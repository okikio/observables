import type { ObservableError } from "./error.ts";
import type { Operator } from "./utils.ts";
import { createOperator, createStatefulOperator } from "./utils.ts";

/**
 * Transforms each value emitted by the source stream.
 * 
 * 
 * The `map` operator applies a projection function to each chunk from the source
 * stream and emits the resulting values. This is similar to Array.prototype.map
 * but operates on streams.
 * 
 * @typeParam T - Type of values from the source stream
 * @typeParam R - Type of values in the result stream
 * @param project - The function to apply to each value
 * @returns A stream operator that maps values
 * 
 * @example
 * ```ts
 * import { pipe, map } from "./helpers/mod.ts";
 * 
 * // Double each number
 * const result = pipe(
 *   sourceStream,
 *   map(x => x * 2)
 * );
 * 
 * // Convert objects to strings
 * const stringified = pipe(
 *   objectStream,
 *   map(obj => JSON.stringify(obj))
 * );
 * ```
 */
export function map<T, R>(project: (value: T, index: number) => R): Operator<T, R | ObservableError> {
  return createStatefulOperator<T, R | ObservableError, { index: number }>({
    name: 'map',
    createState: () => ({ index: 0 }),
    transform(chunk, state, controller) {
      const result = project(chunk, state.index++);
      controller.enqueue(result);
    }
  });
}

/**
 * Filters values emitted by the source stream based on a predicate function.
 * 
 * 
 * The `filter` operator only emits values that pass the specified predicate test.
 * Values that don't pass the test are silently ignored and not emitted.
 * 
 * @typeParam T - Type of values from the source stream
 * @param predicate - The function to test each value
 * @returns A stream operator that filters values
 * 
 * @example
 * ```ts
 * import { pipe, filter } from "./helpers/mod.ts";
 * 
 * // Keep only even numbers
 * const evenNumbers = pipe(
 *   numberStream,
 *   filter(x => x % 2 === 0)
 * );
 * 
 * // Filter out null/undefined values
 * const nonEmpty = pipe(
 *   dataStream,
 *   filter(x => x != null)
 * );
 * ```
 */
export function filter<T>(predicate: (value: T, index: number) => boolean): Operator<T, T | ObservableError> {
  return createStatefulOperator<T, T | ObservableError, { index: number }>({
    name: 'filter',
    createState: () => ({ index: 0 }),
    transform(chunk, state, controller) {
      if (predicate(chunk, state.index++)) {
        controller.enqueue(chunk);
      }
    }
  });
}

/**
 * Limits the stream to emit at most `count` values.
 * 
 * 
 * The `take` operator returns a stream that emits only the first `count`
 * values emitted by the source stream. Once `count` values are emitted,
 * it completes the stream.
 * 
 * @typeParam T - Type of values from the source stream
 * @param count - The maximum number of values to emit
 * @returns A stream operator that takes at most `count` values
 * 
 * @example
 * ```ts
 * import { pipe, take } from "./helpers/mod.ts";
 * 
 * // Take only the first 5 values
 * const first5 = pipe(
 *   sourceStream,
 *   take(5)
 * );
 * ```
 */
export function take<T>(count: number): Operator<T, T | ObservableError> {
  return createStatefulOperator<T, T | ObservableError, { taken: number }>({
    name: 'take',
    createState: () => ({ taken: 0 }),
    transform(chunk, state, controller) {
      if (state.taken < count) {
        controller.enqueue(chunk);
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
 * Skips the first `count` values emitted by the source stream.
 * 
 * 
 * The `drop` operator (also known as `skip` in some libraries) returns a
 * stream that skips the first `count` items emitted by the source stream
 * and emits the remaining items.
 * 
 * @typeParam T - Type of values from the source stream
 * @param count - The number of values to skip
 * @returns A stream operator that skips the first `count` values
 * 
 * @example
 * ```ts
 * import { pipe, drop } from "./helpers/mod.ts";
 * 
 * // Skip the first 10 values
 * const afterFirst10 = pipe(
 *   sourceStream,
 *   drop(10)
 * );
 * ```
 */
export function drop<T>(count: number): Operator<T, T | ObservableError> {
  return createStatefulOperator<T, T | ObservableError, { dropped: number }>({
    name: 'drop',
    createState: () => ({ dropped: 0 }),
    transform(chunk, state, controller) {
      if (state.dropped < count) {
        state.dropped++;
      } else {
        controller.enqueue(chunk);
      }
    }
  });
}

/**
 * Transforms each value from the source stream with an accumulator function,
 * emitting each intermediate result.
 * 
 * 
 * The `scan` operator applies an accumulator function to each value from the source
 * and emits each intermediate accumulated value. This is useful for maintaining
 * and emitting state over time.
 * 
 * @typeParam T - Type of values from the source stream
 * @typeParam R - Type of the accumulated result
 * @param accumulator - Function that combines the current accumulation with each value
 * @param seed - Initial value for the accumulation
 * @returns A stream operator that accumulates values
 * 
 * @example
 * ```ts
 * import { pipe, scan } from "./helpers/mod.ts";
 * 
 * // Running sum
 * const runningSum = pipe(
 *   numberStream,
 *   scan((acc, value) => acc + value, 0)
 * );
 * 
 * // Track state changes
 * const state = pipe(
 *   actionStream,
 *   scan((state, action) => {
 *     switch (action.type) {
 *       case 'INCREMENT':
 *         return { ...state, count: state.count + 1 };
 *       case 'DECREMENT':
 *         return { ...state, count: state.count - 1 };
 *       default:
 *         return state;
 *     }
 *   }, { count: 0 })
 * );
 * ```
 */
export function scan<T, R>(
  accumulator: (acc: R, value: T, index: number) => R,
  seed: R
): Operator<T, R | ObservableError> {
  return createStatefulOperator<T, R | ObservableError, { acc: R, index: number }>({
    name: 'scan',
    createState: () => ({ acc: seed, index: 0 }),
    start(state, controller) {
      // Emit the seed value immediately
      controller.enqueue(state.acc);
    },
    transform(chunk, state, controller) {
      state.acc = accumulator(state.acc, chunk, state.index++);
      controller.enqueue(state.acc);
    }
  });
}

/**
 * Collects all values from the source stream and emits them as a single array
 * when the source completes.
 * 
 * 
 * The `toArray` operator buffers all values emitted by the source stream
 * and emits a single array containing those values when the source completes.
 * 
 * Warning: This operator should only be used with streams that are known
 * to complete and emit a reasonable number of values to avoid memory issues.
 * 
 * @typeParam T - Type of values from the source stream
 * @returns A stream operator that collects values into an array
 * 
 * @example
 * ```ts
 * import { pipe, toArray } from "./helpers/mod.ts";
 * 
 * // Collect all values into a single array
 * const allValuesArray = pipe(
 *   sourceStream,
 *   toArray()
 * );
 * ```
 */
export function toArray<T>(): Operator<T, T[]> {
  return createStatefulOperator<T, T[], T[]>({
    name: 'toArray',
    createState: () => [],
    transform(chunk, state) {
      state.push(chunk);
    },
    flush(state, controller) {
      controller.enqueue(state);
    }
  });
}

/**
 * Batches values from the source stream into arrays of the specified size.
 * 
 * 
 * The `batch` operator collects values from the source stream into arrays
 * of the specified size before emitting them. If the source completes before
 * a batch is filled, the remaining values are emitted as a smaller batch.
 * 
 * @typeParam T - Type of values from the source stream
 * @param size - The size of each batch
 * @returns A stream operator that batches values
 * 
 * @example
 * ```ts
 * import { pipe, batch } from "./helpers/mod.ts";
 * 
 * // Batch values into groups of 3
 * const batched = pipe(
 *   sourceStream, // emits 1, 2, 3, 4, 5, 6, 7, 8
 *   batch(3)
 * );
 * 
 * // Result: [1,2,3], [4,5,6], [7,8]
 * ```
 */
export function batch<T>(size: number): Operator<T, T[]> {
  if (size <= 0) {
    throw new Error('batch: size must be greater than 0');
  }

  return createStatefulOperator<T, T[], T[]>({
    name: 'batch',
    createState: () => [],
    transform(chunk, buffer, controller) {
      buffer.push(chunk);

      if (buffer.length >= size) {
        controller.enqueue([...buffer]);
        buffer.length = 0;
      }
    },
    flush(buffer, controller) {
      if (buffer.length > 0) {
        controller.enqueue([...buffer]);
      }
    }
  });
}

/**
 * Performs an action for each value emitted by the source stream without
 * modifying the values.
 * 
 * 
 * The `tap` operator lets you perform side effects for each emission on the source
 * stream, without modifying the emissions themselves. This is useful for
 * debugging, logging, or triggering side effects.
 * 
 * @typeParam T - Type of values from the source stream
 * @param fn - Action to perform for each value
 * @returns A stream operator that performs the action but passes values through
 * 
 * @example
 * ```ts
 * import { pipe, tap, map } from "./helpers/mod.ts";
 * 
 * // Log values as they pass through
 * const result = pipe(
 *   sourceStream,
 *   tap(x => console.log('Before mapping:', x)),
 *   map(x => x * 2),
 *   tap(x => console.log('After mapping:', x))
 * );
 * ```
 */
export function tap<T>(fn: (value: T) => void): Operator<T, T | ObservableError> {
  return createOperator<T, T | ObservableError>({
    name: 'tap',
    transform(chunk, controller) {
      fn(chunk);
      controller.enqueue(chunk);
    }
  });
}