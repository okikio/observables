// Observable.ts

/**
 * A minimal, TC39-inspired Observable implementation with detailed TSDocs and examples.
 *
 * Features:
 * - Push API via `subscribe()` (Observer or callbacks)
 * - Pull API via `for await...of` (simple) or `.pull()` for backpressure control
 * - Interop via `Symbol.observable`
 * - Resource cleanup with `Symbol.dispose` and `Symbol.asyncDispose` on subscriptions
 *
 * Creation helpers `of` and `from` are separate exports for tree-shaking.
 *
 * @example Basic subscription:
 * ```ts
 * import { of } from './Observable.ts';
 *
 * // Emit 1,2,3 then complete
 * const subscription = of(1, 2, 3).subscribe({
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
 * import { of } from './Observable.ts';
 *
 * (async () => {
 *   for await (const x of of('a', 'b', 'c')) {
 *     console.log(x);
 *   }
 * })();
 * ```
 *
 * @example Pull with strategy:
 * ```ts
 * import { from } from './Observable.ts';
 *
 * const nums$ = from([1,2,3,4,5]);
 * (async () => {
 *   for await (const n of nums$.pull({ strategy: { highWaterMark: 2 } })) {
 *     console.log('Pulled:', n);
 *   }
 * })();
 * ```
 */

import type { IObservable, Observer, Subscription } from "./_types.ts";
import { Symbol } from "./symbol.ts";

/** Teardown callback returned by subscriber. */
export type Teardown = () => void;

/** Internal wrapper enforcing closed state. */
export class SubscriptionObserver<T> {
  public closed = false;
  #observer: Observer<T>;
  constructor(obs: Observer<T>) { this.#observer = obs; }
  next(value: T) { if (!this.closed) this.#observer.next?.(value); }
  error(err: unknown) { if (!this.closed) { this.closed = true; this.#observer.error?.(err); } }
  complete() { if (!this.closed) { this.closed = true; this.#observer.complete?.(); } }
}

/**
 * Core Observable class.
 * @typeParam T  Type of values emitted.
 */
export class Observable<T> implements AsyncIterable<T>, IObservable<T> {
  #subscribeFn: (obs: SubscriptionObserver<T>) => Teardown | void;

  /**
   * @param subscribeFn  Called for each subscription; can return teardown.
   */
  constructor(subscribeFn: (obs: SubscriptionObserver<T>) => Teardown | void) {
    this.#subscribeFn = subscribeFn;
  }

  /** Interop: returns this. */
  [Symbol.observable](): Observable<T> { return this; }

  /**
   * Subscribe overloads: Observer or callbacks.
   * @returns Subscription
   */
  subscribe(observer: Partial<Observer<T>>): Subscription;
  subscribe(next: (value: T) => void, error?: (e: unknown) => void, complete?: () => void): Subscription;
  subscribe(arg1: any, arg2?: any, arg3?: any): Subscription {
    const obs: Observer<T> = typeof arg1 === 'function'
      ? { next: arg1, error: arg2, complete: arg3 }
      : arg1;

    let teardown: Teardown | void;
    const subscription: Subscription = {
      closed: false,
      unsubscribe() {
        if (!this.closed) {
          this.closed = true;
          subObs.closed = true;
          teardown?.();
        }
      },

      [Symbol.dispose]() { this.unsubscribe(); },
      async [Symbol.asyncDispose]() { return await this.unsubscribe(); }
    };

    const subObs = new SubscriptionObserver<T>(obs);
    obs.start?.(subscription);
    try { teardown = this.#subscribeFn(subObs); }
    catch (err) { subObs.error(err); subscription.unsubscribe(); }
    return subscription;
  }

  /** Simple pull: for-await uses pull(). */
  async *[Symbol.asyncIterator](): AsyncIterator<T> { yield* this.pull(); }

  /**
   * Pull-based async generator with backpressure control.
   * @param strategy  ReadableStream queuing strategy (default {highWaterMark:1}).
   */
  async *pull({ strategy = { highWaterMark: 1 } }: { strategy?: QueuingStrategy<T> } = {}): AsyncGenerator<T> {
    let subscription!: Subscription;
    // capture this
    const _self = this;
    const stream = new ReadableStream<T>({
      start(controller) {
        subscription = _self.subscribe({
          next(v) { controller.enqueue(v); },
          error(err) { controller.error(err); subscription.unsubscribe(); },
          complete() { controller.close(); subscription.unsubscribe(); }
        });
      },
      cancel() { subscription.unsubscribe(); }
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
}

/**
 * Emit given values synchronously, then complete.
 */
export function of<T>(...items: T[]): Observable<T> {
  return new Observable<T>(obs => { for (const v of items) obs.next(v); obs.complete(); });
}

/**
 * Convert Observable-like or Iterable to Observable.
 */
export function from<T>(input: Observable<T> | Iterable<T>): Observable<T> {
  if (input && "Symbol.observable" in input && typeof (input as IObservable<T>)[Symbol.observable] === 'function') {
    const obs = (input as IObservable<T>)[Symbol.observable]() as Observable<T>;
    return obs;
  }

  if (input && "Symbol.iterator" in input && typeof (input as Iterable<T>)[Symbol.iterator] === 'function') {
    return new Observable<T>(obs => { 
      for (const v of input as Iterable<T>) { 
        obs.next(v);
        if (obs.closed) break;
      }

      obs.complete(); 
    });
  }

  if (input && "Symbol.asyncIterator" in input && typeof (input as AsyncIterable<T>)[Symbol.asyncIterator] === 'function') {
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

  throw new TypeError('Input is not Observable or Iterable');
}