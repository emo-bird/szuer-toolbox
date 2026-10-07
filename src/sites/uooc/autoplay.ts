/**
 * UOOC 自动连播（U3）。
 *
 * 需求细则见 `docs/UOOC-连播与答题-需求细则.md` A 节；本文件是它的实现。
 *
 * === 与参考脚本（`local/reference/UOOC assistant.js`）的关键差异 ===
 *
 * 参考脚本的连播是**纯 DOM 爬树**：`video.onended = findNextVideo`，然后靠 `search(mode.NEXT_VIDEO)`
 * 逐层点开目录、`waitForExpand` 250ms 轮询、`toNextListAfterList` 往外爬，找 `FIRST_VIDEO`/`NEXT_VIDEO`。
 * 它只找「下一个视频」，**完全不处理附件/文本/讨论/测验**，而且深度绑定站点的类名。
 *
 * 我们的做法是 **API 驱动**：拿 `getCatalogList` 的树 + `getUnitLearn` 的资源，自己算队列，
 * 跳转靠**改 `location.hash`**（用户 m00513 拍板 ①A）。理由：
 *   - 与站点自己的 `ui-sref` 走同一条 ui-router 通道，效果等价；
 *   - 不依赖 DOM 是否渲染（旧版 `ul.rank-3` 上挂着 `ng-if="stateParams.sectionId == ..."`，
 *     跨节时 DOM 里压根没有目标元素）；
 *   - 不受新旧版类名差异影响（旧版 `div.resourcelist` / 新版 `div.level_3_resourcelist`）。
 *
 * === 队列来源（用户 m00513 拍板 ②A）===
 *
 * **拦截为主，超时兜底**：先等站点自己发 `getCatalogList`（`intercept.ts`），
 * 等不到就自己补发一次同源 GET。
 *
 * === 已知未完成 ===
 *
 * - 测验（`type 80`）未完成 + 开了「AI 答题」时：直接暂停。AI 答题是 U6–U9，用户 m00368 明确推迟。
 * - 新版课程页点测验会开新标签页，需求细则 A.4 要求「改成当前标签页换地址」——还没做。
 * - 暂停后目前只能靠 `window.__szuUoocAutoplay.resume()` 恢复，没有面板按钮（待与用户确认形态）。
 */

import { request } from '../../common/core/http.ts';
import { scoped } from '../../common/core/log.ts';
import { getValue, isEnabled } from '../../common/core/settings.ts';
import { pageOrSelf } from '../../common/utils/page.ts';
import {
  type CatalogLeaf,
  type UnitSource,
  catalogListUrl,
  classifySource,
  courseIdFromLocation,
  currentChainFromHash,
  findLeafIndex,
  flattenLeaves,
  parseCatalogTree,
  parseUnitSources,
  sourceHash,
  unitLearnUrl,
} from './catalog.ts';
import {
  peekCatalog,
  peekUnitLearn,
  primeCatalog,
  primeUnitLearn,
  waitCatalog,
  waitUnitLearn,
} from './intercept.ts';
import { SITE_ID, TOGGLE, VALUE } from './settings.ts';

const log = scoped('uooc/autoplay');

/**
 * 目录的兜底触发点：**页面 `load` 之后再等这么久**，站点仍未发 `getCatalogList` 才自己补发。
 *
 * 为什么不按「装载后 N 秒」算：实测站点那发 XHR 是在 Angular 启动之后才出去的
 * （document-start 装载 → 站点发目录 ≈ 5 秒后），任何固定短超时都会抢先补发，
 * 结果每次开课都白打一发 35KB，"拦截为主"退化成"补发为主"。
 */
const FALLBACK_AFTER_LOAD_MS = 2000;
/** 兜底硬上限：页面始终不 load、站点也始终不发时，最后一道保险 */
const CATALOG_HARD_TIMEOUT_MS = 30000;
/** 等站点自己发 `getUnitLearn` 的上限；超时自己补发 */
const UNIT_INTERCEPT_TIMEOUT_MS = 3000;
/** `{等待时间}` 设置项缺失时的兜底值（需求细则 A.3 的默认值） */
const DEFAULT_WAIT_MS = 5000;
/** 切到视频后，检查「是不是已经播完了」的延迟 */
const VIDEO_END_CHECK_MS = 1500;
/**
 * `ended` 去重窗口：部分播放器在片尾会连发两条 `ended`，只认第一条。
 * 窗口开得比 `VIDEO_END_CHECK_MS` 大一点，免得两条路径各推一次。
 */
const ENDED_DEDUPE_MS = 1000;

/** 面板能力（从 `SiteInitContext.panel` 取） */
export interface AutoplayHost {
  toast(message: string, kind?: 'info' | 'warn' | 'error' | 'success'): void;
}

/** 对外暴露的遥控手柄（挂到 window 上，方便用户手测/救急） */
export interface AutoplayHandle {
  resume(): void;
  next(): void;
  stop(): void;
  status(): { running: boolean; paused: boolean; cursor: number; total: number };
}

/** 手柄挂到 `window` 上用的键名 */
export const AUTOPLAY_HANDLE_KEY = '__szuUoocAutoplay';

function readWaitMs(): number {
  const raw = Number(getValue<string>(SITE_ID, VALUE.NEXT_WAIT_MS));
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_WAIT_MS;
}

/** 附件标签页的打开结果：`gm` 走 Tampermonkey、`anchor` 走 `<a>`（未确认）、`failed` 明确失败 */
export type TabOpenResult = 'gm' | 'anchor' | 'failed';

/**
 * 打开一个后台标签页。
 *
 * ⚠️ 这个函数**不许谎报成功**。早先的版本只要 `a.click()` 不抛异常就 `return true`，
 * 真机冒烟里明明一个标签页都没开出来、日志却写着「OK」—— 因为不带用户手势的程序化
 * `a.click()` 开 `target="_blank"` 会被弹窗拦截器**静默**拦掉（不抛异常、不报错），
 * 和 `sites/bkxk/page-realm.ts:4-8` 记的那个坑是同一类。
 *
 * 所以优先走 Tampermonkey 的 `GM_openInTab`（不受弹窗拦截影响，header 里已 `@grant`），
 * 拿不到它才退回 `<a target="_blank">`，并且**如实**返回三态：
 * 只有走 GM 才叫成功；走 `<a>` 只能标「未确认」；抛异常才是 failed。
 */
function openInBackgroundTab(url: string): TabOpenResult {
  if (url === '') return 'failed';

  const g = globalThis as Record<string, unknown>;
  const gmOpen = g['GM_openInTab'];
  if (typeof gmOpen === 'function') {
    try {
      (gmOpen as (u: string, o?: unknown) => unknown)(url, {
        active: false, // 后台打开，不抢当前课程页的焦点
        insert: true,
        setParent: true,
      });
      return 'gm';
    } catch (err) {
      log.warn(`GM_openInTab 不可用，退回 <a>：${String(err)}`);
    }
  }

  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 弹窗拦截是静默的，这里无法证明真的开出来了 ⇒ 只能标 anchor，不能标成功
    return 'anchor';
  } catch {
    return 'failed';
  }
}

/**
 * 启动自动连播。
 *
 * @returns 卸载函数
 */
export function startAutoplay(host: AutoplayHost): () => void {
  let stopped = false;
  let paused = false;
  let phase: 'idle' | 'video' | 'delay' = 'idle';
  let delayTimer: number | null = null;
  let checkTimer: number | null = null;

  /**
   * 「当前这一项已经布好 ended 陷阱」。
   *
   * 为什么需要它：早先的版本拿 `phase === 'video'` 当「能不能处理 ended」的判据，
   * 结果凡是 phase 不是播放态的情形（已经 `finish()` 过、上一次 `next()` 还没走完、
   * 页面才刚 boot）都会让 ended **被静默丢弃**——不报错、不打日志，
   * 用户看到的就是「视频播完了但一动不动」。
   *
   * 现在改成显式布防：只有 `act()` 判定「这一项是视频」时才布防，`next()` 立刻撤防。
   */
  let endedArmed = false;
  /** 上一次因 ended 推进的时刻，用于压制播放器连发的重复事件 */
  let lastAdvanceAt = 0;

  let cid = '';
  let leaves: CatalogLeaf[] = [];
  let cursor = 0;
  let currentLeaf: CatalogLeaf | null = null;
  let currentSources: UnitSource[] = [];
  let subIndex = 0;

  // ---------------------------------------------------------- 资源获取

  async function sourcesOf(leaf: CatalogLeaf): Promise<UnitSource[]> {
    const key = String(leaf.nodeId);

    const primed = peekUnitLearn(key);
    if (primed !== null) return parseUnitSources(primed);

    const captured = await waitUnitLearn(key, UNIT_INTERCEPT_TIMEOUT_MS);
    if (captured !== null) return parseUnitSources(captured);

    // 兜底：自己补发一次同源 GET
    log.debug(`未截获 getUnitLearn（${key}），主动补发`);
    try {
      const res = await request({
        url: unitLearnUrl(cid, leaf),
        responseType: 'json',
        timeoutMs: 15000,
      });
      if (res.status === 200 && res.json !== undefined) {
        primeUnitLearn(key, res.json);
        return parseUnitSources(res.json);
      }
      log.warn(`补发 getUnitLearn 失败（${key}）：HTTP ${res.status}`);
    } catch (err) {
      log.warn(`补发 getUnitLearn 异常（${key}）：${String(err)}`);
    }
    return [];
  }

  /**
   * 等目录：**先让站点自己发**。
   *
   * 兜底不由「装载后 N 秒」触发，而由「页面 load 之后 2 秒」触发 ——
   * 站点自己的 `getCatalogList` 一向是在页面（Angular）起来之后才出去的，
   * 用固定短超时去等，必然是我们先补发，拦截形同虚设。
   */
  async function loadCatalog(): Promise<CatalogLeaf[] | null> {
    const primed = peekCatalog(cid);
    if (primed !== null) return flattenLeaves(parseCatalogTree(primed));

    const body = await catalogWhenSiteGivesUp();
    if (body === null) return null;
    return flattenLeaves(parseCatalogTree(body));
  }

  /** 截获与补发的赛跑：谁先拿到目录谁赢；补发失败则继续等站点的，直到硬上限 */
  function catalogWhenSiteGivesUp(): Promise<unknown | null> {
    return new Promise((resolve) => {
      let settled = false;
      let armTimer = 0;
      let hardTimer = 0;

      const done = (body: unknown | null): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(armTimer);
        window.clearTimeout(hardTimer);
        window.removeEventListener('load', arm);
        resolve(body);
      };

      const arm = (): void => {
        armTimer = window.setTimeout(() => {
          void (async () => {
            log.debug(`页面已 load 且站点仍未发 getCatalogList（${cid}），主动补发`);
            try {
              const res = await request({
                url: catalogListUrl(cid),
                responseType: 'json',
                timeoutMs: 20000,
              });
              if (res.status === 200 && res.json !== undefined) {
                primeCatalog(cid, res.json);
                done(res.json);
                return;
              }
              log.warn(`补发 getCatalogList 失败：HTTP ${res.status}`);
            } catch (err) {
              log.warn(`补发 getCatalogList 异常：${String(err)}`);
            }
            // 补发没成，继续等站点自己那发（硬上限兜底）
          })();
        }, FALLBACK_AFTER_LOAD_MS);
      };

      // 站点自己发的
      void waitCatalog(cid, CATALOG_HARD_TIMEOUT_MS).then((body) => {
        if (body !== null) done(body);
      });

      if (document.readyState === 'complete') arm();
      else window.addEventListener('load', arm, { once: true });

      hardTimer = window.setTimeout(() => done(null), CATALOG_HARD_TIMEOUT_MS);
    });
  }

  // ---------------------------------------------------------- 流程控制

  function clearTimers(): void {
    if (delayTimer !== null) {
      window.clearTimeout(delayTimer);
      delayTimer = null;
    }
    if (checkTimer !== null) {
      window.clearTimeout(checkTimer);
      checkTimer = null;
    }
  }

  function finish(reason: string): void {
    phase = 'idle';
    clearTimers();
    log.info(`连播结束：${reason}`);
    host.toast(`连播结束：${reason}`, 'info');
  }

  function pause(reason: string): void {
    paused = true;
    phase = 'idle';
    clearTimers();
    log.info(`连播暂停：${reason}`);
    host.toast(`连播已暂停：${reason}（${AUTOPLAY_HANDLE_KEY}.resume() 可恢复）`, 'warn');
  }

  /** 推进到下一项 */
  function next(): void {
    if (stopped) return;
    endedArmed = false; // 离开当前项，立刻撤防
    subIndex++;
    if (subIndex >= currentSources.length) {
      cursor++;
      currentLeaf = null;
      currentSources = [];
      subIndex = 0;
    }
    void step();
  }

  /** 等 `{等待时间}` 后推进 */
  function scheduleDelay(): void {
    const ms = readWaitMs();
    phase = 'delay';
    log.debug(`等待 ${ms}ms 后继续`);
    delayTimer = window.setTimeout(() => {
      delayTimer = null;
      phase = 'idle';
      next();
    }, ms);
  }

  function navigateTo(hash: string): void {
    if (location.hash === hash) return;
    log.debug(`跳转 ${hash}`);
    location.hash = hash;
  }

  /** 处理当前叶子里的一个资源 */
  async function act(leaf: CatalogLeaf, src: UnitSource): Promise<void> {
    const kind = classifySource(src.type);

    if (kind === 'quiz') {
      if (src.finished) {
        log.debug(`测验已完成，跳过（${src.title}）`);
        scheduleDelay();
        return;
      }
      if (isEnabled(SITE_ID, TOGGLE.AI_ANSWER)) {
        pause(`遇到未完成的测验「${src.title}」，但 AI 答题还没实现`);
        return;
      }
      pause(`遇到未完成的测验「${src.title}」，请手动完成`);
      return;
    }

    if (kind === 'discussion' && !isEnabled(SITE_ID, TOGGLE.SKIP_DISCUSSION)) {
      pause(`遇到讨论「${src.title}」，请手动完成后恢复`);
      return;
    }

    if (kind === 'video') {
      navigateTo(sourceHash(cid, leaf, src.id));
      phase = 'video';
      endedArmed = true; // 布防：这一项是视频，等它的 ended
      log.info(`开始播放：${leaf.titles.join(' / ')} / ${src.title}`);
      // 兜底：万一这条视频已经播完了（目录里 finished=1 且定位在片尾），`ended` 不会再来
      checkTimer = window.setTimeout(() => {
        checkTimer = null;
        if (stopped || paused || phase !== 'video') return;
        const v = document.querySelector('video');
        if (v !== null && v.ended) {
          log.debug('视频已在片尾，直接推进');
          phase = 'idle';
          next();
        }
      }, VIDEO_END_CHECK_MS);
      return;
    }

    if (kind === 'attach') {
      navigateTo(sourceHash(cid, leaf, src.id));
      const doc = src.documents[0];
      const uri = doc === undefined ? '' : doc.uri;
      const name = doc === undefined ? src.title : doc.title;
      if (uri !== '') {
        const how = openInBackgroundTab(uri);
        if (how === 'gm') {
          log.info(`打开附件（后台标签页）：${name}`);
        } else if (how === 'anchor') {
          log.info(`尝试打开附件：${name}（走 <a target=_blank>，无法确认是否被弹窗拦截）`);
        } else {
          log.warn(`附件打开失败：${name}`);
          host.toast(`附件「${name}」打开失败，请手动查看`, 'warn');
        }
      } else {
        log.warn(`附件没有 document[].uri（${src.title}）`);
      }
      scheduleDelay();
      return;
    }

    if (kind === 'unknown') log.debug(`未知资源类型 ${src.type}，按文本处理（${src.title}）`);

    // 附件 / 文本 / 讨论（跳过时）/ 未知类型：都是「跳过去 → 等一会儿 → 下一项」
    navigateTo(sourceHash(cid, leaf, src.id));
    scheduleDelay();
  }

  /** 主循环：跳到「第一个有资源的项」并处理它 */
  async function step(): Promise<void> {
    for (;;) {
      if (stopped || paused) return;

      const leaf = leaves[cursor];
      if (leaf === undefined) {
        finish('已到目录末尾');
        return;
      }

      // 不设范围上限：跨章一直播下去，走到目录末尾才停（用户 m00971 拍板移除「连播范围」）

      if (currentLeaf !== leaf) {
        const sources = await sourcesOf(leaf);
        if (stopped || paused) return;
        currentLeaf = leaf;
        currentSources = sources.filter((s) => classifySource(s.type) !== 'unknown');
        subIndex = 0;
      }

      if (subIndex >= currentSources.length) {
        // 空叶子（实测存在，如 733704712 → data: []）或本叶子已走完
        if (currentSources.length === 0) log.debug(`跳过无资源的叶子 ${leaf.nodeId} ${leaf.title}`);
        cursor++;
        currentLeaf = null;
        currentSources = [];
        subIndex = 0;
        continue;
      }

      const src = currentSources[subIndex];
      if (src === undefined) {
        cursor++;
        currentLeaf = null;
        currentSources = [];
        subIndex = 0;
        continue;
      }

      await act(leaf, src);
      return;
    }
  }

  // ---------------------------------------------------------- 媒体事件

  const onEnded = (ev: Event): void => {
    const el = ev.target;
    if (el === null || (el as Element).tagName !== 'VIDEO') return;
    if (stopped || paused) return;

    // 三重护栏，都是「宁可不动，也不要乱跳」：
    if (!endedArmed) {
      // 当前项不是视频（文本 / 附件 / 测验的等待期），或这一条已经推进过了
      log.debug('忽略未布防的 ended（当前项不是视频）');
      return;
    }
    if (!(el as HTMLVideoElement).isConnected) {
      // 播放器已经被换掉，这是旧元素迟到的 ended
      log.debug('忽略已脱离文档的 ended（播放器被换掉了）');
      return;
    }
    const now = Date.now();
    if (now - lastAdvanceAt < ENDED_DEDUPE_MS) {
      log.debug('忽略重复的 ended');
      return;
    }

    endedArmed = false;
    lastAdvanceAt = now;
    clearTimers();
    phase = 'idle';
    log.info('视频播放完毕，进入下一项');
    next();
  };

  // ---------------------------------------------------------- 启动

  function boot(): void {
    const hash = location.hash;
    const found = courseIdFromLocation(location.pathname, hash);
    if (found === null) {
      log.warn(`拿不到课程 id，连播不启动（pathname=${location.pathname}，hash=${hash}）`);
      return;
    }
    cid = found;

    void (async () => {
      const list = await loadCatalog();
      if (stopped) return;
      if (list === null || list.length === 0) {
        host.toast('连播启动失败：没拿到课程目录', 'error');
        return;
      }
      leaves = list;

      const chain = currentChainFromHash(hash);
      const at = chain === null ? -1 : findLeafIndex(leaves, chain);
      cursor = at >= 0 ? at : 0;

      log.info(`连播已启动：cid=${cid}，叶子 ${leaves.length} 个，从第 ${cursor + 1} 个开始`);
      host.toast('自动连播已启动', 'info');
      void step();
    })();
  }

  function uninstall(): void {
    if (stopped) return;
    stopped = true;
    paused = false;
    clearTimers();
    document.removeEventListener('ended', onEnded, true);
    const g = pageOrSelf();
    if (g[AUTOPLAY_HANDLE_KEY] === handle) delete g[AUTOPLAY_HANDLE_KEY];
  }

  const handle: AutoplayHandle = {
    resume() {
      if (stopped) return;
      paused = false;
      log.info('连播已恢复');
      host.toast('连播已恢复', 'info');
      void step();
    },
    next() {
      if (stopped) return;
      paused = false;
      clearTimers();
      next();
    },
    stop() {
      uninstall();
    },
    status() {
      return { running: !stopped, paused, cursor, total: leaves.length };
    },
  };

  document.addEventListener('ended', onEnded, true);
  // 必须挂在**页面 realm**：脚本在 Tampermonkey 沙箱里跑，往沙箱 globalThis 上挂
  // 页面那边一个字节都看不见（同 src/sites/bkxk/page-realm.ts:4-8 记录的教训）。
  pageOrSelf()[AUTOPLAY_HANDLE_KEY] = handle;

  if (isEnabled(SITE_ID, TOGGLE.AUTO_NEXT)) {
    boot();
  } else {
    log.debug('自动连播开关未开，只挂手柄不启动');
  }

  return uninstall;
}
