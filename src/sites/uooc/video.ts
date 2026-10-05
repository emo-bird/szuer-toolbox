/**
 * UOOC 视频助手：二倍速（U1）+ 静音（U2）。
 *
 * 证据来源（都是现成可运行的脚本，不是我猜的）：
 *   - `local/reference/uooc防止失去焦点，自动二倍数播放.js`（1230 B）——
 *     用 `document.getElementById('player_html5_api')` 取 video.js 的 video 元素，
 *     然后 `playbackRate = 2`、`muted = true`；
 *   - `local/reference/UOOC assistant.js` v1.0.8 —— 同一套选择器（:511 / :544 / :777）。
 * 两处独立来源一致，所以 `#player_html5_api` 可信；`<video>` 作为兜底。
 *
 * 为什么不照抄参考脚本的 `setInterval(..., 1000)`：
 *   站点是 SPA，换集时 video 元素会被 video.js 重建。参考脚本靠 1 秒轮询兜住这件事，
 *   代价是整段观看期间都在跑定时器。这里改成「DOM 变更观察 + 媒体事件捕获」，
 *   只在**元素出现**与**新片源载入**时动作。
 *
 * 与参考脚本一处**有意的不同**：不在 `ratechange` 事件上重新应用速率。
 * 否则用户在站点自带的倍速菜单里选了 1.0x，会被立刻扳回 2.0x，看起来像播放器坏了。
 * 我们只在「元素出现 / 新片源载入 / 开始播放」时各应用一次；
 * 用户手动改速率之后我们就让位（关掉开关再打开可以重新夺回）。
 */

import { scoped } from '../../common/core/log.ts';
import { isEnabled } from '../../common/core/settings.ts';
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

/** 我们对每个 video 元素做过什么 —— 关开关时只回退**我们改过**的那部分 */
interface Applied {
  rate: boolean;
  mute: boolean;
}

const applied = new WeakMap<HTMLVideoElement, Applied>();

/** 已经打过「已应用」日志的元素，避免换集时刷屏 */
const announced = new WeakSet<HTMLVideoElement>();

/** 元素是不是真的 video（不依赖 `instanceof HTMLVideoElement`，沙箱里它可能不是同一个构造器） */
function asVideo(el: Element | null): HTMLVideoElement | null {
  return el !== null && el.tagName === 'VIDEO' ? (el as HTMLVideoElement) : null;
}

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
      `播放器助手已就绪：二倍速=${wantRate ? '开' : '关'}，静音=${wantMute ? '开' : '关'}` +
        `（当前速率 ${v.playbackRate}x）`,
    );
  }
}

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
  const onMediaEvent = (): void => scan();
  document.addEventListener('play', onMediaEvent, true);
  document.addEventListener('loadstart', onMediaEvent, true);
  document.addEventListener('loadedmetadata', onMediaEvent, true);

  // 站内 hash 路由换集不会重载页面
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);

  log.debug('视频助手已挂载（二倍速 / 静音）');

  return () => {
    stopped = true;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    observer.disconnect();
    document.removeEventListener('play', onMediaEvent, true);
    document.removeEventListener('loadstart', onMediaEvent, true);
    document.removeEventListener('loadedmetadata', onMediaEvent, true);
    window.removeEventListener('hashchange', schedule);
    window.removeEventListener('popstate', schedule);
  };
}
