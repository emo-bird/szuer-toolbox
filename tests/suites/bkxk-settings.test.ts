/**
 * 纯函数冒烟（档1）：本科选课的配置项声明。
 *
 * 为什么值得单独钉：这些声明的形态直接决定设置界面的样子，而界面形态是本轮
 * 用户反馈的重点 ——
 *   - 监控模式 / 监控类别 / 重试策略必须是**下拉**（旧脚本就是下拉；
 *     自由文本框会让用户打错一个字母就静默不生效）；
 *   - 三个时间参数必须**带校验**（低于建议下限要当场提示，而不是等出事）；
 *   - 请求间隔必须**带 apply 钩子**（改完立刻生效，不用刷新）。
 *
 * 声明写错了不会报错，只会「界面看起来怪」或者「设了不生效」，所以只能靠测试兜。
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import { clearAll } from '../../src/common/core/storage.ts';
import { valuesOf, resetRegistry as resetSettings } from '../../src/common/core/settings.ts';
import { registerBkxkSettings, SITE_ID, VALUE } from '../../src/sites/bkxk/settings.ts';
import { LIMITS } from '../../src/common/core/limits.ts';
import type { ValueDef } from '../../src/common/core/settings.ts';

function boot(): void {
  clearAll();
  resetSettings();
  registerBkxkSettings();
}

function def(id: string): ValueDef<unknown> {
  const found = valuesOf(SITE_ID).find((v) => v.id === id);
  assert(found !== undefined, `未注册配置项 ${id}`);
  return found!;
}

describe('bkxk 配置项 —— 形态', () => {
  it('共 7 个配置项，id 全部来自 VALUE 常量', () => {
    boot();
    const ids = valuesOf(SITE_ID).map((v) => v.id).sort();
    const expected = Object.values(VALUE).sort();
    assertEqual(ids.join(','), expected.join(','), '配置项清单应与 VALUE 常量一一对应');
    assertEqual(ids.length, 7);
  });

  it('三个时间参数用数字框，其余用文本/下拉', () => {
    boot();
    for (const id of [VALUE.INTERVAL_MS, VALUE.RETRY_INTERVAL_MS, VALUE.POLL_INTERVAL_MS]) {
      assertEqual(def(id).kind, 'number', `${id} 应当是数字框`);
    }
    assertEqual(def(VALUE.BATCH_CODE).kind, 'text');
  });

  it('监控模式 / 监控类别 / 重试策略是下拉，且选项都是「值 + 中文名」', () => {
    boot();
    for (const id of [VALUE.MONITOR_MODE, VALUE.MONITOR_CATEGORY, VALUE.RETRY_MODE]) {
      const d = def(id);
      assertEqual(d.kind, 'select', `${id} 必须是下拉（用户明确要求）`);
      assert((d.options?.length ?? 0) > 0, `${id} 下拉必须有选项`);
      for (const opt of d.options ?? []) {
        assert(opt.value !== '', `${id} 的选项值不能为空`);
        assert(opt.label !== '', `${id} 的选项文案不能为空`);
      }
      // 默认值必须能落在某个选项上，否则下拉首次渲染会显示错项
      assert(
        (d.options ?? []).some((o) => o.value === d.default),
        `${id} 的 default=${String(d.default)} 不在选项里`,
      );
    }
  });

  it('监控类别列出全部 8 个类别代码', () => {
    boot();
    const values = (def(VALUE.MONITOR_CATEGORY).options ?? []).map((o) => o.value);
    assertEqual(values.length, 8);
    assert(values.includes('FANKC') && values.includes('MOOC'), `实际：${values.join(',')}`);
  });

  it('每个配置项都有 desc（渲染成标签下面独立一行）', () => {
    boot();
    for (const v of valuesOf(SITE_ID)) {
      assert(typeof v.desc === 'string' && v.desc !== '', `${v.id} 缺 desc`);
    }
  });
});

describe('bkxk 配置项 —— 校验与生效', () => {
  it('请求间隔有校验钩子：低于建议下限会报错，正常值通过', () => {
    boot();
    const d = def(VALUE.INTERVAL_MS);
    assert(d.validate !== undefined, '请求间隔必须有 validate');
    assertEqual(d.validate!('500'), null);
    const msg = d.validate!('50');
    assert(msg !== null, '50ms 必须被提示');
    assert(msg.includes('200'), `提示里应含建议下限 200，实际：${msg}`);
  });

  it('重试 / 轮询间隔同样有校验（免得只有请求间隔受管）', () => {
    boot();
    for (const id of [VALUE.RETRY_INTERVAL_MS, VALUE.POLL_INTERVAL_MS]) {
      const d = def(id);
      assert(d.validate !== undefined, `${id} 必须有 validate`);
      assertEqual(d.validate!(String(d.default)), null, '默认值本身不应触发告警');
    }
  });

  it('只有请求间隔带 apply 钩子（另两个每轮现读设置，不需要 apply）', () => {
    boot();
    assert(def(VALUE.INTERVAL_MS).apply !== undefined, '请求间隔必须能立刻生效');
    // 重试 / 轮询间隔在模块里是「每轮循环现读设置」（tasks.retryIntervalMs / monitor.intervalMs），
    // 所以故意不带 apply —— 换了值下一轮就生效，无需钩子。
    assertEqual(def(VALUE.RETRY_INTERVAL_MS).apply, undefined);
    assertEqual(def(VALUE.POLL_INTERVAL_MS).apply, undefined);
  });

  it('时间参数的默认值取自 LIMITS，不写死数字', () => {
    boot();
    // 断言与 LIMITS 对齐而不是断言字面量：写死 500 的话，改 core/limits 就漂移了。
    assertEqual(def(VALUE.INTERVAL_MS).default, String(LIMITS.intervalMs.def));
    assertEqual(def(VALUE.RETRY_INTERVAL_MS).default, String(LIMITS.retryIntervalMs.def));
    assertEqual(def(VALUE.POLL_INTERVAL_MS).default, String(LIMITS.pollIntervalMs.def));
    // 三个 def 必须落在各自的合法区间里，否则「失焦填默认值」会填进一个非法值
    for (const key of ['intervalMs', 'retryIntervalMs', 'pollIntervalMs'] as const) {
      const spec = LIMITS[key];
      assert(spec.def >= spec.min && spec.def <= spec.max, `${key} 的默认值越界`);
    }
  });
});
