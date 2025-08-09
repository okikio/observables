import type { ExcludeError, Operator } from "../_types.ts";
import type { ObservableError } from "../../error.ts";

import { createStatefulOperator } from "../operators.ts";

/**
 * Collects all values from the source stream and emits them as a single array
 * when the source completes.
 *
 * Like `Array.prototype.slice()` for the whole stream, but delivered as a
 * single chunk when the stream is done.
 *
 * @example
 * ```ts
 * import { pipe, toArray } from "../../mod.ts";
 * import { from } from "../../../observable.ts";
 *
 * // Array behavior
 * const fullArray = [1, 2, 3, 4, 5]; // [1, 2, 3, 4, 5]
 *
 * // Stream behavior
 * const sourceStream = from([1, 2, 3, 4, 5]);
 * const resultObservable = pipe(
 *   sourceStream,
 *   toArray()
 * );
 *
 * for await (const result of resultObservable) {
 *   console.log(result); // [1, 2, 3, 4, 5]
 * }
 * ```
 *
 * ## Practical Use Case
 *
 * Use `toArray` when you need to gather all results from a stream before
 * processing them, such as aggregating data for a final report or waiting for
 * all parallel operations to complete.
 *
 * **Warning**: This operator should only be used with streams that are known
 * to complete and emit a reasonable number of values to avoid memory issues.
 *
 * ## Key Insight
 *
 * `toArray` converts a stream back into a promise that resolves with an array,
 * making it a bridge between asynchronous streams and synchronous array processing.
 *
 * @typeParam T - Type of values from the source stream
 * @returns A stream operator that collects values into an array
 */
export function toArray<T>(): Operator<T | ObservableError, T[] | ObservableError> {
  return createStatefulOperator<T | ObservableError, T[], T[]>({
    name: "toArray",
    createState: () => [],
    transform(chunk, state) {
      // If chunk is an error, we should not push it to the array
      state.push(chunk as ExcludeError<T>); // Ensure chunk is not an error
    },
    flush(state, controller) {
      controller.enqueue(state);
    },
  });
}

/**
 * Batches values from the source stream into arrays of a specified size.
 *
 * Like a chunking utility, it groups items into fixed-size arrays, but for
 * async streams. If the stream ends before a batch is full, it emits the
 * partial batch.
 *
 * @example
 * ```ts
 * import { pipe, batch } from "../../mod.ts";
 * import { from } from "../../../observable.ts";
 *
 * // No direct Array equivalent, but conceptually like chunking:
 * const data = [1, 2, 3, 4, 5, 6, 7, 8];
 * // Manual chunking: [[1, 2, 3], [4, 5, 6], [7, 8]]
 *
 * // Stream behavior
 * const sourceStream = from(data);
 * const batchedStream = pipe(
 *   sourceStream,
 *   batch(3)
 * );
 *
 * for await (const result of batchedStream) {
 *   console.log(result);
 * }
 * // Resulting chunks: [1,2,3], [4,5,6], [7,8]
 * ```
 *
 * ## Practical Use Case
 *
 * Use `batch` to process items in bulk, such as sending data to an API that
 * accepts multiple records at once, or inserting records into a database in
 * transactions. This is often more efficient than processing items one by one.
 *
 * ## Key Insight
 *
 * `batch` helps manage load on downstream systems by reducing the number of
 * individual processing requests, turning a chatty stream into a more
 * efficient, chunky one.
 *
 * @typeParam T - Type of values from the source stream
 * @param size - The size of each batch
 * @returns A stream operator that batches values
 */
export function batch<T>(size: number): Operator<T | ObservableError, T[] | ObservableError> {
  if (size <= 0) {
    throw new Error('batch: size must be greater than 0');
  }

  return createStatefulOperator<T | ObservableError, T[], T[]>({
    name: 'batch',
    createState: () => [],
    transform(chunk, buffer, controller) {
      // If chunk is an error, we should not push it to the buffer
      buffer.push(chunk as ExcludeError<T>); // Ensure chunk is not an error

      if (buffer.length >= size) {
        controller.enqueue(Array.from(buffer));
        buffer.length = 0;
      }
    },
    flush(buffer, controller) {
      if (buffer.length > 0) {
        controller.enqueue(Array.from(buffer));
      }
    }
  });
}