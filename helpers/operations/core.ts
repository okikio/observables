import type { ExcludeError, Operator } from "../_types.ts";
import { createOperator, createStatefulOperator } from "../operators.ts";
import { ObservableError } from "../../error.ts";

/**
 * @module operations/core
 *
 * **Core Stream Operators - Like Array Methods, But Error-Aware**
 *
 * These operators work just like Array methods you already know, but automatically handle errors:
 *
 * ```ts
 * // Array methods:
 * [1, 2, 3].map(n => n * 2).filter(n => n > 3)  // [4, 6]
 *
 * // Stream operators (same API, error-aware):
 * pipe(
 *   [1, 2, 3],
 *   map(n => n * 2),      // Transforms data, passes errors through
 *   filter(n => n > 3)    // Filters data, keeps all errors
 * )  // Stream: [4, 6] + any errors
 * ```
 *
 * ## How Error Handling Works
 *
 * - **Data items**: Get processed by your functions normally
 * - **ObservableError items**: Skip processing and flow through unchanged
 * - **Function crashes**: Get wrapped in ObservableError automatically
 *
 * ```ts
 * // Clean code - no manual error checking needed
 * const users = pipe(
 *   userIds,
 *   map(id => fetchUser(id)),        // Some API calls fail → ObservableError
 *   filter(user => user.isActive),   // Only filters real users
 *   take(10)                         // Takes 10 real users, errors flow alongside
 * );
 * ```
 *
 * Your functions only receive clean data, never errors. Errors are preserved for later handling.
 */

/**
 * Transforms each data item, automatically skipping errors.
 *
 * Like `Array.map()`, but errors flow through unchanged:
 *
 * ```ts
 * // Array.map() transforms everything
 * [1, 2, 3].map(n => n * 2)  // [2, 4, 6]
 *
 * // Stream map() transforms only data
 * pipe([1, Error, 3], map(n => n * 2))  // [2, Error, 6]
 * ```
 *
 * Your function only receives clean data, never errors:
 *
 * ```ts
 * pipe(
 *   userIds,
 *   map(id => fetchUser(id)),        // Some API calls fail
 *   map(user => user.name),          // Only runs on real users
 *   map(name => name.toUpperCase())  // Only runs on real names
 * );
 * // Result: [Name, Error, Name] - clean transformations, errors preserved
 * ```
 *
 * @param project - Function that transforms each data item
 */
export function map<T, R>(
  project: (value: ExcludeError<T>, index: number) => R
): Operator<T, R | ObservableError> {
  return createStatefulOperator<T, R | ObservableError, { index: number }>({
    name: "map",
    createState: () => ({ index: 0 }),
    transform(chunk, state, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      const result = project(chunk as ExcludeError<T>, state.index++);
      controller.enqueue(result);
    },
  });
}

/**
 * Keeps data items that pass your test, always preserves errors.
 *
 * Like `Array.filter()`, but errors automatically pass through:
 *
 * ```ts
 * // Array.filter() tests everything
 * [1, 2, 3, 4].filter(n => n > 2)  // [3, 4]
 *
 * // Stream filter() tests only data
 * pipe([1, Error, 3, 4], filter(n => n > 2))  // [Error, 3, 4]
 * ```
 *
 * Your test function only receives clean data:
 *
 * ```ts
 * pipe(
 *   users,
 *   filter(user => user.isActive),       // Only tests real users
 *   filter(user => user.age >= 18)       // Chain multiple filters
 * );
 * // Result: filtered users + all errors preserved
 * ```
 *
 * @param predicate - Test function that decides which data items to keep
 */
export function filter<T>(
  predicate: (value: ExcludeError<T>, index: number) => boolean,
): Operator<T, ExcludeError<T> | ObservableError> {
  return createStatefulOperator<T, ExcludeError<T> | ObservableError, { index: number }>({
    name: "filter",
    createState: () => ({ index: 0 }),
    transform(chunk, state, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      if (predicate(chunk as ExcludeError<T>, state.index++)) {
        controller.enqueue(chunk as ExcludeError<T>);
      }
    },
  });
}

/**
 * Takes the first N data items, errors don't count toward the limit.
 *
 * Like `Array.slice(0, N)`, but counts only successful data:
 *
 * ```ts
 * // Array.slice() counts everything
 * [1, "error", 2, 3].slice(0, 2)  // [1, "error"] - 2 items total
 *
 * // Stream take() counts only data
 * pipe([1, Error, 2, 3], take(2))  // [1, Error, 2] - 2 data items
 * ```
 *
 * Perfect for pagination and "top N" scenarios:
 *
 * ```ts
 * pipe(
 *   productIds,
 *   map(id => fetchProduct(id)),    // Some API calls fail
 *   filter(p => p.rating > 4),      // Only high-rated products
 *   take(10)                        // Exactly 10 products + any errors
 * );
 * // Guarantees 10 actual products for your UI
 * ```
 *
 * Stream stops immediately after collecting N data items.
 *
 * @param count - How many data items to take
 */
export function take<T>(
  count: number,
): Operator<T, ExcludeError<T> | ObservableError> {
  return createStatefulOperator<
    T,
    ExcludeError<T> | ObservableError,
    { taken: number }
  >({
    name: "take",
    createState: () => ({ taken: 0 }),
    transform(chunk, state, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      if (state.taken < count) {
        controller.enqueue(chunk as ExcludeError<T>);
        state.taken++;

        // If we've taken enough values, terminate the stream
        if (state.taken >= count) {
          controller.terminate();
        }
      }
    },
  });
}

/**
 * Skips the first N data items, errors don't count toward the skip count.
 *
 * Like `Array.slice(N)`, but counts only successful data:
 *
 * ```ts
 * // Array.slice() counts everything
 * [1, "error", 2, 3].slice(2)  // [2, 3] - skipped first 2 items
 *
 * // Stream drop() counts only data
 * pipe([1, Error, 2, 3], drop(2))  // [Error, 3] - skipped first 2 data items
 * ```
 *
 * Perfect for pagination - skip to the right page regardless of errors:
 *
 * ```ts
 * // Page 2: skip first 20 successful products
 * pipe(
 *   productIds,
 *   map(id => fetchProduct(id)),    // Some API calls fail
 *   drop(20),                       // Skip first 20 real products
 *   take(20)                        // Next 20 products
 * );
 * // Errors flow through immediately, don't affect page positioning
 * ```
 *
 * @param count - How many data items to skip
 */
export function drop<T>(
  count: number,
): Operator<T, ExcludeError<T> | ObservableError> {
  return createStatefulOperator<
    T,
    ExcludeError<T> | ObservableError,
    { dropped: number }
  >({
    name: "drop",
    createState: () => ({ dropped: 0 }),
    transform(chunk, state, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      if (state.dropped < count) {
        state.dropped++;
      } else {
        controller.enqueue(chunk as ExcludeError<T>);
      }
    },
  });
}

/**
 * Runs side effects on data items, automatically skipping errors.
 *
 * Like adding `console.log()` to debug, but only logs clean data:
 *
 * ```ts
 * // Regular debugging sees everything (messy)
 * data.map(x => { console.log('Item:', x); return transform(x); })
 *
 * // Stream tap() sees only data (clean)
 * pipe(
 *   data,
 *   map(x => transform(x)),
 *   tap(x => console.log('Processed:', x))  // Only logs real data
 * )
 * ```
 *
 * Perfect for logging, analytics, caching, progress tracking:
 *
 * ```ts
 * pipe(
 *   userIds,
 *   map(id => fetchUser(id)),                // Some API calls fail
 *   tap(user => console.log('Loaded:', user.name)),  // Clean logs
 *   tap(user => analytics.track('user_loaded')),     // Business events only
 *   filter(user => user.isActive)
 * );
 * // Logs show only successful operations, errors flow silently
 * ```
 *
 * Data flows through unchanged - `tap` just observes.
 *
 * @param fn - Function to run on each data item (for side effects)
 */
export function tap<T>(
  fn: (value: ExcludeError<T>) => void,
): Operator<T, T | ObservableError> {
  return createOperator<T, T | ObservableError>({
    name: "tap",
    transform(chunk, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      fn(chunk as ExcludeError<T>);
      controller.enqueue(chunk);
    },
  });
}

/**
 * Builds running totals from data, automatically skipping errors.
 *
 * Like `Array.reduce()`, but shows each step and handles errors:
 *
 * ```ts
 * // Array.reduce() gives final result only
 * [1, 2, 3].reduce((sum, n) => sum + n, 0)  // 6
 *
 * // Stream scan() shows progressive results
 * pipe([1, Error, 3], scan((sum, n) => sum + n, 0))  // [0, 1, Error, 4]
 * ```
 *
 * Perfect for running totals, counters, building objects:
 *
 * ```ts
 * pipe(
 *   productIds,
 *   map(id => fetchPrice(id)),              // Some API calls fail
 *   scan((total, price) => total + price, 0) // Running cart total
 * );
 * // Result: [0, 10, Error, 35, 40] - total ignores errors
 * ```
 *
 * Always starts by emitting your initial value immediately.
 *
 * @param accumulator - Function that combines current total with new data
 * @param seed - Starting value (emitted first)
 */
export function scan<T, R>(
  accumulator: (acc: R, value: ExcludeError<T>, index: number) => R,
  seed: R,
): Operator<T, R | ObservableError> {
  return createStatefulOperator<
    T,
    R | ObservableError,
    { acc: R; index: number }
  >({
    name: "scan",
    createState: () => ({ acc: seed, index: 0 }),
    start(state, controller) {
      // Emit the seed value immediately
      controller.enqueue(state.acc);
    },
    transform(chunk, state, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      state.acc = accumulator(
        state.acc,
        chunk as ExcludeError<T>,
        state.index++,
      );
      controller.enqueue(state.acc);
    },
  });
}