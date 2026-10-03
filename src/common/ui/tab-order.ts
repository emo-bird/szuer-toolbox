/**
 * 标签栏的分组与排序 —— **纯函数，零 DOM**。
 *
 * 需求（用户拍板）：**站点自己的标签页在前，公共标签页在后**，
 * 两组之间有一条分隔线。
 *
 * ## 为什么要把这件事从 order 数字里拆出来
 *
 * 此前顺序完全由 `TabRegistration.order` 一个数字**全局**排序决定，
 * 「公共占用 0–99、站点标签页建议从 100 起」只是 `sites/types.ts` 注释里的一条约定，
 * 没有任何结构性保证 —— 哪天有人给站点标签页写个 `order: 50`，
 * 它就会插进公共标签页中间，而且**不会报错**。
 *
 * 现在：`order` **只在组内生效**，组间先后由本模块钉死。
 *
 * 单独成文件、且不碰 DOM 的理由：`TabView` 依赖 `document`，
 * 在 node 下测不了；把判定逻辑抽到这里就能进档 1 冒烟（`tests/suites/tab-order.test.ts`）。
 */

import type { TabRegistration } from '../../sites/types.ts';

/** 公共标签页的归属 id —— 公共标签页不属于任何站点 */
export const COMMON_SITE_ID = 'common';

/** 未声明 `order` 时的默认权重（沿用旧约定：排在组内最后） */
export const DEFAULT_ORDER = 1000;

/**
 * 本模块接受的输入。
 *
 * `common/ui/panel.ts` 的 `TabEntry` **结构上就是它**，所以两边不需要互相 import
 * （panel 要 import 本模块，本模块再 import panel 会绕成环）。
 */
export interface TabOrderInput {
  /** 公共标签页为 `COMMON_SITE_ID`，站点标签页为适配器 id */
  readonly siteId: string;
  readonly tab: TabRegistration;
}

export interface PlannedTab<T extends TabOrderInput = TabOrderInput> {
  readonly entry: T;
  /** 挂载它之前是否先插一条分隔线 —— 仅「站点组 → 公共组」的交界处为 true */
  readonly dividerBefore: boolean;
}

/**
 * 排定标签栏的最终顺序。
 *
 * 规则：
 *   1. 站点组在前、公共组在后；
 *   2. **各组内部**按 `order` 升序，`order` 缺省为 `DEFAULT_ORDER`；
 *   3. 两组**都非空**时，交界处（即第一个公共标签之前）插一条分隔线；
 *      只有单组时不插 —— 否则非支持站点（只有公共标签页）的开头会多一条孤零零的竖线。
 */
export function planTabOrder<T extends TabOrderInput>(entries: readonly T[]): readonly PlannedTab<T>[] {
  const site: T[] = [];
  const common: T[] = [];
  for (const entry of entries) {
    (entry.siteId === COMMON_SITE_ID ? common : site).push(entry);
  }

  const siteOrdered = byOrder(site);
  const commonOrdered = byOrder(common);
  const ordered: T[] = [...siteOrdered, ...commonOrdered];

  const wantsDivider = siteOrdered.length > 0 && commonOrdered.length > 0;
  return ordered.map((entry, index) => ({
    entry,
    dividerBefore: wantsDivider && index === siteOrdered.length,
  }));
}

/**
 * 组内按 `order` 升序。
 *
 * `Array#sort` 自 ES2019 起保证**稳定**，所以 `order` 相同的标签页
 * 保持适配器注册时的相对顺序（这个性质有测试钉住）。
 */
function byOrder<T extends TabOrderInput>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => orderOf(a) - orderOf(b));
}

function orderOf(entry: TabOrderInput): number {
  return entry.tab.order ?? DEFAULT_ORDER;
}

// ------------------------------------------------------ 「上次停留的标签」

/**
 * 记忆键，**按站点分键**：`ui:active-tab:<siteId>`。
 *
 * 为什么不跟 `ui:size` 它们一样用一个全局键：位置是「我的面板在哪」（跨站共用才合理），
 * 而标签是「我在这个站点看哪一页」。bkxk 将来有任务 / 监控 / 自定义 / 设置 / 日志
 * **五个**专属标签页，共用一个键意味着「在 bkxk 停在站点设置，去一趟 UOOC，
 * 回来记忆就没了」。
 *
 * `siteId` 已经过校验，所以这里不需要再转义：适配器 id 的格式有测试钉住
 * （`tests/suites/registry.test.ts`），冒号与 `sztb:` 前缀都不会出现。
 */
export function activeTabKey(siteId: string): string {
  return `ui:active-tab:${siteId}`;
}

/**
 * 重新打开面板时该选中哪个标签页 —— **纯函数**，`stored` 是「按 key 取值」的查询函数
 * （调用方传 `storage.read`，测试传一个查表的闭包）。
 *
 * ## 恢复优先级（用户拍板：站点组优先）
 *
 * 一次加载可能**同时存在多个有效键**：bkxk 页面上 `ui:active-tab:bkxk`
 * 与 `ui:active-tab:common` 都可能存着值。规则是：
 *
 *   1. 按 `planTabOrder` 的顺序看**站点组**的键（多个站点按组内先后）；
 *   2. 站点组的键都没值（或值已失效）⇒ 看公共键 `ui:active-tab:common`；
 *   3. 全都没值 / 值已失效 ⇒ 返回 `null`，调用方回退到第一个标签页。
 *
 * 「站点组优先」的理由：站点自己的标签页是这个站点的主场（bkxk 页面的默认落地页
 * 就该是【本科选课设置】），与「站点标签页排在前面」的偏好一致。
 *
 * ## 「值已失效」为什么返回 `null` 而不是"就地修好"
 *
 * 返回 `null` 时调用方只是回退显示，**不写盘** —— 这是用户拍板的配套规则：
 * 存的 id 已不在当前标签集里（例如 bkxk 将来删掉某个标签页）时不覆盖记忆。
 * 真值会在用户下一次**主动点击**标签页时自愈。
 */
export function resolveActiveTab<T extends TabOrderInput>(
  entries: readonly T[],
  stored: (key: string) => string | null,
): string | null {
  const planned = planTabOrder(entries);
  const mounted = new Set<string>();
  const scopes: string[] = [];
  for (const item of planned) {
    mounted.add(item.entry.tab.id);
    if (item.entry.siteId === COMMON_SITE_ID) continue;
    if (!scopes.includes(item.entry.siteId)) scopes.push(item.entry.siteId);
  }
  scopes.push(COMMON_SITE_ID); // 公共组兜底，永远最后一个看

  for (const scope of scopes) {
    const id = stored(activeTabKey(scope));
    if (id !== null && mounted.has(id)) return id;
  }
  return null;
}
