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
import { isEnabled } from '../../common/core/settings.ts';
import { maybeSwapToBlank } from './blank.ts';
import { SITE_ID, TOGGLE } from './settings.ts';

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

/** 按当前设置应用一次；开关关掉时只回退我们改过的部分 */
function apply(v: HTMLVideoElement): void {
  const state: Applied = applied.get(v) ?? { rate: false, mute: false };

  // U10：拿到原片时长之后就换成等长空白片源。只做一次；换源会让元素重新走
  // 加载算法，下面这些速率/静音设置会在新片源的 loadedmetadata 上再跑一遍。
  maybeSwapToBlank(v);

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

  if (!announced.has(v)) {
    announced.add(v);
    log.info(
      `播放器助手已就绪：二倍速=${wantRate ? '开' : '关'}，静音=${wantMute ? '开' : '关'}，` +
        `防失焦=${isEnabled(SITE_ID, TOGGLE.KEEP_PLAYING) ? '开' : '关'}（当前速率 ${v.playbackRate}x）`,
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

const MEDIA_EVENTS: readonly string[] = ['play', 'playing', 'pause', 'ratechange', 'volumechange'];

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
  document.addEventListener('ratechange', onMediaEvent, true);
  document.addEventListener('volumechange', onMediaEvent, true);

  // 站内 hash 路由换集不会重载页面
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);

  log.debug('视频助手已挂载（二倍速 / 静音 / 防失焦）');

  return () => {
    stopped = true;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    observer.disconnect();
    document.removeEventListener('loadstart', onLoad, true);
    document.removeEventListener('loadedmetadata', onLoad, true);
    for (const type of MEDIA_EVENTS) document.removeEventListener(type, onMediaEvent, true);
    window.removeEventListener('hashchange', schedule);
    window.removeEventListener('popstate', schedule);
  };
}
