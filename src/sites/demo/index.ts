/**
 * 演示适配器（仅用于开发期验证框架）。
 *
 * 只在 localhost / 127.0.0.1 生效，或者当 URL hash 里带 `sztb-demo` 时
 * 由 registry 强制注入（见 sites/registry.ts 的 DEBUG_HASH_FLAG）。
 *
 * 它存在的意义：在没有真实站点的机器上，也能把「分派 → 悬浮窗 → 标签页 →
 * 设置门禁 → 日志 / 状态」整条链路跑通，并作为新站点适配器的抄写模板。
 */

import { scoped } from '../../common/core/log.ts';
import { request, queueDepth, getIntervalMs } from '../../common/core/http.ts';
import { el } from '../../common/utils/dom.ts';
import type { SiteAdapter, TabRegistration, TabContext } from '../types.ts';

const log = scoped('site/demo');

const demoCss = `
.demo-box { display: flex; flex-direction: column; gap: 8px; }
.demo-hint { color: var(--sztb-text-dim); font-size: 12px; }
`;

function button(label: string, onClick: () => void | Promise<void>, variant?: string): HTMLElement {
  return el('button', {
    class: 'sztb-btn',
    text: label,
    attrs: { type: 'button', ...(variant !== undefined ? { 'data-variant': variant } : {}) },
    on: {
      click: () => {
        void onClick();
      },
    },
  });
}

/** 演示标签页：把框架的公共能力逐一点一遍 */
export const demoTab: TabRegistration = {
  id: 'demo:playground',
  title: '演示',
  order: 100,
  css: demoCss,
  mount(root: HTMLElement, ctx: TabContext) {
    const box = el(
      'div',
      { class: 'demo-box' },
      el('div', {
        class: 'demo-hint',
        text: '这个标签页只在本机测试时出现，用来验证框架各部件是否正常。',
      }),
      button('弹一条 Toast', () => ctx.host.toast('这是一条测试提示', 'success')),
      button('弹二次确认（危险）', async () => {
        const ok = await ctx.host.confirm({
          title: '危险操作确认',
          body: '这是演示用的二次确认框。\n确认后会弹一条 Toast。',
          danger: true,
        });
        ctx.host.toast(ok ? '你点了确认' : '你取消了', ok ? 'warn' : 'info');
      }),
      button('写一条日志', () => {
        log.info('来自演示标签页的日志', { siteId: ctx.siteId, queue: queueDepth() });
        ctx.host.toast('已写入日志，切到「日志」标签页查看');
      }),
      button('排一个请求（走限流队列）', async () => {
        ctx.host.toast(`请求已入队（间隔 ${getIntervalMs()}ms）`);
        try {
          const res = await request({ url: `${location.origin}/?_sztb_probe=${Date.now()}`, method: 'GET' });
          log.info(`探测请求返回 ${res.status}`, { elapsedMs: res.elapsedMs });
          ctx.host.toast(`返回 ${res.status}，耗时 ${res.elapsedMs}ms`, 'success');
        } catch (err) {
          log.warn('探测请求失败', err);
          ctx.host.toast('请求失败，详见日志', 'error');
        }
      }),
      button('折叠悬浮窗', () => ctx.host.collapse()),
    );
    root.appendChild(box);
  },
};

export const demoAdapter: SiteAdapter = {
  id: 'demo',
  name: '演示站点',
  hosts: ['localhost', '127.0.0.1', '*.localhost'],
  pages: ['*'],
  tabs: [demoTab],
  toggles: [
    {
      id: 'demo-safe',
      label: '只读示例开关',
      desc: '🟢 只读类，任何时候都能勾。',
      risk: 'safe',
      default: true,
      group: '演示',
    },
    {
      id: 'demo-trace',
      label: '留痕示例开关',
      desc: '🟠 会在站点留下访问记录，默认关闭。',
      risk: 'trace',
      default: true,
      group: '演示',
    },
    {
      id: 'demo-irreversible',
      label: '不可逆示例开关',
      desc: '🔴 勾选后会弹二次确认（提交类操作的门禁演示）。',
      risk: 'irreversible',
      default: true,
      group: '演示',
    },
  ],
  init(ctx) {
    log.info(`演示适配器已启用：isFeaturePage=${String(ctx.isFeaturePage)}`);
  },
};
