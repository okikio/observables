// @filename: symbol.ts
/**
 * > Inspired by https://jsr.io/@nick/dispose/1.1.0/symbol.ts
 *
 * Extensions to the global Symbol constructor for interoperability with
 * Observable.
 *
 * This interface extends the standard Symbol constructor with well-known
 * symbols needed for Observable interoperability and resource cleanup:
 *
 * 1. `Symbol.observable`: For Observable interoperability (TC39 proposal)
 *
 * These symbols enable our implementation to work with:
 * - Other Observable libraries via Symbol.observable
 *
 * @example
 * ```ts
 * // Using Symbol.observable for interop
 * const myObservable = {
 *   [Symbol.observable]() {
 *     return new Observable(observer => {
 *       observer.next('Hello');
 *       observer.complete();
 *     });
 *   }
 * };
 * ```
 *
 * @module
 */
export interface SymbolConstructor
  extends Omit<typeof globalThis.Symbol, "observable"> {
  /**
   * Well-known symbol for values that can expose themselves as Observables.
   *
   * This symbol allows any object to define how it converts to an Observable.
   * Objects with a `[Symbol.observable]()` method can be passed directly to
   * `Observable.from()` and will be properly converted.
   *
   * This works the same way `Symbol.iterator` lets an object act like an
   * iterable.
   *
   * @see {@link https://github.com/tc39/proposal-observable | TC39 Observable proposal}
   */
  readonly observable: unique symbol;
}

/**
 * Cross-runtime `Symbol` reference with the Observable and disposal protocol
 * names attached when the host does not provide them natively.
 */
export const Symbol: SymbolConstructor = (globalThis.Symbol ??
  ((description: string) => ({
    description,
    toString: () => `Symbol(${description})`,
  }))) as unknown as SymbolConstructor;

/**
 * Adds `Symbol.dispose` if the runtime does not provide it.
 *
 * This lets `using` clean up values automatically when the scope ends.
 *
 * @example Basic resource cleanup with using
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * {
 *   using subscription = Observable.of(1, 2, 3).subscribe({
 *     next: (val) => console.log('Value:', val)
 *   });
 *
 *   // Use the subscription here
 *   // ...
 * } // subscription.unsubscribe() called automatically at block end
 * ```
 *
 * @example Automatic cleanup on error
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * function processData() {
 *   using sub = Observable.from(dataStream).subscribe({
 *     next: (data) => processItem(data)
 *   });
 *
 *   if (invalidCondition) {
 *     throw new Error('Processing failed');
 *   }
 *   // sub.unsubscribe() called even if error thrown
 * }
 * ```
 */
if (
  typeof globalThis.Symbol === "function" &&
  typeof Symbol.dispose !== "symbol"
) {
  Reflect.defineProperty(Symbol, "dispose", {
    // deno-lint-ignore no-explicit-any
    value: (Symbol as any)("Symbol.dispose"),
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

/**
 * Adds `Symbol.asyncDispose` if the runtime does not provide it.
 *
 * This lets `await using` wait for async cleanup when the scope ends.
 *
 * @example Async resource cleanup with await using
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * async function streamData() {
 *   await using sub = Observable.of(1, 2, 3).subscribe({
 *     next: async (data) => await saveData(data)
 *   });
 *
 *   // Use the subscription here
 *   // ...
 * } // sub.unsubscribe() (or async dispose) awaited automatically at block end
 * ```
 *
 * @example Guaranteed async cleanup on error
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * async function fetchAndProcess() {
 *   await using sub = Observable.from(apiStream).subscribe({
 *     next: async (item) => await processAsync(item)
 *   });
 *
 *   if (errorCondition) {
 *     throw new Error('Failed');
 *   }
 *   // Async cleanup guaranteed even if error thrown
 * }
 * ```
 */
if (
  typeof globalThis.Symbol === "function" &&
  typeof Symbol.asyncDispose !== "symbol"
) {
  Reflect.defineProperty(Symbol, "asyncDispose", {
    // deno-lint-ignore no-explicit-any
    value: (Symbol as any)("Symbol.asyncDispose"),
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

/**
 * Adds `Symbol.observable` if the runtime does not provide it.
 *
 * This keeps Observable-like values working the same way across runtimes.
 */
if (
  typeof globalThis.Symbol === "function" &&
  typeof Symbol.observable !== "symbol"
) {
  Reflect.defineProperty(Symbol, "observable", {
    // deno-lint-ignore no-explicit-any
    value: (Symbol as any)("Symbol.observable"),
    enumerable: false,
    configurable: false,
    writable: false,
  });
}
