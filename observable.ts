// @filename: observable.ts
/**
 * A **spec-faithful** yet ergonomic TC39-inspired Observable implementation with detailed TSDocs and examples.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * Why this file exists
 * --------------------
 * 1.  **Inter-op with the upcoming TC39 Observable proposal (stage 1 as of May 2025).**
 *      <https://github.com/tc39/proposal-observable>
 * 2.  **Bridge push-based and pull-based worlds in a single 250 line module**
 *     while keeping the public surface identical to the spec so future browsers
 *     can drop in native implementations with zero code changes on your side.
 * 3.  **Teach by example.**  Every exported symbol is fully @link-ed back to the
 *     relevant spec algorithm step so you can browse the spec and the code side
 *     by side.
 *
 * Features
 * --------
 * - **Push API**: Standard Observable `.subscribe()` interface with proper cleanup
 * - **Pull API**: Async iteration with backpressure via ReadableStream
 * - **Interop**: Seamless integration with other Observable implementations
 * - **Resource Management**: Support for `using`/`await using` blocks
 * - **Spec Compliant**: Carefully follows the TC39 proposal semantics
 * - **Performance Optimized**: Streamlined for high-frequency event handling
 * 
 * Example output
 * --------------
 * ```text
 * > node demo/basic.js
 * Subscribed
 * Value: 1
 * Value: 2
 * Value: 3
 * Complete
 * ```
 *
 * Creation helpers `of` and `from` are separate exports for tree-shaking.
 * 
 * > Error-propagation policy  
 * > ─────────────────────────────
 * > * If the *observer supplies its own `error()` handler*,
 * >   that handler is considered the "catch-block" for the stream.
 * >     ↳  Any exception that happens *inside* the user's `next()` /
 * >         `complete()` callbacks is forwarded to `error(err)` **once**.
 * >     ↳  If `error()` itself throws, we still delegate to `HostReportErrors` (≈ "unhandled-promise rejection") 
 * >         (i.e. `queueMicrotask`), exactly as the proposal specifies.
 * > 
 * > * If the observer does **not** implement `error()`, we fall back to the
 * >   spec's `HostReportErrors` behaviour (queueMicrotask + throw) so the host
 * >   surfaces the error just like an uncaught Promise rejection.
 * > 
 * > Rationale – Think of `error()` as the moral equivalent of a `.catch()`
 * > on a Promise.  Once a catch exists, the host no longer warns about
 * > "unhandled" rejections; we mirror that mental model here.
 *
 * @example Basic subscription:
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * // Emit 1,2,3 then complete
 * const subscription = Observable.of(1, 2, 3).subscribe({
 *   start(sub) { console.log('Subscribed'); },
 *   next(val)  { console.log('Value:', val); },
 *   complete() { console.log('Complete'); }
 * });
 *
 * // Cancel manually if needed
 * subscription.unsubscribe();
 * ```
 *
 * @example Resource-safe usage with `using` statement:
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * {
 *   using subscription = Observable.of(1, 2, 3).subscribe({
 *     next(val) { console.log('Value:', val); }
 *   });
 *   
 *   // Code that uses the subscription
 *   doSomething();
 *   
 * } // Subscription automatically unsubscribed at block end
 * ```
 *
 * @example Simple async iteration:
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * (async () => {
 *   for await (const x of Observable.of('a', 'b', 'c')) {
 *     console.log(x);
 *   }
 * })();
 * ```
 *
 * @example Pull with backpressure:
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * const nums$ = Observable.from([1,2,3,4,5]);
 * (async () => {
 *   for await (const n of nums$.pull({ strategy: { highWaterMark: 2 } })) {
 *     console.log('Pulled:', n);
 *     await new Promise(r => setTimeout(r, 1000)); // Slow consumer
 *   }
 * })();
 * ```
 * 
 * @module
 */
import type { SpecObservable, ObservableProtocol } from "./_spec.ts";
import type { Observer, Subscription } from "./_types.ts";
import { Symbol } from "./symbol.ts";

/**
 * Teardown function returned by the *subscriber* when it needs to release
 * resources (DOM handlers, sockets…).
 *
 * @remarks
 * The TC39 spec allows subscribers to return either:
 * - A function that will be called when the subscription is cancelled
 * - An object with an `unsubscribe()` method
 * - Nothing (`undefined`), indicating no cleanup is needed
 * 
 * This type represents the function variant, though our implementation
 * handles all valid return types according to the spec.
 * 
 * @example
 * ```ts
 * new Observable(observer => {
 *   const timer = setInterval(() => observer.next(Date.now()), 1000);
 *   // Return teardown function
 *   return () => clearInterval(timer);
 * });
 * ```
 */
export type Teardown = () => void;

/**
 * Internal state associated with each Subscription.
 * Using a dedicated state object stored in a WeakMap gives us:
 * 1. A single source of truth for subscription state
 * 2. No circular references that might leak memory
 * 3. Clean separation between public interface and internal state
 */
interface StateMap<T> {
  /** True once subscription is closed via unsubscribe, error, or complete */
  closed: boolean;

  /** Reference to the observer; nulled on closure to prevent memory leaks */
  observer: Observer<T> | null;

  /** Function or object returned by subscriber; used for resource cleanup */
  cleanup: Teardown | Subscription | null;
}

/**
 * Central registry of subscription state.
 * 
 * Using a WeakMap allows us to:
 * 1. Associate state with subscription objects without extending them
 * 2. Let the garbage collector automatically clean up entries when subscriptions are no longer referenced
 * 3. Hide implementation details from users
 */
const SubscriptionStateMap = new WeakMap<Subscription, StateMap<unknown>>()
/**
 * Check if a subscription is closed.
 * All code paths that need to verify closed state use this function,
 * ensuring consistent behavior.
 * 
 * @returns True if subscription is closed, unsubscribed, or invalid
 */
function isClosed(subscription: Subscription): boolean {
  return SubscriptionStateMap.get(subscription)?.closed ?? true;
}

/**
 * Creates a new Subscription object with properly initialized state.
 * 
 * @remarks
 * We validate observer methods early, ensuring type errors are caught
 * at subscription time rather than during event emission.
 * 
 * The returned Subscription includes support for:
 * - Manual cancellation via `unsubscribe()`
 * - Automatic cleanup via `using` blocks (Symbol.dispose)
 * - Async cleanup contexts (Symbol.asyncDispose)
 * 
 * @throws TypeError if observer methods are present but not functions
 */
function createSubscription<T>(observer: Observer<T>): Subscription {
  // Observer's methods should be functions if they exist
  if (observer.next !== undefined && typeof observer.next !== 'function') {
    throw new TypeError('Observer.next must be a function');
  }
  if (observer.error !== undefined && typeof observer.error !== 'function') {
    throw new TypeError('Observer.error must be a function');
  }
  if (observer.complete !== undefined && typeof observer.complete !== 'function') {
    throw new TypeError('Observer.complete must be a function');
  }

  /* -------------------------------------------------------------------
   * Create the Subscription facade (spec: CreateSubscription()).
   * ------------------------------------------------------------------- */
  const subscription: Subscription = {
    get [Symbol.toStringTag](): "Subscription" { return "Subscription" as const; },

    /**
     * Returns whether this subscription is closed.
     * 
     * @remarks
     * A subscription becomes closed after:
     * - Explicit call to unsubscribe()
     * - Error notification
     * - Complete notification
     * 
     * Once closed, no further events will be delivered to the observer,
     * and resources associated with the subscription are released.
     */
    get closed() { return isClosed(this) },

    /**
     * Cancels the subscription and releases resources.
     * 
     * @remarks
     * - Safe to call multiple times (idempotent)
     * - Synchronously performs cleanup
     * - Marks subscription as closed
     * - Prevents further observer notifications
     * 
     * This is the primary method for consumers to explicitly
     * terminate a subscription when they no longer need it.
     */
    unsubscribe(): void { closeSubscription(this); },

    // Support `using` disposal for automatic resource management
    [Symbol.dispose]() {
      this.unsubscribe();
    },

    // Support async disposal patterns
    [Symbol.asyncDispose]() {
      return Promise.resolve(this.unsubscribe());
    }
  };

  // Initialize shared state
  SubscriptionStateMap.set(subscription, {
    closed: false,
    observer,
    cleanup: null
  });

  return subscription;
}

/**
 * Marks a subscription as closed and runs any necessary cleanup.
 * 
 * @remarks
 * This is the centralized implementation for all subscription termination paths:
 * - Manual unsubscribe()
 * - Observer.error()
 * - Observer.complete()
 * 
 * The function ensures:
 * 1. Idempotency (safe to call multiple times)
 * 2. Cleanup happens exactly once
 * 3. State is properly cleared to prevent memory leaks
 * 4. WeakMap entry is removed to aid garbage collection
 * 
 * @param subscription - The subscription to close
 */
function closeSubscription(subscription: Subscription): void {
  const state = SubscriptionStateMap.get(subscription);
  if (!state || state.closed) return;

  // Mark closed first
  state.closed = true;

  // Cache cleanup and observer before clearing
  let cleanup = state.cleanup;

  // Clear references first
  state.cleanup = null;
  state.observer = null;

  try {
    // Run cleanup
    if (cleanup) cleanupSubscription(cleanup);
  } finally {
    // Ensure WeakMap entry is deleted even if cleanup throws
    SubscriptionStateMap.delete(subscription);
    cleanup = null;
  }
}


/**
 * Handles the actual cleanup process for a subscription.
 * 
 * @remarks
 * The spec allows three different types of cleanup values:
 * 1. Function: Called directly
 * 2. Object with unsubscribe method: unsubscribe() is called
 * 3. (deviate from spec) Object with Symbol.dispose/asyncDispose: dispose() is called
 * 
 * Any errors during cleanup are reported asynchronously to prevent
 * them from disrupting the unsubscribe flow.
 * 
 * @param cleanup - Function or object to perform cleanup
 */
function cleanupSubscription(cleanup: Teardown | Subscription | null) {
  let temp = cleanup;
  cleanup = null;

  if (!temp) return;
  try {
    if (typeof temp === 'function') temp();
    else if (typeof temp === "object") {
      if (typeof temp.unsubscribe === 'function') temp.unsubscribe();
      else if (typeof temp[Symbol.asyncDispose] === "function")
        temp[Symbol.asyncDispose]();
      else if (typeof temp[Symbol.dispose] === "function")
        temp[Symbol.dispose]();
    }
  } catch (err) {
  // Report cleanup errors asynchronously to avoid disrupting the unsubscribe flow
    queueMicrotask(() => { throw err });
  }

  temp = null;
}


/**
 * Wraps an observer with key guarantees required by the Observable specification.
 * 
 * @remarks
 * SubscriptionObserver is a critical component that ensures:
 * 
 * 1. The observer contract is honored correctly
 * 2. Notifications stop after a subscription is closed
 * 3. Error/complete notifications properly terminate the subscription
 * 4. Observer methods are called with the correct `this` context
 * 5. Errors are properly propagated according to spec
 * 
 * This wrapper acts as the intermediary between the Observable producer
 * and the consumer-provided Observer.
 * 
 * @typeParam T - The type of values delivered by the parent Observable.
 */
export class SubscriptionObserver<T> {
  /**
   * Returns whether this observer's subscription is closed.
   * 
   * @remarks
   * Uses the single source of truth for closed state from SubscriptionStateMap.
   * This property is used by subscriber functions to check if they should
   * continue delivering events.
   * 
   * @example
   * ```ts
   * const timer$ = new Observable(observer => {
   *   const id = setInterval(() => {
   *     if (!observer.closed) {
   *       observer.next(Date.now());
   *     }
   *   }, 1000);
   *   return () => clearInterval(id);
   * });
   * ```
   */
  get closed() { 
    if (!this.#subscription) return true;
    return isClosed(this.#subscription); 
  }

  /**
   * Retrieves the current observer, if available.
   * 
   * @remarks
   * - Returns null if subscription is closed or unavailable
   * - Accesses state via WeakMap to maintain single source of truth
   * - Used internally by next/error/complete methods
   */
  get #observer(): Observer<T> | null { 
    if (!this.#subscription) return null;
    return SubscriptionStateMap.get(this.#subscription)?.observer ?? null;
  }

  /** Reference to the subscription that created this observer */
  #subscription?: Subscription | null = null;

  /**
   * Creates a new SubscriptionObserver attached to the given subscription.
   * 
   * @param subscription - The subscription that created this observer
   */
  constructor(subscription?: Subscription | null) {
    this.#subscription = subscription;
  }

  /**
   * Delivers the next value to the observer if the subscription is open.
   * 
   * @remarks
   * This is typically the "hot path" in an Observable implementation,
   * as it's called for every emitted value. Key behaviors:
   * 
   * 1. Silently returns if subscription is closed (no errors)
   * 2. Properly preserves observer's `this` context
   * 3. Catches and handles errors thrown from observer.next
   * 4. Forwards errors to observer.error when available
   * 
   * Performance Considerations:
   * - Minimizes property access chains
   * - Early returns for closed subscriptions
   * - Type checking to avoid calling non-functions
   * 
   * @param value - The value to deliver to the observer
   * 
   * @example
   * ```ts
   * // Inside a subscriber function:
   * observer.next(42);  // Delivers value to consumer
   * ```
   * 
   * > Note: Error-propagation policy  
   * > ─────────────────────────────
   * > * If the *observer supplies its own `error()` handler*,
   * >   that handler is considered the “catch-block” for the stream.
   * >     ↳  Any exception that happens *inside* the user’s `next()` /
   * >         `complete()` callbacks is forwarded to `error(err)` **once**.
   * >     ↳  If `error()` itself throws, we still delegate to `HostReportErrors` (≈ “unhandled-promise rejection”) 
   * >         (i.e. `queueMicrotask`), exactly as the proposal specifies.
   * >
   * > * If the observer does **not** implement `error()`, we fall back to the
   * >   spec’s `HostReportErrors` behaviour (queueMicrotask + throw) so the host
   * >   surfaces the error just like an uncaught Promise rejection.
   * >
   * > Rationale – Think of `error()` as the moral equivalent of a `.catch()`
   * > on a Promise.  Once a catch exists, the host no longer warns about
   * > “unhandled” rejections; we mirror that mental model here.
   * >
   * > Spec reference – This diverges slightly from stage-1, which still
   * > invokes HostReportErrors if the *error handler itself* throws.  We
   * > intentionally suppress that extra surfacing for the reasons above.
   */
  next(value: T) {
    if (this.closed) return;
    if (typeof this.#observer?.next !== 'function') return;

    try {
      this.#observer.next.call(this.#observer, value); 
    } catch (err) {
      if (typeof this.#observer?.error === "function") {
        try { this.#observer.error.call(this.#observer, err); }
        catch (err) { queueMicrotask(() => { throw err; }); }
      }

      // Either a user callback or HostReportErrors emulation (queueMicrotask).
      else queueMicrotask(() => { throw err; });
    }
  }

  /**
   * Delivers an error notification to the observer, then closes the subscription.
   * 
   * @remarks
   * Error is a terminal operation - after calling it:
   * 1. The subscription is immediately marked as closed
   * 2. Resources are released via unsubscribe()
   * 3. No further notifications will be delivered
   * 
   * Error Handling:
   * - If observer.error exists, the error is delivered there
   * - If observer.error throws, the error is reported asynchronously
   * - If no error handler exists, the error is reported asynchronously
   * 
   * > Note: Even for "silent" errors (no error handler), we still close
   * the subscription and report the error to the host.
   * 
   * @param err - The error to deliver
   * 
   * @example
   * ```ts
   * // Inside a subscriber function:
   * try {
   *   doRiskyOperation();
   * } catch (err) {
   *   observer.error(err);  // Terminates the subscription with error
   * }
   * ```
   * 
   * @see {@link SubscriptionObserver.next | Review the error propagation policy in `next()` on how errors propagate, the behaviour is not obvious on first glance.}
   */
  error(err: unknown) {
    if (this.closed) return;

    if (typeof this.#observer?.error === 'function') {
      try { this.#observer.error.call(this.#observer, err); } 
      catch (innerErr) { queueMicrotask(() => { throw innerErr; }); }
    } 

    // No error handler, delegate to host
    else queueMicrotask(() => { throw err; });

    if (typeof this.#subscription?.unsubscribe === 'function') {
      const sub = this.#subscription;
      this.#subscription = null; // Clear reference first
      sub.unsubscribe();
    }
  }

  /**
   * Signals successful completion of the observable sequence.
   * 
   * @remarks
   * Complete is a terminal operation - after calling it:
   * 1. The subscription is immediately marked as closed
   * 2. Resources are released via unsubscribe()
   * 3. No further notifications will be delivered
   * 
   * If observer.complete throws an error:
   * - The error is forwarded to observer.error if available
   * - Otherwise, it's reported asynchronously to the host
   * 
   * @example
   * ```ts
   * // Inside a subscriber function:
   * observer.next(1);
   * observer.next(2);
   * observer.complete();  // Terminates the subscription normally
   * ```
   * 
   * @see {@link SubscriptionObserver.next | Review the error propagation policy in `next()` on how errors propagate, the behaviour is not obvious on first glance.}
   */
  complete() {
    if (this.closed) return;
    if (typeof this.#observer?.complete === "function") {
      try {
        this.#observer.complete.call(this.#observer);
      } catch (err) {
        if (typeof this.#observer?.error === "function") {
          try { this.#observer.error.call(this.#observer, err); }
          catch (innerErr) { queueMicrotask(() => { throw innerErr; }); }
        }

        // Either a user callback or HostReportErrors emulation (queueMicrotask).
        else queueMicrotask(() => { throw err; });
      }
    }

    if (typeof this.#subscription?.unsubscribe === 'function') {
      const sub = this.#subscription;
      this.#subscription = null; // Clear reference first
      sub.unsubscribe();
    }
  }

  /**
   * Returns a standard string tag for the object.
   * Used by Object.prototype.toString.
   */
  get [Symbol.toStringTag](): "Subscription Observer" { return "Subscription Observer" as const; }
}


/**
 * Core implementation of the TC39 Observable proposal.
 * 
 * @remarks
 * Observable is the central type in this library, representing a push-based
 * source of values that can be subscribed to. It delivers values to observers
 * and provides lifecycle guarantees around subscription and cleanup.
 * 
 * Key guarantees:
 * 1. Lazy execution - nothing happens until subscribe() is called
 * 2. Multiple independent observers can subscribe to the same Observable
 * 3. Each observer receives its own subscriber execution and cleanup
 * 4. Proper resource management when subscriptions are cancelled
 * 
 * Extensions beyond the TC39 proposal:
 * - Pull API via AsyncIterable interface
 * - Using/await using support via Symbol.dispose/asyncDispose
 * - Helper factories like create() for easier construction
 * 
 * @typeParam T - Type of values emitted by this Observable
 */
export class Observable<T> implements AsyncIterable<T>, SpecObservable<T>, ObservableProtocol<T> {
  /** The subscriber function provided when the Observable was created */
  #subscribeFn: (obs: SubscriptionObserver<T>) => Teardown | Subscription | void;

  /**
   * Creates a new Observable with the given subscriber function.
   * 
   * @remarks
   * The subscriber function is the heart of an Observable. It:
   * 1. Is called once per subscription (not at Observable creation time)
   * 2. Receives a SubscriptionObserver to send values through
   * 3. Can optionally return a cleanup function or subscription
   * 
   * Nothing happens when an Observable is created - execution only
   * begins when subscribe() is called.
   * 
   * @param subscribeFn - Function that implements the Observable's behavior
   * 
   * @throws TypeError if subscribeFn is not a function
   * @throws TypeError if Observable is called without "new"
   * 
   * @example
   * ```ts
   * // Timer that emits the current timestamp every second
   * const timer$ = new Observable(observer => {
   *   console.log('Subscription started!');
   *   const id = setInterval(() => {
   *     observer.next(Date.now());
   *   }, 1000);
   *   
   *   // Return cleanup function
   *   return () => {
   *     console.log('Cleaning up timer');
   *     clearInterval(id);
   *   };
   * });
   * ```
   */
  constructor(subscribeFn: (obs: SubscriptionObserver<T>) => Teardown | void) {
    if (typeof subscribeFn !== 'function') {
      throw new TypeError('Observable initializer must be a function');
    }

    // Add check for constructor invocation
    if (!(this instanceof Observable)) {
      throw new TypeError('Observable must be called with new');
    }

    this.#subscribeFn = subscribeFn;
  }

  /**
   * Returns this Observable (required for interoperability).
   * 
   * @remarks
   * This method implements the TC39 Symbol.observable protocol,
   * which allows foreign Observable implementations to recognize
   * and interoperate with this implementation.
   * 
   * @returns This Observable instance
   */
  [Symbol.observable](): Observable<T> { return this; }

  /**
   * Subscribes to this Observable with an observer object.
   * 
   * @remarks
   * This method creates a subscription that:
   * 1. Executes the subscriber function to begin producing values
   * 2. Delivers those values to the observer's callbacks
   * 3. Returns a subscription object for cancellation
   * 
   * Subscription Lifecycle:
   * - Starts immediately and synchronously
   * - Continues until explicitly cancelled or completed/errored
   * - Guarantees proper resource cleanup on termination
   * 
   * Critical Note About Infinite Observables:
   * If the Observable never calls `complete()` or `error()`,
   * resources will not be automatically released unless you call
   * `unsubscribe()` manually. For long-lived subscriptions, consider:
   * 
   * 1. Using a `using` block with this subscription
   * 2. Setting up a timeout or take-until condition
   * 3. Explicitly calling `unsubscribe()` when no longer needed
   * 
   * @param observer - Object with next/error/complete callbacks
   * @returns Subscription object that can be used to cancel the subscription
   * 
   * @example
   * ```ts
   * const subscription = observable.subscribe({
   *   next(value) { console.log('Received:', value) },
   *   error(err) { console.error('Error:', err) },
   *   complete() { console.log('Done!') }
   * });
   * 
   * // Later, to cancel:
   * subscription.unsubscribe();
   * ```
   */
  subscribe(observer: Observer<T>): Subscription;

  /**
   * Subscribes to this Observable with callback functions.
   * 
   * @remarks
   * Convenience overload that wraps the callbacks in an Observer object.
   * See the documentation for the observer-based overload for details
   * on subscription behavior.
   * 
   * Critical Note About Infinite Observables:
   * If the Observable never calls `complete()` or `error()`,
   * resources will not be automatically released unless you call
   * `unsubscribe()` manually. For long-lived subscriptions, consider:
   * 
   * 1. Using a `using` block with this subscription
   * 2. Setting up a timeout or take-until condition
   * 3. Explicitly calling `unsubscribe()` when no longer needed
   * 
   * @param next - Function to handle each emitted value
   * @param error - Optional function to handle errors
   * @param complete - Optional function to handle completion
   * @returns Subscription object that can be used to cancel the subscription
   * 
   * @example
   * ```ts
   * const subscription = observable.subscribe(
   *   value => console.log('Received:', value),
   *   err => console.error('Error:', err),
   *   () => console.log('Done!')
   * );
   * ```
   */
  subscribe(
    next: (value: T) => void,
    error?: (e: unknown) => void,
    complete?: () => void
  ): Subscription;

  /**
   * Implementation of subscribe method (handles both overloads).
   */
  subscribe(
    observerOrNext: Observer<T> | ((value: T) => void), 
    error?: (e: unknown) => void, 
    complete?: () => void
  ): Subscription {
    // Check for invalid this context
    if (this === null || this === undefined) {
      throw new TypeError('Cannot read property "subscribe" of null or undefined');
    }

    /* -------------------------------------------------------------------
     * 1.  Normalise the observer – mirrors spec step 4.
     * ------------------------------------------------------------------- */
    const observer: Observer<T> | null =
      typeof observerOrNext === 'function'
        ? { next: observerOrNext, error, complete }
        : observerOrNext && typeof observerOrNext === 'object'
          ? observerOrNext
          : {};           // ← spec-compliant fallback for null / primitives
    
    /* -------------------------------------------------------------------
     * 2.  Create the Subscription facade (spec: CreateSubscription()).
     * ------------------------------------------------------------------- */
    const subscription: Subscription = createSubscription(observer);

    /* -------------------------------------------------------------------
     * 3.  Wrap user observer so we enforce closed-state.
     * ------------------------------------------------------------------- */
    const subObserver = new SubscriptionObserver<T>(subscription);


    /* -------------------------------------------------------------------
     * 4.  Call observer.start(subscription) – (spec step 10).
     * ------------------------------------------------------------------- */
    try {
      observer.start?.(subscription);
      if (subscription?.closed) return subscription;   // spec step 10.d
    } catch (err) {
      // WarnIfAbrupt: report, but return closed subscription
      // Queue in a micro-task so it surfaces *after* current job,
      // matching the spec’s “report later” intent.
      queueMicrotask(() => {
        // 1. Print to console for visibility
        console.error(err);

        // 2. Re-throw so debuggers break (optional, but common)
        throw err;
      });

      subscription?.unsubscribe?.();
      return subscription;
    }

    /* -------------------------------------------------------------------
     * 5.  Execute the user subscriber and capture its cleanup (spec step 12-16).
     * ------------------------------------------------------------------- */
    try {
      let cleanup = this.#subscribeFn?.call(undefined, subObserver) ?? null;

      // Validate the cleanup value if provided
      if (cleanup !== undefined) {
        if (!(
          typeof cleanup === 'function' || 
          typeof cleanup?.unsubscribe === 'function'
        )) {
          throw new TypeError('Expected subscriber to return a function, an unsubscribe object, or undefined');
        }
      }

      // Store the cleanup function in the subscription state
      const state = SubscriptionStateMap.get(subscription);
      if (state && cleanup) (state.cleanup = cleanup);
      cleanup = null;

      // If already closed (via synchronous complete/error), no need to do anything
      // The unsubscribe call from those methods already performed cleanup
    } catch (err) {
      // 6) If their subscribeFn throws, send that as an error notification
      subObserver.error(err);
    }

    // 7) Finally, hand back the Subscription so callers can cancel whenever they like
    return subscription;
  }

  /**
   * Enables `for await ... of observable` syntax for direct async iteration.
   * 
   * @remarks
   * This method allows Observables to be used in any context that accepts an AsyncIterable,
   * implementing the "pull" mode of consuming an Observable.
   * 
   * The implementation delegates to the `pull()` function which:
   * 1. Converts push-based events to pull-based async iteration
   * 2. Applies backpressure with ReadableStream
   * 3. Handles proper cleanup on early termination
   * 
   * @returns An AsyncIterator that yields values from this Observable
   * 
   * @example
   * ```ts
   * const observable = Observable.of(1, 2, 3);
   * 
   * // Using for-await-of directly on an Observable
   * for await (const value of observable) {
   *   console.log(value); // Logs 1, 2, 3
   * }
   * ```
   */
  async *[Symbol.asyncIterator](): AsyncIterator<T> { yield* pull(this); }

  /**
   * Converts this Observable into an AsyncGenerator with backpressure control.
   * 
   * @remarks
   * This method provides more control over async iteration than the default
   * Symbol.asyncIterator implementation, allowing consumers to:
   * 
   * 1. Specify a queuing strategy with a custom highWaterMark
   * 2. Control buffering behavior when the producer is faster than the consumer
   * 3. Apply backpressure to prevent memory issues with fast producers
   * 
   * The implementation uses ReadableStream internally to manage buffering
   * and backpressure, pausing the producer when the buffer fills up.
   * 
   * @param options - Configuration options for the pull operation
   * @returns An AsyncGenerator that yields values from this Observable
   * 
   * @example
   * ```ts
   * // Buffer up to 5 items before applying backpressure
   * for await (const value of observable.pull({ 
   *   strategy: { highWaterMark: 5 } 
   * })) {
   *   console.log(value);
   *   // Slow consumer - producer will pause when buffer fills
   *   await new Promise(r => setTimeout(r, 1000));
   * }
   * ```
   */
  pull({ strategy = { highWaterMark: 1 } }: { strategy?: QueuingStrategy<T> } = {}): AsyncGenerator<T> {
    return pull(this, { strategy })
  }

  /**
   * Converts an iterable, async iterable, or Observable-like object to an Observable.
   * 
   * @remarks
   * This static method is a key part of the Observable interoperability mechanism,
   * handling multiple input types in a consistent way.
   * 
   * Behavior depends on the input type:
   * 1. Objects with Symbol.observable - Delegates to their implementation
   * 2. Synchronous iterables - Emits all values then completes
   * 3. Asynchronous iterables - Emits values as they arrive then completes
   * 
   * Unlike Promise.resolve, Observable.from will not return the input unchanged
   * if it's already an Observable, unless it's an instance of the exact same
   * constructor. This ensures consistent behavior across different Observable
   * implementations.
   * 
   * @param input - The object to convert to an Observable
   * @returns A new Observable that emits values from the input
   * 
   * @example
   * ```ts
   * // From an array
   * Observable.from([1, 2, 3]).subscribe({
   *   next: val => console.log(val) // 1, 2, 3
   * });
   * 
   * // From a Promise
   * Observable.from(Promise.resolve("result")).subscribe({
   *   next: val => console.log(val) // "result"
   * });
   * 
   * // From another Observable-like object
   * const foreign$ = {
   *   [Symbol.observable]() {
   *     return new Observable(obs => {
   *       obs.next("hello");
   *       obs.complete();
   *     });
   *   }
   * };
   * Observable.from(foreign$).subscribe({
   *   next: val => console.log(val) // "hello"
   * });
   * ```
   */
  static readonly from = from;

  /**
   * Creates an Observable that synchronously emits the given values then completes.
   * 
   * @remarks
   * This is a convenience method for creating simple Observables that:
   * 1. Emit a fixed set of values synchronously
   * 2. Complete immediately after emitting all values
   * 3. Never error
   * 
   * It's the Observable equivalent of `Promise.resolve()` for single values
   * or `[].values()` for multiple values.
   * 
   * @param items - Values to emit
   * @returns A new Observable that emits the given values then completes
   * 
   * @example
   * ```ts
   * // Create and subscribe
   * Observable.of(1, 2, 3).subscribe({
   *   next: val => console.log(val), // Logs 1, 2, 3
   *   complete: () => console.log('Done!')
   * });
   * 
   * // Output:
   * // 1
   * // 2
   * // 3
   * // Done!
   * ```
   */
  static readonly of = of;

  /**
   * Ergonomic factory for creating Observables with automatic type inference.
   * 
   * @remarks
   * This static method provides a more concise way to create Observables,
   * with better TypeScript type inference in many cases.
   * 
   * @see create
   */
  static readonly create = create;

  /**
   * Standard string tag for the object.
   * Used by Object.prototype.toString.
   */
  get [Symbol.toStringTag](): "Observable" { return "Observable"; }
}



/**
 * Creates an Observable that synchronously emits the given values then completes.
 * 
 * @remarks
 * This standalone function implements the Observable.of static method while
 * properly supporting subclassing. It's the Observable equivalent of:
 * - `Array.of()` for collections
 * - `Promise.resolve()` for single values
 * 
 * Key behaviors:
 * 1. Emits values synchronously when subscribed
 * 2. Completes immediately after all values are emitted
 * 3. Never errors
 * 4. Respects the constructor it was called on for subclassing
 * 
 * @param items - Values to emit
 * @returns A new Observable that emits the given values then completes
 * 
 * @example
 * ```ts
 * // Basic usage
 * of(1, 2, 3).subscribe({
 *   next: x => console.log(x),
 *   complete: () => console.log('Done!')
 * });
 * // Output: 1, 2, 3, Done!
 * 
 * // Subclassing support
 * class MyObservable extends Observable<number> {
 *   // Custom methods...
 * }
 * 
 * // Creates a MyObservable instance
 * const mine = MyObservable.of(1, 2, 3);
 * ```
 */
export function of<T>(this: unknown, ...items: T[]): Observable<T> {
  const Constructor = (typeof this === "function" ? this as typeof Observable<T> : Observable);
  return new Constructor(obs => {
    for (const v of items) obs.next(v);
    obs.complete();
  });
}

/**
 * Converts an Observable-like, sync iterable, or async iterable into an Observable.
 * 
 * @remarks
 * This is the standalone implementation of Observable.from, supporting:
 * - Objects with Symbol.observable (Observable-like)
 * - Regular iterables (arrays, Maps, Sets, generators)
 * - Async iterables (async generators, ReadableStreams)
 * 
 * Conversion follows these rules:
 * 1. For Symbol.observable objects: delegates to their implementation
 * 2. For iterables: synchronously emits all values, then completes
 * 3. For async iterables: emits values as they arrive, then completes
 * 
 * This function properly supports subclassing, preserving the constructor
 * it was called on.
 * 
 * @throws TypeError if input is null, undefined, or not convertible
 * 
 * @example
 * ```ts
 * // From array
 * from([1, 2, 3]).subscribe(x => console.log(x));
 * // Output: 1, 2, 3
 * 
 * // From Promise
 * from(Promise.resolve('done')).subscribe(x => console.log(x));
 * // Output: 'done'
 * 
 * // From Map
 * from(new Map([['a', 1], ['b', 2]])).subscribe(x => console.log(x));
 * // Output: ['a', 1], ['b', 2]
 * 
 * // From another Observable implementation
 * const foreign$ = {
 *   [Symbol.observable]() {
 *     return { subscribe: observer => {
 *       observer.next('hello');
 *       observer.complete();
 *       return { unsubscribe() {} };
 *     }};
 *   }
 * };
 * from(foreign$).subscribe(x => console.log(x));
 * // Output: 'hello'
 * ```
 */
export function from<T>(
  this: unknown,
  input: SpecObservable<T> | 
         Iterable<T> | AsyncIterable<T>
): Observable<T> {
  if (input === null || input === undefined) {
    throw new TypeError('Cannot convert undefined or null to Observable');
  }

  // Case 1 – object with @@observable
  if (typeof (input as SpecObservable<T>)?.[Symbol.observable] === 'function') {
    const Constructor = (typeof this === "function" ? this as typeof Observable<T> : Observable);
    const result = (input as SpecObservable<T>)[Symbol.observable]();

    // Validate the result has a subscribe method
    if (!result || typeof result.subscribe !== 'function') {
      throw new TypeError('Object returned from [Symbol.observable]() does not implement subscribe method');
    }

    // Return directly if it's already an instance of the target constructor
    if (result instanceof Constructor) return result as Observable<T>;

    // Otherwise, wrap it to ensure consistent behavior
    return new Constructor(observer => {
      const sub = (result as ObservableProtocol<T>).subscribe(observer);
      return () => sub?.unsubscribe?.();
    });
  }

  // Case 2 – synchronous iterable
  if ( typeof (input as Iterable<T>)?.[Symbol.iterator] === 'function') {
    return new Observable<T>(obs => {
      const iterator = (input as Iterable<T>)[Symbol.iterator]();
      for (let step = iterator.next(); !step.done; step = iterator.next()) {
        obs.next(step.value);

        // If subscription was closed during iteration, clean up and exit
        if (obs.closed) {
          if (typeof iterator?.return === 'function') 
            iterator.return(); // IteratorClose
          break;
        }
      }

      obs.complete();
    });
  }

  // Case 3 – async iterable
  if (typeof (input as AsyncIterable<T>)?.[Symbol.asyncIterator] === 'function') {
    return new Observable<T>(obs => {
      // Start consuming the async iterable
      (async () => {
        const iterator = (input as AsyncIterable<T>)[Symbol.asyncIterator]();
        try {
          for (let step = await iterator.next(); !step.done; step = await iterator.next()) {
            obs.next(step.value);

            // If subscription was closed during iteration, clean up and exit
            if (obs.closed) {
              if (typeof iterator?.return === 'function') 
                await iterator.return(); // IteratorClose
              break;
            }
          }

          // Normal completion
          obs.complete();
        } catch (err) {
          // Error during iteration
          obs.error(err);
        }
      })()
    });
  }

  throw new TypeError('Input is not Observable, Iterable, or AsyncIterable');
}


/**
 * Converts an Observable into an AsyncGenerator with backpressure control.
 * 
 * @remarks
 * This function bridges the gap between push-based Observables and
 * pull-based async iteration, allowing consumers to:
 * 
 * 1. Process values at their own pace
 * 2. Use standard async iteration patterns (for-await-of)
 * 3. Control buffering behavior to prevent memory issues
 * 
 * Implementation details:
 * - Uses ReadableStream as the backpressure mechanism
 * - Connects the Observable to the stream as a source
 * - Returns an AsyncGenerator that yields values from the stream
 * - Handles proper cleanup on early termination
 * 
 * Benefits over direct subscription:
 * - Consumer controls the pace of value processing
 * - Automatic buffering prevents overwhelmed consumers
 * - Natural integration with other async iteration tools
 * 
 * @param observable - Source of values to pull from
 * @param options - Configuration options for buffering and backpressure
 * @returns An AsyncGenerator that yields values from the observable
 * 
 * @example Basic usage with for-await-of:
 * ```ts
 * // Process values at controlled pace
 * for await (const value of pull(observable)) {
 *   console.log(value);
 *   await expensiveOperation(value);
 * }
 * ```
 * 
 * @example Custom buffering strategy:
 * ```ts
 * // Allow up to 10 values to buffer before applying backpressure
 * for await (const value of pull(observable, { 
 *   strategy: { highWaterMark: 10 } 
 * })) {
 *   console.log(value);
 * }
 * ```
 */
export async function* pull<T>(
  observable: Observable<T>,
  { strategy = { highWaterMark: 1 } }: { strategy?: QueuingStrategy<T> } = {},
): AsyncGenerator<T> {
  let sub: Subscription | null = null;

  // Create a ReadableStream that will buffer values from the Observable
  const stream = new ReadableStream<T>({
    start: ctrl => {
      sub = observable.subscribe({
        next: v => ctrl.enqueue(v),
        error: e => ctrl.error(e),
        complete: () => ctrl.close(),
      });
    },
    // Clean up the subscription if the stream is cancelled
    cancel: () => sub?.unsubscribe(),
  }, strategy);

  // Get a reader for the stream and yield values as they become available
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
  // Ensure resources are cleaned up even if iteration is terminated early
    reader.releaseLock();
    await stream.cancel();
  }
}

/**
 * Creates Observables with automatic type inference and simplified syntax.
 * 
 * @remarks
 * This factory function provides:
 * 
 * 1. Better TypeScript type inference than the Observable constructor
 * 2. A more concise API without requiring 'new'
 * 3. Options for simple emit-only or full observer access
 * 
 * It comes in two forms:
 * - Basic: Just provide an `emit` function
 * - Advanced: Access both `emit` and the full observer
 * 
 * Benefits:
 * - TypeScript infers the generic type parameter automatically
 * - No need for explicit type annotations in most cases
 * - Same runtime behavior as Observable constructor
 * 
 * @example Creating a simple string Observable:
 * ```ts
 * // Type inferred as Observable<string>
 * const names$ = create(emit => {
 *   emit("Alice");
 *   emit("Bob");
 *   emit("Charlie");
 * });
 * ```
 * 
 * @example With observer access for lifecycle control:
 * ```ts
 * const timer$ = create<number>((emit, observer) => {
 *   let count = 0;
 *   const id = setInterval(() => {
 *     if (count < 5) {
 *       emit(count++);
 *     } else {
 *       observer.complete();
 *     }
 *   }, 1000);
 *   
 *   return () => clearInterval(id);
 * });
 * ```
 */

/* ── Overload signatures ──────────────────────────────────────────────── */
export function create<T>(
  subscribe: (emit: (value: T) => void) => Teardown | void,
): Observable<T>;

export function create<T>(
  subscribe: (
    emit: (value: T) => void,
    observer?: SubscriptionObserver<T>,
  ) => Teardown | void,
): Observable<T>;

/* ── Shared implementation (no generic) ───────────────────────────────── */
export function create(
  subscribe: (
    emit: (value: unknown) => void,                        // ← any, not unknown
    observer?: SubscriptionObserver<unknown>,              // ← any, not unknown
  ) => Teardown | void,
): Observable<unknown> {                                   // ← any, then cast
  const obs = new Observable<unknown>(observer => {
    const emit = (v: unknown) => observer.next(v);
    return subscribe.length < 2
      ? subscribe(emit)                    // emit-only
      : subscribe(emit, observer);         // emit + observer
  });

  return obs as Observable<unknown>;           // satisfies every overload
}
