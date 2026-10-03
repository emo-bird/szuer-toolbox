/**
 * 事件总线：模块间解耦用。
 *
 * 刻意做成极小的类型安全发射器 —— 不引入任何依赖，也避免把 EventTarget 的
 * 字符串事件名语义带进来（我们的模块是站点级的，事件名容易撞）。
 */

export type Unsubscribe = () => void;

export type Handler<T> = (payload: T) => void;

export class Bus<Events extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  /** 订阅一个事件，返回取消订阅函数 */
  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): Unsubscribe {
    let set = this.handlers.get(event);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => {
      set.delete(handler as Handler<never>);
    };
  }

  /** 订阅一次 */
  once<K extends keyof Events>(event: K, handler: Handler<Events[K]>): Unsubscribe {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  /**
   * 广播。**监听器抛出的异常不会中断其它监听器**，而是落到 onError。
   * 这一点很重要：一个坏掉的站点模块不该把整个悬浮窗带崩。
   */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (set === undefined) return;
    for (const handler of [...set]) {
      try {
        (handler as Handler<Events[K]>)(payload);
      } catch (err) {
        this.onError?.(event, err);
      }
    }
  }

  /** 监听器异常出口，由 main 装配时指向 logger */
  onError?: (event: keyof Events, err: unknown) => void;

  /** 清空所有订阅（页面卸载前调用） */
  clear(): void {
    this.handlers.clear();
  }
}
