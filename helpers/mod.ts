// @filename: helpers/mod.ts
/**
 * Most pipelines only need one import path for operators, pipe helpers, and
 * interop utilities.
 *
 * The exports here cover the common jobs you combine into a pipeline:
 *
 * - reshape values with `map`, `filter`, `scan`, `take`, and friends
 * - coordinate time with `debounce`, `delay`, `throttle`, and `timeout`
 * - start follow-up work with `mergeMap`, `concatMap`, and `switchMap`
 * - recover from wrapped failures with `catchErrors`, `ignoreErrors`, and
 *   related helpers
 *
 * All of those stages share the same Web Streams-based runtime, so teardown,
 * backpressure, and error-mode behavior stay consistent from one stage to the
 * next. Narrower `./operations/*` paths are available when a focused category
 * is easier to explore.
 *
 * ## Basic Usage
 *
 * @example
 * ```ts
 * import { pipe, map, filter, take } from "./helpers/mod.ts";
 * import { Observable } from "./observable.ts";
 *
 * // Create an Observable with some data
 * const source = new Observable(observer => {
 *   for (let i = 0; i < 10; i++) {
 *     observer.next(i);
 *   }
 *   observer.complete();
 * });
 *
 * // Transform the Observable
 * const result = pipe(
 *   source,
 *   filter(x => x % 2 === 0), // Keep even numbers
 *   map(x => x * 10),         // Multiply by 10
 *   take(3)                   // Take only the first 3 values
 * );
 *
 * // Subscribe to the result
 * result.subscribe({
 *   next: value => console.log(value),
 *   complete: () => console.log('Done')
 * });
 * // Output: 0, 20, 40
 * ```
 *
 * ## Advanced Composition
 *
 * For more complex pipelines, the `compose` function helps you group operators:
 *
 * @example
 * ```ts
 * import { pipe, compose, map, filter, take, tap } from "./helpers/mod.ts";
 *
 * // Use them in a pipeline
 * const result = pipe(
 *   source,
 *
 *   // Process numbers
 *   filter(x => x % 2 === 0),
 *   map(x => x * 10),
 *   tap(x => console.log('Processed:', x)),
 *
 *   // Limit and format output
 *   take(3),
 *   map(x => `Result: ${x}`)
 * );
 * ```
 *
 * ## Limitations
 *
 * - Each pipeline is limited to 9 operators due to TypeScript's recursion limits
 * - Use `compose` to group operators when you need more than 9
 * - Composed operator groups are also limited to 9 operators
 *
 * @module
 */

// Re-export all operators from their respective modules
export type * from "./_types.ts";

export * from "./operations/mod.ts";
export * from "./operators.ts";
export * from "./pipe.ts";
export * from "./utils.ts";
