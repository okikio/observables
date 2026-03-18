// @filename: helpers/mod.ts
/**
 * High-level operator entrypoint for composing Observable pipelines.
 *
 * This is the ergonomic "import most things from one place" surface for the
 * package. It re-exports the pipe/compose helpers, operator builders, utility
 * helpers, and the built-in operator families so callers can build an entire
 * pipeline without remembering which category module each operator lives in.
 *
 * The exports here fall into a few broad groups:
 * - core transformation operators such as `map`, `filter`, `take`, and `scan`
 * - timing operators such as `debounce`, `delay`, `throttle`, and `timeout`
 * - combination operators such as `mergeMap`, `concatMap`, and `switchMap`
 * - batching and error operators for collecting values or recovering from
 *   failures in a stream
 *
 * Everything shares the same Web Streams-based runtime, so backpressure,
 * teardown, and error-mode behavior stay consistent from one operator to the
 * next. Import from `./operations/*` only when you want a narrower entrypoint
 * for discovery or tree-shaken docs. Import from this module when you want the
 * familiar "just give me the operator toolbox" experience.
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
