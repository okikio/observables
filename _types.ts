import type { Symbol } from "./symbol.ts";

/**
 * Receives notifications from an {@link Observable}.
 * All callbacks are optional and will be skipped if missing.
 */
export interface Observer<T> {
  /** Called immediately after subscribing. */
  start?(subscription: Subscription): void;
  /** Handle next value. */
  next?(value: T): void;
  /** Handle error. */
  error?(error: unknown): void;
  /** Handle completion. */
  complete?(): void;
}

/** Object returned by {@link Observable.subscribe}. */
export interface Subscription {
  /** Cancel the subscription and run teardown. */
  unsubscribe(): void;
  /** True if closed (unsubscribed, errored, or completed). */
  closed: boolean;
  /** Alias for unsubscribe (for using syntax). */
  [Symbol.dispose](): void;
  /** Async alias for unsubscribe. */
  [Symbol.asyncDispose](): Promise<void>;
  readonly [Symbol.toStringTag]: "Subscription";
}
