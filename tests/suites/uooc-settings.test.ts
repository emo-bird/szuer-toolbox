/**
 * 纯函数冒烟（档1）：UOOC 的开关与配置项声明。
 *
 * 声明写错了不会报错 —— 只会「设置面板里少一行」或者「填了不生效」，
 * 所以只能靠测试钉住形态：
 *   - 🔴 irreversible 的 `default` 必须写 false（写了 true 也不生效，只会误导后来人）；
 *   - 上报区间的两个数必须**带校验**（否则用户填 0 会变成每帧发一次请求）；
 *   - 默认值本身必须能通过自己的校验（否则一打开设置面板就顶着一条黄字）。
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import { clearAll } from '../../src/common/core/storage.ts';
import { resetRegistry as resetSettings, valuesOf } from '../../src/common/core/settings.ts';
import type { ValueDef } from '../../src/common/core/settings.ts';
import {
  PROGRESS_DEFAULT,
  SITE_ID,
  SWITCH_WAIT_DEFAULT,
  TOGGLE,
  UOOC_TOGGLES,
  VALUE,
  registerUoocSettings,
} from '../../src/sites/uooc/settings.ts';

const MIN_S = 5;
const MAX_S = 3600;

function boot(): void {
  clearAll();
  resetSettings();
  registerUoocSettings();
}

function def(id: string): ValueDef<unknown> {
  const found = valuesOf(SITE_ID).find((v) => v.id === id);
  assert(found !== undefined, `未注册配置项 ${id}`);
  return found!;
}

describe('uooc 开关声明', () => {
  it('id 不重复', () => {
    const ids = UOOC_TOGGLES.map((t) => t.id);
    assertEqual(new Set(ids).size, ids.length, `有重复 id：${ids.join(',')}`);
  });

  it('每个开关都有 label / desc / risk / default', () => {
    for (const t of UOOC_TOGGLES) {
      assert(t.label !== '', `${t.id} 缺 label`);
      assert(t.desc !== undefined && t.desc !== '', `${t.id} 缺 desc`);
      assert(typeof t.default === 'boolean', `${t.id} 的 default 不是布尔`);
      assert(
        t.risk === 'safe' || t.risk === 'trace' || t.risk === 'irreversible',
        `${t.id} 的 risk 取值非法：${t.risk}`,
      );
    }
  });

  it('🔴 的 default 一律 false', () => {
    for (const t of UOOC_TOGGLES) {
      if (t.risk === 'irreversible') assertEqual(t.default, false, `${t.id} 是 🔴，default 必须 false`);
    }
  });

  it('文案里不出现 markdown 记号（设置面板的 desc 走纯文本渲染）', () => {
    for (const t of UOOC_TOGGLES) {
      assert(!(t.desc ?? '').includes('**'), `${t.id} 的 desc 里有 **，会原样显示成星号`);
    }
  });

  it('进度上报是 🔴 且默认关', () => {
    const t = UOOC_TOGGLES.find((x) => x.id === TOGGLE.AUTO_PROGRESS);
    assert(t !== undefined, '缺少「进度上报」开关');
    assertEqual(t!.risk, 'irreversible');
    assertEqual(t!.default, false);
  });

  it('自动作答目前只是占位，也是 🔴 且默认关', () => {
    const t = UOOC_TOGGLES.find((x) => x.id === TOGGLE.AUTO_SOLVE);
    assert(t !== undefined, '缺少「自动作答」开关');
    assertEqual(t!.risk, 'irreversible');
    assertEqual(t!.default, false);
  });

  it('自动连播钉在设置页最上面（order 最小）', () => {
    const t = UOOC_TOGGLES.find((x) => x.id === TOGGLE.AUTO_NEXT);
    assert(t !== undefined, '缺少「自动连播」开关');
    assertEqual(t!.order, 0, '自动连播的 order 必须是 0');
    const orders = UOOC_TOGGLES.map((x) => x.order ?? 100);
    assertEqual(Math.min(...orders), 0, '自动连播必须是权重最小的那个（否则排不到第一条）');
    const others = UOOC_TOGGLES.filter((x) => x.id !== TOGGLE.AUTO_NEXT);
    assert(
      others.every((x) => (x.order ?? 100) > 0),
      '其它开关不该也拿到 0，否则「最上面」会被抢',
    );
  });
});

describe('uooc 配置项声明', () => {
  it('连播范围是下拉，两个选项', () => {
    boot();
    const d = def(VALUE.NEXT_SCOPE);
    assertEqual(d.kind, 'select');
    assertEqual(d.options?.length, 2, '连播范围应当只有「止于本章 / 跨章继续」两项');
    assert(
      d.options!.some((o) => o.value === 'chapter'),
      '缺少「止于本章」',
    );
    assert(
      d.options!.some((o) => o.value === 'all'),
      '缺少「跨章继续」',
    );
  });

  it('上报区间是 number 且带校验', () => {
    boot();
    for (const id of [VALUE.PROGRESS_MIN, VALUE.PROGRESS_MAX]) {
      const d = def(id);
      assertEqual(d.kind, 'number', `${id} 应当是数字输入框`);
      assert(typeof d.validate === 'function', `${id} 必须带校验`);
    }
  });

  it('切前等待是 number，且允许 0（立刻切）', () => {
    boot();
    const d = def(VALUE.SWITCH_WAIT);
    assertEqual(d.kind, 'number');
    assertEqual(d.default, SWITCH_WAIT_DEFAULT);
    assertEqual(d.validate?.('0') ?? null, null, '0 应当放行 —— 用户明确要「立刻切」时的合法值');
    assertEqual(d.validate?.(SWITCH_WAIT_DEFAULT) ?? null, null, '默认值本身必须合法');
    assert(d.validate?.('-1') !== null, '负数应当被拒');
    assert(d.validate?.('121') !== null, '超过上限应当被拒');
  });

  it('默认值本身能通过校验', () => {
    boot();
    const min = def(VALUE.PROGRESS_MIN);
    const max = def(VALUE.PROGRESS_MAX);
    assertEqual(min.validate?.(min.default) ?? null, null, '下限默认值自己不合法');
    assertEqual(max.validate?.(max.default) ?? null, null, '上限默认值自己不合法');
    assertEqual(PROGRESS_DEFAULT.min, min.default);
    assertEqual(PROGRESS_DEFAULT.max, max.default);
  });

  it('校验拒绝 0 / 负数 / 小数 / 超上限', () => {
    boot();
    const d = def(VALUE.PROGRESS_MIN);
    for (const bad of ['0', '-5', '1.5', '99999', 'abc']) {
      assert(d.validate?.(bad) !== null, `${bad} 应当被拒绝`);
    }
  });

  it('校验放行边界值', () => {
    boot();
    const d = def(VALUE.PROGRESS_MIN);
    assertEqual(d.validate?.(String(MIN_S)) ?? null, null, `${MIN_S} 应当放行`);
    assertEqual(d.validate?.(String(MAX_S)) ?? null, null, `${MAX_S} 应当放行`);
  });
});
