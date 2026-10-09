/**
 * UOOC 空白片源（V5）—— 把站点的真实课程视频换成**等长的纯黑片段**。
 *
 * 为什么这么做：课程视频是**跨域直连 MP4**（`sourcetx3.uooconline.com`），
 * 浏览器自己发的媒体请求 JS 拦不到，唯一的下手点就是 `video.src`。
 * 换成一帧黑画面、时长为原片时长的自制 MP4 之后：
 *
 * - 下载量从几百 MB 掉到 1 KB 上下；
 * - `currentTime` 照常走、`ended` 照常触发，站点的 `markVideoLearn`
 *   上报的 `video_length` / `video_pos` 与真实播放完全一致（时长取自原片元数据）。
 *
 * ⚠️ 只省流量、**不省墙钟时间**：614 秒的课在 2 倍速下依然要 307 秒才 `ended`。
 *
 * 为什么在代码里合成 MP4 而不是塞一份现成的小 mp4 文件：
 * 仓库里没有任何媒体文件，而 mp4 的**盒子结构**完全可以手写；真正必须由编码器
 * 产出的只有「一帧黑画面」的 H.264 码流那几百个字节 —— 它以 base64 常量内嵌在本文件
 * （见 `BLACK_FRAME_B64`，生成命令见 docs/开发文档.md）。
 *
 * 关键手法：只有一个 sample，却把 `stts` 的 `sample_delta` 设成**整段时长**，
 * 于是浏览器认为这一帧要显示到片尾 —— 播放条平滑前进，到点触发 `ended`。
 */

import { scoped } from '../../common/core/log.ts';
import { isEnabled } from '../../common/core/settings.ts';
import { noticePost } from './notice.ts';
import { SITE_ID, TOGGLE } from './settings.ts';

const log = scoped('uooc/blank');

/**
 * 一帧黑画面的 H.264 Annex-B 码流（base64）。
 *
 * 由 ffmpeg 生成，**不要手改**：
 * ```
 * ffmpeg -y -f lavfi -i color=c=black:s=640x360:d=1 -frames:v 1 -c:v libx264 \
 *   -preset veryfast -tune stillimage -profile:v baseline -level 3.0 \
 *   -pix_fmt yuv420p -bf 0 -x264-params keyint=1:scenecut=0 -f h264 black.264
 * ```
 * NAL 顺序是 SPS(7) / PPS(8) / SEI(6) / IDR(5)。其中 SEI 只是 x264 的版本字符串
 * （约 600 字节，占了大头），`blankVideoBytes()` 会把它丢掉 —— 它进不了 mp4。
 */
const BLACK_FRAME_B64 =
  'AAAAAWdCwB7cCgL/lwEQAAADABAAAAMDIPFi+AAAAAFozg/IAAABBgX//1vcRem95tlIt5Ys2CDZ' +
  'I+7veDI2NCAtIGNvcmUgMTY1IHIzMjIzIDA0ODBjYjAgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVj' +
  'IC0gQ29weWxlZnQgMjAwMy0yMDI1IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1s' +
  'IC0gb3B0aW9uczogY2FiYWM9MCByZWY9MSBkZWJsb2NrPTE6LTM6LTMgYW5hbHlzZT0weDE6MHgx' +
  'MTEgbWU9aGV4IHN1Ym1lPTIgcHN5PTEgcHN5X3JkPTIuMDA6MC43MCBtaXhlZF9yZWY9MCBtZV9y' +
  'YW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTAgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEs' +
  'MTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9MCB0aHJlYWRzPTExIGxvb2thaGVhZF90' +
  'aHJlYWRzPTIgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJs' +
  'dXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5' +
  'aW50PTEga2V5aW50X21pbj0xIHNjZW5lY3V0PTAgaW50cmFfcmVmcmVzaD0wIHJjPWNyZiBtYnRy' +
  'ZWU9MCBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0' +
  'aW89MS40MCBhcT0xOjEuMjAAgAAAAWWIhAVzn///D0UAAULfJycnJycnJycnJycnJycnJycnJycn' +
  'JycnJycnJycnJycnJycnJycnXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' +
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXgA==';

/** 黑帧尺寸：必须与码流里 SPS 一致，否则 `avc1` 描述与实际画面不符 */
const BLACK_WIDTH = 640;
const BLACK_HEIGHT = 360;

/**
 * 媒体时间基。取 1000（毫秒）是刻意的：单帧的 `stts.sample_delta` 于是**直接就是
 * 时长毫秒数**，不用做换算；毫秒精度也足够让上报的 `video_length` 小数位对得上。
 */
const TIMESCALE = 1000;

/**
 * 换源时长上限。超过 8 小时的「课程视频」多半是脏数据（时长读到 Infinity 或垃圾值），
 * 与其合成一个荒唐的 mp4，不如老实播原片。
 */
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;

/** `durationMs → blob:` 的缓存，避免同一集反复建 Blob（换集回来时命中） */
const urlCache = new Map<number, string>();

/** 缓存条数上限：一页翻几十集也够用了，多了纯占内存 */
const URL_CACHE_MAX = 32;

// ---------------------------------------------------------------- 字节小工具

function u16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** 一个普通盒子：4 字节长度 + 4 字节类型 + 载荷 */
export function box(type: string, ...parts: readonly Uint8Array[]): Uint8Array {
  const payload = concat(parts);
  return concat([u32(payload.length + 8), ascii(type), payload]);
}

/** 一个 full box：在普通盒子的载荷前插 1 字节 version + 3 字节 flags */
function fullBox(type: string, version: number, flags: number, ...parts: readonly Uint8Array[]): Uint8Array {
  return box(type, new Uint8Array([version & 0xff, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff]), ...parts);
}

/** 单位矩阵（16.16 / 2.30 定点），`mvhd` 与 `tkhd` 都要 */
const MATRIX = ((): Uint8Array => {
  const m = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];
  return concat(m.map((v) => u32(v)));
})();

// ---------------------------------------------------------------- 码流解析

/** base64 → 字节。`atob` 在页面与 Node（≥16）里都是全局函数，两边都能用 */
export function base64ToBytes(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 把 Annex-B 码流按起始码切开，返回每个 NAL（**含** NAL 头字节，**不含**起始码）。
 *
 * 起始码可能是 3 字节（`00 00 01`）也可能是 4 字节（`00 00 00 01`），
 * 统一按「`00 00 01` 之后就是 NAL 头」处理，多出来的那个 0 归到上一个 NAL 的尾部，
 * 再由尾部去零去掉（RBSP 的最后一个字节必带停止位，不可能是 0，所以去零是安全的）。
 */
export function splitAnnexB(stream: Uint8Array): Uint8Array[] {
  const heads: number[] = [];
  for (let i = 0; i + 2 < stream.length; i += 1) {
    if (stream[i] === 0 && stream[i + 1] === 0 && stream[i + 2] === 1) {
      heads.push(i + 3);
      i += 2;
    }
  }

  const out: Uint8Array[] = [];
  for (let k = 0; k < heads.length; k += 1) {
    const start = heads[k]!;
    let end = k + 1 < heads.length ? heads[k + 1]! - 3 : stream.length;
    while (end > start && stream[end - 1] === 0) end -= 1;
    if (end > start) out.push(stream.slice(start, end));
  }
  return out;
}

/** NAL 类型（头字节低 5 位）：7=SPS / 8=PPS / 6=SEI / 5=IDR 切片 / 1=非 IDR 切片 */
export function nalType(nal: Uint8Array): number {
  return (nal[0] ?? 0) & 0x1f;
}

/**
 * 组装 `avcC`（AVCDecoderConfigurationRecord）的载荷（不含盒子头）。
 *
 * 浏览器就靠它知道 SPS/PPS 与「NAL 长度是几字节的前缀」，所以 `lengthSizeMinusOne`
 * 必须固定为 3 —— `mdat` 里我们写的就是 4 字节长度前缀。
 */
export function buildAvcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  if (sps.length < 4) throw new Error('SPS 太短，至少要有 4 个字节');
  return concat([
    new Uint8Array([1]), // configurationVersion
    new Uint8Array([sps[1]!]), // AVCProfileIndication
    new Uint8Array([sps[2]!]), // profile_compatibility
    new Uint8Array([sps[3]!]), // AVCLevelIndication
    new Uint8Array([0xfc | 3]), // 保留 6 位全 1 + lengthSizeMinusOne=3（4 字节长度前缀）
    new Uint8Array([0xe0 | 1]), // 保留 3 位全 1 + numOfSequenceParameterSets=1
    u16(sps.length),
    sps,
    new Uint8Array([1]), // numOfPictureParameterSets
    u16(pps.length),
    pps,
  ]);
}

// ---------------------------------------------------------------- MP4 合成

export interface BlankMp4Options {
  /** 视频时长（毫秒）：同时写进 mvhd / tkhd / mdhd，也是单帧的 sample_delta */
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
  readonly sps: Uint8Array;
  readonly pps: Uint8Array;
  /** 进 `mdat` 的切片 NAL（**不含**起始码），按长度前缀写 */
  readonly sampleNals: readonly Uint8Array[];
}

/**
 * 合成一个「单帧、指定时长」的最小 MP4。
 *
 * 结构：`ftyp` + `moov`（`mvhd` / `trak`→`tkhd`,`mdia`→`mdhd`,`hdlr`,`minf`→`vmhd`,`dinf`,
 * `stbl`→`stsd`/`avc1`/`avcC`,`stts`,`stsc`,`stsz`,`stco`）+ `mdat`。
 */
export function buildBlankMp4(opts: BlankMp4Options): Uint8Array {
  const { durationMs, width, height, sps, pps } = opts;

  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41'));

  // 一个 sample = 4 字节长度前缀 + NAL（MP4 里不用起始码）
  const sample = concat(opts.sampleNals.map((nal) => concat([u32(nal.length), nal])));
  const mdat = box('mdat', sample);

  const mvhd = fullBox(
    'mvhd',
    0,
    0,
    u32(0), // creation_time
    u32(0), // modification_time
    u32(TIMESCALE),
    u32(durationMs),
    u32(0x00010000), // rate = 1.0
    u16(0x0100), // volume = 1.0
    u16(0), // reserved
    u32(0), // reserved
    u32(0), // reserved
    MATRIX,
    u32(0),
    u32(0),
    u32(0),
    u32(0),
    u32(0),
    u32(0), // pre_defined[6]
    u32(2), // next_track_ID
  );

  const tkhd = fullBox(
    'tkhd',
    0,
    7, // enabled | in movie | in preview
    u32(0),
    u32(0),
    u32(1), // track_ID
    u32(0), // reserved
    u32(durationMs),
    u32(0),
    u32(0), // reserved[2]
    u16(0), // layer
    u16(0), // alternate_group
    u16(0), // volume（视频轨恒为 0）
    u16(0), // reserved
    MATRIX,
    u32(width << 16),
    u32(height << 16),
  );

  const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(durationMs), u16(0x55c4), u16(0)); // 语言 'und'

  const hdlr = fullBox('hdlr', 0, 0, u32(0), ascii('vide'), u32(0), u32(0), u32(0), ascii('VideoHandler\0'));

  const vmhd = fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0));

  // dref 里一条 'url ' 且 flags=1：数据就在本文件里，没有外部数据引用
  const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));

  const avc1 = box(
    'avc1',
    new Uint8Array([0, 0, 0, 0, 0, 0]), // reserved
    u16(1), // data_reference_index
    u16(0), // pre_defined
    u16(0), // reserved
    u32(0),
    u32(0),
    u32(0), // pre_defined[3]
    u16(width),
    u16(height),
    u32(0x00480000), // 72 dpi
    u32(0x00480000),
    u32(0), // reserved
    u16(1), // frame_count
    new Uint8Array(32), // compressorname（32 字节定长，全 0 即无名）
    u16(0x0018), // depth
    u16(0xffff), // pre_defined
    box('avcC', buildAvcC(sps, pps)),
  );

  const buildMoov = (chunkOffset: number): Uint8Array => {
    const stbl = box(
      'stbl',
      fullBox('stsd', 0, 0, u32(1), avc1),
      // 只有一个 sample，它的 delta 就是整段时长 —— 黑帧「显示」到片尾
      fullBox('stts', 0, 0, u32(1), u32(1), u32(durationMs)),
      fullBox('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
      fullBox('stsz', 0, 0, u32(0), u32(1), u32(sample.length)),
      fullBox('stco', 0, 0, u32(1), u32(chunkOffset)),
    );
    const minf = box('minf', vmhd, dinf, stbl);
    const mdia = box('mdia', mdhd, hdlr, minf);
    const trak = box('trak', tkhd, mdia);
    return box('moov', mvhd, trak);
  };

  // stco 要写 mdat 载荷的绝对偏移，而 moov 的长度又取决于它自己 —— 长度是定长的，
  // 所以先用占位偏移算一次长度，再拿真偏移重建一次即可。
  const offset = ftyp.length + buildMoov(0).length + 8;
  return concat([ftyp, buildMoov(offset), mdat]);
}

// ---------------------------------------------------------------- 常量 → mp4

interface BlackFrame {
  readonly sps: Uint8Array;
  readonly pps: Uint8Array;
  readonly nals: readonly Uint8Array[];
}

let parsed: BlackFrame | null = null;

/** 解析内嵌的黑帧码流（只做一次），挑出 SPS / PPS / 切片 NAL，丢掉 SEI */
function blackFrame(): BlackFrame {
  if (parsed !== null) return parsed;

  const nals = splitAnnexB(base64ToBytes(BLACK_FRAME_B64));
  const sps = nals.find((n) => nalType(n) === 7);
  const pps = nals.find((n) => nalType(n) === 8);
  if (sps === undefined || pps === undefined) throw new Error('内嵌黑帧码流缺少 SPS/PPS');

  // SEI（类型 6）不进 mdat：它只是 x264 的版本字符串，白占字节
  const slice = nals.filter((n) => nalType(n) === 5 || nalType(n) === 1);
  if (slice.length === 0) throw new Error('内嵌黑帧码流缺少切片 NAL');

  parsed = { sps, pps, nals: slice };
  return parsed;
}

/** 合成指定时长的空白视频字节 */
export function blankVideoBytes(durationMs: number): Uint8Array {
  const frame = blackFrame();
  return buildBlankMp4({
    durationMs,
    width: BLACK_WIDTH,
    height: BLACK_HEIGHT,
    sps: frame.sps,
    pps: frame.pps,
    sampleNals: frame.nals,
  });
}

/** 同一时长复用同一个 blob: URL（换集回来时命中缓存） */
export function blankVideoUrl(durationMs: number): string {
  const hit = urlCache.get(durationMs);
  if (hit !== undefined) return hit;

  // 拷进一个「干净的」ArrayBuffer 再建 Blob：既躲开 SharedArrayBuffer 的类型纠结，
  // 也让 Blob 不持有我们可能复用的视图
  const bytes = blankVideoBytes(durationMs);
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  const url = URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
  if (urlCache.size >= URL_CACHE_MAX) {
    const oldest = urlCache.keys().next();
    if (oldest.done !== true) urlCache.delete(oldest.value);
  }
  urlCache.set(durationMs, url);
  return url;
}

/** 只给测试用：清掉缓存与换源记录 */
export function clearBlankCache(): void {
  urlCache.clear();
  states = new WeakMap<HTMLVideoElement, BlankState>();
  parsed = null;
}

// ---------------------------------------------------------------- 换源

/**
 * 同一元素的换源记录。
 *
 * **不能**用一次性的「处理过就跳过」标记：视频站的 `<video>` 元素是跨集复用的
 * （video.js 的播放器实例活在 SPA 里，换集只是给它换 src），一次性标记会让第 2 集
 * 起就再也不换源。所以判据是「当前 src 是不是我们自己设的那个 blob」。
 */
interface BlankState {
  /** 我们给这个元素设过的 blob: URL */
  url: string | null;
  /** 最近的换源时刻，用来发现「站点把 src 改回去」的对着改 */
  stamps: number[];
  /** 已经确认在对着改 → 不再碰这个元素 */
  giveUp: boolean;
  /** 上一次因为「时长长得不像话」而放弃的那个时长（同值不重复告警） */
  lastAbsurd: number | null;
}

let states = new WeakMap<HTMLVideoElement, BlankState>();

/** 对着改的判定：窗口内换源次数上限 */
const FIGHT_WINDOW_MS = 10_000;
const FIGHT_MAX = 3;

/**
 * 试着把这个播放器的片源换成等长空白视频。
 *
 * 时机是**必须**有元数据之后 —— 时长只能从原片读（站点的接口里没有时长，
 * `getUnitLearn` 只给 `video_pos`），所以这一步是「先让原片报出时长，再立刻换掉」。
 * 原片此时才刚开始下载，换掉之后不会再接着下。
 *
 * @returns 真的换了返回 true
 */
export function maybeSwapToBlank(v: HTMLVideoElement): boolean {
  const state = states.get(v) ?? { url: null, stamps: [], giveUp: false, lastAbsurd: null };
  states.set(v, state);

  if (state.giveUp) return false;
  if (!isEnabled(SITE_ID, TOGGLE.BLANK_VIDEO)) return false;
  // 当前片源就是我们设的空白视频 ⇒ 这一集已经处理过了
  if (state.url !== null && v.currentSrc === state.url) return false;
  // readyState < 1（HAVE_METADATA）时 duration 是 NaN
  if (v.readyState < 1) return false;

  const seconds = v.duration;
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  const durationMs = Math.round(seconds * 1000);
  if (durationMs > MAX_DURATION_MS) {
    if (state.lastAbsurd !== durationMs) {
      state.lastAbsurd = durationMs;
      log.warn(`时长 ${seconds}s 大得不像课程视频，不换片源`);
    }
    return false;
  }

  // 对着改护栏：正常换集间隔以分钟计，短时间内反复触发只可能是站点在把 src 改回去
  const now = Date.now();
  while (state.stamps.length > 0 && now - state.stamps[0]! > FIGHT_WINDOW_MS) state.stamps.shift();
  if (state.stamps.length >= FIGHT_MAX) {
    state.giveUp = true;
    log.warn(`这个播放器 ${FIGHT_WINDOW_MS / 1000} 秒内被换了 ${FIGHT_MAX} 次片源，疑似与站点对着改，停手`);
    noticePost('空白片源被站点反复改回，已停手，这一集继续播原片', 'warn', { quiet: true });
    return false;
  }

  const wasPlaying = !v.paused && !v.ended;
  let url: string;
  try {
    url = blankVideoUrl(durationMs);
  } catch (err) {
    log.warn(`合成空白视频失败，继续播原片：${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  state.stamps.push(now);
  state.url = url;
  v.src = url;

  // 换源会重新走一遍加载算法，loadedmetadata 会再响一次；那一次把播放接上
  v.addEventListener(
    'loadedmetadata',
    () => {
      try {
        if (v.currentTime !== 0) v.currentTime = 0;
      } catch {
        // 有的实现在 seekable 为空时拒绝设 currentTime，忽略
      }
      if (!wasPlaying) return;
      const p = v.play();
      if (p !== undefined && typeof p.catch === 'function') {
        p.catch((err: unknown) => {
          log.debug(`空白片源续播被拒绝：${err instanceof Error ? err.message : String(err)}`);
        });
      }
    },
    { once: true },
  );

  log.info(`片源已换成空白视频：${seconds.toFixed(2)}s（${blankVideoBytes(durationMs).length} 字节）`);
  noticePost(`视频已换成空白片段（${seconds.toFixed(1)} 秒），不再下载原片`, 'info', { quiet: true });
  return true;
}
