/**
 * A minimal, TC39-inspired Observable implementation with detailed TSDocs and examples.
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

/** A callback for cleaning up resources when unsubscribing or completing. */
export type Teardown = () => void;

/**
 * Internal wrapper enforcing the closed state of an Observer.
 * Automatically unsubscribes when error or complete events occur.
 */
export class SubscriptionObserver<T> {
  public closed = false;
  #observer: Observer<T>;
  #subscription?: Subscription | null = null;

  constructor(obs: Observer<T>, subscription?: Subscription | null) {
    this.#observer = obs;
    this.#subscription = subscription;
  }

  /**
   * Sends the next value if not closed.
   * @param value - The value to deliver
   */
  next(value: T) {
    if (!this.closed) this.#observer.next?.(value);
  }

  /**
   * Sends an error notification, marks closed, and unsubscribes.
   * @param err - The error to deliver
   */
  error(err: unknown) {
    if (!this.closed) {
      this.closed = true;
      this.#observer.error?.(err);
      this.#subscription?.unsubscribe();
    }
  }

  /**
   * Sends a completion notification, marks closed, and unsubscribes.
   */
  complete() {
    if (!this.closed) {
      this.closed = true;
      this.#observer.complete?.();
      this.#subscription?.unsubscribe();
    }
  }
}

/**
 * Core Observable class implementing the TC39 spec with extensions.
 *
 * @typeParam T - Type of values this Observable emits.
 */
export class Observable<T> implements AsyncIterable<T> {
  #subscribeFn: (obs: SubscriptionObserver<T>) => Teardown | Subscription | void;

  /**
   * @param subscribeFn - Called for each subscriber; returns an optional teardown.
   */
  constructor(subscribeFn: (obs: SubscriptionObserver<T>) => Teardown | void) {
    this.#subscribeFn = subscribeFn;
  }

  /**
   * Interop: Returns this Observable for chaining.
   * @returns This Observable
   */
  [Symbol.observable](): Observable<T> { return this; }

  /** Subscribe to this Observable. */
  subscribe(observer: Observer<T>): Subscription;
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
    // 1) Normalize args into a single Observer<T> shape
    const observer: Observer<T> =
      typeof observerOrNext === "function"
        ? { next: observerOrNext, error, complete }
        : observerOrNext;

    // 2) This will hold whatever teardown‐callback the user’s subscribeFn returns
    let teardown: Teardown | Subscription | null = null;

    // 3) Build our Subscription object
    const subscription: Subscription = {
      closed: false,
      unsubscribe(): void {
        if (!this.closed) {
          // (a) Mark closed so this block only runs once
          this.closed = true;
          // (b) Tell our SubscriptionObserver to stop sending events
          subObserver.closed = true;
          // (c) Actually clean up any resources
          if (subscription.closed && typeof teardown === 'function') {
            // Pull the function out and null it so it can’t run twice
            const fn = teardown;
            teardown = null;
            fn?.();
          }
        }
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

    // 4) Wrap the raw Observer so we auto‐unsubscribe on error/complete
    const subObserver = new SubscriptionObserver<T>(observer, subscription);

    // 5) Let user‐provided `start` hook run before any values
    observer.start?.(subscription);

    // 6) Call their subscribe‐function and capture its cleanup callback
    try {
      teardown = this.#subscribeFn(subObserver) ?? null;

      // 7) **Edge‐case**: if their subscribeFn synchronously called `complete()`
      //    then `subscription.closed` is already true. We need to run teardown
      //    _right now_, or else we’ll never clean up on a sync complete.
      if (subscription.closed && typeof teardown === 'function') {
        // Pull the function out and null it so it can’t run twice
        const fn = teardown;
        teardown = null;
        fn?.();
      }
    } catch (err) {
      // 8) If their subscribeFn throws, send that as an error notification
      subObserver.error(err);
    }

    // 9) Finally, hand back the Subscription so callers can cancel whenever they like
    return subscription;
  }

  /** Enables `for await` iteration over this Observable. */
  async *[Symbol.asyncIterator](): AsyncIterator<T> { yield* this.pull(); }

  /**
   * Pull-based async generator with backpressure control.
   * @param strategy - Queuing strategy (default: `{ highWaterMark: 1 }`).
   * @yields Values emitted by this Observable.
   *
   * @example
   * ```ts
   * for await (const x of obs.pull({ strategy: { highWaterMark: 2 } })) {
   *   console.log(x);
   * }
   * ```
   */
  async *pull({ strategy = { highWaterMark: 1 } }: { strategy?: QueuingStrategy<T> } = {}): AsyncGenerator<T> {
    let subscription!: Subscription;
    const self = this;

    const stream = new ReadableStream<T>({
      start(controller) {
        subscription = self.subscribe({
          next(v) { controller.enqueue(v); },
          error(err) { controller.error(err); },
          complete() { controller.close(); }
        });
      },
      cancel() { subscription?.unsubscribe?.(); }
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

  static from = from;
  static of = of;
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
  input: Pick<Observable<T>, typeof Symbol.observable> | 
         Iterable<T> | AsyncIterable<T>
): Observable<T> {
  if (
    input && 
    Symbol.observable in input && 
    typeof (input as Pick<Observable<T>, typeof Symbol.observable>)[Symbol.observable] === 'function'
  ) {
    const result = (input as Pick<Observable<T>, typeof Symbol.observable>)[Symbol.observable]() as unknown;
    if (result instanceof Observable) return result;

    // Wrap foreign Observable-like
    return new Observable<T>(observer => {
      const sub = (result as Observable<T>).subscribe({
        next: v => observer.next(v),
        error: e => observer.error(e),
        complete: () => observer.complete()
      });
      return () => sub?.unsubscribe?.();
    });
  }

  // Sync iterable
  if (
    input && 
    Symbol.iterator in input && 
    typeof (input as Iterable<T>)[Symbol.iterator] === 'function'
  ) {
    return new Observable<T>(obs => {
      for (const v of input as Iterable<T>) {
        obs.next(v);
        if (obs.closed) break;
      }

      obs.complete();
    });
  }

  // Async iterable
  if (
    input && 
    Symbol.asyncIterator in input && 
    typeof (input as AsyncIterable<T>)[Symbol.asyncIterator] === 'function'
  ) {
    return new Observable<T>(obs => {
      (async () => {
        for await (const v of input as AsyncIterable<T>) {
          obs.next(v);
          if (obs.closed) break;
        }

        obs.complete();
      })()
    });
  }

  throw new TypeError('Input is not Observable, Iterable, or AsyncIterable');
}

