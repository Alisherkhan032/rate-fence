import type { FenceEventName, FenceEvents } from "../types/events.js";

type Listener<E extends FenceEventName> = (payload: FenceEvents[E]) => void;

/**
 * Typed event bus. Listener errors are swallowed so they never break the request path.
 * Async listeners are fire-and-forget (not awaited).
 */
export class EventBus {
  private readonly listeners = new Map<FenceEventName, Set<Listener<FenceEventName>>>();

  on<E extends FenceEventName>(event: E, listener: Listener<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<FenceEventName>);
    return () => {
      set!.delete(listener as Listener<FenceEventName>);
      if (set!.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  emit<E extends FenceEventName>(event: E, payload: FenceEvents[E]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) {
      return;
    }
    for (const listener of set) {
      try {
        const result = (listener as Listener<E>)(payload) as unknown;
        if (result && typeof (result as Promise<unknown>).then === "function") {
          void (result as Promise<unknown>).catch(() => {
            // Ignore async listener failures.
          });
        }
      } catch {
        // Synchronous listener failures must not break evaluate().
      }
    }
  }

  listenerCount(event?: FenceEventName): number {
    if (event) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
