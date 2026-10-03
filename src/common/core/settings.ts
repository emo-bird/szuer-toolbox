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

export interface ValueDef<T> {
  readonly siteId: string;
  readonly id: string;
  readonly label: string;
  readonly desc?: string;
  readonly default: T;
  /** 输入框类型，供设置页渲染 */
  readonly kind: 'text' | 'password' | 'number' | 'url';
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

export function getValue<T>(siteId: string, id: string): T {
  const def = valueRegistry.get(composite(siteId, id));
  const fallback = (def?.default ?? undefined) as T;
  return read<T>(`value:${siteId}:${id}`, fallback);
}

export function setValue(siteId: string, id: string, value: unknown): void {
  write(`value:${siteId}:${id}`, value);
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
