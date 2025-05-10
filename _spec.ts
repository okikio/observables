// @filename: _spec.ts
import type { Symbol } from "./symbol.ts";


/**
 * Defines the minimal contract for subscribable objects in the Observable ecosystem.
 * 
 * @remarks
 * ObservableProtocol is the core interface that all Observable-like objects must
 * implement. It represents the object returned by `[Symbol.observable]()` that 
 * consumers actually call `.subscribe()` on.
 * 
 * This interface is designed for interoperability between different Observable
 * implementations, allowing libraries to work with any object that conforms to
 * this protocol.
 * 
 * In the TC39 proposal, this is the interface that the object returned by
 * `[Symbol.observable]()` must satisfy.
 * 
 * @typeParam T - Type of values emitted by this Observable.
 * 
 * @example
 * ```ts
 * // Example of an object implementing ObservableProtocol
 * const source: ObservableProtocol<number> = {
 *   subscribe(observer) {
 *     observer.next?.(1);
 *     observer.next?.(2);
 *     observer.complete?.();
 *     return { unsubscribe() {} };
 *   }
 * };
 * 
 * // Using the protocol
 * const subscription = source.subscribe({
 *   next: value => console.log(value)
 * });
 * ```
 */
export interface ObservableProtocol<T> {
  /**
   * Subscribes to this Observable with an observer object.
   * 
   * @remarks
   * This method is the primary way to consume values from an Observable.
   * It begins the subscription process, connecting the consumer (observer)
   * to the producer, and returns a subscription object that can be used
   * to cancel the subscription.
   * 
   * @param observer - Object with callback methods to handle notifications
   * @returns A subscription object for cancellation
   * 
   * @specref § 3.1 Observable.prototype.subscribe
   */
  subscribe(observer: SpecObserver<T>): SpecSubscription;

  /**
   * Subscribes to this Observable with individual callback functions.
   * 
   * @remarks
   * This is a convenience overload that allows subscribing with individual
   * functions instead of an observer object. Internally, these callbacks
   * are wrapped into an observer object.
   * 
   * @param next - Function to handle each emitted value
   * @param error - Optional function to handle errors
   * @param complete - Optional function to handle completion
   * @returns A subscription object for cancellation
   * 
   * @specref § 3.1 Observable.prototype.subscribe
   */
  subscribe(
    next: (value: T) => void,
    error?: (error: unknown) => void,
    complete?: () => void
  ): SpecSubscription;
}

/**
 * Represents a cancellable connection to an Observable.
 * 
 * @remarks
 * A SpecSubscription is returned by the `subscribe` method and provides
 * a way to cancel the subscription, stopping the delivery of values and
 * releasing any resources associated with it.
 * 
 * This interface is intentionally minimal, matching the TC39 proposal's
 * requirements for subscription objects.
 * 
 * @example
 * ```ts
 * const subscription = observable.subscribe({
 *   next: value => console.log(value)
 * });
 * 
 * // Later, to cancel:
 * subscription.unsubscribe();
 * ```
 */
export interface SpecSubscription {
  /**
   * Cancels the subscription and releases associated resources.
   * 
   * @remarks
   * When called:
   * - Execution of the Observable is stopped
   * - No further notifications are delivered to the observer
   * - Resources associated with the subscription are released
   * - If already closed (unsubscribed, errored, or completed), this is a no-op
   * 
   * This method is idempotent - calling it multiple times has the same
   * effect as calling it once.
   * 
   * @specref § 4.2.2 %SubscriptionPrototype%.unsubscribe
   */
  unsubscribe(): void;
}

/**
 * Defines a consumer of Observable notifications.
 * 
 * @remarks
 * An Observer is an object with optional callback methods that receive
 * notifications from an Observable:
 * - `next`: Called for each value emitted by the Observable
 * - `error`: Called when an error occurs (terminal)
 * - `complete`: Called when the Observable finishes normally (terminal)
 * - `start`: Called immediately after subscription is established
 * 
 * All methods are optional. If a method is missing, the corresponding
 * notification is effectively ignored.
 * 
 * @typeParam T - Type of values this observer can receive.
 * 
 * @example
 * ```ts
 * const observer: SpecObserver<number> = {
 *   start(subscription) {
 *     console.log('Starting subscription');
 *     // Save subscription reference if needed later
 *   },
 *   next(value) {
 *     console.log('Received value:', value);
 *   },
 *   error(err) {
 *     console.error('Error occurred:', err);
 *   },
 *   complete() {
 *     console.log('Observable completed');
 *   }
 * };
 * 
 * observable.subscribe(observer);
 * ```
 */
export interface SpecObserver<T> {
  /**
   * Called immediately after subscription is established.
   * 
   * @remarks
   * This callback:
   * - Receives the subscription object as a parameter
   * - Runs before any other observer methods
   * - Allows the observer to store the subscription for later cancellation
   * - Can throw exceptions, which are reported but don't prevent subscription
   * 
   * If this method throws, the error is reported to the host environment
   * but the subscription is still established.
   * 
   * @param subscription - The subscription object created by this subscribe call
   * @specref § 4.2 CreateSubscription
   */
  start?(subscription: SpecSubscription): void;

  /**
   * Receives the next value in the sequence.
   * 
   * @remarks
   * This is the main data channel of an Observable. It:
   * - Is called zero or more times, once per emitted value
   * - Receives each value as its only parameter
   * - Is never called after error or complete
   * - Is never called after unsubscribe
   * 
   * If this method throws, the error is delivered to the `error` method.
   * 
   * @param value - The value emitted by the Observable
   * @specref § 5.2.4 %SubscriptionObserverPrototype%.next
   */
  next?(value: T): void;

  /**
   * Handles an error notification.
   * 
   * @remarks
   * This is called when:
   * - The Observable encounters an error during execution
   * - The observer's next or complete methods throw
   * 
   * After this method is called:
   * - The subscription is considered closed
   * - No more notifications will be delivered
   * - Resources associated with the subscription are released
   * 
   * If this method throws, the error is reported to the host environment.
   * 
   * @param error - The error that occurred
   * @specref § 5.2.5 %SubscriptionObserverPrototype%.error
   */
  error?(error: unknown): void;

  /**
   * Handles successful completion of the Observable.
   * 
   * @remarks
   * This is called when:
   * - The Observable has finished emitting values normally
   * - No more values will be emitted
   * 
   * After this method is called:
   * - The subscription is considered closed
   * - No more notifications will be delivered
   * - Resources associated with the subscription are released
   * 
   * If this method throws, the error is delivered to the `error` method.
   * 
   * @specref § 5.2.6 %SubscriptionObserverPrototype%.complete
   */
  complete?(): void;
}

/**
 * Defines an object that can be converted to an Observable.
 * 
 * @remarks
 * This interface represents anything that has a `[Symbol.observable]()` method,
 * making it interoperable with the Observable ecosystem. It's the TypeScript
 * equivalent of the TC39 proposal's "Observable-like" concept.
 *
 * The method must return an ObservableProtocol that can be subscribed to.
 * This enables interoperability between different Observable implementations
 * and allows conversion of custom types to Observables.
 * 
 * @typeParam T - Type of values the resulting Observable will emit.
 * 
 * @example
 * ```ts
 * // A simple string sequence as an Observable-like
 * const greetings: SpecObservable<string> = {
 *   [Symbol.observable]() {
 *     return {
 *       subscribe(observer) {
 *         observer.next?.('Hello');
 *         observer.next?.('World');
 *         observer.complete?.();
 *         return { unsubscribe() {} };
 *       }
 *     };
 *   }
 * };
 * 
 * // Convert to an Observable
 * const observable = Observable.from(greetings);
 * ```
 * 
 * @see https://tc39.es/proposal-observable/#observable-interface
 * @specref § 3.3 Observable.prototype[@@observable]
 */
export interface SpecObservable<T> {
  /**
   * Returns an object that conforms to the ObservableProtocol.
   * 
   * @remarks
   * This method acts as a conversion point that transforms any object
   * into an Observable-like entity that can be subscribed to.
   * 
   * When called:
   * - It should return an object with a `subscribe` method
   * - That object must conform to the ObservableProtocol interface
   * - The returned object becomes the actual subscription target
   * 
   * @returns An ObservableProtocol that can be subscribed to
   */
  [Symbol.observable](): ObservableProtocol<T>;
}