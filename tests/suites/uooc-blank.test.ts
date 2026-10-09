/**
 * `uooc/blank` 的纯函数部分 —— 盒子写入器、Annex-B 切分、`avcC`、整份 MP4 合成。
 *
 * 为什么单独锁它：这段代码产出的字节要**直接喂给浏览器的解码器**，写错一个长度字段
 * 的后果不是报错，是播放器黑屏/卡死 —— 而在真机上排查这种问题只能靠肉眼盯播放器。
 * 所以断言全部落在字节层面（盒子边界、时长字段、样本偏移），让机器替我们盯。
 */

import { assert, assertDeepEqual, assertEqual, assertThrows, describe, it } from '../harness.ts';
import {
  base64ToBytes,
  blankVideoBytes,
  box,
  buildAvcC,
  buildBlankMp4,
  nalType,
  splitAnnexB,
} from '../../src/sites/uooc/blank.ts';

/** 测试用的真实时长：抓包里 markVideoLearn 上报过 614.29 秒 */
const DURATION_MS = 614290;

interface BoxInfo {
  readonly type: string;
  readonly start: number;
  readonly size: number;
  /** 载荷起点（跳过 4 字节长度 + 4 字节类型） */
  readonly body: number;
}

function u16(b: Uint8Array, at: number): number {
  return ((b[at]! << 8) | b[at + 1]!) >>> 0;
}

function u32(b: Uint8Array, at: number): number {
  return ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
}

function asciiOf(b: Uint8Array, at: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i += 1) s += String.fromCharCode(b[at + i]!);
  return s;
}

/** 把 from..to 之间**连续**的盒子逐个列出来 */
function boxes(b: Uint8Array, from = 0, to: number = b.length): BoxInfo[] {
  const out: BoxInfo[] = [];
  let at = from;
  while (at + 8 <= to) {
    const size = u32(b, at);
    if (size < 8 || at + size > to) break;
    out.push({ type: asciiOf(b, at + 4, 4), start: at, size, body: at + 8 });
    at += size;
  }
  return out;
}

function find(b: Uint8Array, from: number, to: number, type: string): BoxInfo {
  const hit = boxes(b, from, to).find((x) => x.type === type);
  assert(hit !== undefined, `没找到盒子 ${type}`);
  return hit!;
}

/** 顺着 moov → trak → mdia → minf → stbl 找到 stbl 里的某个盒子 */
function inStbl(b: Uint8Array, type: string): BoxInfo {
  const moov = find(b, 0, b.length, 'moov');
  const trak = find(b, moov.body, moov.start + moov.size, 'trak');
  const mdia = find(b, trak.body, trak.start + trak.size, 'mdia');
  const minf = find(b, mdia.body, mdia.start + mdia.size, 'minf');
  const stbl = find(b, minf.body, minf.start + minf.size, 'stbl');
  return find(b, stbl.body, stbl.start + stbl.size, type);
}

describe('uooc/blank · 字节小工具', () => {
  it('box 写的是「长度 + 类型 + 载荷」', () => {
    const b = box('abcd', new Uint8Array([1, 2]));
    assertEqual(b.length, 10);
    assertEqual(u32(b, 0), 10);
    assertEqual(asciiOf(b, 4, 4), 'abcd');
    assertDeepEqual([...b.slice(8)], [1, 2]);
  });

  it('base64ToBytes 与 atob 一致', () => {
    assertDeepEqual([...base64ToBytes('AAECAw==')], [0, 1, 2, 3]);
    assertEqual(base64ToBytes('').length, 0);
  });
});

describe('uooc/blank · Annex-B 切分', () => {
  it('3 字节与 4 字节起始码都认，尾部补齐的 0 不算进 NAL', () => {
    const stream = new Uint8Array([0, 0, 0, 1, 0x67, 0xaa, 0, 0, 1, 0x68, 0xbb, 0xcc, 0, 0, 0]);
    const nals = splitAnnexB(stream);
    assertEqual(nals.length, 2);
    assertDeepEqual([...nals[0]!], [0x67, 0xaa]);
    assertDeepEqual([...nals[1]!], [0x68, 0xbb, 0xcc]);
  });

  it('没有起始码就什么都切不出来', () => {
    assertEqual(splitAnnexB(new Uint8Array([1, 2, 3, 4])).length, 0);
    assertEqual(splitAnnexB(new Uint8Array(0)).length, 0);
  });

  it('nalType 取头字节低 5 位', () => {
    assertEqual(nalType(new Uint8Array([0x67])), 7);
    assertEqual(nalType(new Uint8Array([0x68])), 8);
    assertEqual(nalType(new Uint8Array([0x65])), 5);
    assertEqual(nalType(new Uint8Array([0x06])), 6);
  });
});

describe('uooc/blank · avcC', () => {
  const sps = new Uint8Array([0x67, 0x42, 0xc0, 0x1e, 0x9a]);
  const pps = new Uint8Array([0x68, 0xce, 0x0f, 0xc8]);

  it('头部四字节照抄 SPS，长度前缀固定 4 字节', () => {
    const c = buildAvcC(sps, pps);
    assertEqual(c[0], 1, 'configurationVersion');
    assertEqual(c[1], 0x42, 'profile');
    assertEqual(c[2], 0xc0, 'profile_compatibility');
    assertEqual(c[3], 0x1e, 'level');
    assertEqual(c[4], 0xff, 'lengthSizeMinusOne 必须是 3');
    assertEqual(c[5], 0xe1, 'numOfSPS = 1');
    assertEqual(u16(c, 6), sps.length);
    assertDeepEqual([...c.slice(8, 8 + sps.length)], [...sps]);
    assertEqual(c[8 + sps.length], 1, 'numOfPPS = 1');
    assertEqual(u16(c, 9 + sps.length), pps.length);
    assertDeepEqual([...c.slice(11 + sps.length)], [...pps]);
    assertEqual(c.length, 11 + sps.length + pps.length);
  });

  it('SPS 短到读不出档次要报错', () => {
    assertThrows(() => {
      buildAvcC(new Uint8Array([0x67, 0x42]), pps);
    });
  });
});

describe('uooc/blank · MP4 合成', () => {
  const sps = new Uint8Array([0x67, 0x42, 0xc0, 0x1e, 0x9a]);
  const pps = new Uint8Array([0x68, 0xce, 0x0f, 0xc8]);
  const idr = new Uint8Array([0x65, 0x01, 0x02, 0x03]);
  const mp4 = buildBlankMp4({ durationMs: DURATION_MS, width: 640, height: 360, sps, pps, sampleNals: [idr] });

  it('顶层是 ftyp + moov + mdat，且首尾严丝合缝', () => {
    const top = boxes(mp4);
    assertDeepEqual(
      top.map((b) => b.type),
      ['ftyp', 'moov', 'mdat'],
    );
    assertEqual(top[0]!.start, 0);
    assertEqual(top[2]!.start + top[2]!.size, mp4.length, 'mdat 之后不该有剩余字节');
    assertEqual(asciiOf(mp4, 8, 4), 'isom');
  });

  it('mvhd：时间基 1000、时长为整段', () => {
    const moov = find(mp4, 0, mp4.length, 'moov');
    const mvhd = find(mp4, moov.body, moov.start + moov.size, 'mvhd');
    assertEqual(u32(mp4, mvhd.body + 12), 1000);
    assertEqual(u32(mp4, mvhd.body + 16), DURATION_MS);
  });

  it('tkhd：轨道时长与画面尺寸', () => {
    const moov = find(mp4, 0, mp4.length, 'moov');
    const trak = find(mp4, moov.body, moov.start + moov.size, 'trak');
    const tkhd = find(mp4, trak.body, trak.start + trak.size, 'tkhd');
    assertEqual(u32(mp4, tkhd.body + 20), DURATION_MS);
    assertEqual(u32(mp4, tkhd.start + tkhd.size - 8), 640 << 16);
    assertEqual(u32(mp4, tkhd.start + tkhd.size - 4), 360 << 16);
  });

  it('mdhd：媒体时间基与时长跟 mvhd 一致', () => {
    const mdhd = inStblExtra(mp4, 'mdhd');
    assertEqual(u32(mp4, mdhd.body + 12), 1000);
    assertEqual(u32(mp4, mdhd.body + 16), DURATION_MS);
  });

  it('stts：一个样本，delta 就是整段时长（黑帧显示到片尾）', () => {
    const stts = inStbl(mp4, 'stts');
    assertEqual(u32(mp4, stts.body + 4), 1, 'entry_count');
    assertEqual(u32(mp4, stts.body + 8), 1, 'sample_count');
    assertEqual(u32(mp4, stts.body + 12), DURATION_MS, 'sample_delta');
  });

  it('stsz 记的样本大小 = 长度前缀 + NAL', () => {
    const stsz = inStbl(mp4, 'stsz');
    assertEqual(u32(mp4, stsz.body + 8), 1, 'sample_count');
    assertEqual(u32(mp4, stsz.body + 12), idr.length + 4);
  });

  it('stco 指向 mdat 载荷，且那里确实是长度前缀的 NAL', () => {
    const stco = inStbl(mp4, 'stco');
    const offset = u32(mp4, stco.body + 8);
    const mdat = find(mp4, 0, mp4.length, 'mdat');
    assertEqual(offset, mdat.body, '样本偏移必须正好是 mdat 载荷起点');
    assertEqual(u32(mp4, offset), idr.length);
    assertDeepEqual([...mp4.slice(offset + 4, offset + 4 + idr.length)], [...idr]);
  });

  it('avc1 描述里的尺寸、帧数、avcC 都对得上', () => {
    const stsd = inStbl(mp4, 'stsd');
    const avc1 = find(mp4, stsd.body + 8, stsd.start + stsd.size, 'avc1');
    assertEqual(u16(mp4, avc1.body + 6), 1, 'data_reference_index');
    assertEqual(u16(mp4, avc1.body + 24), 640);
    assertEqual(u16(mp4, avc1.body + 26), 360);
    assertEqual(u32(mp4, avc1.body + 28), 0x00480000, '72 dpi');
    assertEqual(u16(mp4, avc1.body + 40), 1, 'frame_count');
    const avcC = find(mp4, avc1.body + 78, avc1.start + avc1.size, 'avcC');
    assertEqual(mp4[avcC.body], 1);
    assertEqual(mp4[avcC.body + 1], sps[1]);
  });
});

/** `mdhd` / `hdlr` 在 mdia 下、和 minf 平级，不能走 inStbl */
function inStblExtra(b: Uint8Array, type: string): BoxInfo {
  const moov = find(b, 0, b.length, 'moov');
  const trak = find(b, moov.body, moov.start + moov.size, 'trak');
  const mdia = find(b, trak.body, trak.start + trak.size, 'mdia');
  return find(b, mdia.body, mdia.start + mdia.size, type);
}

describe('uooc/blank · 内嵌黑帧', () => {
  const bytes = blankVideoBytes(DURATION_MS);

  it('合成结果能被解出 ftyp/moov/mdat，且 mdat 里只有一个 IDR', () => {
    const top = boxes(bytes);
    assertDeepEqual(
      top.map((b) => b.type),
      ['ftyp', 'moov', 'mdat'],
    );
    const mdat = top[2]!;
    const sampleLen = u32(bytes, mdat.body);
    assertEqual(sampleLen, mdat.size - 12, 'mdat 里应当只有这一个样本');
    assertEqual(nalType(bytes.slice(mdat.body + 4)), 5, '样本是 IDR 切片');
  });

  it('时长只写进头部，不改变体积', () => {
    assertEqual(blankVideoBytes(1000).length, blankVideoBytes(8 * 60 * 60 * 1000).length);
    assertEqual(blankVideoBytes(1000).length, bytes.length);
  });

  it('体积足够小（这就是整件事的目的）', () => {
    assert(bytes.length < 4096, `空白 mp4 应当远小于一帧图片，实际 ${bytes.length} 字节`);
  });

  it('内嵌码流是 baseline profile（老设备也能解）', () => {
    const stsd = inStbl(bytes, 'stsd');
    const avc1 = find(bytes, stsd.body + 8, stsd.start + stsd.size, 'avc1');
    const avcC = find(bytes, avc1.body + 78, avc1.start + avc1.size, 'avcC');
    assertEqual(bytes[avcC.body + 1], 0x42, 'AVCProfileIndication = baseline');
    assertEqual(bytes[avcC.body + 3], 0x1e, 'level 3.0');
  });

  it('每个时长都得到合法的 moov（抽几个边界值）', () => {
    for (const ms of [1, 1000, 60_000, DURATION_MS, 8 * 60 * 60 * 1000]) {
      const one = blankVideoBytes(ms);
      const stts = inStbl(one, 'stts');
      assertEqual(u32(one, stts.body + 12), ms, `${ms}ms 的 sample_delta`);
      const top = boxes(one);
      assertEqual(top[2]!.start + top[2]!.size, one.length, `${ms}ms 的盒子要铺满整个文件`);
    }
  });
});
