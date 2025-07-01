import type { ObservableError } from "../../error.ts";
import type { Operator } from "../_types.ts";
import { createStatefulOperator } from "../operators.ts";

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
export function toArray<T>(): Operator<T, T[] | ObservableError> {
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
export function batch<T>(size: number): Operator<T, T[] | ObservableError> {
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