// @filename: observable.ts
/**
 * A **spec-faithful** yet ergonomic TC39-inspired Observable implementation with detailed TSDocs and examples.
 *
 * A **push‑based stream abstraction** for events, data, and long‑running
 * operations. Think of it as a **multi‑value Promise** that keeps sending
 * values until you tell it to stop.
 *
 * Meant to help with juggling many async sources, mouse clicks, HTTP requests, timers,
 * WebSockets, file watchers. Before Observables you glued those together with a
 * mish‑mash of callbacks, Promises, `EventTarget`s and async iterators, each
 * with different rules for cleanup and error handling. **Observables give you
 * one mental model** for subscription → cancellation → propagation → teardown.
 *
 * @example Common Patterns
 * ```ts
 * // DOM events → Observable
 * const clicks = new Observable<Event>(obs => {
 *   const h = (e: Event) => obs.next(e);
 *   button.addEventListener("click", h);
 *   return () => button.removeEventListener("click", h);
 * });
 *
 * // HTTP polling every 5 s
 * const poll = new Observable<Response>(obs => {
 *   const id = setInterval(async () => {
 *     try { obs.next(await fetch("/api/data")); }
 *     catch (e) { obs.error(e); }
 *   }, 5000);
 *   return () => clearInterval(id);
 * });
 *
 * // WebSocket stream with graceful close
 * const live = new Observable<string>(obs => {
 *   const ws = new WebSocket("wss://example.com");
 *   ws.onmessage = e => obs.next(e.data);
 *   ws.onerror   = e => obs.error(e);
 *   ws.onclose   = () => obs.complete();
 *   return () => ws.close();
 * });
 * ```
 *
 * That makes Observables a good fit for UI events, timers, socket messages,
 * file watchers, and any workflow where starting, stopping, and cleaning up
 * are part of the job.
 *
 * By default, each `subscribe()` call starts fresh work for that subscriber.
 * If you subscribe twice to a fetch-like Observable, you usually get two
 * separate fetches unless you choose to share the source.
 *
 * ```text
 * source setup -> subscribe() -> next(value) ... -> complete()
 *                         |             |
 *                         |             -> error(error)
 *                         -> unsubscribe()
 * ```
 *
 * Cleanup runs once when the subscription completes, fails, or is cancelled,
 * even if the source finishes right away during setup.
 *
 * Read operator pipelines the same way you read array pipelines:
 * `pipe(source, map(...), filter(...))` is the time-based version of
 * `array.map(...).filter(...)`.
 *
 * @example Turning DOM events into a stream
 * ```ts
 * const clicks = new Observable<MouseEvent>((observer) => {
 *   const handler = (event: MouseEvent) => observer.next(event);
 *   button.addEventListener('click', handler);
 *
 *   return () => button.removeEventListener('click', handler);
 * });
 * 
 * // Auto-cleanup when leaving scope
 * using subscription = clicks.subscribe(event => console.log('Clicked!'));
 * ```
 *
 * @example Building an Array-style pipeline for async values
 * ```ts
 * const evenTens = pipe(
 *   Observable.of(1, 2, 3, 4),
 *   filter((value) => value % 2 === 0),
 *   map((value) => value * 10),
 * );
 *
 * evenTens.subscribe(console.log);
 * // 20
 * // 40
 * ```
 *
 * @example Pulling values at the consumer's pace
 * ```ts
 * const values = Observable.from([1, 2, 3, 4, 5]);
 *
 * for await (const value of values.pull({ strategy: { highWaterMark: 2 } })) {
 *   console.log(value);
 *   await new Promise((resolve) => setTimeout(resolve, 100));
 * }
 * ```
 *
 * @module
 */
import type {
  ObservableProtocol,
  SpecObservable,
  SpecSubscription,
} from "./_spec.ts";
import type { Observer, Subscription } from "./_types.ts";

import { assertObservableError, ObservableError } from "./error.ts";
import { Symbol } from "./symbol.ts";

/**
 * `Teardown` describes how a subscription releases resources.
 *
 * The subscriber can return a plain function, an object with
 * `unsubscribe()`, or a sync/async disposable. They all mean the same thing:
 * when the subscription closes, clean up once.
 *
 * @example Cleaning up a timer
 * ```ts
 * new Observable<number>((observer) => {
 *   const timer = setInterval(() => observer.next(Date.now()), 1000);
 *   return () => clearInterval(timer);
 * });
 * ```
 *
 * @example Cleaning up several resources together
 * ```ts
 * new Observable<string>((observer) => {
 *   const timer = setInterval(() => observer.next('tick'), 1000);
 *   const socket = new WebSocket(url);
 *
 *   return () => {
 *     clearInterval(timer);
 *     socket.close();
 *   };
 * });
 * ```
 */
export type Teardown =
  | (() => void)
  | SpecSubscription
  | AsyncDisposable
  | Disposable
  | null
  | undefined
  | void;

/**
 * Internal subscription state kept outside the public `Subscription` object.
 *
 * Storing this in a `WeakMap` keeps the public handle small while giving close,
 * cleanup, and abort logic one place to read and update state.
 */
export interface StateMap<T> {
  /** Set once cancellation, completion, or error closes the subscription. */
  closed: boolean;

  /** Active observer callbacks. Cleared on close so references can be released. */
  observer: Observer<T> | null;

  /** Cleanup returned by the subscriber body. */
  cleanup: Teardown;

  /** Removes the linked `AbortSignal` listener when one was attached. */
  removeAbortHandler?: (() => void) | null;
}

/**
 * Central registry of subscription state.
 *
 * Using a WeakMap allows us to:
 * 1. Associate state with subscription objects without extending them
 * 2. Let the garbage collector automatically clean up entries when subscriptions are no longer referenced
 * 3. Hide implementation details from users
 */
export const SubscriptionStateMap: WeakMap<Subscription, StateMap<unknown>> =
  new WeakMap();

/**
 * Creates a new Subscription object with properly initialized state.
 *
 * We validate observer methods early, ensuring type errors are caught
 * at subscription time rather than during event emission.
 *
 * The returned Subscription includes support for:
 * - Manual cancellation via `unsubscribe()`
 * - Automatic cleanup via `using` blocks (Symbol.dispose)
 * - Async cleanup contexts (Symbol.asyncDispose)
 *
 * @throws TypeError if observer methods are present but not functions
 * @internal
 */
export function createSubscription<T>(
  observer: Observer<T>,
  opts?: { signal?: AbortSignal } | null,
): Subscription {
  // Observer's methods should be functions if they exist
  if (observer.next !== undefined && typeof observer.next !== "function") {
    throw new TypeError("Observer.next must be a function");
  }
  if (observer.error !== undefined && typeof observer.error !== "function") {
    throw new TypeError("Observer.error must be a function");
  }
  if (
    observer.complete !== undefined && typeof observer.complete !== "function"
  ) {
    throw new TypeError("Observer.complete must be a function");
  }

  // Create a local statemap to speed up access during hot-paths
  const stateMap: StateMap<T> = {
    closed: false,
    observer,
    cleanup: null,
    removeAbortHandler: null,
  };

  /* -------------------------------------------------------------------
   * Create the Subscription facade (spec: CreateSubscription()).
   * ------------------------------------------------------------------- */
  const subscription: Subscription = {
    get [Symbol.toStringTag](): "Subscription" {
      return "Subscription" as const;
    },

    /**
     * Returns whether this subscription is closed.
     *
     * A subscription becomes closed after:
     * - Explicit call to unsubscribe()
     * - Error notification
     * - Complete notification
     *
     * Once closed, no further events will be delivered to the observer,
     * and resources associated with the subscription are released.
     */
    get closed() {
      return stateMap.closed;
    },

    /**
     * Cancels the subscription and releases resources.
     *
     * - Safe to call multiple times (idempotent)
     * - Synchronously performs cleanup
     * - Marks subscription as closed
     * - Prevents further observer notifications
     *
     * This is the primary method for consumers to explicitly
     * terminate a subscription when they no longer need it.
     */
    unsubscribe(): void {
      closeSubscription(this, stateMap);
    },

    // Let subscriptions work with `using` for automatic cleanup.
    [Symbol.dispose]() {
      this.unsubscribe();
    },

    // Match async disposal APIs too.
    [Symbol.asyncDispose]() {
      return Promise.resolve(this.unsubscribe());
    },
  };

  // Adds support for unsubscribing via AbortSignals
  const abortHandler = () => subscription?.unsubscribe();
  const removeAbortHandler = () =>
    opts?.signal?.removeEventListener("abort", abortHandler);
  stateMap.removeAbortHandler = removeAbortHandler;

  // Initialize shared state before any early-close path so subscribe() can
  // still call observer.start(subscription) with a valid, already-closed
  // subscription facade when needed.
  SubscriptionStateMap.set(subscription, stateMap);

  if (opts?.signal?.aborted) {
    closeSubscription(subscription, stateMap);
    return subscription;
  }
  
  opts?.signal?.addEventListener?.("abort", abortHandler, { once: true });
  return subscription;
}

/**
 * Mark subscription as closed and return observer reference.
 * Does NOT perform cleanup - that happens later.
 */
export function markSubscriptionClosed<T>(
  state: StateMap<T> | undefined | null,
  returnObserver: true,
): Observer<T> | null;
/**
 * Marks a subscription as closed when the caller does not need the observer.
 */
export function markSubscriptionClosed<T>(
  state: StateMap<T> | undefined | null,
  returnObserver: false,
): undefined | null;
/**
 * Marks a subscription as closed and optionally returns the detached observer.
 */
export function markSubscriptionClosed<T>(
  state: StateMap<T> | undefined | null,
  returnObserver?: boolean,
): Observer<T> | undefined | null;
export function markSubscriptionClosed<T>(
  state: StateMap<T> | undefined | null,
  returnObserver = false,
): Observer<T> | null | undefined {
  if (!state || state.closed) return null;

  // Capture observer BEFORE marking closed (for spec compliance)
  const observer = state.observer;

  // Mark as closed (this is what SubscriptionClosed checks)
  state.closed = true;
  state.observer = null;

  // Return observer if requested (enables spec-compliant error/complete)
  if (returnObserver) return observer;
}

/**
 * Perform cleanup if available. Safe to call multiple times.
 */
export function performSubscriptionCleanup(
  subscription: Subscription,
  state?: StateMap<unknown> | null,
): void {
  if (!state) return;

  // Cache cleanup, abort signal and the abort handler before clearing
  let cleanup = state.cleanup;
  let removeAbortHandler = state.removeAbortHandler;

  // Clear references first
  state.cleanup = null;
  state.removeAbortHandler = null;

  try {
    removeAbortHandler?.();
    cleanupSubscription(cleanup);
  } finally {
    SubscriptionStateMap.delete(subscription);
    cleanup = null;
    removeAbortHandler = null;
  }
}

/**
 * Marks a subscription as closed and schedules necessary cleanup.
 *
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
 * @internal
 */
export function closeSubscription(
  subscription: Subscription,
  stateMap?: StateMap<unknown> | undefined | null,
): Observer<unknown> | null | void {
  const state = stateMap ?? SubscriptionStateMap.get(subscription);
  const closed = markSubscriptionClosed(state!);
  if (closed === null) return;

  // If we have an observer, perform cleanup
  performSubscriptionCleanup(subscription, state!);
}

/**
 * Handles the actual cleanup process for a subscription.
 *
 * The spec allows three different types of cleanup values:
 * 1. Function: Called directly
 * 2. Object with unsubscribe method: unsubscribe() is called
 * 3. (deviate from spec) Object with Symbol.dispose/asyncDispose: dispose() is called
 *
 * Any errors during cleanup are reported asynchronously to prevent
 * them from disrupting the unsubscribe flow.
 *
 * @param cleanup - Function or object to perform cleanup
 * @internal
 */
function cleanupSubscription(cleanup: Teardown) {
  let temp = cleanup;
  cleanup = null;

  if (!temp) return;
  try {
    if (typeof temp === "function") temp();
    else if (typeof temp === "object") {
      if (typeof (temp as SpecSubscription).unsubscribe === "function") {
        (temp as SpecSubscription).unsubscribe();
      } else if (
        typeof (temp as AsyncDisposable)[Symbol.asyncDispose] === "function"
      ) {
        (temp as AsyncDisposable)[Symbol.asyncDispose]();
      } else if (typeof (temp as Disposable)[Symbol.dispose] === "function") {
        (temp as Disposable)[Symbol.dispose]();
      }
    }
  } catch (err) {
    // Report cleanup errors asynchronously to avoid disrupting the unsubscribe flow
    queueMicrotask(() => {
      throw err;
    });
  }

  temp = null;
}

/**
 * Wraps an observer with key guarantees required by the Observable specification.
 *
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
  /** Cached state map to improve perf. */
  #state?: StateMap<T> | null;

  /** Reference to the subscription that created this observer */
  #subscription?: Subscription | null = null;

  /**
   * Returns whether this observer's subscription is closed.
   *
   * Uses the single source of truth for closed state from SubscriptionStateMap.
   * This property is used by subscriber functions to check if they should
   * continue delivering events.
   *
   * @example
   * ```ts
   * const timer = new Observable(observer => {
   *   const id = setInterval(() => {
   *     if (!observer.closed) {
   *       observer.next(Date.now());
   *     }
   *   }, 1000);
   *   return () => clearInterval(id);
   * });
   * ```
   */
  get closed(): boolean {
    const state = this.#state;
    if (!state) return true;
    return state.closed ?? true;
  }

  /**
   * Creates a new SubscriptionObserver attached to the given subscription.
   *
   * @param subscription - The subscription that created this observer
   */
  constructor(subscription?: Subscription | null) {
    this.#subscription = subscription;

    if (subscription) {
      this.#state = SubscriptionStateMap.get(subscription);
      if (!this.#state) throw new Error("Subscription state not found");
    }
  }

  /**
   * Delivers the next value to the observer if the subscription is open.
   *
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
    const state = this.#state;
    if (!state || state.closed) return;

    // Fast-path optimization to avoid long request chains
    const observer = state.observer;
    if (!observer) return;

    const nextFn = observer.next;
    if (typeof nextFn !== "function") return;

    try {
      nextFn.call(observer, value);
    } catch (err) {
      const errorFn = observer.error;
      if (typeof errorFn === "function") {
        try {
          errorFn.call(observer, err);
        } catch (err) {
          queueMicrotask(() => {
            throw err;
          });
        }
      } // Either a user callback or HostReportErrors emulation (queueMicrotask).
      else {queueMicrotask(() => {
          throw err;
        });}
    }
  }

  /**
   * Delivers an error notification to the observer, then closes the subscription.
   *
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
   * ##
   *
   * @example Important Timing Consideration
   * When this method is called during the subscriber function execution (before it returns),
   * there's a potential race condition with cleanup functions.
   *
   * Consider:
   * ```ts
   * new Observable(observer => {
   *   observer.error(new Error()); // Triggers unsubscribe here
   *   return () => cleanupResources(); // But this hasn't been returned yet!
   * });
   * ```
   *
   * Our implementation handles this by:
   * 1. Marking the subscription as closed immediately
   * 2. Scheduling actual cleanup in a microtask to ensure the teardown function
   *    has time to be captured and stored
   *
   * This ensures resources are properly cleaned up even when error/complete
   * is called synchronously during subscription setup.
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
   * > Note: {@link SubscriptionObserver.next | Review the error propagation policy in `next()` on how errors propagate, the behaviour is not obvious on first glance.}
   */
  error(err: unknown) {
    const state = this.#state;

    // Mark closed and get observer in one call
    const observer = markSubscriptionClosed(state, true);
    if (observer === null) return;

    const errorFn = observer?.error;
    if (typeof errorFn === "function") {
      try {
        errorFn.call(observer, err);
      } catch (innerErr) {
        queueMicrotask(() => {
          throw innerErr;
        });
      }
    } // No error handler, delegate to host
    else {queueMicrotask(() => {
        throw err;
      });}

    // Perform cleanup after marking closed
    performSubscriptionCleanup(this.#subscription!, state);

    // Clear reference
    this.#subscription = null;
  }

  /**
   * Signals successful completion of the observable sequence.
   *
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
   * > Note: {@link SubscriptionObserver.next | Review the error propagation policy in `next()` on how errors propagate, the behaviour is not obvious on first glance.}
   */
  complete() {
    const state = this.#state;
    if (!state || state.closed) return;

    // Mark closed and get observer in one call
    const observer = markSubscriptionClosed(state, true);
    if (observer === null) return;

    const completeFn = observer?.complete;
    if (typeof completeFn === "function") {
      try {
        completeFn.call(observer);
      } catch (err) {
        const errorFn = observer?.error;
        if (typeof errorFn === "function") {
          try {
            errorFn.call(observer, err);
          } catch (innerErr) {
            queueMicrotask(() => {
              throw innerErr;
            });
          }
        } // Either a user callback or HostReportErrors emulation (queueMicrotask).
        else {queueMicrotask(() => {
            throw err;
          });}
      }
    }

    // Perform cleanup after marking closed
    performSubscriptionCleanup(this.#subscription!, state);

    // Clear reference
    this.#subscription = null;
  }

  /**
   * Returns a standard string tag for the object.
   * Used by Object.prototype.toString.
   */
  get [Symbol.toStringTag](): "Subscription Observer" {
    return "Subscription Observer" as const;
  }
}

/**
 * `Observable` is the main type for values that show up over time.
 *
 * A Promise gives you one future value. An Observable can give you many
 * values, plus a clear way to stop listening and clean up.
 *
 * A few rules matter most:
 * 1. Nothing happens until `subscribe()` is called.
 * 2. Each subscription runs its own work unless you share the source.
 * 3. Cleanup runs when the subscription completes, fails, or is cancelled.
 * 4. Infinite streams need `unsubscribe()` or a `using` block.
 *
 * This implementation also lets you consume values with `for await` and clean
 * up with `Symbol.dispose` or `Symbol.asyncDispose`.
 *
 * @typeParam T - Type of values emitted by this Observable
 */
export class Observable<T>
  implements AsyncIterable<T>, SpecObservable<T>, ObservableProtocol<T> {
  /** The subscriber function provided when the Observable was created */
  #subscribeFn: (obs: SubscriptionObserver<T>) => Teardown;

  /**
   * Creates a new Observable with the given subscriber function.
   *
    * Creating an Observable does not start any work. It only stores the
    * function that should run later when someone subscribes.
    *
    * That function gets an observer it can send values to, and it can return
    * cleanup logic for timers, event listeners, sockets, or other resources.
   *
   * @param subscribeFn - Function that implements the Observable's behavior
   *
  * The observer lets the source:
   * - `observer.next(value)` - Emit a value
   * - `observer.error(err)` - Emit error (terminates)
   * - `observer.complete()` - Signal completion (terminates)
   * - `observer.closed` - Check if subscription is still active
   *
   * @throws TypeError if subscribeFn is not a function
   * @throws TypeError if Observable is called without "new"
   *
   * @example Timer with cleanup
   * ```ts
   * // Timer that emits the current timestamp every second
   * const timer = new Observable(observer => {
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
   *
   * @example Async operation with error handling
   * ```ts
   * const fetch = new Observable(observer => {
   *   const controller = new AbortController();
   *
   *   fetch('/api/data', { signal: controller.signal })
   *     .then(res => res.json())
   *     .then(data => {
   *       observer.next(data);
   *       observer.complete();
   *     })
   *     .catch(err => observer.error(err));
   *
   *   return () => controller.abort(); // Cleanup
   * });
   * ```
   */
  constructor(subscribeFn: (obs: SubscriptionObserver<T>) => Teardown) {
    if (typeof subscribeFn !== "function") {
      throw new TypeError("Observable initializer must be a function");
    }

    // Add check for constructor invocation
    if (!(this instanceof Observable)) {
      throw new TypeError("Observable must be called with new");
    }

    this.#subscribeFn = subscribeFn;
  }

  /**
    * Returns this Observable from `[Symbol.observable]()`.
    *
    * Other libraries use this method to treat the instance as an Observable-like
    * source.
   *
   * @returns This Observable instance
   */
  [Symbol.observable](): Observable<T> {
    return this;
  }

  /**
   * Subscribes to this Observable with an observer object.
   *
    * This starts the source, sends values to the observer callbacks, and
    * returns a subscription you can cancel.
   *
   * `observer.start()` is for observing the newly-created subscription or
   * cancelling it before the subscriber body runs. It is not where teardown is
   * registered. Cleanup is still sourced from the subscriber function's return
   * value.
   *
  * The subscription starts right away. It keeps going until the source
  * finishes or you cancel it.
  *
  * If you provide an `error` callback, stream failures go there. If you do
  * not, they are reported to the host environment.
  *
  * Infinite Observables need manual cleanup. If the source never finishes,
  * call `unsubscribe()` yourself or use a `using` block.
   *
   * For long-lived subscriptions, consider:
   * 1. Using a `using` block with this subscription
   * 2. Setting up a timeout or take-until condition
   * 3. Explicitly calling `unsubscribe()` when no longer needed
   *
   * @param observer - Object with next/error/complete callbacks
   * @param opts.signal - Optional AbortSignal to close subscription
   * @returns Subscription object that can be used to cancel the subscription
   *
   * @example Observer object
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
   *
   * @example Two ways to subscribe
   * ```ts
   * // Observer object (recommended)
   * obs.subscribe({
   *   start(sub) { console.log('Started, can call sub.unsubscribe()'); },
   *   next(val) { console.log('Value:', val); },
   *   error(err) { console.error('Error:', err); },
   *   complete() { console.log('Done'); }
   * });
   *
   * // Separate functions
   * obs.subscribe(
   *   val => console.log(val),
   *   err => console.error(err),
   *   () => console.log('done')
   * );
   * ```
   */
  subscribe(
    observer: Observer<T>,
    opts?: { signal?: AbortSignal },
  ): Subscription;

  /**
   * Subscribes to this Observable with callback functions.
   *
   * Convenience overload that wraps the callbacks in an Observer object.
   * See the documentation for the observer-based overload for details
   * on subscription behavior.
   *
  * This overload does the same work as the observer-based form: it starts the
  * source, sends values to your callbacks, and returns a subscription you can
  * cancel.
  *
  * `observer.start()` is only for seeing or cancelling the subscription
  * before the subscriber body runs. It is not where cleanup is registered.
  * Cleanup still comes from the value returned by the subscriber function.
  *
  * The subscription starts right away. It keeps going until the source
  * finishes or you cancel it.
  *
  * If you provide an `error` callback, stream failures go there. If you do
  * not, they are reported to the host environment.
  *
  * Infinite Observables need manual cleanup. If the source never finishes,
  * call `unsubscribe()` yourself or use a `using` block.
   *
   * For long-lived subscriptions, consider:
   * 1. Using a `using` block with this subscription
   * 2. Setting up a timeout or take-until condition
   * 3. Explicitly calling `unsubscribe()` when no longer needed
   *
   * @param next - Function to handle each emitted value
   * @param error - Optional function to handle errors
   * @param complete - Optional function to handle completion
   * @param opts.signal - Optional AbortSignal to close subscription
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
   *
   * @example Two ways to subscribe
   * ```ts
   * // Observer object (recommended)
   * obs.subscribe({
   *   start(sub) { console.log('Started, can call sub.unsubscribe()'); },
   *   next(val) { console.log('Value:', val); },
   *   error(err) { console.error('Error:', err); },
   *   complete() { console.log('Done'); }
   * });
   *
   * // Separate functions
   * obs.subscribe(
   *   val => console.log(val),
   *   err => console.error(err),
   *   () => console.log('done')
   * );
   * ```
   */
  subscribe(
    next: (value: T) => void,
    error?: (e: unknown) => void,
    complete?: () => void,
    opts?: { signal?: AbortSignal },
  ): Subscription;

  /**
   * Implementation of subscribe method (handles both overloads).
   */
  subscribe(
    observerOrNext: Observer<T> | ((value: T) => void),
    errorOrOpts?: ((e: unknown) => void) | { signal?: AbortSignal },
    complete?: () => void,
    _opts?: { signal?: AbortSignal },
  ): Subscription {
    // Check for invalid this context
    if (this === null || this === undefined) {
      throw new TypeError(
        'Cannot read property "subscribe" of null or undefined',
      );
    }

    /* -------------------------------------------------------------------
     * 1.  Normalise the observer – mirrors spec step 4.
     * ------------------------------------------------------------------- */
    const observer: Observer<T> | null = (
      typeof observerOrNext === "function"
        ? {
          next: observerOrNext,
          error: errorOrOpts as (e: unknown) => void,
          complete,
        }
        : observerOrNext
    ) ?? {}; // ← spec-compliant fallback for null / primitives

    // Additional options to pass along AbortSignal (part of the WCIG Observables Spec., thought to implement it for convinence reasons)
    const opts =
      (typeof observerOrNext === "function"
        ? _opts
        : errorOrOpts as typeof _opts) ?? {};

    /* -------------------------------------------------------------------
     * 2.  Create the Subscription facade (spec: CreateSubscription()).
     * ------------------------------------------------------------------- */
    const subscription: Subscription = createSubscription(observer, opts);

    /* -------------------------------------------------------------------
     * 3.  Call observer.start(subscription) – (spec step 10).
     * ------------------------------------------------------------------- */
    try {
      observer.start?.(subscription);
      if (subscription?.closed) return subscription; // spec step 10.d
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
     * 4.  Wrap user observer so we enforce closed-state.
     * ------------------------------------------------------------------- */
    const subObserver = new SubscriptionObserver<T>(subscription);

    /* -------------------------------------------------------------------
     * 5.  Execute the user subscriber and capture its cleanup (spec step 12-16).
     * ------------------------------------------------------------------- */
    try {
      let cleanup = this.#subscribeFn?.call(undefined, subObserver) ?? null;

      // Validate the cleanup value if provided
      if (cleanup !== undefined && cleanup !== null) {
        if (
          !(
            typeof cleanup === "function" ||
            typeof (cleanup as SpecSubscription)?.unsubscribe === "function" ||
            typeof (cleanup as Disposable)?.[Symbol.dispose] === "function" ||
            typeof (cleanup as AsyncDisposable)?.[Symbol.asyncDispose] ===
              "function"
          )
        ) {
          throw new TypeError(
            "Expected subscriber to return a function, an unsubscribe object, a disposable with a [Symbol.dispose] method, an async-disposable with a [Symbol.asyncDispose] method, or undefined/null",
          );
        }
      }

      // Store the cleanup function in the subscription state
      const state = SubscriptionStateMap.get(subscription);
      if (state && cleanup) state.cleanup = cleanup;

      /**
       * Handle the case where complete/error was called synchronously during the subscribe function.
       * This is a critical edge case that requires special handling - when the observer
       * calls `error()` or `complete()` before the subscribe function returns, we need to ensure
       * that any teardown function returned by the subscriber is still executed properly.
       *
       * The returned teardown wouldn't have been available when `unsubscribe()` was initially
       * triggered by error/complete, so we need to handle it manually here.
       *
       * @example
       * ```ts
       * const errorObservable = new Observable(observer => {
       *   observer.error(new Error("test error")); // Will auto-unsubscribe (but teardown hasn't been defined yet)
       *   log.push("after error"); // This should still run
       *
       *   // Teardown now defined but now the subscription has been closedn
       *   // but resources being used haven't actually been disposed yet
       *   return () => {
       *     log.push("error teardown");
       *   };
       * });
       * ```
       *
       * `observer.error` fires before the teardown function is defined, so we would need to manually cleanup ourselves
       * by manually running the teardown function
       */
      if (subscription.closed && cleanup) {
        cleanupSubscription(cleanup);
      }

      cleanup = null;
    } catch (err) {
      // 6) If their subscribeFn throws, send that as an error notification
      subObserver.error(err);
    }

    // 7) Finally, hand back the Subscription so callers can cancel whenever they like
    return subscription;
  }

  /**
   * Visits every value in this Observable and resolves when it completes.
   *
   * This is the terminal-consumer counterpart to `tap()`. `tap()` stays inside
   * a pipeline and returns another Observable. `forEach()` consumes the stream,
   * runs your callback for each value, and returns a Promise that settles when
   * the stream ends.
   *
   * Use this when you want Promise-style completion semantics without the
   * async-iterator overhead of `pull()` or `for await ... of`.
   *
   * If the callback throws, the returned Promise rejects and the subscription
   * is cancelled immediately.
  *
  * Like the standalone helper, this method still tears down correctly when a
  * foreign Observable-like source emits synchronously before `subscribe()`
  * returns its subscription object.
   *
   * @param callback - Function invoked for each emitted value
   * @param opts.signal - Optional AbortSignal to cancel traversal
   * @returns Promise that resolves with `undefined` on completion
   *
  * @example Visiting values through the instance method
   * ```ts
   * await Observable.of(1, 2, 3).forEach((value, index) => {
   *   console.log(index, value);
   * });
   * ```
   */
  forEach(
    callback: (value: T, index: number) => void,
    opts?: { signal?: AbortSignal },
  ): Promise<void> {
    return forEach(this, callback, opts);
  }

  /**
   * Enables `for await ... of observable` syntax for direct async iteration.
   *
   * This method allows Observables to be used in any context that accepts an AsyncIterable,
   * implementing the "pull" mode of consuming an Observable.
   *
   * Uses default buffer size of 64 items.
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
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    yield* pull(this);
  }

  /**
   * Converts this Observable into an AsyncGenerator with backpressure control.
   *
   * **Why use this**: Control buffer size to prevent memory issues when producer is faster than consumer.
   * Uses ReadableStream internally for efficient buffering.
   *
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
   * **Buffer sizing**:
   * - Small (1-10): Memory-constrained environments, large data items
   * - Medium (10-100): Most applications, good balance
   * - Large (100+): High-throughput scenarios, small items
   *
   * **Error handling**: Errors are sent through value channel (not stream errors) to ensure
   * all buffered values are processed before error is thrown.
   *
   * @param options - Configuration options for the pull operation
   * @param options.strategy.highWaterMark - Max items to buffer before applying backpressure (default: 64)
   * @returns Async generator that yields values and slows the producer when the
   *          buffer is full.
   *
   * @example Memory-efficient processing
   * ```ts
   * // Buffer up to 5 items before applying backpressure
   * for await (const value of observable.pull({
   *   strategy: { highWaterMark: 5 }
   * })) {
   *   console.log(value);
   *   // Slow consumer - producer will pause when buffer fills
   *   await new Promise(r => setTimeout(r, 1000));
   * }
   *
   * // Large items, tiny buffer
   * for await (const item of largeDataStream.pull({ strategy: { highWaterMark: 1 } })) {
   *   await processLargeItem(item); // Producer pauses when buffer full
   * }
   *
   * // High throughput, large buffer
   * for await (const event of fastStream.pull({ strategy: { highWaterMark: 1000 } })) {
   *   await processFast(event);
   * }
   * ```
   */
  pull(
    opts?: Parameters<typeof pull>[1] & { ignoreError?: true },
  ): AsyncGenerator<T>;
  /**
   * Returns pulled values while preserving `ObservableError` objects in the
   * yielded value channel.
   */
  pull(
    opts?: Parameters<typeof pull>[1] & { ignoreError?: false },
  ): AsyncGenerator<T | ObservableError>;
  pull(
    opts?: Parameters<typeof pull>[1] & { ignoreError?: boolean },
  ): AsyncGenerator<T | ObservableError> {
    return pull(this, opts);
  }

  /**
   * Turns a Promise, iterable, async iterable, or Observable-like value into
   * an Observable.
   *
   * **Handles**:
   * - Arrays, Sets, Maps → sync emission
   * - Async generators → values over time
   * - Symbol.observable objects → delegates to their implementation
   *
  * What happens depends on the input type:
   * 1. Objects with Symbol.observable - Delegates to their implementation
   * 2. Synchronous iterables - Emits all values then completes
   * 3. Asynchronous iterables - Emits values as they arrive then completes
   * 4. Promise - Emits a single value (the resovled value) then completes
   *
  * Unlike `Promise.resolve`, `Observable.from` does not always return the
  * input unchanged when it already looks Observable-like. That keeps behavior
  * consistent across different Observable libraries.
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
   * const foreign = {
   *   [Symbol.observable]() {
   *     return new Observable(obs => {
   *       obs.next("hello");
   *       obs.complete();
   *     });
   *   }
   * };
   * Observable.from(foreign).subscribe({
   *   next: val => console.log(val) // "hello"
   * });
   * ```
   */
  static readonly from: typeof from = from;

  /**
   * Creates an Observable that synchronously emits the given values then completes.
   *
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
  static readonly of: typeof of = of;

  /**
   * Converts a Observable into an AsyncGenerator with backpressure control.
   *
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
  static readonly pull: typeof pull = pull;

  /**
   * Standard string tag for the object.
   * Used by Object.prototype.toString.
   */
  get [Symbol.toStringTag](): "Observable" {
    return "Observable";
  }
}

/**
 * Cached empty observable handler
 * @internal
 */
function EMPTY(obs: SubscriptionObserver<unknown>) {
  obs.complete();
}

/**
 * Creates an Observable that synchronously emits the given values then completes.
 *
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
  const Constructor = typeof this === "function"
    ? this as typeof Observable<T>
    : Observable;
  const len = items.length;

  // Pre-defined handlers for common cases to avoid creating new closures
  switch (len) {
    case 0:
      return new Constructor(EMPTY);
    case 1:
      return new Constructor((obs) => {
        obs.next(items[0]);
        obs.complete();
      });
    case 2:
      return new Constructor((obs) => {
        obs.next(items[0]);
        obs.next(items[1]);
        obs.complete();
      });
    case 3:
      return new Constructor((obs) => {
        obs.next(items[0]);
        obs.next(items[1]);
        obs.next(items[2]);
        obs.complete();
      });
    default:
      // For arrays > 3 items, balance between code size and performance
      return new Constructor((obs) => {
        // Based on benchmarking:
        // - Arrays < 100: simple loop is fine (method call dominates)
        // - Arrays >= 100: unrolling provides measurable benefit
        if (len < 100) {
          for (let i = 0; i < len; i++) {
            obs.next(items[i]);
          }
        } else {
          // Unroll by 8 for large arrays (2.8x speedup)
          let i = 0;
          const limit = len - (len % 8);

          for (; i < limit; i += 8) {
            obs.next(items[i]);
            obs.next(items[i + 1]);
            obs.next(items[i + 2]);
            obs.next(items[i + 3]);
            obs.next(items[i + 4]);
            obs.next(items[i + 5]);
            obs.next(items[i + 6]);
            obs.next(items[i + 7]);
          }

          // Handle remainder
          for (; i < len; i++) {
            obs.next(items[i]);
          }
        }

        obs.complete();
      });
  }
}

/**
 * Converts an Observable-like, sync iterable, or async iterable into an Observable.
 *
 * This is the standalone implementation of Observable.from, supporting:
 * - Objects with Symbol.observable (Observable-like)
 * - Regular iterables (arrays, Maps, Sets, generators)
 * - Async iterables (async generators, ReadableStreams)
 *
 * Conversion follows these rules:
 * 1. For Symbol.observable objects: delegates to their implementation
 * 2. For Promises: resolves and emits the promise's value
 * 3. For iterables: synchronously emits all values, then completes
 * 4. For async iterables: emits values as they arrive, then completes
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
 * const foreign = {
 *   [Symbol.observable]() {
 *     return { subscribe: observer => {
 *       observer.next('hello');
 *       observer.complete();
 *       return { unsubscribe() {} };
 *     }};
 *   }
 * };
 * from(foreign).subscribe(x => console.log(x));
 * // Output: 'hello'
 * ```
 */
export function from<T>(
  this: unknown,
  input:
    | SpecObservable<T>
    | Iterable<T>
    | AsyncIterable<T>
    | PromiseLike<T>
    | ArrayLike<T>,
  { throwError = true } = {},
): Observable<T> {
  if (input === null || input === undefined) {
    throw new TypeError("Cannot convert undefined or null to Observable");
  }

  const Constructor = typeof this === "function"
    ? this as typeof Observable<T>
    : Observable;

  // Faster implementation of iteration for array-like values
  const arr = input as ArrayLike<T>;
  if (Array.isArray(input) || typeof arr.length === "number") {
    const len = arr.length;

    // Optimize for small arrays
    if (len === 0) return new Constructor(EMPTY);
    if (len === 1) {
      return new Constructor((obs) => {
        if (throwError) assertObservableError(arr[0], obs);
        obs.next(arr[0]);
        obs.complete();
      });
    }

    // Type check to ensure it's actually array-like
    return new Constructor((obs) => {
      try {
        // Typed arrays: no bounds checking needed, direct iteration
        // Small arrays: simple loop with early exit checks
        if (len < 100 || ArrayBuffer.isView(arr)) {
          for (let i = 0; i < len; i++) {
            if (throwError) assertObservableError(arr[i]);

            obs.next(arr[i]);
            if (obs.closed) return;
          }
        } else {
          // Large arrays: unroll with less frequent closed checks
          let i = 0;
          const limit = len - (len % 8);

          // Check closed once per 8 items (balanced approach)
          for (; i < limit; i += 8) {
            if (throwError) {
              assertObservableError(arr[i]);
              assertObservableError(arr[i + 1]);
              assertObservableError(arr[i + 2]);
              assertObservableError(arr[i + 3]);
              assertObservableError(arr[i + 4]);
              assertObservableError(arr[i + 5]);
              assertObservableError(arr[i + 6]);
              assertObservableError(arr[i + 7]);
            }

            obs.next(arr[i]);
            obs.next(arr[i + 1]);
            obs.next(arr[i + 2]);
            obs.next(arr[i + 3]);
            obs.next(arr[i + 4]);
            obs.next(arr[i + 5]);
            obs.next(arr[i + 6]);
            obs.next(arr[i + 7]);
            if (obs.closed) return;
          }

          // Handle remainder with checks
          for (; i < len; i++) {
            if (throwError) assertObservableError(arr[i]);
            obs.next(arr[i]);
            if (obs.closed) return;
          }
        }
      } catch (err) {
        obs.error(err);
      }

      obs.complete();
    });
  }

  // Case 1 – object with @@observable
  const observableFn = (input as SpecObservable<T>)[Symbol.observable];
  if (typeof observableFn === "function") {
    const observable = observableFn.call(input);

    // Validate the result has a subscribe method
    if (!observable || typeof observable.subscribe !== "function") {
      throw new TypeError(
        "Object returned from [Symbol.observable]() does not implement subscribe method",
      );
    }

    // Return directly if it's already an instance of the target constructor
    if (observable instanceof Constructor) return observable as Observable<T>;

    // Otherwise, wrap it to ensure consistent behavior
    return new Constructor((observer) => {
      const sub = observable.subscribe(observer);
      return () => sub?.unsubscribe?.();
    });
  }

  // Fast implementation for Set & Maps which are generally optimized
  // by the runtime when using `for..of` loops
  if (input instanceof Set || input instanceof Map) {
    const collection = input as Set<T> | Map<unknown, unknown>;
    const size = collection.size;
    if (size === 0) return new Constructor(EMPTY);

    return new Constructor((obs) => {
      // For...of is optimized for Sets in V8
      for (const item of collection) {
        if (throwError) assertObservableError(item, obs);

        obs.next(item as T);
        if (obs.closed) return;
      }

      obs.complete();
    });
  }

  // Case 2 – promise
  const promise = input as PromiseLike<T>;
  if (typeof promise.then === "function") {
    return new Constructor((obs) => {
      promise.then(
        (value) => {
          if (throwError) assertObservableError(value, obs);
          obs.next(value);
          obs.complete();
        },
        // Error during iteration
        (err) => obs.error(err),
      );
    });
  }

  // Case 3 – synchronous iterable
  const iteratorFn = (input as Iterable<T>)[Symbol.iterator];
  if (typeof iteratorFn === "function") {
    return new Constructor((obs) => {
      const iterator = iteratorFn.call(input);

      try {
        for (let step = iterator.next(); !step.done; step = iterator.next()) {
          if (throwError) assertObservableError(step.value);
          obs.next(step.value);

          // If subscription was closed during iteration, clean up and exit
          if (obs.closed) break;
        }

        obs.complete();
      } catch (err) {
        obs.error(err);
      }

      return () => {
        if (typeof iterator?.return === "function") {
          try {
            iterator.return(); // IteratorClose
          } catch (err) {
            queueMicrotask(() => {
              throw err;
            });
          }
        }
      };
    });
  }

  // Case 4 – async iterable
  const asyncIteratorFn = (input as AsyncIterable<T>)[Symbol.asyncIterator];
  if (typeof asyncIteratorFn === "function") {
    return new Constructor((obs) => {
      const asyncIterator = asyncIteratorFn.call(input);

      // Start consuming the async iterable
      (async () => {
        try {
          for (
            let step = await asyncIterator.next();
            !step.done;
            step = await asyncIterator.next()
          ) {
            if (throwError) assertObservableError(step.value);
            obs.next(step.value);

            // If subscription was closed during iteration, clean up and exit
            if (obs.closed) break;
          }

          // Normal completion
          obs.complete();
        } catch (err) {
          // Error during iteration
          obs.error(err);
        }
      })();

      return () => {
        if (typeof asyncIterator?.return === "function") {
          try {
            asyncIterator.return(); // IteratorClose
          } catch (err) {
            queueMicrotask(() => {
              throw err;
            });
          }
        }
      };
    });
  }

  throw new TypeError(
    "Input is not Observable, Iterable, AsyncIterable, Promise, or ReadableStream",
  );
}

/**
 * Converts an Observable into an AsyncGenerator with backpressure control.
 *
 * This function bridges the gap between push-based Observables and
 * pull-based async iteration, allowing consumers to:
 * 1. Process values at their own pace
 * 2. Use standard async iteration patterns (for-await-of)
 * 3. Control buffering behavior to prevent memory issues
 *
 * ## How It Works
 * Observable → ReadableStream (for buffering) → AsyncGenerator
 *
 * **Key features**:
 * - Automatic backpressure when consumer slower than producer
 * - Configurable buffer size via highWaterMark
 * - Proper cleanup on early termination
 * - Errors sent through value channel to preserve buffered items
 *
 * Implementation details:
 * - Uses ReadableStream as the backpressure mechanism
 * - Connects the Observable to the stream as a source
 * - Returns an AsyncGenerator that yields values from the stream
 * - Handles proper cleanup on early termination
 *
 * Instead of using ReadableStream's error mechanism, this implementation uses a special
 * approach to error handling: errors are wrapped in `ObservableError` objects and
 * sent through the normal value channel. This ensures all values emitted before an error
 * are properly processed in order before the error is thrown.
 *
 * ## Key Benefits
 *
 * 1. **Controlled Processing**: Process values at your own pace rather than being overwhelmed
 * 2. **Proper Backpressure**: When your consumer is slow, the producer automatically slows down
 * 3. **Complete Error Handling**: Errors don't cause queued values to be lost
 * 4. **Resource Safety**: Automatically cleans up subscriptions, even with early termination
 * 5. **Memory Efficiency**: Controls buffer size to prevent memory issues with fast producers
 * 6. **Iterator Integration**: Natural integration with other async iteration tools
 *
 * @param observable - Source Observable to pull values from
 * @param options - Configuration options for the ReadableStream
 * @param options.strategy - Queuing strategy that controls how backpressure is applied
 * @param options.strategy.highWaterMark - Buffer size before backpressure (default: 64)
 *
 * @returns An AsyncGenerator that yields values from the Observable at the consumer's pace
 *
 * @example Basic usage with for-await-of loop:
 * ```ts
 * const numbers = Observable.of(1, 2, 3, 4, 5);
 *
 * // Process each value at your own pace
 * for await (const num of pull(numbers)) {
 *   console.log(`Processing ${num}`);
 *   await someTimeConsumingOperation(num);
 * }
 * // Output:
 * // Processing 1
 * // Processing 2
 * // Processing 3
 * // Processing 4
 * // Processing 5
 *
 * const fast = new Observable(obs => {
 *   let count = 0;
 *   const id = setInterval(() => obs.next(count++), 10); // 100/sec
 *   return () => clearInterval(id);
 * });
 *
 * // Slow consumer with small buffer
 * for await (const n of pull(fast, { strategy: { highWaterMark: 5 } })) {
 *   console.log(n);
 *   await new Promise(r => setTimeout(r, 1000)); // 1/sec - producer slows down
 * }
 * ```
 *
 * @example Handling errors while ensuring all prior values are processed:
 * ```ts
 * // Observable that emits values then errors
 * const source = new Observable(observer => {
 *   observer.next(1);
 *   observer.next(2);
 *   observer.error(new Error("Something went wrong"));
 *   // Even though an error occurred, both 1 and 2 will be processed
 * });
 *
 * try {
 *   for await (const value of pull(source)) {
 *     console.log(`Got value: ${value}`);
 *   }
 * } catch (err) {
 *   console.error(`Error caught: ${err.message}`);
 * }
 *
 * // Output:
 * // Got value: 1
 * // Got value: 2
 * // Error caught: Something went wrong
 * ```
 *
 * @example Controlling buffer size for memory efficiency:
 * ```ts
 * // Create a producer that emits values rapidly
 * const fastProducer = new Observable(observer => {
 *   let count = 0;
 *   const interval = setInterval(() => {
 *     observer.next(count++);
 *     if (count > 1000) {
 *       clearInterval(interval);
 *       observer.complete();
 *     }
 *   }, 1);
 *   return () => clearInterval(interval);
 * });
 *
 * // Limit buffer to just 5 items to prevent memory issues
 * for await (const num of pull(fastProducer, {
 *   strategy: { highWaterMark: 5 }
 * })) {
 *   console.log(`Processing ${num}`);
 *   // Slow consumer - producer will pause when buffer fills
 *   await new Promise(r => setTimeout(r, 100));
 * }
 * ```
 */
export function pull<T>(
  this: unknown,
  observable: SpecObservable<T>,
  opts?: { strategy?: QueuingStrategy<T | ObservableError>; throwError?: true },
): AsyncGenerator<T>;
/**
 * Converts an Observable into an AsyncGenerator that yields both values and
 * wrapped `ObservableError` objects when `throwError` is disabled.
 */
export function pull<T>(
  this: unknown,
  observable: SpecObservable<T>,
  opts?: {
    strategy?: QueuingStrategy<T | ObservableError>;
    throwError?: false;
  },
): AsyncGenerator<T | ObservableError>;
export async function* pull<T>(
  this: unknown,
  observable: SpecObservable<T>,
  { strategy = { highWaterMark: 64 }, throwError = true }: {
    strategy?: QueuingStrategy<T | ObservableError>;
    throwError?: boolean;
  } = {},
): AsyncGenerator<T | ObservableError> {
  const obs = observable?.[Symbol.observable]?.();
  let sub: SpecSubscription | null = null;

  // Create a ReadableStream that will buffer values from the Observable
  const stream = new ReadableStream<T | ObservableError>({
    start: (ctrl) => {
      // Subscribe to the Observable and connect it to the stream
      sub = obs?.subscribe({
        // Normal values flow directly into the stream
        next: (v) => ctrl.enqueue(v),

        // Errors are wrapped as special values rather than using stream.error()
        // This ensures values emitted before the error are still processed
        error: (e) => {
          ctrl.enqueue(ObservableError.from(e, "observable:pull"));
          sub = null;
        },

        // Close the stream when the Observable completes
        complete: () => {
          ctrl.close();
          sub = null;
        },
      });
    },

    // Clean up the subscription if the stream is cancelled
    // This happens when the AsyncGenerator is terminated early
    cancel: () => {
      sub?.unsubscribe();
      sub = null;
    },
  }, strategy);

  // Get a reader for the stream and yield values as they become available
  const reader = stream.getReader();

  try {
    while (true) {
      // Wait for the next value (with backpressure automatically applied)
      const { value, done } = await reader.read();

      // If we received a wrapped error, unwrap and throw it
      if (throwError) assertObservableError(value);

      // If the stream is done (Observable completed), exit the loop
      if (done) break;

      // Otherwise, yield the value to the consumer
      yield value as T;
    }
  } finally {
    // Ensure resources are cleaned up even if iteration is terminated early
    // This guarantees no memory leaks, even with break or thrown exceptions
    reader.releaseLock();
    await stream.cancel();
  }
}

/**
 * Shared mutable state for one `forEach()` traversal.
 *
 * Some Observable-like sources synchronously call observer methods before
 * `subscribe()` returns the subscription handle. This object keeps callback
 * progress, cancellation state, and the eventual subscription in one place so
 * every exit path can coordinate correctly.
 */
interface ForEachState<T> {
  /** Function invoked for each emitted value. */
  callback: (value: T, index: number) => void;
  /** Internal signal used to stop the source after callback failure. */
  controller: AbortController;
  /** Deferred promise returned from `forEach()`. */
  deferred: PromiseWithResolvers<void>;
  /** Optional caller-owned cancellation signal. */
  externalSignal?: AbortSignal;
  /** Zero-based callback index. */
  index: number;
  /** Stored so the abort listener can be removed exactly once. */
  onExternalAbort: (() => void) | null;
  /** Prevents multiple resolve or reject attempts. */
  settled: boolean;
  /** Subscription returned by the source, if it has been produced yet. */
  subscription: SpecSubscription | null;
}

/**
 * Settles the traversal promise and removes the external abort listener.
 *
 * `forEach()` can finish in several ways: normal completion, source error,
 * callback failure, or external cancellation. This helper makes sure only one
 * of those paths wins, and that the Promise plus abort-listener cleanup happen
 * once.
 */
function settleForEach<T>(
  state: ForEachState<T>,
  result: { ok: true } | { ok: false; reason: unknown },
): void {
  if (state.settled) return;

  state.settled = true;

  if (state.onExternalAbort) {
    state.externalSignal?.removeEventListener?.('abort', state.onExternalAbort);
    state.onExternalAbort = null;
  }

  if (result.ok) {
    state.deferred.resolve();
    return;
  }

  state.deferred.reject(result.reason);
}

/**
 * Visits every value in an Observable and resolves when the stream completes.
 *
 * This is the tree-shakeable terminal-consumer helper for workflows that want
 * Promise completion semantics without going through async iteration. It is the
 * consumer-side counterpart to `tap()`: `tap()` keeps the stream alive inside a
 * pipeline, while `forEach()` consumes the stream and returns a Promise.
 *
 * The callback receives the emitted value and a zero-based index. If the
 * callback throws, the Promise rejects and the subscription is cancelled.
 *
 * Some Observable-like sources synchronously emit before their `subscribe()`
 * call returns. `forEach()` still tears those sources down correctly by routing
 * callback failures and `AbortSignal` cancellation through one shared teardown
 * path.
 *
 * This helper follows the WICG Observable draft's promise-returning operator
 * shape more closely than `zen-observable`'s callback-plus-cancel signature.
 *
 * @param observable - Observable or Observable-like source to consume
 * @param callback - Function invoked for each emitted value
 * @param opts.signal - Optional AbortSignal to cancel traversal
 * @returns Promise that resolves with `undefined` on completion
 *
 * @example Visiting each emitted value with an index
 * ```ts
 * await forEach(Observable.of("a", "b"), (value, index) => {
 *   console.log(index, value);
 * });
 * ```
 *
 * @example Cancelling traversal with an AbortSignal
 * ```ts
 * const controller = new AbortController();
 *
 * const done = forEach(source, (value) => {
 *   if (value === 10) controller.abort(new Error("stopped early"));
 * }, { signal: controller.signal });
 * ```
 */
export function forEach<T>(
  this: unknown,
  observable: SpecObservable<T>,
  callback: (value: T, index: number) => void,
  opts: { signal?: AbortSignal } = {},
): Promise<void> {
  if (typeof callback !== "function") {
    return Promise.reject(new TypeError("forEach callback must be a function"));
  }

  const obs = observable?.[Symbol.observable]?.();
  if (!obs || typeof obs.subscribe !== "function") {
    return Promise.reject(new TypeError("Expected an Observable-like value"));
  }

  if (opts.signal?.aborted) {
    return Promise.reject(opts.signal.reason);
  }

  const deferred = Promise.withResolvers<void>();

  // `subscribe()` can synchronously emit before it returns. This shared state
  // lets callback code, abort handling, and final settlement all coordinate
  // even when the subscription handle arrives last.
  const state: ForEachState<T> = {
    callback,
    controller: new AbortController(),
    deferred,
    externalSignal: opts.signal,
    index: 0,
    onExternalAbort: null,
    settled: false,
    subscription: null,
  };

  // External cancellation should behave the same as callback failure: stop the
  // source, release the subscription once, and reject with the abort reason.
  const onExternalAbort = () => {
    const reason = opts.signal?.reason;

    if (!state.controller.signal.aborted) {
      state.controller.abort(reason);
    }

    state.subscription?.unsubscribe();
    state.subscription = null;
    settleForEach(state, { ok: false, reason });
  };
  state.onExternalAbort = onExternalAbort;
  opts.signal?.addEventListener?.('abort', onExternalAbort, { once: true });

  try {
    state.subscription = (
      obs as {
        subscribe(
          observer: Observer<T>,
          opts?: { signal?: AbortSignal },
        ): SpecSubscription;
      }
    ).subscribe({
      next(value) {
        try {
          state.callback(value, state.index++);
        } catch (error) {
          if (!state.controller.signal.aborted) {
            state.controller.abort(error);
          }

          state.subscription?.unsubscribe();
          state.subscription = null;
          settleForEach(state, { ok: false, reason: error });
        }
      },
      error(error) {
        // The source has already finished with an error, so later teardown
        // paths should not try to unsubscribe a stale handle.
        state.subscription = null;
        settleForEach(state, { ok: false, reason: error });
      },
      complete() {
        // Completion uses the same one-shot settlement path as errors so the
        // Promise and abort listener cannot diverge.
        state.subscription = null;
        settleForEach(state, { ok: true });
      },
    }, { signal: state.controller.signal });
  } catch (error) {
    state.subscription = null;
    settleForEach(state, { ok: false, reason: error });
    return deferred.promise;
  }

  // Some Observable-like sources synchronously call `next()` and only return
  // the subscription object afterward. If traversal already aborted during that
  // synchronous work, unsubscribe once here now that the handle exists.
  if (state.controller.signal.aborted) {
    state.subscription?.unsubscribe();
    state.subscription = null;

    if (!state.settled) {
      settleForEach(state, {
        ok: false,
        reason: state.controller.signal.reason,
      });
    }
  }

  return deferred.promise;
}

/**
 * Returns `true` when a value is an instance of this library's `Observable`
 * class.
 *
 * Use it when you need methods that belong to this implementation specifically,
 * such as `pull()`.
 *
 * @example Narrowing to this implementation
 * ```ts
 * if (isObservable(source)) {
 *   return source.pull();
 * }
 * ```
 */
export function isObservable<T = unknown>(
  value: unknown,
): value is Observable<T> {
  // This is a straightforward instanceof check
  // Works reliably across module boundaries and handles inheritance correctly
  return value instanceof Observable;
}

/**
 * Returns `true` when a value implements the Observable protocol via
 * `[Symbol.observable]()`.
 *
 * Use it when compatibility matters more than the concrete class. This is the
 * right check for adapters and utilities that should work with RxJS, this
 * package, or any other spec-shaped Observable.
 *
 * @example Accepting any Observable-like source
 * ```ts
 * if (isSpecObservable(source)) {
 *   return Observable.from(source);
 * }
 * ```
 */
export function isSpecObservable<T = unknown>(
  value: unknown,
): value is SpecObservable<T> {
  // Early return for non-objects
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }

  try {
    // Check if the object has the Symbol.observable method
    const observableMethod =
      (value as Record<symbol, unknown>)[Symbol.observable];
    if (typeof observableMethod !== "function") {
      return false;
    }

    // Call the method to get the subscribable object
    const subscribable = (observableMethod as () => unknown).call(value);

    // Verify the result has a subscribe method
    return (
      subscribable !== null &&
      subscribable !== undefined &&
      typeof subscribable === "object" &&
      typeof (subscribable as Record<string, unknown>).subscribe === "function"
    );
  } catch {
    // If any step throws, it's not a valid Observable
    return false;
  }
}
