/**
 * 存储层：统一走 GM 存储，但在没有 GM 环境时（纯 node 测试、本地 mock 页）
 * 自动降级到 localStorage → 内存。
 *
 * 红线 R3（继承自 szu_bkxk）：**凭证一律不落盘**。本模块只负责普通配置的读写，
 * 不允许任何调用方把 token / cookie / 学号写进来。
 */

export interface StorageBackend {
  readonly name: string;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  keys(): string[];
}

/** 所有键统一加前缀，便于枚举与清理 */
export const NS_PREFIX = 'sztb:';

function nsKey(key: string): string {
  return key.startsWith(NS_PREFIX) ? key : NS_PREFIX + key;
}

// ---------------------------------------------------------------- backends

class MemoryBackend implements StorageBackend {
  readonly name = 'memory';
  private readonly map = new Map<string, unknown>();

  get(key: string): unknown {
    return this.map.get(key);
  }
  set(key: string, value: unknown): void {
    this.map.set(key, value);
  }
  delete(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

class LocalStorageBackend implements StorageBackend {
  readonly name = 'localStorage';

  get(key: string): unknown {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  set(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  }
  delete(key: string): void {
    localStorage.removeItem(key);
  }
  keys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k !== null) out.push(k);
    }
    return out;
  }
}

class GmBackend implements StorageBackend {
  readonly name = 'GM';

  get(key: string): unknown {
    return GM_getValue<unknown>(key, undefined);
  }
  set(key: string, value: unknown): void {
    GM_setValue(key, value as Tampermonkey.StorageValue);
  }
  delete(key: string): void {
    GM_deleteValue(key);
  }
  keys(): string[] {
    return GM_listValues().filter((k) => k.startsWith(NS_PREFIX));
  }
}

/** GM_* 是否可用（`@grant none` 或纯 node 环境下为 false） */
export function hasGmStorage(): boolean {
  const g = globalThis as Record<string, unknown>;
  return (
    typeof g['GM_getValue'] === 'function' &&
    typeof g['GM_setValue'] === 'function' &&
    typeof g['GM_deleteValue'] === 'function' &&
    typeof g['GM_listValues'] === 'function'
  );
}

function pickBackend(): StorageBackend {
  if (hasGmStorage()) return new GmBackend();
  if (typeof localStorage !== 'undefined') return new LocalStorageBackend();
  return new MemoryBackend();
}

const backend: StorageBackend = pickBackend();

/** 当前实际生效的后端名，供日志标签页展示 */
export function backendName(): string {
  return backend.name;
}

// ---------------------------------------------------------------- public API

/** 读一个值；不存在或类型不符时返回 fallback */
export function read<T>(key: string, fallback: T): T {
  const raw = backend.get(nsKey(key));
  if (raw === undefined) return fallback;
  if (typeof raw !== typeof fallback && fallback !== null) {
    // 类型不匹配（例如旧版本残留），退回默认值而不是把脏数据喂给业务代码
    return fallback;
  }
  return raw as T;
}

/** 写一个值 */
export function write(key: string, value: unknown): void {
  backend.set(nsKey(key), value);
}

/** 删一个值 */
export function remove(key: string): void {
  backend.delete(nsKey(key));
}

/** 当前命名空间下的全部键（已去掉前缀），按字典序 */
export function listKeys(): string[] {
  return backend.keys()
    .filter((k) => k.startsWith(NS_PREFIX))
    .map((k) => k.slice(NS_PREFIX.length))
    .sort();
}

/**
 * 跨标签页值变更监听（GM 专属能力：多标签页挂机靠它同步状态）。
 * 无 GM 环境时返回一个 no-op 取消函数。
 */
export function onRemoteChange(
  key: string,
  listener: (oldValue: unknown, newValue: unknown, remote: boolean) => void,
): () => void {
  if (typeof GM_addValueChangeListener !== 'function') return () => {};
  const full = nsKey(key);
  const id = GM_addValueChangeListener(full, (_name, oldV, newV, remote) => {
    listener(oldV, newV, remote);
  });
  return () => {
    GM_removeValueChangeListener(id);
  };
}

/** 测试用：把存储重置干净（只清本命名空间） */
export function clearAll(): void {
  for (const key of listKeys()) remove(key);
}
