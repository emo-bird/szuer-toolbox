/**
 * 站点适配层接口定义。
 *
 * 铁律（见 docs/需求文档.md §10）：
 *   - `common/` 不得 import `sites/`，依赖方向只能是 `sites/ → common/`
 *   - `sites/` 内各站点互不 import，跨站点数据一律走 `common/core/storage`
 *   - 站点模块**不直接操作悬浮窗 DOM**，只做声明式注册
 */

/** 功能开关的风险分级，决定 UI 门禁强度（见 需求文档 §8.1 N1） */
export type RiskLevel =
  /** 🟢 只读，无副作用，默认可用 */
  | 'safe'
  /** 🟠 会留痕（请求日志、访问记录），默认关闭，需复选框显式开启 */
  | 'trace'
  /** 🔴 不可逆（提交选课 / 提交答案 / 交卷），默认关闭 + 复选框 + 二次确认 */
  | 'irreversible';

/** 标签页挂载时注入的上下文，由 common/ui 提供 */
export interface TabContext {
  /** 该标签页所属站点 id；公共标签页为 'common' */
  readonly siteId: string;
  /** 悬浮窗根元素（shadow root 内），日志/Toast 等公共能力走这里 */
  readonly host: PanelApi;
}

/** 悬浮窗对外暴露给标签页的少量能力（标签页拿不到也不该拿 panel 内部结构） */
export interface PanelApi {
  /** 折叠成悬浮球 */
  collapse(): void;
  /** 展开为面板 */
  expand(): void;
  /** 当前是否折叠 */
  isCollapsed(): boolean;
  /** 弹一条 Toast */
  toast(message: string, kind?: 'info' | 'warn' | 'error' | 'success'): void;
  /** 弹二次确认框，resolve 为 true 表示用户点了确认 */
  confirm(options: ConfirmOptions): Promise<boolean>;
  /**
   * 全屏提示「登录态已失效，请刷新页面重新登录」（灰色遮罩 + 居中提示）。
   *
   * 比 toast 重得多，只在**确认站点已经把会话踢下线**时用（HTTP 层认出
   * 未认证响应）。抢课 / 监控这类会连续发请求的循环一旦遇到它就必须停下，
   * 否则只会一直撞重定向并刷日志。
   */
  alertAuthExpired(): void;
  /** 把面板切到某个标签页 */
  activateTab(tabId: string): void;
}

export interface ConfirmOptions {
  title: string;
  body: string;
  /** 危险操作确认：按钮文案与配色都会走红色 */
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
}

/**
 * 一个标签页的声明。
 *
 * 注意：因为悬浮窗在 Shadow DOM 内，**标签页自己的样式拿不到页面全局 CSS**，
 * 所以必须通过 `css` 字段随注册一起交上来，由 common/ui 塞进 shadow root 的 <style>。
 */
export interface TabRegistration {
  /** 全局唯一 id，约定为 `${siteId}:${name}` */
  readonly id: string;
  /** 标签按钮上显示的文字 */
  readonly title: string;
  /**
   * 组内排序权重，小的靠前。
   *
   * ⚠️ `order` **只在组内生效**：站点标签页永远排在公共标签页之前，
   * 两组先后由 `common/ui/tab-order.ts` 决定，写多大的数字都翻不过去
   * （早期这里靠「公共占 0–99、站点从 100 起」的约定，一旦有人写错就静默错位）。
   */
  readonly order?: number;
  /** 该标签页专属样式（会被注入 shadow root） */
  readonly css?: string;
  /**
   * 挂载标签页内容。
   * @param root 标签页面板容器（已存在于 shadow root 内）
   * @returns 可选的卸载函数，切换/销毁时调用
   */
  mount(root: HTMLElement, ctx: TabContext): void | (() => void);
}

/**
 * 站点适配器。
 *
 * 两级匹配（对应「悬浮球常在、功能页才自动展开」）：
 *   - `hosts`：站点域。命中 → 注入脚本 + 显示悬浮球（折叠态）
 *   - `pages`：功能页。命中 → 自动展开面板
 */
export interface SiteAdapter {
  /** 站点 id，同时用作 storage 命名空间前缀 */
  readonly id: string;
  /** 站点中文名，用于日志与 UI 展示 */
  readonly name: string;
  /**
   * 站点域通配列表，形如 `bkxk.szu.edu.cn`、`*.szu.edu.cn`、`www.uooc.net.cn`。
   * 语义与 `@match` 的 host 部分一致，但支持前导 `*.`。
   */
  readonly hosts: readonly string[];
  /**
   * 功能页通配列表，形如 `/home/learn/index*`。相对当前 host，仅比较 pathname + search + hash。
   * 空数组表示「该站点任意页面都自动展开」。
   */
  readonly pages: readonly string[];
  /** 站点专属标签页 */
  readonly tabs: readonly TabRegistration[];
  /** 站点专属功能开关；注册后由设置标签页统一渲染复选框 */
  readonly toggles?: readonly SiteToggleDef[];
  /**
   * 本站的设置**已经渲染进了自己的标签页**，请公共设置页不要再列一遍。
   *
   * 为什么需要显式声明：`hasOwnSettingsTab` 原本靠「有没有一个 id 等于
   * `<siteId>:settings` 的标签页」来判定（见 `sites/registry.ts` 的约定）。
   * 但站点把设置**拆成多页**时（UOOC = 视频 / 连播 / AI 作答），一个 id 表达不了，
   * 那个等式必然不成立 —— 没有这个字段，公共设置页就会把同一个开关再渲染一次，
   * 于是同一个开关在面板里出现两遍、还能从两处改。
   */
  readonly settingsInOwnTabs?: boolean;
  /**
   * **启动期**钩子：在 `document-start` 时机调用，**早于页面加载任何脚本**。
   *
   * 存在的理由：响应接管（劫持页面 XHR / fetch）必须抢在站点自己的脚本之前完成，
   * 否则等 DOM 就绪时站点的请求早已发出、构造函数也已被别的代码捕获。
   *
   * ⚠️ 此时 `document.body` 尚不存在，**不允许碰 DOM**（只能挂钩子、读 storage）。
   * 需要操作 DOM 的初始化请放 `init`。
   */
  earlyInit?(ctx: SiteEarlyContext): void;
  /** 命中站点域时调用一次（不论是否是功能页），用于初始化站点级监听 */
  init?(ctx: SiteInitContext): void;
}

/** 启动期上下文：此时还没有悬浮窗，也没有 DOM */
export interface SiteEarlyContext {
  readonly adapter: SiteAdapter;
  /** 启动时的 URL；hash 路由站点后续变化由 main 的 watchNavigation 负责 */
  readonly url: URL;
}

/** 站点初始化上下文 */
export interface SiteInitContext {
  readonly adapter: SiteAdapter;
  /** 当前页是否命中 `pages`（true = 已自动展开） */
  readonly isFeaturePage: boolean;
  readonly panel: PanelApi;
}

/** 站点功能开关声明 */
export interface SiteToggleDef {
  /** 开关 id，在同一站内唯一，如 `auto-play` */
  readonly id: string;
  readonly label: string;
  readonly desc?: string;
  readonly risk: RiskLevel;
  readonly default: boolean;
  /** 站点内部分组名，用于设置页分节 */
  readonly group?: string;
}
