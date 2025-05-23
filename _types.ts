// @filename: _types.ts
import type { SpecSubscription, SpecObserver } from "./_spec.ts";
import type { Symbol } from "./symbol.ts";

/**
 * Enhanced Observer interface for our implementation.
 * 
 * 
 * This extends the minimal SpecObserver with additional capabilities and
 * type-safety for our specific Observable implementation. It provides:
 * 
 * 1. Type-safe access to our enhanced Subscription object
 * 2. Consistent method signatures for notification handling
 * 3. Same optional methods as the spec but with our own types
 * 
 * While the base spec only requires minimal functionality, our extended
 * Observer provides more guarantees and features.
 * 
 * @typeParam T - Type of values this observer can receive.
 * 
 * @example
 * ```ts
 * const timerObserver: Observer<number> = {
 *   start(subscription) {
 *     console.log('Timer started');
 *     // Can access enhanced subscription properties
 *     console.log('Subscription active:', !subscription.closed);
 *   },
 *   next(value) {
 *     console.log('Tick:', value);
 *   },
 *   complete() {
 *     console.log('Timer completed');
 *   }
 * };
 * ```
 */
export interface Observer<T> extends SpecObserver<T> {
  /**
   * Called immediately after subscribing with our enhanced Subscription type.
   * 
   * 
   * This override ensures the subscription passed to start() is our
   * enhanced Subscription type with additional properties and methods,
   * not just the minimal SpecSubscription.
   * 
   * @param subscription - Our enhanced Subscription object
   * @specref § 4.2 CreateSubscription
   */
  start?(subscription: Subscription): void;
}

/**
 * Enhanced Subscription interface with additional features.
 * 
 * 
 * Extends the minimal SpecSubscription with:
 * 1. A `closed` property to check subscription state
 * 2. Support for `using` blocks via Symbol.dispose
 * 3. Support for async cleanup via Symbol.asyncDispose
 * 4. String tag for proper toString() behavior
 * 
 * These enhancements make subscriptions more useful and ergonomic
 * while maintaining compatibility with the core specification.
 * 
 * @example
 * ```ts
 * // Standard usage
 * const sub = observable.subscribe(observer);
 * console.log('Active:', !sub.closed);
 * sub.unsubscribe();
 * 
 * // With using blocks (automatically unsubscribes at block end)
 * {
 *   using sub = observable.subscribe(observer);
 *   // Use subscription here...
 * } // Subscription cleaned up here
 * 
 * // With async using blocks
 * async function example() {
 *   await using sub = observable.subscribe(observer);
 *   // Use subscription here...
 * } // Awaits cleanup here
 * ```
 */
export interface Subscription extends SpecSubscription, Disposable, AsyncDisposable {
  /**
   * Indicates whether this subscription is closed.
   * 
   * 
   * A subscription becomes closed when:
   * - `unsubscribe()` is called explicitly
   * - The Observable calls observer.error()
   * - The Observable calls observer.complete()
   * 
   * Once closed, a subscription cannot be reopened, and no further
   * notifications will be delivered to the observer.
   * 
   * @example
   * ```ts
   * const sub = observable.subscribe(...);
   * console.log(sub.closed); // false
   * 
   * sub.unsubscribe();
   * console.log(sub.closed); // true
   * ```
   */
  readonly closed: boolean;

  /**
   * Enables automatic cleanup in `using` blocks.
   * 
   * 
   * This method enables subscriptions to work with TC39's `using` statement,
   * providing automatic resource cleanup at block exit. When a subscription
   * is used with `using`, it will be automatically unsubscribed when the
   * block exits, even if an exception occurs.
   * 
   * @example
   * ```ts
   * {
   *   using sub = observable.subscribe(...);
   *   // Code that uses the subscription
   * } // Subscription automatically unsubscribed here
   * ```
   */
  [Symbol.dispose](): void;

  /**
   * Enables automatic cleanup in `await using` blocks.
   * 
   * 
   * This method enables subscriptions to work with TC39's `await using`
   * statement, providing automatic cleanup for async contexts. When a
   * subscription is used with `await using`, it will be automatically
   * unsubscribed when the block exits.
   * 
   * @returns A Promise that resolves after unsubscribe completes
   * 
   * @example
   * ```ts
   * async function example() {
   *   await using sub = observable.subscribe(...);
   *   // Async code that uses the subscription
   * } // Subscription automatically unsubscribed here
   * ```
   */
  [Symbol.asyncDispose](): Promise<void>;

  /**
   * Provides a standard string tag for the object.
   * 
   * 
   * Used by Object.prototype.toString to identify this object type.
   * This ensures that `Object.prototype.toString.call(subscription)`
   * returns "[object Subscription]".
   */
  readonly [Symbol.toStringTag]: "Subscription";
}

export type * from "./_spec.ts";