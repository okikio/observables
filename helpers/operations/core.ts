import type { ExcludeError, Operator } from "../_types.ts";
import { createOperator, createStatefulOperator } from "../operators.ts";
import { ObservableError } from "../../error.ts";

/**
 * @module operations/core
 *
 * **Core Stream Operators - Value-Focused with Error Passthrough**
 *
 * This module contains the core operators for Observable streams. These operators are designed
 * with the principle that **errors should flow through pipelines transparently** while
 * transformations and filtering apply only to actual data values.
 *
 * ## Design Philosophy
 *
 * In most data processing scenarios, you want to:
 * 1. **Transform actual data values** (numbers, objects, strings, etc.)
 * 2. **Preserve error information** without accidentally corrupting it
 * 3. **Keep pipelines clean** without error-handling boilerplate in every operator
 *
 * These operators accomplish this by automatically detecting `ObservableError` instances
 * and passing them through unchanged, while applying your logic only to real data.
 *
 * ## When to Use These Operators
 *
 * **Use these operators (the defaults) when:**
 * - You want to focus on data transformation without worrying about errors
 * - You need errors to flow through your pipeline for downstream error handling
 * - You want type-safe operations that don't require manual error checking
 * - You're building typical data processing pipelines (which is 90% of use cases)
 *
 * @example
 * **Standard Data Processing Pipeline**
 * ```ts
 * import { Observable } from "../../observable.ts";
 * import { pipe } from "../pipe.ts";
 * import { map, filter, take, tap } from "./core.ts";  // These are the core operators
 *
 * // Process a stream that might contain errors
 * const result = pipe(
 *   dataStream,                    // Observable<number | ObservableError>
 *   tap(x => console.log(x)),      // Logs only numbers, errors pass through silently
 *   map(x => x * 2),               // Doubles only numbers, x is type 'number'
 *   filter(x => x > 10),           // Filters only numbers, x is type 'number'
 *   take(5)                        // Takes 5 numbers, all errors still pass through
 * );
 * // Clean, type-safe, no error handling needed in the pipeline
 * ```
 *
 * @example
 * **Comprehensive Comparison: Core vs Strict Operators**
 * ```ts
 * import { Observable } from "../../observable.ts";
 * import { pipe } from "../pipe.ts";
 * import { map, filter, take, tap } from "./core.ts";  // Core operators (value-focused)
 * import { ObservableError } from "../../error.ts";
 *
 * // Create a mixed stream with values and errors
 * const mixedStream = new Observable(observer => {
 *   observer.next(1);
 *   observer.next(new ObservableError("Error 1", "Test error"));
 *   observer.next(2);
 *   observer.next(3);
 *   observer.next(new ObservableError("Error 2", "Test error"));
 *   observer.next(4);
 *   observer.complete();
 * });
 *
 * // CORE OPERATORS - focus on values, errors pass through
 * const corePipeline = pipe(
 *   mixedStream,
 *   tap(x => console.log('Value:', x)),      // Only logs: 1, 2, 3, 4
 *   map(x => x * 2),                         // Only transforms numbers: 2, 4, 6, 8
 *   filter(x => x > 2),                      // Only filters numbers: 4, 6, 8
 *   take(3)                                  // Takes 3 values, all errors pass through
 * );
 * // Output: ObservableError("Error 1"), 4, 6, ObservableError("Error 2"), 8
 * // Clean, type-safe, intuitive
 * ```
 *
 * ## Key Benefits of Core Operators
 *
 * | Aspect | Core Operators | Strict Operators |
 * |--------|----------------|------------------|
 * | **Boilerplate** | None - automatic error passthrough | High - manual error checks |
 * | **Type Safety** | Clean types, no error unions in transform functions | Must handle union types everywhere |
 * | **Counting Logic** | Counts only actual data values | Counts everything including errors |
 * | **Error Preservation** | Guaranteed - errors always pass through | Depends on your implementation |
 * | **Code Readability** | High - focus on business logic | Lower - mixed with error handling |
 * | **Learning Curve** | Low - works like standard operators | Higher - need to understand error patterns |
 *
 * ## Error Handling Patterns
 *
 * While these operators pass errors through, you can still handle them when needed:
 *
 * ```ts
 * import { pipe, map, tap, filter } from "./core.ts";
 * import { ignoreErrors, onlyErrors, mapError } from "./errors.ts";
 *
 * const pipeline = pipe(
 *   source,
 *   map(x => x.value),                    // Transform values
 *   filter(x => x > 0),                   // Filter values
 *   tap(x => console.log('Success:', x)), // Debug values
 *   // Handle errors when you need to:
 *   mapError(err => ({ ...err, handled: true })),  // Transform errors
 *   // Or branch the stream:
 *   fork(
 *     ignoreErrors(),                     // Continue with just values
 *     onlyErrors()                        // Process errors separately
 *   )
 * );
 * ```
 */

/**
 * Transforms each value emitted by the source stream while passing errors through unchanged.
 *
 * ## Overview
 *
 * This is the **standard `map` operator** for Observable streams. It transforms only the actual
 * data values while automatically passing any `ObservableError` instances through unchanged.
 * This gives you clean, type-safe transformations without error-handling boilerplate.
 *
 * Unlike traditional map operations that apply uniformly to all items, this `map` is
 * "error-aware" and focuses on your actual data, letting errors flow naturally through
 * the pipeline for downstream error handling.
 *
 * ## When to Use This
 *
 * **Use this (the default) when:**
 * - You want to transform data values (numbers, strings, objects, etc.)
 * - You need errors to flow through your pipeline unchanged
 * - You want type-safe transformations without manual error checking
 * - You're building standard data processing pipelines (most common case)
 *
 * ## How It Works
 *
 * 1. **Error Detection**: Each emitted value is checked for `ObservableError`
 * 2. **Error Passthrough**: Errors are passed downstream without modification
 * 3. **Value Transformation**: Non-error values are transformed using your function
 * 4. **Type Safety**: Your transform function only receives actual data, never errors
 *
 * ## Type Behavior
 *
 * - **Input**: `Observable<T | ObservableError>`
 * - **Transform Function Input**: `ExcludeError<T>` (clean type, no errors)
 * - **Output**: `Observable<R | ObservableError>`
 *
 * Your projection function gets a clean type and never needs to handle errors.
 *
 * @typeParam T - Type of values from the source stream (may include error union)
 * @typeParam R - Type of values after transformation
 * @param project - Function that transforms data values. Receives only non-error values.
 * @returns A stream operator that transforms values while preserving errors
 *
 * @example
 * **Basic Data Transformation**
 * ```ts
 * import { pipe, map, of } from "./mod.ts";
 *
 * // Transform numbers - clean and simple
 * const doubled = pipe(
 *   of(1, 2, 3, 4, 5),
 *   map(x => x * 2)  // x is guaranteed to be number, no error checking needed
 * );
 * // Output: 2, 4, 6, 8, 10
 * ```
 *
 * @example
 * **Object Transformation**
 * ```ts
 * interface User { id: number; name: string; email: string; }
 * interface UserSummary { id: number; displayName: string; }
 *
 * const summaries = pipe(
 *   userStream,  // Observable<User | ObservableError>
 *   map(user => ({
 *     id: user.id,
 *     displayName: `${user.name} <${user.email.toLowerCase()}>`
 *   }))  // user is guaranteed to be User, never ObservableError
 * );
 * // Clean transformations, errors flow through unchanged
 * ```
 *
 * @example
 * **Mixed Stream with Errors**
 * ```ts
 * import { Observable } from "../../observable.ts";
 * import { ObservableError } from "../../error.ts";
 *
 * const mixedStream = new Observable(observer => {
 *   observer.next(10);
 *   observer.next(new ObservableError("Network timeout", "HTTP_ERROR"));
 *   observer.next(20);
 *   observer.next(30);
 *   observer.complete();
 * });
 *
 * const result = pipe(
 *   mixedStream,
 *   map(x => x * 3)  // Only transforms the numbers: 30, 60, 90
 * );
 * // Output: 30, ObservableError("Network timeout"), 60, 90
 * // Error passes through unchanged, numbers are transformed
 * ```
 *
 * @example
 * **Chaining Multiple Transformations**
 * ```ts
 * const pipeline = pipe(
 *   dataStream,
 *   map(x => x.toString()),        // number -> string
 *   map(s => s.padStart(3, '0')),  // "1" -> "001"
 *   map(s => `ID_${s}`)            // "001" -> "ID_001"
 * );
 * // Each transformation is clean and type-safe
 * // Errors flow through all steps unchanged
 * ```
 *
 * @example
 * **Error Handling When Needed**
 * ```ts
 * import { mapError, ignoreErrors } from "./errors.ts";
 *
 * const robust = pipe(
 *   source,
 *   map(x => x.value),                    // Transform values normally
 *   mapError(err => ({                    // Handle errors when needed
 *     ...err,
 *     context: 'Failed during value extraction'
 *   })),
 *   map(v => v * 2),                      // Continue transforming values
 *   ignoreErrors()                        // Or filter out errors entirely
 * );
 * ```
 *
 * ## Common Patterns
 *
 * **Data extraction and formatting:**
 * ```ts
 * pipe(
 *   apiResponse,
 *   map(response => response.data),
 *   map(data => data.items),
 *   map(items => items.filter(item => item.active))
 * )
 * ```
 *
 * **Safe property access:**
 * ```ts
 * pipe(
 *   userStream,
 *   map(user => user.profile?.avatar?.url || '/default-avatar.png')
 *   // No need to check if user is an error - it's guaranteed not to be
 * )
 * ```
 *
 * ## Performance Notes
 *
 * - **Minimal overhead**: Only one `instanceof` check per emitted value
 * - **No try-catch**: Errors are detected, not caught, so no exception overhead
 * - **Type optimization**: TypeScript can optimize the clean input types
 *
 * ## Comparison with Strict Map
 *
 * ```ts
 * // This operator (clean and simple):
 * map(x => x * 2)
 *
 * // Equivalent strict operator (verbose):
 * mapStrict(x => x instanceof ObservableError ? x : x * 2)
 * ```
 */
export function map<T, R>(
  project: (value: ExcludeError<T>) => R
): Operator<T, R | ObservableError> {
  return createOperator<T, R | ObservableError>({
    name: "map",
    transform(chunk, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      const result = project(chunk as ExcludeError<T>);
      controller.enqueue(result);
    },
  });
}

/**
 * Filters non-error values emitted by the source stream based on a predicate function, while passing errors through unchanged.
 *
 * ## Intent and Purpose
 *
 * The `filterValue` operator is designed to filter only the actual data values in a stream,
 * while letting any `ObservableError` instances pass through untouched. This is different
 * from the regular `filter` operator which applies the predicate to everything, including errors.
 *
 * Think of it as a "smart filter" that knows the difference between real data and error objects,
 * and only applies your predicate function to the real data.
 *
 * ## When to Use This
 *
 * Use `filterValue` when:
 * - You want to filter data but preserve error information exactly as-is
 * - You're working in a pipeline that might contain both values and `ObservableError` objects
 * - You need type-safe filtering that won't accidentally filter out error objects
 * - You want cleaner error handling without checking for errors in your predicate
 *
 * ## How It Works
 *
 * 1. **Error Detection**: Each chunk is checked to see if it's an `ObservableError`
 * 2. **Error Passthrough**: If it's an error, it gets passed downstream unchanged
 * 3. **Value Filtering**: If it's a real value, your predicate function is applied
 * 4. **Conditional Emission**: The value is emitted only if the predicate returns true
 *
 * ## Edge Cases and Gotchas
 *
 * **Error Object Detection**: Only `ObservableError` instances are treated as errors.
 * Regular JavaScript `Error` objects or other falsy values will be passed to your
 * predicate function.
 *
 * **Predicate Errors**: If your `predicate` function throws an error, it will
 * crash the stream. Unlike `filter`, this operator doesn't automatically wrap
 * predicate errors in `ObservableError`.
 *
 * @typeParam T - Type of values from the source stream (includes error union)
 * @param predicate - Function that tests non-error values. Only receives actual data values, never errors.
 * @returns A stream operator that filters values while preserving errors
 *
 * @example
 * **Basic Value Filtering**
 * ```ts
 * import { pipe, filterValue, of } from "./mod.ts";
 *
 * // Filter only the actual numbers, errors pass through
 * const result = pipe(
 *   of(1, 2, 3, 4, 5),
 *   filterValue(x => x % 2 === 0)  // x is guaranteed to be a number
 * );
 * // Output: 2, 4
 * ```
 *
 * @example
 * **Mixed Values and Errors**
 * ```ts
 * import { pipe, filterValue } from "./mod.ts";
 * import { ObservableError } from "../../error.ts";
 *
 * // Create a stream with both values and errors
 * const mixedStream = new Observable(observer => {
 *   observer.next(10);
 *   observer.next(new ObservableError("Something went wrong", "Test error"));
 *   observer.next(5);
 *   observer.next(20);
 *   observer.complete();
 * });
 *
 * const result = pipe(
 *   mixedStream,
 *   filterValue(x => x > 8)  // Only filters the numbers
 * );
 * // Output: 10, ObservableError(...), 20 (5 is filtered out, error passes through)
 * ```
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
 * Limits the stream to emit at most `count` non-error values, while passing errors through unchanged.
 *
 * ## Intent and Purpose
 *
 * The `takeValue` operator is designed to count only the actual data values in a stream,
 * while letting any `ObservableError` instances pass through without counting toward the limit.
 * This is different from the regular `take` operator which counts everything, including errors.
 *
 * Think of it as a "smart take" that knows the difference between real data and error objects,
 * and only counts your actual data values toward the limit.
 *
 * ## When to Use This
 *
 * Use `takeValue` when:
 * - You want to limit the number of actual data values but preserve all error information
 * - You're working in a pipeline that might contain both values and `ObservableError` objects
 * - You need to ensure you get exactly N valid data points, regardless of errors
 * - You want errors to flow through without affecting your data collection logic
 *
 * ## How It Works
 *
 * 1. **Error Detection**: Each chunk is checked to see if it's an `ObservableError`
 * 2. **Error Passthrough**: If it's an error, it gets passed downstream without counting
 * 3. **Value Counting**: If it's a real value, it's emitted and counts toward the limit
 * 4. **Stream Termination**: Once `count` values are emitted, the stream terminates
 *
 * @typeParam T - Type of values from the source stream (includes error union)
 * @param count - The maximum number of non-error values to emit
 * @returns A stream operator that takes at most `count` values while preserving all errors
 *
 * @example
 * **Basic Value Taking**
 * ```ts
 * import { pipe, takeValue, of } from "./mod.ts";
 *
 * // Take only the first 3 actual values, errors don't count
 * const result = pipe(
 *   of(1, 2, 3, 4, 5),
 *   takeValue(3)
 * );
 * // Output: 1, 2, 3
 * ```
 *
 * @example
 * **Mixed Values and Errors**
 * ```ts
 * import { pipe, takeValue } from "./mod.ts";
 * import { ObservableError } from "../../error.ts";
 *
 * // Create a stream with both values and errors
 * const mixedStream = new Observable(observer => {
 *   observer.next(1);
 *   observer.next(new ObservableError("Error 1", "Test error"));
 *   observer.next(2);
 *   observer.next(new ObservableError("Error 2", "Test error"));
 *   observer.next(3);
 *   observer.next(4); // This won't be emitted due to takeValue(3)
 *   observer.complete();
 * });
 *
 * const result = pipe(
 *   mixedStream,
 *   takeValue(3)  // Takes 3 values, but errors still pass through
 * );
 * // Output: 1, ObservableError("Error 1"), 2, ObservableError("Error 2"), 3
 * // Note: 4 is not emitted because we've already taken 3 values
 * ```
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
 * Skips the first `count` non-error values emitted by the source stream, while passing errors through unchanged.
 *
 * ## Intent and Purpose
 *
 * The `dropValue` operator is designed to count only the actual data values in a stream,
 * while letting any `ObservableError` instances pass through without counting toward the skip count.
 * This is different from the regular `drop` operator which counts everything, including errors.
 *
 * Think of it as a "smart drop" that knows the difference between real data and error objects,
 * and only counts your actual data values toward the items to skip.
 *
 * ## When to Use This
 *
 * Use `dropValue` when:
 * - You want to skip a specific number of actual data values but preserve all error information
 * - You're working in a pipeline that might contain both values and `ObservableError` objects
 * - You need to skip N valid data points, regardless of errors in between
 * - You want errors to flow through immediately without affecting your skip logic
 *
 * @typeParam T - Type of values from the source stream (includes error union)
 * @param count - The number of non-error values to skip
 * @returns A stream operator that skips the first `count` values while preserving all errors
 *
 * @example
 * **Basic Value Dropping**
 * ```ts
 * import { pipe, dropValue, of } from "./mod.ts";
 *
 * // Skip the first 2 actual values, errors don't count
 * const result = pipe(
 *   of(1, 2, 3, 4, 5),
 *   dropValue(2)
 * );
 * // Output: 3, 4, 5
 * ```
 *
 * @example
 * **Mixed Values and Errors**
 * ```ts
 * import { pipe, dropValue } from "./mod.ts";
 * import { ObservableError } from "../../error.ts";
 *
 * // Create a stream with both values and errors
 * const mixedStream = new Observable(observer => {
 *   observer.next(1);                                      // Will be dropped
 *   observer.next(new ObservableError("Error 1", "Test error")); // Passes through immediately
 *   observer.next(2);                                      // Will be dropped
 *   observer.next(new ObservableError("Error 2", "Test error")); // Passes through immediately
 *   observer.next(3);                                      // Will be emitted (first non-dropped value)
 *   observer.next(4);                                      // Will be emitted
 *   observer.complete();
 * });
 *
 * const result = pipe(
 *   mixedStream,
 *   dropValue(2)  // Drops first 2 values, but errors still pass through
 * );
 * // Output: ObservableError("Error 1"), ObservableError("Error 2"), 3, 4
 * ```
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
 * Performs an action for each non-error value emitted by the source stream, while passing errors through unchanged.
 *
 * ## Intent and Purpose
 *
 * The `tapValue` operator is designed to perform side effects only on the actual data values in a stream,
 * while letting any `ObservableError` instances pass through without triggering the side effect.
 * This is different from the regular `tap` operator which applies the function to everything, including errors.
 *
 * Think of it as a "smart tap" that knows the difference between real data and error objects,
 * and only applies your side effect function to the real data.
 *
 * ## When to Use This
 *
 * Use `tapValue` when:
 * - You want to log, debug, or perform side effects only on actual data values
 * - You're working in a pipeline that might contain both values and `ObservableError` objects
 * - You need type-safe side effects that won't accidentally process error objects
 * - You want separate handling for debugging values vs. debugging errors
 *
 * @typeParam T - Type of values from the source stream (includes error union)
 * @param fn - Action to perform for each non-error value
 * @returns A stream operator that performs the action on values while preserving errors
 *
 * @example
 * **Basic Value Tapping**
 * ```ts
 * import { pipe, tapValue, of } from "./mod.ts";
 *
 * // Log only the actual values, errors pass through silently
 * const result = pipe(
 *   of(1, 2, 3),
 *   tapValue(x => console.log('Value:', x))  // x is guaranteed to be a number
 * );
 * // Console output: Value: 1, Value: 2, Value: 3
 * // Stream output: 1, 2, 3
 * ```
 *
 * @example
 * **Mixed Values and Errors**
 * ```ts
 * import { pipe, tapValue } from "./mod.ts";
 * import { ObservableError } from "../../error.ts";
 *
 * // Create a stream with both values and errors
 * const mixedStream = new Observable(observer => {
 *   observer.next(10);
 *   observer.next(new ObservableError("Something went wrong", "Test error"));
 *   observer.next(20);
 *   observer.complete();
 * });
 *
 * const result = pipe(
 *   mixedStream,
 *   tapValue(x => console.log('Processing value:', x))  // Only logs actual values
 * );
 * // Console output: Processing value: 10, Processing value: 20
 * // Stream output: 10, ObservableError(...), 20
 * ```
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
 * Accumulates non-error values from the source stream with an accumulator function, while passing errors through unchanged.
 *
 * ## Intent and Purpose
 *
 * The `scanValue` operator is designed to accumulate only the actual data values in a stream,
 * while letting any `ObservableError` instances pass through without affecting the accumulation.
 * This is different from the regular `scan` operator which tries to accumulate everything, including errors.
 *
 * Think of it as a "smart scan" that knows the difference between real data and error objects,
 * and only applies your accumulator function to the real data while maintaining state correctly.
 *
 * ## When to Use This
 *
 * Use `scanValue` when:
 * - You want to build up state from actual data values but preserve error information
 * - You're working in a pipeline that might contain both values and `ObservableError` objects
 * - You need type-safe accumulation that won't accidentally process error objects
 * - You want errors to flow through without corrupting your accumulated state
 *
 * ## How It Works
 *
 * 1. **Error Detection**: Each chunk is checked to see if it's an `ObservableError`
 * 2. **Error Passthrough**: If it's an error, it gets passed downstream without accumulation
 * 3. **Value Accumulation**: If it's a real value, your accumulator function is applied
 * 4. **Result Emission**: The accumulated result is emitted for each successful accumulation
 *
 * @typeParam T - Type of values from the source stream (includes error union)
 * @typeParam R - Type of the accumulated result
 * @param accumulator - Function that combines the current accumulation with each non-error value
 * @param seed - Initial value for the accumulation
 * @returns A stream operator that accumulates values while preserving errors
 *
 * @example
 * **Basic Value Scanning**
 * ```ts
 * import { pipe, scanValue, of } from "./mod.ts";
 *
 * // Accumulate only the actual numbers, errors pass through
 * const result = pipe(
 *   of(1, 2, 3, 4),
 *   scanValue((acc, value) => acc + value, 0)  // value is guaranteed to be a number
 * );
 * // Output: 0, 1, 3, 6, 10
 * ```
 *
 * @example
 * **Mixed Values and Errors**
 * ```ts
 * import { pipe, scanValue } from "./mod.ts";
 * import { ObservableError } from "../../error.ts";
 *
 * // Create a stream with both values and errors
 * const mixedStream = new Observable(observer => {
 *   observer.next(10);
 *   observer.next(new ObservableError("Something went wrong", "Test error"));
 *   observer.next(5);
 *   observer.next(new ObservableError("Another error", "Test error"));
 *   observer.next(3);
 *   observer.complete();
 * });
 *
 * const result = pipe(
 *   mixedStream,
 *   scanValue((acc, value) => acc + value, 0)  // Only accumulates actual values
 * );
 * // Output: 0, 10, ObservableError(...), 15, ObservableError(...), 18
 * // Note: Errors pass through, but accumulation continues correctly (10 + 5 = 15, 15 + 3 = 18)
 * ```
 *
 * @example
 * **State Management with Errors**
 * ```ts
 * interface AppState { count: number; items: string[] }
 *
 * const result = pipe(
 *   actionStream,  // Observable<Action | ObservableError>
 *   scanValue((state, action) => {
 *     // action is guaranteed to be Action, never ObservableError
 *     switch (action.type) {
 *       case 'ADD_ITEM':
 *         return { ...state, items: [...state.items, action.item] };
 *       case 'INCREMENT':
 *         return { ...state, count: state.count + 1 };
 *       default:
 *         return state;
 *     }
 *   }, { count: 0, items: [] })
 * );
 * // State updates only on valid actions, errors flow through without corrupting state
 * ```
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
