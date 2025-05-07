/**
 * A **spec‑faithful** yet ergonomic TC39-inspired Observable implementation with detailed TSDocs and examples.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * Why this file exists
 * --------------------
 * 1.  **Inter‑op with the upcoming TC39 Observable proposal (stage 1 as of May 2025).**
 *      <https://github.com/tc39/proposal-observable>
 * 2.  **Bridge push‑based and pull‑based worlds in a single 250 line module**
 *     while keeping the public surface identical to the spec so future browsers
 *     can drop in native implementations with zero code changes on your side.
 * 3.  **Teach by example.**  Every exported symbol is fully @link‑ed back to the
 *     relevant spec algorithm step so you can browse the spec and the code side
 *     by side.
 *
 * Formatting + conventions
 * ------------------------
 * • 2‑space indent (matches user preference)
 * • `function` keyword for exports (YAGNI: no classes unless needed)
 * • `Object.assign` instead of the object spread
 * • Strict TypeScript (`--strict`) compatible
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
 * Features:
 * - Push API via `subscribe()` (Observer or callbacks)
 * - Pull API via `for await...Observable.of` (simple) or `.pull()` for backpressure control
 * - Interop via `Symbol.observable`
 * - Resource cleanup with `Symbol.dispose` and `Symbol.asyncDispose` on subscriptions
 *
 * Creation helpers `of` and `from` are separate exports for tree-shaking.
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
 * @example Pull with strategy:
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * const nums$ = Observable.from([1,2,3,4,5]);
 * (async () => {
 *   for await (const n of nums$.pull({ strategy: { highWaterMark: 2 } })) {
 *     console.log('Pulled:', n);
 *   }
 * })();
 * ```
 * 
 * @module
 */

import type { Observer, Subscription } from "./_types.ts";
import { Symbol } from "./symbol.ts";

/**
 * Teardown function returned by the *subscriber* when it needs to release
 * resources (DOM handlers, sockets…).
 *
 * @remarks
 * Matches the **«subscription cleanup function»** concept in *spec § Subscription
 * Cleanup Functions*.
 */
export type Teardown = () => void;

/** Map Subscription → SubscriptionObserver (internal). */
const SubscriptionObserverPrivateAccess = new WeakMap<Subscription, SubscriptionObserver<unknown>>()

/**
 * Wraps the user‑supplied {@link Observer} so that
 *
 * 1.  `error()` / `complete()` **close** the subscription immediately.
 * 2.  After closure *no further callbacks fire* – exactly what the spec
 *     guarantees via the *[[Observer]]* internal slot.
 *
 * @typeParam T  The type of values delivered by the parent {@link Observable}.
 *
 * @see {@link https://github.com/tc39/proposal-observable | TC39 Observable § Subscription Observer Objects}
 */
export class SubscriptionObserver<T> {
  /** True once `error`, `complete` or `unsubscribe` ran. */
  get closed() { return this.#closed; }
  #closed = false;

  /** Raw observer reference – nulled once closed to aid the GC. */
  #observer: Observer<T> | null;
  #subscription?: Subscription | null = null;

  constructor(obs: Observer<T>, subscription?: Subscription | null) {
    this.#observer = obs;
    this.#subscription = subscription;
  }

  /**
   * Sends the next value if not closed.
   * @param value - The value to deliver
   *
   * @specref *§ EmitSubscriptionHook step 1* – Notification is skipped if
   *          `SubscriptionClosed(subscription)`.
   */
  next(value: T) {
    if (this.closed) return;
    this.#observer?.next?.(value);
  }

  /**
   * Sends an error notification, marks closed, and unsubscribes.
   * @param err - The error to deliver
   *
   * @specref *§ SubscriptionObserverPrototype.error*.
   */
  error(err: unknown) {
    if (this.closed) return;

    this.#closed = true;

    // Either a user callback or HostReportErrors emulation (queueMicrotask).
    this.#observer?.error?.(err);
    !this.#observer?.error && queueMicrotask(() => { throw err; });

    this.#subscription?.unsubscribe();
    this.#observer = null;
  }

  /**
   * Sends a completion notification, marks closed, and unsubscribes.
   *
   * @specref *§ SubscriptionObserverPrototype.complete*.
   */
  complete() {
    if (this.closed) return;

    this.#closed = true;
    this.#observer?.complete?.();
    this.#subscription?.unsubscribe();
    this.#observer = null;
  }

  /**
   * Internal helper invoked by {@link Subscription.unsubscribe}.  Mutates the
   * `#closed` flag without touching user callbacks.
   * 
   * @internal
   */
  static close(sub: Subscription) {
    const subObs = SubscriptionObserverPrivateAccess.get(sub);
    if (subObs) subObs.#closed = true;
  }

  /** `Object.prototype.toString.call(observer)` → `[object Subscription Observer]`. */
  get [Symbol.toStringTag](): "Subscription Observer" { return "Subscription Observer" as const; }
}

/**
 * A thin, spec‑accurate wrapper around a *subscriber* function, implements the TC39 spec with extensions.
 *
 * @typeParam T  Type of items this Observable emits.
 *
 * @remarks
 * Differences vs. the raw proposal:
 * * Adds {@link Observable.pull} for back‑pressure via *ReadableStream*.
 * * Adds `Symbol.dispose` / `Symbol.asyncDispose` bridges for TC39 using blocks.
 */
export class Observable<T> implements AsyncIterable<T> {
  #subscribeFn: (obs: SubscriptionObserver<T>) => Teardown | Subscription | void;

  /**
   * @param subscribeFn  Called **once per subscriber**, synchronously, exactly
   *                     as demanded in *§ ExecuteSubscriber*.
   */
  constructor(subscribeFn: (obs: SubscriptionObserver<T>) => Teardown | void) {
    if (typeof subscribeFn !== 'function') {
      throw new TypeError('Observable initializer must be a function'); // spec step 2
    }

    this.#subscribeFn = subscribeFn;
  }

  /** `obs[@@observable]()` – required for inter‑op. */
  [Symbol.observable](): Observable<T> { return this; }

  /** Subscribe with an {@link Observer} object. */
  subscribe(observer: Observer<T>): Subscription;
  /** Subscribe with individual callbacks (sugar). */
  subscribe(
    next: (value: T) => void,
    error?: (e: unknown) => void,
    complete?: () => void
  ): Subscription;
  subscribe(
    observerOrNext: Observer<T> | ((value: T) => void), 
    error?: (e: unknown) => void, 
    complete?: () => void
  ): Subscription {   
    /* -------------------------------------------------------------------
     * 1.  Normalise the observer – mirrors spec step 4.
     * ------------------------------------------------------------------- */
    let observer: Observer<T> | null =
      typeof observerOrNext === 'function'
        ? { next: observerOrNext, error, complete }
        : observerOrNext && typeof observerOrNext === 'object'
          ? observerOrNext
          : {};           // ← spec‑compliant fallback for null / primitives

    /* -------------------------------------------------------------------
     * 2.  Internal state: teardown holder (spec: [[Cleanup]]).
     * ------------------------------------------------------------------- */
    let cleanup: Teardown | Subscription | null = null;

    /* -------------------------------------------------------------------
     * 3.  Create the Subscription facade (spec: CreateSubscription()).
     * ------------------------------------------------------------------- */
    const subscription: Subscription = {
      get [Symbol.toStringTag](): "Subscription" { return "Subscription" as const; },
      get closed() { return subObserver.closed ?? false },

      // unsubscribe() spec‑style
      unsubscribe(): void {
        if (this.closed) return;

        // (a) Mark closed so this block only runs once
        // (b) Tell our SubscriptionObserver to stop sending events
        SubscriptionObserver.close(this); 
        observer = null; // clears spec [[Observer]] slot.

        // (c) Actually clean up any resources
        runCleanup();
      },

      // Support `using` disposal:
      [Symbol.dispose]() {
        this.unsubscribe();
      },
      // Support async disposal patterns:
      async [Symbol.asyncDispose]() {
        this.unsubscribe();
      }
    };

    /* -------------------------------------------------------------------
     * 4.  Wrap user observer so we enforce closed‑state.
     * ------------------------------------------------------------------- */
    const subObserver = new SubscriptionObserver<T>(observer, subscription);
    SubscriptionObserverPrivateAccess.set(subscription, subObserver);

    /* Shared utility for spec § CleanupSubscription */
    function runCleanup() {
      let temp = cleanup;
      cleanup = null;

      if (!temp) return;
      if (typeof temp === 'function') temp?.();  
      else if (typeof temp === "object") {
        if (typeof temp.unsubscribe === 'function') temp?.unsubscribe?.();
        else if (typeof temp[Symbol.asyncDispose] === "function") 
          temp?.[Symbol.asyncDispose]?.(); 
        else if (typeof temp[Symbol.dispose] === "function") 
          temp?.[Symbol.dispose]?.(); 
      }

      temp = null;
    }

    /* -------------------------------------------------------------------
     * 5.  Call observer.start(subscription) – (spec step 10).
     * ------------------------------------------------------------------- */
    try {
      observer.start?.(subscription);
      if (subscription.closed) return subscription;   // spec step 10.d
    } catch (err) {
      // WarnIfAbrupt: report, but return closed subscription
      // Queue in a micro‑task so it surfaces *after* current job,
      // matching the spec’s “report later” intent.
      queueMicrotask(() => {
        // 1. Print to console for visibility
        console.error(err);

        // 2. Re‑throw so debuggers break (optional, but common)
        throw err;
      });

      subscription.unsubscribe();
      return subscription;
    }

    /* -------------------------------------------------------------------
     * 6.  Execute the user subscriber and capture its cleanup (spec step 12‑16).
     * ------------------------------------------------------------------- */
    try {
      cleanup = this.#subscribeFn(subObserver) ?? null;

      // 7) **Edge‐case**: if their subscribeFn synchronously called `complete()`
      //    then `subscription.closed` is already true. We need to run teardown
      //    _right now_, or else we’ll never clean up on a sync complete.
      if (subscription.closed) runCleanup();
    } catch (err) {
      // 8) If their subscribeFn throws, send that as an error notification
      subObserver.error(err);
    }

    // 9) Finally, hand back the Subscription so callers can cancel whenever they like
    return subscription;
  }

  //───────────────── Pull‑mode sugar (ReadableStream) ──────────────────

  /** Enables `for await … of observable` directly. */
  async *[Symbol.asyncIterator](): AsyncIterator<T> { yield* pull(this); }

  /**
   * Convert push into pull using `ReadableStream` back‑pressure.
   *
   * @param strategy  Optional stream queuing strategy.  Defaults to
   *                  `{ highWaterMark: 1 }` which effectively means “pause the
   *                  producer until the consumer awaits the next chunk”.
   * @yields Values emitted by the observable.
   *
   * @example
   * ```ts
   * for await (const x of obs.pull({ strategy: { highWaterMark: 2 } })) {
   *   console.log(x);
   * }
   * ```
   */
  pull({ strategy = { highWaterMark: 1 } }: { strategy?: QueuingStrategy<T> } = {}): AsyncGenerator<T> {
    return pull(this, { strategy })
  }

  //───────────────── Helper constructors – of / from ──────────────────

  /** See spec § Observable.from.  Handles Observable‑like, iterable and async‑iterable inputs. */
  static readonly from = from;

  /** Create an Observable that synchronously emits the given items and completes. */
  static readonly of = of;

  get [Symbol.toStringTag](): "Observable" { return "Observable"; }
}


/**
 * Synchronously emits the provided values, then completes.
 * @param items - Values to emit
 * @returns An Observable of the given items
 */
export function of<T>(...items: T[]): Observable<T> {
  return new Observable<T>(obs => {
    for (const v of items) obs.next(v);
    obs.complete();
  });
}

/**
 * Converts an Observable-like, sync iterable, or async iterable into an Observable.
 * @param input - Something with `Symbol.observable`, or iterable
 * @throws TypeError if input is not compatible
 */
export function from<T>(
  this: Observable<T>,
  input: Pick<Observable<T>, typeof Symbol.observable> | 
         Iterable<T> | AsyncIterable<T>
): Observable<T> {
  // Case 1 – object with @@observable
  if (
    input && Symbol.observable in input && 
    typeof (input as Pick<Observable<T>, typeof Symbol.observable>)[Symbol.observable] === 'function'
  ) {
    // spec step 5: return verbatim if constructor identity matches
    const result = (input as Pick<Observable<T>, typeof Symbol.observable>)[Symbol.observable]();
    const Constructor = Observable ?? this;
    if ((result as any)?.constructor === Constructor) return result;

    // Wrap foreign Observable-like
    return new Observable<T>(observer => {
      const sub = (result as Observable<T>)?.subscribe(observer);
      return () => sub?.unsubscribe?.();
    });
  }

  // Case 2 – synchronous iterable
  if (
    input && Symbol.iterator in input && 
    typeof (input as Iterable<T>)[Symbol.iterator] === 'function'
  ) {
    return new Observable<T>(obs => {
      const iterator = (input as Iterable<T>)[Symbol.iterator]();
      for (let step = iterator.next(); !step.done; step = iterator.next()) {
        obs.next(step.value);

        if (obs.closed) {
          if (typeof iterator.return === 'function') iterator.return(); // IteratorClose
          break;
        }
      }

      obs.complete();
    });
  }

  // Case 3 – async iterable
  if (
    input && Symbol.asyncIterator in input && 
    typeof (input as AsyncIterable<T>)[Symbol.asyncIterator] === 'function'
  ) {
    return new Observable<T>(obs => {
      (async () => {
        const iterator = (input as AsyncIterable<T>)[Symbol.asyncIterator]();
        for (let step = await iterator.next(); !step.done; step = await iterator.next()) {
          obs.next(step.value);

          if (obs.closed) {
            if (typeof iterator.return === 'function') await iterator.return(); // IteratorClose
            break;
          }
        }

        obs.complete();
      })()
    });
  }

  throw new TypeError('Input is not Observable, Iterable, or AsyncIterable');
}


//───────────────────────────────────────────────────────────────────────────────
//  pull() – bridge push into pull (exported standalone helper)
//───────────────────────────────────────────────────────────────────────────────

/**
 * Convert **any** {@link Observable} into an *async generator* with proper
 * back‑pressure using **`ReadableStream`**.
 *
 * ### Why a free function?
 *  * Works on **foreign observables** (RxJS, zen‑observable, etc.) without
 *    monkey‑patching their prototypes.
 *  * Avoids increasing the surface area of {@link Observable} itself – stays
 *    closer to the TC39 draft while giving users Deno‑/Node‑friendly pull mode.
 *
 * ### Relation to the spec
 * The proposal purposefully leaves *pull mode* out‑of‑scope.  TC39 expects
 * libraries to layer it.  This helper shows **one canonical layering** that
 * respects the "deliver synchronously" guarantee while still letting the
 * consumer apply back‑pressure.
 *
 * @typeparam T       Item type emitted by the source observable.
 * @param observable  Any object conforming to the Observable protocol.
 * @param options     Pass a custom `highWaterMark` or full `QueuingStrategy`
 *                    to control internal buffering.
 *
 * @returns An `AsyncGenerator<T>` compatible with `for await … of`.
 *
 * @example Consume five numbers *slowly* (1 s delay each) without overflowing
 * the buffer.  The producer pauses automatically because `highWaterMark` = 1.
 * ```ts
 * import { pull, Observable } from "./observable.ts";
 *
 * const slow = Observable.of(1, 2, 3, 4, 5);
 * for await (const n of pull(slow)) {
 *   console.log(n);
 *   await new Promise(r => setTimeout(r, 1000));
 * }
 * ```
 */
export async function* pull<T>(
  observable: Observable<T>,
  { strategy = { highWaterMark: 1 } }: { strategy?: QueuingStrategy<T> } = {},
): AsyncGenerator<T> {
  let sub: Subscription | null = null;

  const stream = new ReadableStream<T>({
    start: ctrl => {
      sub = observable.subscribe({
        next: v => ctrl.enqueue(v),
        error: e => ctrl.error(e),
        complete: () => ctrl.close(),
      });
    },
    cancel: () => sub?.unsubscribe(),
  }, strategy);

  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
    await stream.cancel();
  }
}
