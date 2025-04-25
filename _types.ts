import type { Symbol } from "./symbol.ts";

/**
 * Functions to receive notifications from an Observable.
 * @typeParam T  Type of values emitted.
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

/**
 * Represents an active subscription to an Observable.
 */
export interface Subscription {
  /** Cancel the subscription and run teardown. */
  unsubscribe(): void;
  /** True if closed (unsubscribed, errored, or completed). */
  closed: boolean;
  /** Alias for unsubscribe (for using syntax). */
  [Symbol.dispose](): void;
  /** Async alias for unsubscribe. */
  [Symbol.asyncDispose](): Promise<void>;
}

export interface IObservable<T> {
  /**
   * Subscribe overloads: Observer or callbacks.
   * @returns Subscription
   */
  subscribe(observer: Partial<Observer<T>>): Subscription;
  subscribe(next: (value: T) => void, error?: (e: unknown) => void, complete?: () => void): Subscription;
  [Symbol.observable](): IObservable<T>;
}
