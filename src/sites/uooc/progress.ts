/**
 * UOOC 视频进度上报（随机心跳）。
 *
 * 站点自己会在视频播放期间向 `POST /home/learn/markVideoLearn` 提交进度
 * （抓包实测 body：`chapter_id=&cid=&hidemsg_=true&network=2&resource_id=&
 * section_id=&source=1&subsection_id=0&video_length=&video_pos=`）。
 * 本模块按用户设置的**随机区间**再补一份，用于把进度往前推。
 *
 * 出口优先级（用户拍板）：
 *   1. **站点自己的函数** —— 学习控制器 scope 上有 `LearnMark`（旧版实证）。
 *      但打包后的 JS 里只有接口声明表、没有调用点，签名拿不到，所以只能
 *      「按最可能的形状调一次，抛错就换路」。
 *   2. **直连** —— 自己按抓包里那份报文 POST，走 `common/core/http.ts` 的
 *      统一出口（页面 `unsafeWindow.fetch`，Cookie / Referer 与站点自身请求一致）。
 *
 * ⚠️ 这是 🔴 irreversible 开关（需求文档 §8.1 N1/N6）：默认关、需要在设置里
 * 显式勾选并二次确认才会生效；关掉后下一次 tick 就自己停。
 *
 * 「改了区间立刻按新区间重新计时」不是靠设置回调做的，而是靠
 * `noteVideo()` 里的 key 比对 —— 它由 `video.ts` 的 DOM 变动扫描驱动
 * （约 200ms 一次），所以区间一改，最多 200ms 后就会重启倒计时。
 */

import { PRIORITY, request, qs } from '../../common/core/http.ts';
import { scoped } from '../../common/core/log.ts';
import { getValue, isEnabled } from '../../common/core/settings.ts';
import { activeResourceItem, findScopeFunction, parseHash, readLearnContext } from './catalog.ts';
import { PROGRESS_DEFAULT, SITE_ID, TOGGLE, VALUE } from './settings.ts';

const log = scoped('uooc/progress');

/** 站点自己的进度提交接口 */
const MARK_PATH = '/home/learn/markVideoLearn';

/**
 * 站点控制器上「提交视频进度」可能叫的名字。
 *
 * `LearnMark` 是旧版学习页 scope 上实测到的（`courseService` 里对应的接口别名
 * 也是它）；其余几个是防止新版换名留的兜底，找不到就直连。
 */
const SITE_FN_NAMES: readonly string[] = ['LearnMark', 'learnMark', 'markVideoLearn'];

/**
 * 报文里的固定字段，照抄抓包。
 *
 * ⚠️ 这几个值站点自己也不总是相同（同一端点抓到过 `network=2`，用户样本里是
 * `network=1`），含义未知，原样带着即可。
 */
const NETWORK = '2';

/** 区间的硬边界（秒）：比这还小就是对站点不客气，比这还大就没意义了 */
const MIN_INTERVAL_S = 5;
const MAX_INTERVAL_S = 3600;

/** 当前挂着的视频；`null` = 还没看到播放器 */
let current: HTMLVideoElement | null = null;

/** 上一次用于判定「要不要重新计时」的场景指纹 */
let lastKey = '';

/** 倒计时句柄 */
let timer: ReturnType<typeof setTimeout> | null = null;

/** 已上报次数（只用于日志） */
let sent = 0;

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function clampInt(raw: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

/** 读出用户设置的区间（秒），已做合法性收敛 */
function intervalRange(): { min: number; max: number } {
  const min = clampInt(
    getValue<string>(SITE_ID, VALUE.PROGRESS_MIN),
    clampInt(PROGRESS_DEFAULT.min, 30, MIN_INTERVAL_S, MAX_INTERVAL_S),
    MIN_INTERVAL_S,
    MAX_INTERVAL_S,
  );
  const max = clampInt(
    getValue<string>(SITE_ID, VALUE.PROGRESS_MAX),
    clampInt(PROGRESS_DEFAULT.max, 90, min, MAX_INTERVAL_S),
    min,
    MAX_INTERVAL_S,
  );
  return { min, max };
}

function nextDelayMs(): number {
  const { min, max } = intervalRange();
  const span = max - min;
  return (min + Math.random() * span) * 1000;
}

/** 场景指纹：换集 / 开关 / 区间，任一项变了就重新计时 */
function sceneKey(): string {
  const h = parseHash();
  const where = h === null ? '' : `${h.cid}/${h.chapterId}/${h.sectionId}/${h.resourceId}`;
  const on = isEnabled(SITE_ID, TOGGLE.AUTO_PROGRESS) ? '1' : '0';
  const { min, max } = intervalRange();
  return `${where}|${on}|${min}-${max}`;
}

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function schedule(): void {
  clearTimer();
  if (!isEnabled(SITE_ID, TOGGLE.AUTO_PROGRESS)) return;
  const delay = nextDelayMs();
  timer = setTimeout(tick, delay);
  log.debug(`进度上报：${Math.round(delay / 1000)} 秒后再报一次`);
}

async function report(v: HTMLVideoElement): Promise<void> {
  const el = activeResourceItem();
  if (el === null) {
    log.warn('进度上报：目录里找不到当前资源（`.active`），这次跳过');
    return;
  }
  const ctx = readLearnContext(el);
  if (ctx === null) {
    log.warn('进度上报：拿不到 课程/章/节/资源 id，这次跳过');
    return;
  }

  // 字段顺序照抄站点自己的报文（`qs()` 按对象插入顺序拼串），别随手重排
  const payload: Record<string, string> = {
    chapter_id: ctx.chapterId,
    cid: ctx.cid,
    hidemsg_: 'true',
    network: NETWORK,
    resource_id: ctx.resourceId,
    section_id: ctx.sectionId,
    source: '1',
    subsection_id: '0',
    video_length: v.duration.toFixed(2),
    video_pos: v.currentTime.toFixed(2),
  };

  // 路 1：站点自己的函数（签名未知，按最可能的形状调一次）
  const fn = findScopeFunction(v, SITE_FN_NAMES);
  if (fn !== null) {
    try {
      fn(payload);
      sent += 1;
      log.info(`进度上报（站点函数，第 ${sent} 次）：${payload['video_pos']}s / ${payload['video_length']}s`);
      return;
    } catch (err) {
      log.warn(`站点函数上报抛错（${describe(err)}），这次改走直连`);
    }
  }

  // 路 2：直连（报文与站点自己发的一致）
  try {
    const res = await request({
      url: MARK_PATH,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: qs(payload),
      priority: PRIORITY.NORMAL,
    });
    sent += 1;
    if (res.status < 200 || res.status >= 300) {
      log.warn(`进度上报（直连）返回 ${res.status}（第 ${sent} 次）：${res.text.slice(0, 120)}`);
      return;
    }
    log.info(`进度上报（直连，第 ${sent} 次）：${payload['video_pos']}s / ${payload['video_length']}s`);
  } catch (err) {
    log.warn(`进度上报（直连）请求失败：${describe(err)}`);
  }
}

function tick(): void {
  timer = null;
  if (!isEnabled(SITE_ID, TOGGLE.AUTO_PROGRESS)) return;

  const v = current;
  // 「播放期间上报」：暂停 / 播完 / 还没读到时源时这一轮不发，只重新排下一次
  if (v !== null && !v.paused && !v.ended && v.currentTime > 0 && v.readyState >= 2) {
    void report(v);
  }

  schedule();
}

/**
 * 每次扫到播放器时调一次（由 `video.ts` 的 `apply()` 驱动，约 200ms 一次）。
 *
 * 只有「场景变了」才重启倒计时 —— 否则 DOM 每动一下就把计时器推后，
 * 永远也轮不到上报。
 */
export function noteVideo(v: HTMLVideoElement): void {
  const key = sceneKey();
  if (v === current && key === lastKey) return;
  if (v !== current) log.debug('进度上报：扫到新的播放器，重新计时');
  current = v;
  lastKey = key;
  schedule();
}

/** 卸载时调（关掉计时器） */
export function stopProgress(): void {
  clearTimer();
  current = null;
  lastKey = '';
}
