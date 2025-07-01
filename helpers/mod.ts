// @filename: helpers/mod.ts
/**
 * Observable Operators Library
 * 
 * @module
 * 
 * 
 * This library provides a collection of operators for working with Observables.
 * It enables functional composition of Observable transformations using the `pipe` and
 * `compose` functions, with each operator implemented using Web Streams for efficiency.
 * 
 * ## Core Features
 * 
 * - **Observable-based API**: Clean, familiar API that works with Observables
 * - **Stream-based implementation**: Uses Web Streams internally for efficiency and backpressure
 * - **Functional**: Pure functions for easy composition
 * - **Type-safe**: Full TypeScript support with proper type inference
 * - **Tree-shakable**: Import only what you need
 * 
 * ## Architecture
 * 
 * This library uses a hybrid approach:
 * - The public API (`pipe` function, creation functions, etc.) works with Observables
 * - Internally, it converts Observables to Web Streams, applies transformations, then converts back
 * - This allows for the efficiency of streams while maintaining a familiar Observable API
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
 * // Define reusable operator groups
 * const processNumbers = compose(
 *   filter(x => x % 2 === 0),
 *   map(x => x * 10),
 *   tap(x => console.log('Processed:', x))
 * );
 * 
 * const limitAndFormat = compose(
 *   take(3),
 *   map(x => `Result: ${x}`)
 * );
 * 
 * // Use them in a pipeline
 * const result = pipe(
 *   source,
 *   processNumbers,
 *   limitAndFormat
 * );
 * ```
 * 
 * ## Limitations
 * 
 * - Each pipeline is limited to 9 operators due to TypeScript's recursion limits
 * - Use `compose` to group operators when you need more than 9
 * - Composed operator groups are also limited to 9 operators
 */

// Re-export all operators from their respective modules
export type * from "./_types.ts";

export * from "./operations/mod.ts";
export * from "./operators.ts";
export * from "./pipe.ts";
export * from "./utils.ts";