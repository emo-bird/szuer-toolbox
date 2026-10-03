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
