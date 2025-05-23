// @filename: symbol.ts
/**
 * > Inspired by https://jsr.io/@nick/dispose/1.1.0/symbol.ts
 * 
 * Extensions to the global Symbol constructor for interoperability with
 * Observable.
 * 
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
   * Well-known symbol for Observable interoperability.
   * 
   * 
   * This symbol allows any object to define how it converts to an Observable.
   * Objects with a `[Symbol.observable]()` method can be passed directly to
   * `Observable.from()` and will be properly converted.
   * 
   * This is analogous to how `Symbol.iterator` enables iteration interop.
   * 
   * @see {@link https://github.com/tc39/proposal-observable | TC39 Observable proposal}
   */
  readonly observable: unique symbol;
}

/**
 * Provides a cross-platform Symbol implementation with Observable 
 * and resource management symbols.
 * 
 * 
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
 * 
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
 * 
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
 * 
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