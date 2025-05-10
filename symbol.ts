// @filename: symbol.ts
/**
 * > Inspired by https://jsr.io/@nick/dispose/1.1.0/symbol.ts
 * 
 * Extensions to the global Symbol constructor for interoperability with
 * Observable, disposal, and resource management proposals.
 * 
 * @remarks
 * This interface extends the standard Symbol constructor with well-known
 * symbols needed for Observable interoperability and resource cleanup:
 * 
 * 1. `Symbol.observable`: For Observable interoperability (TC39 proposal)
 * 2. `Symbol.dispose`: For synchronous resource cleanup (TC39 proposal)
 * 3. `Symbol.asyncDispose`: For asynchronous resource cleanup (TC39 proposal)
 * 
 * These symbols enable our implementation to work with:
 * - `using` statements for automatic cleanup
 * - `await using` statements for async cleanup
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
 * 
 * // Using Symbol.dispose for resource cleanup
 * {
 *   using subscription = observable.subscribe(...);
 *   // Subscription automatically disposed at end of block
 * }
 * ```
 * 
 * @module
 */
export interface SymbolConstructor
  extends Omit<typeof globalThis.Symbol, "dispose" | "asyncDispose" | "observable"> {
  /**
   * Well-known symbol for Observable interoperability.
   * 
   * @remarks
   * This symbol allows any object to define how it converts to an Observable.
   * Objects with a `[Symbol.observable]()` method can be passed directly to
   * `Observable.from()` and will be properly converted.
   * 
   * This is analogous to how `Symbol.iterator` enables iteration interop.
   * 
   * @see {@link https://github.com/tc39/proposal-observable | TC39 Observable proposal}
   */
  readonly observable: unique symbol;

  /**
   * Well-known symbol for synchronous resource disposal.
   * 
   * @remarks
   * Objects that implement this method can be used with the `using` statement
   * to ensure resources are properly cleaned up when the block exits, even
   * if an exception occurs.
   * 
   * For Observables, this enables automatic unsubscription at block exit.
   * 
   * @see {@link https://github.com/tc39/proposal-explicit-resource-management | TC39 Resource Management proposal}
   */
  readonly dispose: unique symbol;

  /**
   * Well-known symbol for asynchronous resource disposal.
   * 
   * @remarks
   * Objects that implement this method can be used with the `await using`
   * statement to ensure resources are properly cleaned up in async contexts.
   * 
   * For Observables, this enables automatic unsubscription in async contexts.
   * 
   * @see {@link https://github.com/tc39/proposal-explicit-resource-management | TC39 Resource Management proposal}
   */
  readonly asyncDispose: unique symbol;
}

/**
 * Provides a cross-platform Symbol implementation with Observable 
 * and resource management symbols.
 * 
 * @remarks
 * This implementation:
 * 1. Uses the native Symbol if available
 * 2. Falls back to a polyfill if Symbol is not supported
 * 3. Adds our special symbols if they don't exist natively
 * 
 * The polyfill is lightweight and provides basic Symbol functionality
 * for environments that don't support it natively.
 * 
 * Note: The polyfill does not implement the full Symbol specification
 * and is intended only for basic interoperability in legacy environments.
 */
export const Symbol: SymbolConstructor = (globalThis.Symbol ??
  ((description: string) => ({
    description,
    toString: () => `Symbol(${description})`,
  }))) as unknown as SymbolConstructor;

/**
 * Adds Symbol.dispose if it doesn't exist natively.
 * 
 * @remarks
 * This ensures Symbol.dispose is available for resource management,
 * even in environments that don't support it natively.
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
 * Adds Symbol.asyncDispose if it doesn't exist natively.
 * 
 * @remarks
 * This ensures Symbol.asyncDispose is available for async resource
 * management, even in environments that don't support it natively.
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
 * Adds Symbol.observable if it doesn't exist natively.
 * 
 * @remarks
 * This ensures Symbol.observable is available for Observable
 * interoperability, even in environments that don't support
 * it natively.
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