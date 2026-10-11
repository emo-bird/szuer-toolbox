/**
 * 公共标签页「登录态」。
 *
 * ⚠️ **当前是空壳**（v0.8）。
 *
 * 为什么先留空壳：登录态探测依赖各站点的认证形态，而
 *   - UOOC 的登录态形态未知（需求文档 §14 Q-M，**必须抓包**才能确定**）；
 *   - bkxk 是 cookie + token 双检测（已验证）；
 *   - 未来还可能有办事大厅等站点，各自不同。
 * 所以在站点适配器落地前做不出可靠实现 —— 按用户拍板「两个都留」，
 * 这里先占位。
 *
 * ⚠️ 2026-10 清理：原先预留的站点注册入口 `setLoginStateProvider` **从未被任何站点调用**
 * （死代码），已随 cleanup/code-clarity 删除。将来真要接站点登录态时，按当时的契约重新设计
 * 注册方式 —— 不要再复活一个没人调的 setter。
 */

import { el, clear } from '../../utils/dom.ts';
import type { TabRegistration } from '../../../sites/types.ts';

export interface LoginField {
  readonly label: string;
  readonly value: string;
  /** 敏感字段（学号 / 令牌等）显示时打码 */
  readonly secret?: boolean;
}

export interface LoginState {
  /** 是否已登录；unknown 表示探测不出（例如没有抓包、站点改版） */
  readonly loggedIn: boolean | 'unknown';
  /** 站点侧给出的补充信息 */
  readonly fields?: readonly LoginField[];
  /** 探测手段说明，例如「劫持页面 sessionStorage」 */
  readonly source?: string;
  /** 探测失败原因 */
  readonly error?: string;
}

type Provider = () => LoginState | Promise<LoginState>;

/** siteId → 探测函数。公共标签页不知道任何站点，全靠站点自己注册进来。 */
const providers = new Map<string, Provider>();

/** 由 main 装配时注入：当前页面命中的站点 id（未命中为 null） */
let currentSite: () => string | null = () => null;

export function setCurrentSiteResolver(fn: () => string | null): void {
  currentSite = fn;
}

/** 敏感值打码：保留首尾，其余用 • 填满 */
function maskValue(value: string): string {
  const chars = [...value];
  if (chars.length <= 2) return '•'.repeat(chars.length);
  if (chars.length <= 6) return `${chars[0]}${'•'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
  return `${chars.slice(0, 2).join('')}${'•'.repeat(4)}${chars.slice(-2).join('')}`;
}

function row(label: string, value: string): HTMLElement {
  return el(
    'div',
    { class: 'sztb-row' },
    el(
      'div',
      { class: 'sztb-row-main' },
      el('span', { class: 'sztb-row-label', text: label }),
      el('span', { class: 'sztb-row-desc', text: value }),
    ),
  );
}

function renderState(root: HTMLElement, state: LoginState): void {
  const badge =
    state.loggedIn === true ? '已登录' : state.loggedIn === false ? '未登录' : '未知（尚不支持该站点）';
  root.appendChild(el('div', { class: 'sztb-group-title', text: `状态：${badge}` }));

  if (state.source !== undefined) root.appendChild(row('探测手段', state.source));
  for (const f of state.fields ?? []) {
    root.appendChild(row(f.label, f.secret === true ? maskValue(f.value) : f.value));
  }
  if (state.error !== undefined) root.appendChild(row('失败原因', state.error));
}

function renderTab(root: HTMLElement): () => void {
  let seq = 0;
  let disposed = false;

  async function repaint(): Promise<void> {
    const mine = ++seq;
    clear(root);

    const siteId = currentSite();
    if (siteId === null) {
      root.appendChild(
        el('div', {
          class: 'sztb-empty',
          text: '当前页面未命中任何站点适配器，没有登录态可探测。',
        }),
      );
      return;
    }

    const provider = providers.get(siteId);
    if (provider === undefined) {
      root.appendChild(
        el('div', {
          class: 'sztb-empty',
          text:
            `站点「${siteId}」尚未提供登录态探测器。\n` +
            '登录态形态依赖站点接口（UOOC 需抓包确认，见需求文档 Q-M），' +
            '将在该站点适配器落地时接入。',
        }),
      );
      return;
    }

    root.appendChild(el('div', { class: 'sztb-empty', text: '探测中…' }));
    try {
      const state = await provider();
      if (disposed || mine !== seq) return;
      clear(root);
      renderState(root, state);
    } catch (err) {
      if (disposed || mine !== seq) return;
      clear(root);
      renderState(root, { loggedIn: 'unknown', error: String(err) });
    }
  }

  void repaint();

  const refresh = el('button', {
    class: 'sztb-btn',
    text: '重新探测',
    attrs: { type: 'button' },
    on: { click: () => void repaint() },
  });
  root.appendChild(refresh);

  return () => {
    disposed = true;
  };
}

export const loginTab: TabRegistration = {
  id: 'common:login',
  title: '登录态',
  order: 92,
  mount(root) {
    return renderTab(root);
  },
};
