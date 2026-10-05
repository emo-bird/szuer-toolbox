/**
 * UOOC 视频助手：二倍速（U1）+ 静音（U2）+ 防失焦暂停（U4）。
 *
 * 证据来源（都是现成可运行的脚本，不是我猜的）：
 *   - `local/reference/uooc防止失去焦点，自动二倍数播放.js`（1230 B）——
 *     用 `document.getElementById('player_html5_api')` 取 video.js 的 video 元素，
 *     然后 `playbackRate = 2`、`muted = true`，并用 `video.onpause = () => this.play()`
 *     无条件抢播；
 *   - `local/reference/UOOC assistant.js` v1.0.8 —— 同一套选择器（:511 / :544 / :777）、
 *     同一套 `video.onpause = ... this.play()` 抢播（:517）。
 * 两处独立来源一致，所以 `#player_html5_api` 可信；`<video>` 作为兜底。
 *
 * 为什么不照抄参考脚本的 `setInterval(..., 1000)`：
 *   站点是 SPA，换集时 video 元素会被 video.js 重建。参考脚本靠 1 秒轮询兜住这件事，
 *   代价是整段观看期间都在跑定时器。这里改成「DOM 变更观察 + 媒体事件捕获」，
 *   只在**元素出现**与**新片源载入**时动作。
 *
 * === 三个开关都是「锁」，不是「一次性设置」（用户 m00978 需求 3/4）===
 *
 * 用户原话：只要开了二倍速按钮就锁二倍速、只要开了禁音就禁音，**不用管有没有用户
 * 在视频播放器上修改**。所以本文件**会**监听 `ratechange` / `volumechange` 并立刻扳回，
 * 站点的倍速菜单与音量控制在开启期间等于失效。
 *
 * ⚠️ 这与本文件 v1 的写法相反（v1 有意不监听 `ratechange`，本意是「别把播放器弄得像坏了」）。
 * 那是我的判断，不是用户的；用户现已明确否决，按用户说的做。
 *
 * U4（防失焦）同样是「无条件抢播」，用户已确认（选项 C：无条件抢播 + 默认开）：
 *   一旦暂停就恢复播放，**包括用户自己按的暂停**；想暂停必须先关掉这个开关。
 *
 * 抢播的两个必要护栏（不做的话会出真 bug）：
 *   1. **只抢「已经播过的」视频** —— 靠 `hasStarted` 记录。否则页面加载后那些
 *      停在 0:00 等你看的 `<video>` 会被自动播放，等于给站点加了自动播放。
 *   2. **反复被站点改回时退让** —— 双方对拉会产生事件风暴（每次抢播/扳回都再触发一次
 *      事件）。用滑动窗口计数，短时间内反复发生就停手几秒并打一条 warn，
 *      而不是无限对拉把页面卡死。
 */

import { scoped } from '../../common/core/log.ts';
import { getValue, isEnabled } from '../../common/core/settings.ts';
import { read as readStore, remove as removeStore, write as writeStore } from '../../common/core/storage.ts';
import { pageOrSelf } from '../../common/utils/page.ts';
import { siteToast } from '../../common/ui/widgets/site-toast.ts';
import {
  RESOURCE_TYPE_VIDEO,
  collectDiag,
  findResourceItem,
  goNextChapter,
  isResourceFinished,
  labelOf,
  parseHash,
  stepForward,
} from './catalog.ts';
import { noteVideo, stopProgress } from './progress.ts';
import { clearQuizDone, onQuizDone, readQuizDone, writeQuizOpening } from './quiz-signal.ts';
import type { QuizSignal } from './quiz-signal.ts';
import { SITE_ID, TOGGLE, VALUE } from './settings.ts';

const log = scoped('uooc/video');

/** 站点的 video 元素 id（video.js 默认 id；两个参考脚本都用它） */
const VIDEO_ID = 'player_html5_api';

/** U1 的目标速率：需求写死「二倍速」 */
const TARGET_RATE = 2;

/** DOM 变更合并窗口（毫秒）。站点页面在持续变动，不合并会一帧扫一次 */
const RESCAN_DEBOUNCE_MS = 200;

/** 跨 iframe 兜底查找的最小间隔（毫秒）。这条路径要遍历 iframe，别太勤 */
const FRAME_FALLBACK_MIN_GAP_MS = 2000;

/** 对拉护栏：滑动窗口长度与窗口内允许的纠正次数 */
const FIGHT_WINDOW_MS = 5000;
const FIGHT_MAX = 8;
/** 超出次数后停手多久（毫秒） */
const FIGHT_COOLDOWN_MS = 5000;

/** 连播一次只做一次：这个时间内不再响应第二次「播完了」 */
const ADVANCE_LOCK_MS = 8000;

/** 连播跳过去之后，等待新片源 ready 的最长时间；超时就放弃这次自动播放 */
const PENDING_AUTOPLAY_TIMEOUT_MS = 15000;

/**
 * 「这一项好了，等几秒再切下一项」的默认秒数。
 *
 * 用户要的就是这个节奏：右上角提醒一声，留 5 秒给人看清楚切到哪了。
 * 可在设置里改（`VALUE.SWITCH_WAIT`）。
 */
const DEFAULT_SWITCH_WAIT_S = 5;

/** 我们对每个 video 元素做过什么 —— 关开关时只回退**我们改过**的那部分 */
interface Applied {
  rate: boolean;
  mute: boolean;
}

const applied = new WeakMap<HTMLVideoElement, Applied>();

/** 已经打过「已应用」日志的元素，避免换集时刷屏 */
const announced = new WeakSet<HTMLVideoElement>();

/**
 * 「这个视频播放过」的标记 —— U4 抢播的门槛。
 *
 * 不在这个集合里的视频，无论怎么暂停都不抢播（避免把页面加载后停在 0:00
 * 的播放器自动播起来）。
 */
const hasStarted = new WeakSet<HTMLVideoElement>();

/**
 * 已经在元素**自身**上挂过 `ended` 监听的那些视频。
 *
 * document 捕获阶段本来就能收到 `ended`（见 `startVideoAssist()`），这里再挂一遍
 * 是为了兜住「播放器不在顶层文档里」的情况（`findVideo()` 会去同源 iframe 里找）。
 * 两边都触发也不会连点两次 —— `startAdvance()` 有「一轮只跑一次」的闸。
 */
const endedBound = new WeakSet<HTMLVideoElement>();

/** 元素是不是真的 video（不依赖 `instanceof HTMLVideoElement`，沙箱里它可能不是同一个构造器） */
function asVideo(el: Element | null): HTMLVideoElement | null {
  return el !== null && el.tagName === 'VIDEO' ? (el as HTMLVideoElement) : null;
}

/**
 * 对拉护栏：同类纠正短时间内发生太多次就停手几秒。
 *
 * @param label 日志里用的名字（「二倍速」/「静音」/「防失焦」）
 * @returns true = 这次允许纠正
 */
function makeGuard(label: string): () => boolean {
  const stamps: number[] = [];
  let mutedUntil = 0;

  return (): boolean => {
    const now = Date.now();
    if (now < mutedUntil) return false;

    while (stamps.length > 0 && now - stamps[0]! > FIGHT_WINDOW_MS) stamps.shift();

    if (stamps.length >= FIGHT_MAX) {
      mutedUntil = now + FIGHT_COOLDOWN_MS;
      stamps.length = 0;
      log.warn(`${label}在 ${FIGHT_WINDOW_MS / 1000} 秒内被反复改回，暂停纠正 ${FIGHT_COOLDOWN_MS / 1000} 秒`);
      return false;
    }

    stamps.push(now);
    return true;
  };
}

const rateGuard = makeGuard('二倍速');
const muteGuard = makeGuard('静音');
const playGuard = makeGuard('防失焦');

let lastFrameScanAt = 0;
let cachedFrameVideo: HTMLVideoElement | null = null;

/**
 * 找播放器。
 *
 * 三级：站点标准 id → 页面里任意 `<video>` → 同源 iframe 内的播放器。
 * 第三级有缓存与最小间隔，因为它要遍历 iframe 并取 `contentDocument`。
 */
function findVideo(): HTMLVideoElement | null {
  const byId = asVideo(document.getElementById(VIDEO_ID));
  if (byId !== null) return byId;

  const anyVideo = asVideo(document.querySelector('video'));
  if (anyVideo !== null) return anyVideo;

  // 缓存命中且元素仍在文档里，直接复用
  if (cachedFrameVideo !== null && cachedFrameVideo.isConnected) return cachedFrameVideo;

  const now = Date.now();
  if (now - lastFrameScanAt < FRAME_FALLBACK_MIN_GAP_MS) return null;
  lastFrameScanAt = now;
  cachedFrameVideo = null;

  for (const frame of Array.from(document.querySelectorAll('iframe'))) {
    let doc: Document | null = null;
    try {
      doc = frame.contentDocument;
    } catch {
      // 跨域 iframe 取 contentDocument 会抛，跳过
      continue;
    }
    if (doc === null) continue;
    const found = asVideo(doc.getElementById(VIDEO_ID)) ?? asVideo(doc.querySelector('video'));
    if (found !== null) {
      cachedFrameVideo = found;
      log.debug('播放器在同源 iframe 内，已切换查找目标');
      return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------- U3 自动连播

/** 正在跳转中（防止 `ended` 抖动或站点重复触发导致连点） */
let advancingUntil = 0;

/** 跳转后等待新片源 ready 的时间戳；0 = 没有待播放 */
let pendingAutoplayAt = 0;

/** 这一轮连播会话的截止时间；0 = 没有会话 */
let advanceDeadline = 0;

/** 这一轮已经走了几步（空节 / 页面异常时靠它兜底） */
let advanceHops = 0;

/** 下一次「走一步」的定时器 */
let advanceTimer: ReturnType<typeof setTimeout> | null = null;

/** 落在一个新视频上的时间戳；0 = 没有落点 */
let landedAt = 0;

/**
 * 最近一次真的点开的资源 —— 连同它属于哪个章 / 节一起记。
 *
 * 传给 `stepForward()` 当扫描起点，防的是「点了资源项但 hash 里没带上 resourceId」
 * 时每轮都从头扫、反复点同一项的死循环。
 *
 * ⚠️ 这个坑实测踩过（m00961 第 1 条）：新版点开**文档 / 附件**之后地址栏停在
 * `#/{cid}/{chapterId}/{sectionId}`，**没有第 4 段**。原来一见到 `hashchange`
 * 就把它清掉，于是每轮 `cursor = -1`、从本节头开始扫，那两项又不是
 * `finished`，就被反复打开 —— 用户看到的就是「不断循环打开附件和文档」。
 * 现在改成：**只在章 / 节没变时才认它**，且 hash 里有 resourceId 时以 hash 为准。
 */
let lastClicked: { id: string; chapterId: string; sectionId: string } | null = null;

/** 这一轮从哪个资源之后开始扫 */
function anchorFor(): string {
  const parts = parseHash();
  if (parts === null) return '';
  if (parts.resourceId !== '') return parts.resourceId;
  if (
    lastClicked !== null &&
    lastClicked.chapterId === parts.chapterId &&
    lastClicked.sectionId === parts.sectionId
  ) {
    return lastClicked.id;
  }
  return '';
}

/**
 * 「本节是空的」连续重试次数。
 *
 * 刚点进一个节时资源列表可能还在路上，所以先重试几次再判定为空 ——
 * 但重试完就一定要往后跳，不能原地打转（`catalog.blankSeenFor` 配合）。
 */
let blankRetries = 0;
const BLANK_RETRY_MS = 1500;
const BLANK_MAX_RETRIES = 3;

const ADVANCE_HOP_DELAY_MS = 700;
const ADVANCE_MAX_HOPS = 40;
const ADVANCE_SESSION_MS = 45000;

function stopAdvance(): void {
  if (advanceTimer !== null) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }
  advanceDeadline = 0;
  advanceHops = 0;
  landedAt = 0;
}

function scheduleAdvanceHop(delay: number): void {
  if (advanceTimer !== null) clearTimeout(advanceTimer);
  advanceTimer = setTimeout(runAdvanceHop, delay);
}

/**
 * U3：往后走一步。
 *
 * 站点是**按需渲染**的（点完节标题要等一个请求才出资源），所以一次只走一步，
 * 按目录层返回的 `kind` 决定「等一下再来」还是收工。
 * 每一步的取舍（跳过文档 / 附件 / 看过的视频 / 做过的测验）都在
 * `catalog.ts` 的 `stepForward()` 里，本函数只管节奏与护栏。
 */
function runAdvanceHop(): void {
  advanceTimer = null;

  if (advanceDeadline === 0) return;
  if (advanceHops >= ADVANCE_MAX_HOPS) {
    log.warn(`连播放弃：已经走了 ${ADVANCE_MAX_HOPS} 步还没找到可播的视频`);
    stopAdvance();
    return;
  }
  if (Date.now() > advanceDeadline) {
    log.warn(`连播放弃：这一轮开了 ${Math.round(ADVANCE_SESSION_MS / 1000)} 秒还没找到可播的视频`);
    stopAdvance();
    return;
  }
  advanceHops += 1;

  const step = stepForward(anchorFor());
  switch (step.kind) {
    case 'clicked':
      // ⚠️ 先 stopAdvance() 再写这三个时间戳 —— `stopAdvance()` 会把 `landedAt`
      // 清零，反过来的话 `breakStall()` 永远看不到落点，兜底就失效了。
      {
        const parts = parseHash();
        lastClicked = {
          id: step.id,
          chapterId: parts?.chapterId ?? '',
          sectionId: parts?.sectionId ?? '',
        };
      }
      blankRetries = 0;
      stopAdvance();
      advancingUntil = Date.now() + ADVANCE_LOCK_MS;
      pendingAutoplayAt = Date.now();
      landedAt = Date.now();
      // 视频交给它自己播完（`ended` 会来触发切换）；
      // 文档 / 附件没有「播完」这回事，按「打开看一眼就算过」处理 ——
      // 用户明确说了文档不必等完成判定（m00553 答复 3）。
      if (step.type !== RESOURCE_TYPE_VIDEO) {
        scheduleSwitch(`已打开${labelOf(step.type)}`);
      }
      return;

    case 'quiz': {
      const cid = parseHash()?.cid ?? '';
      log.info(
        `连播：已替你打开测验 ${step.taskId}${step.title === '' ? '' : `（${step.title}）`}，` +
          '交卷后会自动继续',
      );
      if (isEnabled(SITE_ID, TOGGLE.AUTO_SOLVE)) {
        log.warn('「自动作答」只做了开关，功能还没实现，这一题还得你自己做');
      }
      const opening = { cid, taskId: step.taskId, resourceId: step.resourceId };
      setWaitingQuiz(opening);
      // 给测验页留一张「这个标签页是连播开的」通行证 ——
      // 它据此才敢在交卷后把自己关掉（用户自己开的卷子页不该被我们关）。
      writeQuizOpening(opening);
      siteToast('连播：已为你打开测验，交卷后自动继续', 'info', 6000);
      stopAdvance();
      return;
    }

    case 'blank':
      blankRetries += 1;
      if (blankRetries <= BLANK_MAX_RETRIES) {
        log.info(`本节还没看到任何资源（第 ${blankRetries} 次），稍后再看`);
        scheduleAdvanceHop(BLANK_RETRY_MS);
        return;
      }
      blankRetries = 0;
      scheduleSwitch('本节没有可看的内容');
      return;

    case 'rendered':
      scheduleAdvanceHop(ADVANCE_HOP_DELAY_MS);
      return;

    case 'chapter-end':
      if (getValue<string>(SITE_ID, VALUE.NEXT_SCOPE) !== 'all') {
        log.info('已到本章最后一个资源（连播范围＝止于本章），停在这里');
        stopAdvance();
        return;
      }
      if (goNextChapter()) {
        scheduleAdvanceHop(ADVANCE_HOP_DELAY_MS);
        return;
      }
      log.info('目录里后面没有资源了，连播结束');
      stopAdvance();
      return;

    default:
      log.warn(`连播中断：${step.reason}`);
      stopAdvance();
      return;
  }
}

/**
 * U3 入口：一个视频播完时调用。
 *
 * 跳转之后由 `apply()` 通过 `pendingAutoplayAt` 把新片源播起来
 * （否则会被 `hasStarted` 门槛挡住，用户得自己点一下）。
 */
function startAdvance(): void {
  if (!isEnabled(SITE_ID, TOGGLE.AUTO_NEXT)) return;
  if (Date.now() < advancingUntil) return;
  // 已经有一轮在跑就别重开：'ended' 可能同时从 document 捕获与元素自身两条路进来
  if (advanceDeadline !== 0) return;

  stopAdvance();
  advanceDeadline = Date.now() + ADVANCE_SESSION_MS;
  scheduleAdvanceHop(0);
}

/**
 * 从「等切换」回到「走一步」。
 *
 * 必须先把 `advancingUntil` 清零：它是给「同一次点击被 `ended` 重复触发」兜底的
 * 8 秒锁，而等切换本身就要等好几秒 —— 不清掉的话定时器到点时锁还没过期，
 * `startAdvance()` 会一声不吭地 return，表现就是「提醒弹了、但永远不切」。
 */
function resumeAdvance(): void {
  advancingUntil = 0;
  startAdvance();
}

// ------------------------------------------------ 「这一项好了，等一下再切」

/** 到点该切下一项的时间戳；0 = 没在等 */
let switchAt = 0;

/** 等切换用的定时器 */
let switchTimer: ReturnType<typeof setTimeout> | null = null;

const SWITCH_WAIT_MAX_S = 120;

/** 设置里的等待秒数（越界就夹回合法区间） */
function switchWaitMs(): number {
  const raw = Number.parseInt(String(getValue<string>(SITE_ID, VALUE.SWITCH_WAIT) ?? ''), 10);
  if (!Number.isFinite(raw)) return DEFAULT_SWITCH_WAIT_S * 1000;
  return Math.min(SWITCH_WAIT_MAX_S, Math.max(0, raw)) * 1000;
}

function clearSwitch(): void {
  if (switchTimer !== null) {
    clearTimeout(switchTimer);
    switchTimer = null;
  }
  switchAt = 0;
}

/**
 * 当前这一项「不用再管了」——右上角提醒一声，等 N 秒再切下一项。
 *
 * 这是每一项的唯一出口：视频播完、文档/附件打开、测验做完都走这里。
 * 重复调用只认第一次（`switchAt !== 0` 直接返回），免得同一次完成被
 * `ended` + 元素监听两条路各提醒一遍。
 */
function scheduleSwitch(reason: string): void {
  if (!isEnabled(SITE_ID, TOGGLE.AUTO_NEXT)) return;
  if (switchAt !== 0) return;

  const waitMs = switchWaitMs();
  const seconds = Math.round(waitMs / 1000);
  const text = seconds > 0 ? `${reason}，${seconds} 秒后切下一项` : `${reason}，切下一项`;
  log.info(`连播：${text}`);
  siteToast(`连播：${text}`, 'info', Math.max(2600, waitMs + 1200));

  if (waitMs <= 0) {
    resumeAdvance();
    return;
  }
  switchAt = Date.now() + waitMs;
  switchTimer = setTimeout(() => {
    switchTimer = null;
    switchAt = 0;
    if (!isEnabled(SITE_ID, TOGGLE.AUTO_NEXT)) return;
    resumeAdvance();
  }, waitMs);
}

// ------------------------------------------------------------ 等测验做完

/**
 * 停在测验上时记下「在等哪一道」。
 *
 * 存进油猴存储而不是只放内存里：做测验多半会**整页跳走**
 * （`/exam/*` 是另一个 page 匹配），做完回到学习页时脚本是重新加载的，
 * 内存里的标记早就没了。
 */
const WAITING_QUIZ_KEY = 'uooc:waitingQuiz';

/** 正在等的测验；`null` = 没在等 */
let waitingQuiz: WaitingQuiz | null = null;

interface WaitingQuiz {
  /** 所属课程 id —— 换课程时必须作废，否则会拿着旧 id 去新课程里瞎判 */
  cid: string;
  resourceId: string;
  taskId: string;
}

function setWaitingQuiz(q: WaitingQuiz | null): void {
  waitingQuiz = q;
  if (q === null) removeStore(WAITING_QUIZ_KEY);
  else writeStore(WAITING_QUIZ_KEY, q);
}

/** 启动时把上次留下的标记捡回来 */
function restoreWaitingQuiz(): void {
  const raw = readStore<unknown>(WAITING_QUIZ_KEY, null);
  if (typeof raw !== 'object' || raw === null) return;
  const o = raw as Record<string, unknown>;
  const cid = typeof o['cid'] === 'string' ? o['cid'] : '';
  const resourceId = typeof o['resourceId'] === 'string' ? o['resourceId'] : '';
  const taskId = typeof o['taskId'] === 'string' ? o['taskId'] : '';
  if (resourceId === '') return;

  const nowCid = parseHash()?.cid ?? '';
  if (cid !== '' && nowCid !== '' && cid !== nowCid) {
    log.info(`上次的测验记录属于课程 ${cid}，当前是 ${nowCid}，作废`);
    removeStore(WAITING_QUIZ_KEY);
    return;
  }
  waitingQuiz = { cid, resourceId, taskId };
  log.info(`上次停在测验 ${taskId || '(未知)'}，做完会自动继续连播`);
}

/**
 * 每次扫描时看一眼：等的那道测验做完了没有。
 *
 * 做完就把它从「等待」里摘掉，然后走**和别的资源一样的出口** ——
 * 右上角提醒 + 等 N 秒再切下一项。**只在开关开着时才动它** ——
 * 用户把自动连播关了，这个标记就该原地留着，下次开开关才继续。
 */
/**
 * 确认「等的那道测验做完了」，然后走统一出口（提醒 + 等 N 秒 + 切下一项）。
 *
 * @param signal 跨标签页标记；`null` = 是「看目录」这条兜底路进来的
 */
function handleQuizDone(signal: QuizSignal | null): void {
  if (waitingQuiz === null) return;
  if (signal !== null) {
    if (signal.taskId !== '' && waitingQuiz.taskId !== '' && signal.taskId !== waitingQuiz.taskId) return;
    if (signal.cid !== '' && waitingQuiz.cid !== '' && signal.cid !== waitingQuiz.cid) return;
  }
  log.info(`测验 ${waitingQuiz.taskId || '(未知)'} 已完成`);
  setWaitingQuiz(null);
  clearQuizDone();
  scheduleSwitch('测验已完成');
}

/**
 * 兜底：每次扫描时看一眼**学习页目录**上那一项标没标完成。
 *
 * 主路是测验页写下的跨标签页标记（`onQuizDone`），但有些场景标记到不了：
 * 比如测验是**同一个标签页**内跳过去的，`storage` 事件不跨同一个标签页自身。
 * 那时只能靠目录。**只在开关开着时才动它** —— 用户把自动连播关了，
 * 这个标记就该原地留着，下次开开关才继续。
 */
function checkWaitingQuiz(): void {
  if (waitingQuiz === null) return;
  if (!isEnabled(SITE_ID, TOGGLE.AUTO_NEXT)) return;

  const el = findResourceItem(waitingQuiz.resourceId);
  if (el === null) return;
  if (!isResourceFinished(el)) return;

  handleQuizDone(null);
}

/**
 * 兜底：落在了一个「看过一部分」的视频上。
 *
 * 目录里的 `video_pos` / `finished` 只在展开过的节上才填得准，所以再加一道判据 ——
 * 跳过去之后落点**一直没播起来**、进度条却不在 0 上（站点把进度条拖到了上次的位置），
 * 说明这就是个看过的视频。这时直接再往后跳。
 */
function breakStall(v: HTMLVideoElement): void {
  if (landedAt === 0) return;
  if (Date.now() - landedAt < ADVANCE_LOCK_MS + 4000) return;
  if (v.currentTime <= 3 || v.ended) return;
  if (!v.paused || hasStarted.has(v)) return;

  log.info(`落点停在 ${Math.round(v.currentTime)}s 一直没播起来，按「看过的视频」处理`);
  landedAt = 0;
  scheduleSwitch('视频已看过');
}

/** 跳转后兑现「自动播放下一集」；超时或还没 ready 时什么都不做 */
function tryPendingAutoplay(v: HTMLVideoElement): void {
  if (pendingAutoplayAt === 0) return;
  if (Date.now() - pendingAutoplayAt > PENDING_AUTOPLAY_TIMEOUT_MS) {
    pendingAutoplayAt = 0;
    return;
  }
  if (v.ended || (!v.paused && !v.ended)) {
    // 站点自己已经开始播了，不需要我们插手
    pendingAutoplayAt = 0;
    return;
  }
  if (v.readyState < 2) return;

  pendingAutoplayAt = 0;
  hasStarted.add(v);
  const p = v.play();
  if (p !== undefined && typeof p.catch === 'function') {
    p.catch((err: unknown) => {
      log.warn(`连播后自动播放被拒绝：${err instanceof Error ? err.message : String(err)}`);
    });
  }
}

/** 按当前设置应用一次；开关关掉时只回退我们改过的部分 */
function apply(v: HTMLVideoElement): void {
  const state: Applied = applied.get(v) ?? { rate: false, mute: false };

  // 「已经播过」的判定：接手时它就在播，也算播过
  if (!v.paused && !v.ended) hasStarted.add(v);

  const wantRate = isEnabled(SITE_ID, TOGGLE.RATE_2X);
  if (wantRate) {
    if (v.playbackRate !== TARGET_RATE) {
      try {
        v.playbackRate = TARGET_RATE;
        state.rate = true;
      } catch {
        // 个别浏览器在 readyState 过低时会拒绝设置速率，下一次事件再试
      }
    }
  } else if (state.rate && v.playbackRate === TARGET_RATE) {
    v.playbackRate = 1;
    state.rate = false;
  }

  const wantMute = isEnabled(SITE_ID, TOGGLE.MUTE);
  if (wantMute) {
    if (!v.muted) {
      v.muted = true;
      state.mute = true;
    }
  } else if (state.mute && v.muted) {
    v.muted = false;
    state.mute = false;
  }

  applied.set(v, state);

  // 播完是连播的唯一触发点；除了 document 捕获，再在元素自己身上挂一份
  if (!endedBound.has(v)) {
    endedBound.add(v);
    v.addEventListener('ended', onMediaEvent);
  }

  // 连播跳过来之后，第一件事是把新片源播起来
  tryPendingAutoplay(v);
  breakStall(v);

  // 随机进度上报的「重新计时」也挂在这条路径上（换集 / 改区间 / 开关切换都靠它）
  noteVideo(v);

  if (!announced.has(v)) {
    announced.add(v);
    log.info(
      `播放器助手已就绪：二倍速=${wantRate ? '开' : '关'}，静音=${wantMute ? '开' : '关'}，` +
        `防失焦=${isEnabled(SITE_ID, TOGGLE.KEEP_PLAYING) ? '开' : '关'}，` +
        `自动连播=${isEnabled(SITE_ID, TOGGLE.AUTO_NEXT) ? '开' : '关'}，` +
        `进度上报=${isEnabled(SITE_ID, TOGGLE.AUTO_PROGRESS) ? '开' : '关'}（当前速率 ${v.playbackRate}x）`,
    );
  }
}

/**
 * U4：抢播。
 *
 * 条件是**全部**满足才动作 —— 开关开着、这个视频播过、没播完、片源够用。
 */
function restorePlayback(v: HTMLVideoElement): void {
  if (!isEnabled(SITE_ID, TOGGLE.KEEP_PLAYING)) return;
  if (!hasStarted.has(v)) return;
  if (v.ended) return;
  // readyState < 2（HAVE_CURRENT_DATA）时 play() 多半会 reject，等下一轮事件
  if (v.readyState < 2) return;
  if (!playGuard()) return;

  const p = v.play();
  if (p !== undefined && typeof p.catch === 'function') {
    p.catch((err: unknown) => {
      // 自动播放策略拦下（例如尚未与页面交互）时会 reject，属正常情况
      log.debug(`抢播被拒绝：${err instanceof Error ? err.message : String(err)}`);
    });
  }
}

/** 媒体事件统一入口（注册在 document 的捕获阶段） */
function onMediaEvent(ev: Event): void {
  const v = asVideo(ev.target as Element | null);
  if (v === null) return;

  switch (ev.type) {
    case 'play':
    case 'playing':
      hasStarted.add(v);
      apply(v);
      return;

    case 'pause':
      restorePlayback(v);
      return;

    case 'ended':
      // 视频播完：提醒一声、等几秒再切下一项（不再立刻跳）
      scheduleSwitch('视频已播完');
      return;

    case 'ratechange':
      // 站点（或用户）把速率改了 → 立刻锁回去
      if (isEnabled(SITE_ID, TOGGLE.RATE_2X) && v.playbackRate !== TARGET_RATE && rateGuard()) {
        try {
          v.playbackRate = TARGET_RATE;
        } catch {
          /* 忽略：下一个事件再试 */
        }
      }
      return;

    case 'volumechange':
      if (isEnabled(SITE_ID, TOGGLE.MUTE) && !v.muted && muteGuard()) {
        v.muted = true;
      }
      return;

    default:
      return;
  }
}

const MEDIA_EVENTS: readonly string[] = [
  'play',
  'playing',
  'pause',
  'ended',
  'ratechange',
  'volumechange',
];

/**
 * 启动视频助手。
 *
 * @returns 卸载函数（组件/页面销毁时调用）
 */
export function startVideoAssist(): () => void {
  let timer: number | null = null;
  let stopped = false;

  const scan = (): void => {
    if (stopped) return;
    checkWaitingQuiz();
    const v = findVideo();
    if (v !== null) apply(v);
  };

  const schedule = (): void => {
    if (stopped || timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      scan();
    }, RESCAN_DEBOUNCE_MS);
  };

  restoreWaitingQuiz();
  scan();

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 媒体事件不冒泡，但**捕获阶段**仍会经过 document，所以这样能收到
  const onLoad = (): void => scan();
  document.addEventListener('loadstart', onLoad, true);
  document.addEventListener('loadedmetadata', onLoad, true);

  document.addEventListener('play', onMediaEvent, true);
  document.addEventListener('playing', onMediaEvent, true);
  document.addEventListener('pause', onMediaEvent, true);
  // ⚠️ 这一条曾经漏掉：`MEDIA_EVENTS`（给卸载用的）里一直有 'ended'，
  // 但注册时没带上它 —— 于是 `onMediaEvent` 的 `case 'ended'` 是死代码，
  // 自动连播**一次都不会被触发**（U3 连坏两轮的真凶）。
  document.addEventListener('ended', onMediaEvent, true);
  document.addEventListener('ratechange', onMediaEvent, true);
  document.addEventListener('volumechange', onMediaEvent, true);

  // 站内 hash 路由换集不会重载页面。
  // ⚠️ 这里**不**清 `lastClicked` —— 点开新版文档 / 附件之后地址栏没有 resourceId，
  // 一见 hashchange 就清会让扫描起点丢回本节开头，反复点同一项（踩过）。
  // `anchorFor()` 已经用「章 / 节是否相同」把它限制住了。
  const onRoute = (): void => {
    schedule();
  };
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('popstate', onRoute);

  // 测验页交卷了 → 学习页接着播。三条来路都接上：
  //   1. `storage` 事件（测验页写了标记，浏览器原生广播给同源其它标签页）；
  //   2. 切回本标签页时主动读一次（事件可能已经错过，或测验是同标签页跳走的）；
  //   3. `scan()` 里 `checkWaitingQuiz()` 看学习页目录（最后兜底）。
  const offQuizDone = onQuizDone((signal) => {
    if (!isEnabled(SITE_ID, TOGGLE.AUTO_NEXT)) return;
    handleQuizDone(signal);
  });
  const onVisible = (): void => {
    if (document.visibilityState !== 'visible') return;
    if (!isEnabled(SITE_ID, TOGGLE.AUTO_NEXT)) return;
    const mark = readQuizDone();
    if (mark !== null) handleQuizDone(mark);
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  log.debug('视频助手已挂载（二倍速 / 静音 / 防失焦）');

  // 手测用的诊断口。连播是「点一下 → 等页面反应 → 再看一眼」的状态机，出问题时
  // 最缺的就是「此刻目录到底长什么样」，所以留两个 Console 函数：
  //   __sztbUooc()     只读快照（不点任何东西，可反复调）
  //   __sztbUoocStep() 真的往后走一步，返回判定结果
  const pageWin = pageOrSelf() as Record<string, unknown>;
  pageWin['__sztbUooc'] = () => ({
    ...collectDiag(),
    autoNext: isEnabled(SITE_ID, TOGGLE.AUTO_NEXT),
    nextScope: getValue<string>(SITE_ID, VALUE.NEXT_SCOPE),
    autoProgress: isEnabled(SITE_ID, TOGGLE.AUTO_PROGRESS),
    waitingQuiz,
  });
  pageWin['__sztbUoocStep'] = () => stepForward();

  return () => {
    stopped = true;
    stopProgress();
    clearSwitch();
    delete pageWin['__sztbUooc'];
    delete pageWin['__sztbUoocStep'];
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    observer.disconnect();
    document.removeEventListener('loadstart', onLoad, true);
    document.removeEventListener('loadedmetadata', onLoad, true);
    for (const type of MEDIA_EVENTS) document.removeEventListener(type, onMediaEvent, true);
    window.removeEventListener('hashchange', onRoute);
    window.removeEventListener('popstate', onRoute);
    offQuizDone();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  };
}
