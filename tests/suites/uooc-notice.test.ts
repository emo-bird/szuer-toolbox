/**
 * `uooc/notice` 的纯函数部分 —— 提示流的合并、截断、分级、订阅。
 *
 * 为什么单独锁它：用户 m02281 第 2/3 条要求「各种状态提示都显示在监视页第一位」
 * 且「要有 ToastStack」。这两件事**共用同一份数据**（notice.ts 是唯一出口），
 * 所以合并与分级一旦写错，界面会同时骗人两处：要么刷屏、要么该常驻的走了。
 */

import { assertEqual, describe, it } from '../harness.ts';
import {
  MAX_NOTICES,
  clearNotices,
  clockText,
  noticeBind,
  noticeList,
  noticePost,
  subscribeNotice,
} from '../../src/sites/uooc/notice.ts';
import type { PanelApi } from '../../src/sites/types.ts';

interface Call {
  message: string;
  kind: string;
  sticky: boolean;
}

/** 只用到 `toast` 的假面板（其余方法永不触发，测试里不需要） */
function fakeHost(calls: Call[], throwing = false): PanelApi {
  return {
    toast: (message: string, kind?: string, options?: { sticky?: boolean }) => {
      if (throwing) throw new Error('面板炸了');
      calls.push({ message, kind: kind ?? 'info', sticky: options?.sticky === true });
    },
  } as unknown as PanelApi;
}

function texts(): string[] {
  return noticeList().map((n) => n.text);
}

describe('uooc/notice · 记录与合并', () => {
  it('空串与纯空白不记', () => {
    clearNotices();
    noticePost('');
    noticePost('   ');
    assertEqual(noticeList().length, 0, '空文案不该进历史');
  });

  it('一条提示：默认 info、count 1、文案去空白', () => {
    clearNotices();
    noticePost('  接管中：正在读取课程目录…  ');
    const l = noticeList();
    assertEqual(l.length, 1, '应该记下来');
    assertEqual(l[0]!.kind, 'info', '不传 kind 就是 info');
    assertEqual(l[0]!.count, 1, '第一条 count=1');
    assertEqual(l[0]!.text, '接管中：正在读取课程目录…', '前后空白要去掉');
  });

  it('连续同文案同级别 ⇒ 合并计数，不新增', () => {
    clearNotices();
    noticePost('接管中：正在等元素出现…');
    noticePost('接管中：正在等元素出现…');
    noticePost('接管中：正在等元素出现…');
    const l = noticeList();
    assertEqual(l.length, 1, '连续重复只留一条');
    assertEqual(l[0]!.count, 3, '合并到 3 次');
  });

  it('文案相同但级别不同 ⇒ 不合并（会丢掉严重程度）', () => {
    clearNotices();
    noticePost('没能记完成', 'info');
    noticePost('没能记完成', 'warn');
    assertEqual(noticeList().length, 2, '级别不同就另起一条');
  });

  it('隔一条再重复 ⇒ 不合并（只跟紧挨着的那条比）', () => {
    clearNotices();
    noticePost('A');
    noticePost('B');
    noticePost('A');
    assertEqual(noticeList().length, 3, '不相邻就不合并');
  });

  it('dedupe:false ⇒ 老老实实新增', () => {
    clearNotices();
    noticePost('同一句话');
    noticePost('同一句话', 'info', { dedupe: false });
    assertEqual(noticeList().length, 2, '关掉合并就该是两条');
  });

  it(`超过 ${MAX_NOTICES} 条只留最后那些`, () => {
    clearNotices();
    for (let i = 1; i <= MAX_NOTICES + 5; i += 1) noticePost(`第 ${i} 句`);
    const l = noticeList();
    assertEqual(l.length, MAX_NOTICES, `上限就是 ${MAX_NOTICES}`);
    assertEqual(l[l.length - 1]!.text, `第 ${MAX_NOTICES + 5} 句`, '最新的在末尾');
    assertEqual(l[0]!.text, '第 6 句', '最老的被挤掉');
  });
});

describe('uooc/notice · 订阅与清空', () => {
  it('订阅者每次都收到，退订后不再收到', () => {
    clearNotices();
    let hits = 0;
    const off = subscribeNotice(() => {
      hits += 1;
    });
    noticePost('一');
    assertEqual(hits, 1, '发一条通知一次');
    off();
    noticePost('二');
    assertEqual(hits, 1, '退订后不该再被叫');
  });

  it('订阅者自己抛错不连累别人', () => {
    clearNotices();
    let other = 0;
    const off1 = subscribeNotice(() => {
      throw new Error('我先炸');
    });
    const off2 = subscribeNotice(() => {
      other += 1;
    });
    noticePost('照样发');
    off1();
    off2();
    assertEqual(other, 1, '坏订阅者不该把好订阅者挡住');
    assertEqual(noticeList().length, 1, '记录也不受影响');
  });

  it('clearNotices 清空并通知', () => {
    noticePost('一');
    let hits = 0;
    const off = subscribeNotice(() => {
      hits += 1;
    });
    clearNotices();
    off();
    assertEqual(noticeList().length, 0, '清干净');
    assertEqual(hits, 1, '清空也算一次变化');
  });
});

describe('uooc/notice · Toast 分级', () => {
  it('info / success 自动消失，warn / error 常驻', () => {
    clearNotices();
    const calls: Call[] = [];
    noticeBind(fakeHost(calls));
    noticePost('进度', 'info');
    noticePost('通过', 'success');
    noticePost('注意', 'warn');
    noticePost('炸了', 'error');
    noticeBind(null);
    assertEqual(calls.length, 4, '四条都该弹');
    assertEqual(calls[0]!.sticky, false, 'info 不该常驻');
    assertEqual(calls[1]!.sticky, false, 'success 不该常驻');
    assertEqual(calls[2]!.sticky, true, 'warn 要常驻');
    assertEqual(calls[3]!.sticky, true, 'error 要常驻');
    assertEqual(calls[3]!.kind, 'error', '级别要原样传下去');
    assertEqual(calls[3]!.message, '炸了', '文案要原样传下去');
  });

  it('quiet:true ⇒ 只进监视页，不弹 Toast', () => {
    clearNotices();
    const calls: Call[] = [];
    noticeBind(fakeHost(calls));
    noticePost('这是给监视页看的', 'info', { quiet: true });
    noticeBind(null);
    assertEqual(calls.length, 0, '不该弹');
    assertEqual(noticeList().length, 1, '但要记下来');
  });

  it('没绑面板时只记不抛错', () => {
    clearNotices();
    noticeBind(null);
    noticePost('没人接也得活着');
    assertEqual(noticeList().length, 1, '照记');
  });

  it('面板的 toast 抛错时，记录仍然完整', () => {
    clearNotices();
    noticeBind(fakeHost([], true));
    noticePost('面板坏了也得留痕', 'warn');
    noticeBind(null);
    assertEqual(noticeList().length, 1, '记录不能被面板拖死');
    assertEqual(texts()[0], '面板坏了也得留痕', '文案要对');
  });
});

describe('uooc/notice · 时间戳文案', () => {
  it('补零成 HH:MM:SS', () => {
    const at = new Date(2026, 0, 2, 9, 8, 7).getTime();
    assertEqual(clockText(at), '09:08:07', '个位数要补零');
  });

  it('午夜与正午都对', () => {
    assertEqual(clockText(new Date(2026, 5, 1, 0, 0, 0).getTime()), '00:00:00', '午夜');
    assertEqual(clockText(new Date(2026, 5, 1, 12, 34, 56).getTime()), '12:34:56', '正午过后');
  });
});
