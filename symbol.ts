// Inspired by https://jsr.io/@nick/dispose/1.1.0/symbol.ts
/**
 * A minimal, TC39‑inspired Observable implementation with both push‑based and pull‑based APIs,
 * resource cleanup via `Symbol.dispose` and `Symbol.asyncDispose`, and interoperability via `Symbol.observable`.
 *
 * # Background
 * Observables model asynchronous, push‑based data streams (e.g., DOM events, WebSockets, timers).
 * Unlike Promises, they can emit multiple values over time and support cancellation.
 * This library also provides a pull API for backpressure control via async iteration.
 *
 * # Use Cases
 * - Reacting to user input events or real‑time data feeds
 * - Building data pipelines with composable operators
 * - Converting sync/async iterables into push‑based streams
 * - Managing resource lifecycles in `using`/`await using` contexts
 *
 * @example Push API
 * ```ts
 * import { Observable } from "./Observable.ts";
 *
 * // Create an Observable of click events
 * const clicks$ = new Observable<MouseEvent>(observer => {
 *   const handler = (e: MouseEvent) => observer.next(e);
 *   document.body.addEventListener('click', handler);
 *   // Teardown: remove handler when unsubscribed or completed
 *   return () => document.body.removeEventListener('click', handler);
 * });
 *
 * // Subscribe with an Observer
 * const subscription = clicks$.subscribe({
 *   start() { console.log('Started listening'); },
 *   next(evt) { console.log('Clicked at', evt.clientX, evt.clientY); },
 *   error(err) { console.error('Error in stream', err); },
 *   complete() { console.log('Stream ended'); }
 * });
 *
 * // Later: cancel the stream
 * subscription.unsubscribe();
 * ```
 *
 * @example Pull API
 * ```ts
 * import { of } from "./Observable.ts";
 *
 * (async () => {
 *   // Pull numbers 1,2,3 with highWaterMark 2
 *   for await (const n of of(1,2,3).pull({ strategy: { highWaterMark: 2 } })) {
 *     console.log('Pulled', n);
 *   }
 * })();
 * ```
 */

/**
 * Extensions to the global Symbol constructor for Observable and resource cleanup interop.
 */
export interface SymbolConstructor
  extends Omit<typeof globalThis.Symbol, "dispose" | "asyncDispose" | "observable"> {
  /**
   * Identifies an Observable for interoperability.
   * @see {@link https://github.com/tc39/proposal-observable|TC39 Observable proposal}
   */
  readonly observable: unique symbol;

  /**
   * Sync cleanup symbol, invoked by `using` blocks for resource teardown.
   */
  readonly dispose: unique symbol;

  /**
   * Async cleanup symbol, invoked by `await using` blocks for resource teardown.
   */
  readonly asyncDispose: unique symbol;
}

/**
 * Polyfill or reuse global Symbol, then add our custom symbols if missing.
 */
export const Symbol: SymbolConstructor = (globalThis.Symbol ??
  ((description: string) => ({
    description,
    toString: () => `Symbol(${description})`,
  }))) as unknown as SymbolConstructor;

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