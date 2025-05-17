import { ObservableError } from "./error.ts";
import type { Operator } from "./utils.ts";
import { createStatefulOperator } from "./utils.ts";

/**
 * Emits values from the source stream until a notifier stream emits or completes.
 * 
 * @remarks
 * The `takeUntil` operator creates a stream that mirrors the source stream,
 * but stops emitting values when the notifier stream emits any value or completes.
 * 
 * This is particularly useful for:
 * - Creating cancellable operations
 * - Limiting streams based on external events
 * - Managing subscription lifetimes in component lifecycles
 * 
 * @typeParam T - Type of values from the source stream
 * @typeParam R - Type of values from the notifier stream (not used)
 * @param notifier - The stream whose emissions or completion will stop the output
 * @returns A stream operator that takes values until the notifier emits
 * 
 * @example
 * ```ts
 * import { pipe, takeUntil } from "./helpers/mod.ts";
 * 
 * // Component cleanup pattern
 * const destroy$ = new ReadableStream({
 *   start(controller) {
 *     // Called when component is destroyed
 *     onDestroy(() => controller.enqueue(undefined));
 *   }
 * });
 * 
 * // Auto-cancelling subscription
 * const data = pipe(
 *   dataStream,
 *   takeUntil(destroy$)
 * );
 * ```
 */
export function takeUntil<T, R>(notifier: ReadableStream<R>): Operator<T, T> {
  return (source: ReadableStream<T>): ReadableStream<T> => {
    let sourceReader: ReadableStreamDefaultReader<T>;
    let notifierReader: ReadableStreamDefaultReader<R>;
    let resultController: ReadableStreamDefaultController<T>;
    let isCancelled = false;

    // Create the resulting stream
    return new ReadableStream<T>({
      start(controller) {
        resultController = controller;

        // Set up the readers
        sourceReader = source.getReader();
        notifierReader = notifier.getReader();

        // Start reading from both streams
        readSource();
        readNotifier();
      },

      cancel() {
        isCancelled = true;

        // Clean up readers
        sourceReader.releaseLock();
        notifierReader.releaseLock();
      }
    });

    // Function to read from the source stream
    function readSource() {
      if (isCancelled) return;

      sourceReader.read().then(({ done, value }) => {
        if (done || isCancelled) return;

        // Forward the value
        resultController.enqueue(value);

        // Continue reading
        readSource();
      }).catch(err => {
        resultController.error(err);
      });
    }

    // Function to read from the notifier stream
    function readNotifier() {
      if (isCancelled) return;

      notifierReader.read().then(({ done, value }) => {
        if (isCancelled) return;

        // If the notifier emits any value or completes, close the result stream
        if (done || value !== undefined) {
          isCancelled = true;
          resultController.close();
          sourceReader.releaseLock();
          notifierReader.releaseLock();
          return;
        }

        // Continue reading from the notifier
        readNotifier();
      }).catch(err => {
        // If the notifier errors, propagate the error
        resultController.error(err);
      });
    }
  };
}

/**
 * Tests whether all values emitted by the source stream satisfy a predicate.
 * 
 * @remarks
 * The `every` operator creates a stream that emits a single boolean value: 
 * - `true` if all values from the source stream pass the predicate function
 * - `false` as soon as any value fails the predicate
 * 
 * The resulting stream completes immediately after emitting its single value.
 * 
 * @typeParam T - Type of values from the source stream
 * @param predicate - Function to test each value
 * @returns A stream operator that tests all values
 * 
 * @example
 * ```ts
 * import { pipe, every } from "./helpers/mod.ts";
 * 
 * // Check if all numbers are positive
 * const allPositive = pipe(
 *   numberStream,
 *   every(n => n > 0)
 * );
 * 
 * // Result will be a stream that emits true if all numbers are positive,
 * // or false as soon as a non-positive number is encountered
 * ```
 */
export function every<T>(predicate: (value: T, index: number) => boolean): Operator<T, boolean | ObservableError> {
  return createStatefulOperator<T, boolean | ObservableError, { index: number, finished: boolean }>({
    createState: () => ({ index: 0, finished: false }),

    transform(chunk, state, controller) {
      if (state.finished) return;

      try {
        const result = predicate(chunk, state.index++);

        // If the predicate fails, emit false and complete
        if (!result) {
          state.finished = true;
          controller.enqueue(false);
          controller.terminate();
        }
      } catch (err) {
        controller.enqueue(ObservableError.from(err, "operator:every"));
      }
    },

    // If the stream completes and we haven't emitted yet, emit true
    flush(state, controller) {
      if (!state.finished) {
        controller.enqueue(true);
      }
    }
  });
}

/**
 * Tests whether any value emitted by the source stream satisfies a predicate.
 * 
 * @remarks
 * The `some` operator creates a stream that emits a single boolean value:
 * - `true` as soon as any value from the source stream passes the predicate
 * - `false` if the source completes without any value passing the predicate
 * 
 * The resulting stream completes immediately after emitting its single value.
 * 
 * @typeParam T - Type of values from the source stream
 * @param predicate - Function to test each value
 * @returns A stream operator that tests for any matching value
 * 
 * @example
 * ```ts
 * import { pipe, some } from "./helpers/mod.ts";
 * 
 * // Check if any number is negative
 * const hasNegative = pipe(
 *   numberStream,
 *   some(n => n < 0)
 * );
 * 
 * // Result will be a stream that emits true as soon as a negative number
 * // is encountered, or false if the stream completes with no negative numbers
 * ```
 */
export function some<T>(predicate: (value: T, index: number) => boolean): Operator<T, boolean | ObservableError> {
  return createStatefulOperator<T, boolean | ObservableError, { index: number, finished: boolean }>({
    createState: () => ({ index: 0, finished: false }),

    transform(chunk, state, controller) {
      if (state.finished) return;

      try {
        const result = predicate(chunk, state.index++);

        // If the predicate passes, emit true and complete
        if (result) {
          state.finished = true;
          controller.enqueue(true);
          controller.terminate();
        }
      } catch (err) {
        controller.enqueue(ObservableError.from(err, "operator:some"));
      }
    },

    // If the stream completes and we haven't emitted yet, emit false
    flush(state, controller) {
      if (!state.finished) {
        controller.enqueue(false);
      }
    }
  });
}

/**
 * Emits the first value from the source stream that satisfies a predicate.
 * 
 * @remarks
 * The `find` operator searches for an element in the stream that matches
 * the specified predicate function. It emits the first value that satisfies
 * the predicate, then completes without checking further values.
 * 
 * @typeParam T - Type of values from the source stream
 * @param predicate - Function to test each value
 * @returns A stream operator that finds the first matching value
 * 
 * @example
 * ```ts
 * import { pipe, find } from "./helpers/mod.ts";
 * 
 * // Find the first even number
 * const firstEven = pipe(
 *   numberStream,
 *   find(n => n % 2 === 0)
 * );
 * 
 * // Result will be a stream that emits only the first even number
 * // encountered, then completes
 * ```
 */
export function find<T>(predicate: (value: T, index: number) => boolean): Operator<T, T | ObservableError> {
  return createStatefulOperator<T, T | ObservableError, { index: number }>({
    createState: () => ({ index: 0 }),

    transform(chunk, state, controller) {
      try {
        const result = predicate(chunk, state.index++);

        // If the predicate passes, emit the value and complete
        if (result) {
          controller.enqueue(chunk);
          controller.terminate();
        }
      } catch (err) {
        controller.enqueue(ObservableError.from(err, "operator:find"));
      }
    }
  });
}