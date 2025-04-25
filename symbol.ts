// Inspired by https://jsr.io/@nick/dispose/1.1.0/symbol.ts
export interface SymbolConstructor
  extends Omit<typeof globalThis.Symbol, "dispose" | "asyncDispose" | "observable"> {
  /**
   * A method that is used to identify obserable objects.
   */
  readonly observable: unique symbol;

  /**
   * A method that is used to release resources held by an object. Called by
   * the semantics of the `using` statement.
   */
  readonly dispose: unique symbol;

  /**
   * A method that is used to asynchronously release resources held by an
   * object. Called by the semantics of the `await using` statement.
   */
  readonly asyncDispose: unique symbol;
}

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