/**
 * Batching operators trade immediacy for grouped results.
 *
 * They are useful when one downstream action should work on a whole chunk of
 * values rather than on each value separately, such as bulk inserts, report
 * generation, or end-of-stream collection.
 *
 * @module
 */
import type { ExcludeError, Operator } from "../_types.ts";
import type { ObservableError } from "../../error.ts";

import { createStatefulOperator } from "../operators.ts";

/**
 * Collects the entire stream and emits one final array when the source
 * completes.
 *
 * Use it when you know the stream is finite and the full result really needs to
 * be in memory at once. If downstream work can process items incrementally,
 * staying in streaming mode is usually cheaper.
 */
export function toArray<T>(): Operator<
  T | ObservableError,
  T[] | ObservableError
> {
  return createStatefulOperator<T | ObservableError, T[], T[]>({
    name: "toArray",
    createState: () => [],
    transform(chunk, state) {
      state.push(chunk as ExcludeError<T>);
    },
    flush(state, controller) {
      controller.enqueue(state);
    },
  });
}

/**
 * Groups values into arrays of a fixed size.
 *
 * If the source ends before a batch is full, the last partial batch is still
 * emitted.
 *
 * @example Batch three values at a time
 * ```ts
 * import { batch, from, pipe } from "./helpers/mod.ts";
 *
 * const batchedStream = pipe(from([1, 2, 3, 4, 5, 6, 7, 8]), batch(3));
 *
 * for await (const result of batchedStream) {
 *   console.log(result);
 * }
 * ```
 * @param size - The size of each batch
 */
export function batch<T>(
  size: number,
): Operator<T | ObservableError, T[] | ObservableError> {
  if (size <= 0) {
    throw new Error("batch: size must be greater than 0");
  }

  return createStatefulOperator<T | ObservableError, T[], T[]>({
    name: "batch",
    createState: () => [],
    transform(chunk, buffer, controller) {
      buffer.push(chunk as ExcludeError<T>);

      if (buffer.length >= size) {
        controller.enqueue(Array.from(buffer));
        buffer.length = 0;
      }
    },
    flush(buffer, controller) {
      if (buffer.length > 0) {
        controller.enqueue(Array.from(buffer));
      }
    },
  });
}
