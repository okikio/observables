import type { ExcludeError, Operator } from "../_types.ts";
import { createOperator, createStatefulOperator } from "../operators.ts";
import { ObservableError } from "../../error.ts";


/**
 * @module 
 * 
 * @example
 * **Comprehensive Comparison: Regular vs Value-based Operators**
 * ```ts
 * import { Observable } from "../../observable.ts";
 * import { pipe } from "../pipe.ts";
 * import { map, filter, take, tap } from "./core.ts";
 * import { mapValue, filterValue, takeValue, tapValue } from "./values.ts";
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
 * // REGULAR OPERATORS - handle everything uniformly
 * const regularPipeline = pipe(
 *   mixedStream,
 *   tap(x => console.log('Regular tap:', typeof x)),  // Logs both numbers and errors
 *   map(x => x instanceof ObservableError ? x : x * 2),  // Manual error handling required
 *   filter(x => x instanceof ObservableError || x > 2),  // Manual error handling required
 *   take(4)  // Takes 4 items total (including errors)
 * );
 * // Output: 1, ObservableError("Error 1"), 4, 6
 * // Note: take(4) stops before reaching Error 2 or the final 4
 * 
 * // VALUE-BASED OPERATORS - handle data and errors separately
 * const valuePipeline = pipe(
 *   mixedStream,
 *   tapValue(x => console.log('Value tap:', x)),  // Only logs numbers
 *   mapValue(x => x * 2),  // Only transforms numbers, no error handling needed
 *   filterValue(x => x > 2),  // Only filters numbers, errors pass through
 *   takeValue(3)  // Takes 3 values, but all errors still pass through
 * );
 * // Output: ObservableError("Error 1"), 4, 6, ObservableError("Error 2"), 8
 * // Note: All errors pass through, but we get exactly 3 transformed values
 * 
 * // HYBRID APPROACH - mix both types for maximum control
 * const hybridPipeline = pipe(
 *   mixedStream,
 *   mapValue(x => x * 10),  // Transform values: 10, 20, 30, 40
 *   filterValue(x => x >= 20),  // Keep values >= 20: 20, 30, 40
 *   takeValue(2),  // Take first 2 matching values: 20, 30
 *   tap(x => {  // Log everything that passes through
 *     if (x instanceof ObservableError) {
 *       console.log('Error:', x.message);
 *     } else {
 *       console.log('Final value:', x);
 *     }
 *   })
 * );
 * // Output: ObservableError("Error 1"), 20, 30, ObservableError("Error 2")
 * // Console: "Error: Error 1", "Final value: 20", "Final value: 30", "Error: Error 2"
 * ```
 * 
 * **Key Differences Summary:**
 * 
 * | Aspect | Regular Operators | Value-based Operators |
 * |--------|------------------|----------------------|
 * | **Error Handling** | Manual in each operator | Automatic passthrough |
 * | **Type Safety** | Must handle union types | Clean types, no errors |
 * | **Counting Logic** | Counts everything | Counts only values |
 * | **Code Complexity** | Higher (error checks) | Lower (no error checks) |
 * | **Error Preservation** | Depends on implementation | Guaranteed |
 * | **Use Case** | When you need to transform errors | When you want to ignore errors |
 */

/**
 * Transforms each non-error value emitted by the source stream, while passing errors through unchanged.
 * 
 * ## Intent and Purpose
 * 
 * The `mapValue` operator is designed to transform only the actual data values in a stream,
 * while letting any `ObservableError` instances pass through untouched. This is different
 * from the regular `map` operator which tries to transform everything, including errors.
 * 
 * Think of it as a "smart map" that knows the difference between real data and error objects,
 * and only applies your transformation function to the real data.
 * 
 * ## When to Use This
 * 
 * Use `mapValue` when:
 * - You want to transform data but preserve error information exactly as-is
 * - You're working in a pipeline that might contain both values and `ObservableError` objects
 * - You need type-safe transformations that won't accidentally modify error objects
 * - You want cleaner error handling without wrapping every transformation in try-catch
 * 
 * ## How It Works
 * 
 * 1. **Error Detection**: Each chunk is checked to see if it's an `ObservableError`
 * 2. **Error Passthrough**: If it's an error, it gets passed downstream unchanged
 * 3. **Value Transformation**: If it's a real value, your transformation function is applied
 * 4. **Result Emission**: The transformed value (or unchanged error) is emitted
 * 
 * ## Behavior and Logic
 * 
 * - **Values**: Your `project` function receives only non-error values with the correct type
 * - **Errors**: `ObservableError` instances bypass your function entirely
 * - **Type Safety**: The input type excludes errors, so you don't need to handle them
 * - **Performance**: No try-catch overhead since errors are detected, not caught
 * 
 * ## Edge Cases and Gotchas
 * 
 * **Type Complexity**: The return type is `R | ObservableError` because the stream can
 * emit either your transformed values OR error objects. This can make downstream type
 * handling more complex.
 * 
 * **Error Object Detection**: Only `ObservableError` instances are treated as errors.
 * Regular JavaScript `Error` objects or other falsy values will be passed to your
 * transformation function.
 * 
 * **Transformation Errors**: If your `project` function throws an error, it will
 * crash the stream. Unlike `map`, this operator doesn't automatically wrap
 * transformation errors in `ObservableError`.
 * 
 * ## Unconventional Behavior
 * 
 * Unlike most operators that treat all input uniformly, `mapValue` has built-in
 * awareness of the error type system. This makes it behave differently from
 * standard functional programming map operations.
 * 
 * The operator essentially creates a "branching" behavior where the same input
 * stream can produce two different types of output depending on the input type.
 * 
 * @typeParam T - Type of values from the source stream (includes error union)
 * @typeParam R - Type of values after transformation
 * @param project - Function that transforms non-error values. Only receives actual data values, never errors.
 * @returns A stream operator that transforms values while preserving errors
 * 
 * @example
 * **Basic Value Transformation**
 * ```ts
 * import { pipe, mapValue, of } from "./mod.ts";
 * 
 * // Transform only the actual numbers, errors pass through
 * const result = pipe(
 *   of(1, 2, 3),
 *   mapValue(x => x * 2)  // x is guaranteed to be a number
 * );
 * // Output: 2, 4, 6
 * ```
 * 
 * @example
 * **Mixed Values and Errors**
 * ```ts
 * import { pipe, mapValue } from "./mod.ts";
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
 *   mapValue(x => `Value: ${x}`)  // Only transforms the numbers
 * );
 * // Output: "Value: 10", ObservableError(...), "Value: 20"
 * ```
 * 
 * @example
 * **Type Safety in Action**
 * ```ts
 * // Your transformation function gets the clean type
 * const processUser = pipe(
 *   userStream,  // Observable<User | ObservableError>
 *   mapValue(user => {
 *     // 'user' is guaranteed to be User, never ObservableError
 *     return {
 *       id: user.id,
 *       name: user.name.toUpperCase(),  // Safe to call string methods
 *       email: user.email.toLowerCase()
 *     };
 *   })
 * );
 * ```
 * 
 * @example
 * **Chaining with Error-Aware Operators**
 * ```ts
 * import { pipe, mapValue, filter, take } from "./mod.ts";
 * 
 * const pipeline = pipe(
 *   dataStream,
 *   mapValue(x => x.value),           // Extract value field
 *   filter(x => x > 0),               // Keep positive values
 *   mapValue(x => Math.sqrt(x)),      // Safe math operation
 *   take(10)
 * );
 * // Errors flow through the entire pipeline unchanged
 * ```
 * 
 * @example
 * **Comparison with Regular Map**
 * ```ts
 * // Regular map - you handle errors yourself
 * const withMap = pipe(
 *   stream,
 *   map(x => {
 *     if (x instanceof ObservableError) return x;  // Manual error handling
 *     return x * 2;  // Transform actual values
 *   })
 * );
 * 
 * // mapValue - errors handled automatically
 * const withMapValue = pipe(
 *   stream,
 *   mapValue(x => x * 2)  // x is never an error, much cleaner
 * );
 * ```
 * 
 * ## Common Pitfalls
 * 
 * **Don't use for error transformation**: If you need to modify error objects,
 * use specialized error operators like `mapErrors` or `catchErrors`.
 * 
 * **Transformation function errors**: Make sure your transformation function
 * doesn't throw, or wrap it in appropriate error handling:
 * 
 * ```ts
 * // Risky - could crash the stream
 * mapValue(x => JSON.parse(x.data))
 * 
 * // Safer - handle potential errors
 * mapValue(x => {
 *   try {
 *     return JSON.parse(x.data);
 *   } catch (err) {
 *     return { error: "Invalid JSON", original: x.data };
 *   }
 * })
 * ```
 * 
 * **Type handling downstream**: Remember that the output type includes both
 * your transformed values AND error objects, so downstream operators need
 * to handle this union type appropriately.
 */
export function mapValue<T, R>(project: (value: ExcludeError<T>) => R): Operator<T, R | ObservableError> {
  return createOperator<T, R | ObservableError>({
    name: 'mapValue',
    transform(chunk, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      const result = project(chunk as ExcludeError<T>);
      controller.enqueue(result);
    }
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
export function filterValue<T>(predicate: (value: ExcludeError<T>, index: number) => boolean): Operator<T, ExcludeError<T> | ObservableError> {
  return createStatefulOperator<T, ExcludeError<T> | ObservableError, { index: number }>({
    name: 'filterValue',
    createState: () => ({ index: 0 }),
    transform(chunk, state, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      if (predicate(chunk as ExcludeError<T>, state.index++)) {
        controller.enqueue(chunk as ExcludeError<T>);
      }
    }
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
export function takeValue<T>(count: number): Operator<T, ExcludeError<T> | ObservableError> {
  return createStatefulOperator<T, ExcludeError<T> | ObservableError, { taken: number }>({
    name: 'takeValue',
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
    }
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
export function dropValue<T>(count: number): Operator<T, ExcludeError<T> | ObservableError> {
  return createStatefulOperator<T, ExcludeError<T> | ObservableError, { dropped: number }>({
    name: 'dropValue',
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
    }
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
export function tapValue<T>(fn: (value: ExcludeError<T>) => void): Operator<T, T | ObservableError> {
  return createOperator<T, T | ObservableError>({
    name: 'tapValue',
    transform(chunk, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      fn(chunk as ExcludeError<T>);
      controller.enqueue(chunk);
    }
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
export function scanValue<T, R>(
  accumulator: (acc: R, value: ExcludeError<T>, index: number) => R,
  seed: R
): Operator<T, R | ObservableError> {
  return createStatefulOperator<T, R | ObservableError, { acc: R, index: number }>({
    name: 'scanValue',
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

      state.acc = accumulator(state.acc, chunk as ExcludeError<T>, state.index++);
      controller.enqueue(state.acc);
    }
  });
}
