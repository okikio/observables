import { AssertionError } from "@std/assert/assertion-error";

/**
 * Make an assertion that `actual` and `expected` are not equal, deeply.
 * If not then throw.
 *
 * Type parameter can be specified to ensure values under comparison have the same type.
 *
 * @example Usage
 * ```ts
 * import { assertNotEquals } from "./_assert.ts";
 *
 * assertNotEquals(1, 2); // Doesn't throw
 * assertNotEquals(1, 1); // Throws
 * ```
 *
 * @typeParam T The type of the values to compare.
 * @param actual The actual value to compare.
 * @param expected The expected value to compare.
 * @param msg The optional message to display if the assertion fails.
 */
export function assertNotEquals<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    return;
  }
  const actualString = String(actual);
  const expectedString = String(expected);
  const msgSuffix = msg ? `: ${msg}` : ".";
  throw new AssertionError(
    `Expected actual: ${actualString} not to be: ${expectedString}${msgSuffix}`,
  );
}