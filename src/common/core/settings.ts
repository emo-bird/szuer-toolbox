/**
 * 设置层：功能开关（复选框）+ 普通配置项（输入框）。
 *
 * 门禁规则（需求文档 §8.1 N1）：
 *   - 🟢 safe        默认可用
 *   - 🟠 trace       默认关闭，需用户勾选复选框
 *   - 🔴 irreversible 默认关闭 + 复选框 + **二次确认**（二次确认由 UI 层执行，
 *                    本模块只负责「默认值」与「是否被用户显式开启过」的判定）
 *
 * 本模块不持有任何凭证；API Key 之类是用户自己填的配置，按普通值存。
 */

import { read, write, listKeys } from './storage.ts';
import type { RiskLevel, SiteToggleDef } from '../../sites/types.ts';

export interface RegisteredToggle extends SiteToggleDef {
  readonly siteId: string;
  readonly siteName: string;
}

const toggleRegistry = new Map<string, RegisteredToggle>();

/** `siteId + '\u0000' + toggleId` 作复合键 */
function composite(siteId: string, toggleId: string): string {
  return `${siteId}\u0000${toggleId}`;
}

function storageKey(siteId: string, toggleId: string): string {
  return `toggle:${siteId}:${toggleId}`;
}

/** 注册一个站点的功能开关；重复注册同 id 会覆盖（便于热重载） */
export function registerToggles(siteId: string, siteName: string, defs: readonly SiteToggleDef[]): void {
  for (const def of defs) {
    toggleRegistry.set(composite(siteId, def.id), { ...def, siteId, siteName });
  }
}

/** 某站点已注册的开关，按 group / label 排序 */
export function togglesOf(siteId: string): RegisteredToggle[] {
  const out: RegisteredToggle[] = [];
  for (const item of toggleRegistry.values()) {
    if (item.siteId === siteId) out.push(item);
  }
  return out.sort(compareToggle);
}

/** 全部已注册开关，按站点聚合（保持注册顺序） */
export function allToggles(): RegisteredToggle[] {
  return [...toggleRegistry.values()];
}

function compareToggle(a: RegisteredToggle, b: RegisteredToggle): number {
  const ga = a.group ?? '';
  const gb = b.group ?? '';
  if (ga !== gb) return ga.localeCompare(gb, 'zh-Hans-CN');
  return a.label.localeCompare(b.label, 'zh-Hans-CN');
}

/**
 * 开关是否开启。
 * - 未注册 → 返回 false（宁可不生效，也不要意外打开危险功能）
 * - 已注册但用户从未动过 → 返回 def.default
 * - 🟠 / 🔴 即使 def.default 为 true 也强制 false（红线由代码兜底，不依赖作者自觉）
 */
export function isEnabled(siteId: string, toggleId: string): boolean {
  const def = toggleRegistry.get(composite(siteId, toggleId));
  if (def === undefined) return false;
  const stored = read<boolean | null>(storageKey(siteId, toggleId), null);
  if (stored === null) {
    return def.risk === 'safe' ? def.default : false;
  }
  return stored;
}

/** 写入开关状态。UI 层必须在调用本函数**之前**完成二次确认。 */
export function setEnabled(siteId: string, toggleId: string, enabled: boolean): void {
  write(storageKey(siteId, toggleId), enabled);
}

/** 该开关当前是否「用户显式开启过」——用于判断是否需要弹二次确认 */
export function hasExplicitConsent(siteId: string, toggleId: string): boolean {
  return read<boolean | null>(storageKey(siteId, toggleId), null) === true;
}

/** 某个风险等级是否需要二次确认 */
export function needsConfirm(risk: RiskLevel): boolean {
  return risk === 'irreversible';
}

// ------------------------------------------------------------- 普通配置项

/** `kind: 'select'` 用的可选项 */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface ValueDef<T> {
  readonly siteId: string;
  readonly id: string;
  readonly label: string;
  /** 补充说明。渲染在标签**下方的独立一行**（不是塞在输入框里） */
  readonly desc?: string;
  readonly default: T;
  /** 渲染成什么控件。`select` 必须一并给出 `options` */
  readonly kind: 'text' | 'password' | 'number' | 'url' | 'select';
  /** `kind === 'select'` 时的可选项；其它 kind 忽略 */
  readonly options?: readonly SelectOption[];
  /**
   * 校验钩子。返回非空字符串 = 这个值有问题（UI 把它渲染成输入框下方的一行黄字）。
   *
   * ⚠️ 必须是**纯函数**：不碰 DOM、不写日志、不写存储。这样 node 下能直接测。
   * ⚠️ 只做「提示」，**不要**在这里偷偷把值改掉 —— 改值会让用户以为填进去了。
   */
  readonly validate?: (value: T) => string | null;
  /**
   * 写入后立刻生效的钩子（可选）。
   *
   * 没有它的代价：用户改了配置项，要等下一次页面初始化才生效 ——
   * 填完数值界面上一点反应都没有，用户会以为没保存。
   */
  readonly apply?: (value: T) => void;
}

/**
 * 把输入框里的原始字符串转成要存的值（纯函数）。
 *
 * 规则（需求已确认）：
 *   - 首尾空白一律去掉；
 *   - **空串视为「没填」⇒ 回落 `def.default`**（这就是「失焦为空则自动填入默认值」的实现点）；
 *   - `kind === 'number'` 时校验能不能解析成数字，解析不出来也回落默认值。
 *
 * 注意返回的是**字符串**：`kind` 描述的是「用哪个控件渲染」，不代表存储类型。
 * 各站点自己的配置项都是按字符串存的（数字由消费方用 `clampLimit` 之类去转），
 * 这样 `formatValue(coerceInput(...))` 回到输入框时与用户敲的写法一致。
 *
 * 为什么空串不能原样存下去：`Number('') === 0`，
 * 用户清空输入框会把「请求间隔」静默变成 0。
 */
export function coerceInput(def: ValueDef<unknown>, raw: string): unknown {
  const text = raw.trim();
  if (text === '') return def.default;
  if (def.kind === 'number' && !Number.isFinite(Number(text))) return def.default;
  return text;
}

/**
 * 校验输入框里的原始字符串（纯函数）。返回提示文本，没问题返回 null。
 *
 * 与 `coerceInput` 配对使用：先转成真实值，再交给 `def.validate`。
 */
export function checkInput(def: ValueDef<unknown>, raw: string): string | null {
  const value = coerceInput(def, raw);
  if (def.kind === 'select' && def.options !== undefined) {
    const ok = def.options.some((o) => o.value === String(value));
    if (!ok) return `只能选：${def.options.map((o) => o.label).join(' / ')}`;
  }
  return def.validate?.(value) ?? null;
}

/** 把值渲染成输入框里的字符串（纯函数）。null / undefined 一律渲染成空串。 */
export function formatValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

const valueRegistry = new Map<string, ValueDef<unknown>>();

export function registerValue<T>(def: ValueDef<T>): void {
  valueRegistry.set(composite(def.siteId, def.id), def as ValueDef<unknown>);
}

export function valuesOf(siteId: string): ValueDef<unknown>[] {
  const out: ValueDef<unknown>[] = [];
  for (const item of valueRegistry.values()) {
    if (item.siteId === siteId) out.push(item);
  }
  return out;
}

/**
 * 注册过开关或配置项的站点 id。
 *
 * 先按**开关的注册顺序**（= 适配器注册顺序），再补上「只有配置项、没有开关」的站点。
 * 全局设置页需要这个清单才能遍历站点 —— 它不该去 import sites/registry（依赖方向铁律）。
 */
export function registeredSiteIds(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of toggleRegistry.values()) {
    if (!seen.has(item.siteId)) {
      seen.add(item.siteId);
      out.push(item.siteId);
    }
  }
  for (const item of valueRegistry.values()) {
    if (!seen.has(item.siteId)) {
      seen.add(item.siteId);
      out.push(item.siteId);
    }
  }
  return out;
}

export function getValue<T>(siteId: string, id: string): T {
  const def = valueRegistry.get(composite(siteId, id));
  const fallback = (def?.default ?? undefined) as T;
  return read<T>(`value:${siteId}:${id}`, fallback);
}

export function setValue(siteId: string, id: string, value: unknown): void {
  write(`value:${siteId}:${id}`, value);
  // 立刻生效（可选钩子）。钩子抛错不能连累「值已经写进去了」这个事实，
  // 但也不能静默 —— 所以只吞掉异常，交由调用方的 UI 继续走。
  const def = valueRegistry.get(composite(siteId, id));
  try {
    (def?.apply as ((v: unknown) => void) | undefined)?.(value);
  } catch {
    /* 生效钩子失败不影响已保存的值 */
  }
}

// ---------------------------------------------------------------- 维护

/** 已写入存储的设置键（供「重置设置」使用） */
export function storedSettingKeys(): string[] {
  return listKeys().filter((k) => k.startsWith('toggle:') || k.startsWith('value:'));
}

/** 测试用：清空注册表（不动存储） */
export function resetRegistry(): void {
  toggleRegistry.clear();
  valueRegistry.clear();
}
