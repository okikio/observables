import type { ExcludeError, Operator } from "../_types.ts";
import { ObservableError, isObservableError } from "../../error.ts";
import { createOperator, createStatefulOperator } from "../operators.ts";

/**
 * Removes all errors from the stream, keeping only successful data.
 *
 * Like a filter that only allows non-error values to pass. It's a simple way
 * to clean up a stream when you don't need to handle failures.
 *
 * @example
 * ```ts
 * import { pipe, ignoreErrors, from } from "./helpers/mod.ts";
 *
 * // Array behavior (conceptual)
 * const mixedData = [1, new Error("fail"), 2, 3];
 * const goodData = mixedData.filter(item => !(item instanceof Error)); // [1, 2, 3]
 *
 * // Stream behavior
 * const sourceStream = from([1, new ObservableError("fail"), 2, 3]);
 * const cleanStream = pipe(sourceStream, ignoreErrors()); // Emits 1, 2, 3
 * ```
 *
 * ## Practical Use Case
 *
 * Use `ignoreErrors` when processing a batch of items where some failures are
 * expected and acceptable. For example, fetching a list of URLs where some
 * might be broken. You only want to process the ones that work.
 *
 * ## Key Insight
 *
 * `ignoreErrors` provides a "fire-and-forget" approach to error handling. It's
 * useful for non-critical tasks or when partial success is sufficient.
 *
 * @template T The type of good data in your stream
 * @returns A stream operator that silently removes all errors
 */
export function ignoreErrors<T>(): Operator<T | ObservableError, ExcludeError<T>> {
  return createOperator<T | ObservableError, T>({
    name: 'ignoreErrors',
    ignoreErrors: true,
    transform(chunk, controller) {
      if (!(isObservableError(chunk))) {
        controller.enqueue(chunk as ExcludeError<T>);
      }
      // Errors are silently dropped
    }
  });
}

/**
 * Replaces any error in the stream with a fallback value.
 *
 * Like a `try...catch` block for each item in a stream, but instead of just
 * handling the error, you provide a default value to take its place.
 *
 * @example
 * ```ts
 * import { pipe, catchErrors, from } from "./helpers/mod.ts";
 *
 * // Conceptual equivalent
 * function process(item) {
 *   try {
 *     if (item instanceof Error) throw item;
 *     return item;
 *   } catch {
 *     return "default";
 *   }
 * }
 * const results = [1, new Error("fail")].map(process); // [1, "default"]
 *
 * // Stream behavior
 * const sourceStream = from([1, new ObservableError("fail")]);
 * const safeStream = pipe(sourceStream, catchErrors("default")); // Emits 1, "default"
 * ```
 *
 * ## Practical Use Case
 *
 * Use `catchErrors` to provide a default state or value when an operation
 * fails. For example, if fetching a user's profile fails, you could return a
 * default "Guest" profile instead of letting the error propagate.
 *
 * ## Key Insight
 *
 * `catchErrors` ensures your stream continues with a predictable structure,
 * even when individual operations fail. It maintains the flow of data by
 * substituting errors with safe, default values.
 *
 * @template T The type of data in your stream.
 * @template R The type of the fallback value.
 * @param fallback The value to use whenever an error occurs.
 * @returns A stream operator that replaces errors with a fallback value.
 */
export function catchErrors<T, R>(fallback: R): Operator<T | ObservableError, ExcludeError<T> | R> {
  return createOperator<T | ObservableError, ExcludeError<T> | R>({
    name: 'catchErrors',
    ignoreErrors: false,
    transform(chunk, controller) {
      if (isObservableError(chunk)) {
        controller.enqueue(fallback);
      } else {
        controller.enqueue(chunk as ExcludeError<T>);
      }
    }
  }) as Operator<T | ObservableError, ExcludeError<T> | R>;
}

/**
 * Transforms errors into custom values using a mapping function.
 *
 * This is a more powerful version of `catchErrors`. Instead of a single
 * fallback, you can inspect each error and decide what to replace it with.
 *
 * @example
 * ```ts
 * import { pipe, mapErrors, from } from "./helpers/mod.ts";
 *
 * // Stream behavior
 * const sourceStream = from([
 *   1,
 *   new ObservableError("Not Found"),
 *   new ObservableError("Server Error")
 * ]);
 *
 * const handledStream = pipe(
 *   sourceStream,
 *   mapErrors(err => {
 *     if (err.message === "Not Found") return { status: 404 };
 *     return { status: 500 };
 *   })
 * );
 * // Emits 1, { status: 404 }, { status: 500 }
 * ```
 *
 * ## Practical Use Case
 *
 * Use `mapErrors` to convert different types of errors into meaningful data.
 * For example, a "Not Found" error could be mapped to `null`, while a "Server
 * Error" could be mapped to an object that triggers a retry mechanism.
 *
 * ## Key Insight
 *
 * `mapErrors` treats errors as data. It allows you to create a resilient
 * stream that can intelligently respond to different failure modes without
 * stopping.
 *
 * @template T The type of successful data in your stream.
 * @template E The type your errors will be mapped to.
 * @param errorMapper A function that receives an error and returns a new value.
 * @returns A stream operator that transforms errors.
 */
export function mapErrors<T, E>(
  errorMapper: (error: ObservableError) => E
): Operator<T | ObservableError, ExcludeError<T> | E> {
  return createOperator<T | ObservableError, ExcludeError<T> | E>({
    name: 'mapErrors',
    ignoreErrors: false,
    transform(chunk, controller) {
      if (isObservableError(chunk)) {
        try {
          const mappedError = errorMapper(chunk);
          controller.enqueue(mappedError);
        } catch (mapperError) {
          throw new ObservableError(
            [mapperError, chunk],
            `Your error mapper function threw an error: ${mapperError}`,
            {
              operator: 'mapErrors:mapper',
              value: mapperError,
              cause: chunk,
              tip: 'The function passed to mapErrors threw an error. Check its implementation.'
            }
          );
        }
      } else {
        controller.enqueue(chunk as ExcludeError<T>);
      }
    }
  }) as Operator<T | ObservableError, ExcludeError<T> | E>;
}

/**
 * Keeps only the errors from the stream, discarding successful data.
 *
 * This is the inverse of `ignoreErrors`. It's useful for creating a dedicated
 * error-handling pipeline.
 *
 * @example
 * ```ts
 * import { pipe, onlyErrors, from } from "./helpers/mod.ts";
 *
 * // Stream behavior
 * const sourceStream = from([1, new ObservableError("fail"), 2]);
 * const errorStream = pipe(sourceStream, onlyErrors()); // Emits ObservableError("fail")
 * ```
 *
 * ## Practical Use Case
 *
 * Use `onlyErrors` to separate the error stream from the data stream. You can
 * then log these errors, send them to a monitoring service, or trigger alerts
 * without interfering with the main data processing flow.
 *
 * ## Key Insight
 *
 * `onlyErrors` allows you to create a side-channel for failures, enabling
 * robust monitoring and debugging.
 *
 * @template T The type of data in the source stream.
 * @returns An operator that filters for errors.
 */
export function onlyErrors<T>(): Operator<T | ObservableError, ObservableError> {
  return createOperator<T | ObservableError, ObservableError>({
    name: 'onlyErrors',
    ignoreErrors: false,
    transform(chunk, controller) {
      if (isObservableError(chunk)) {
        controller.enqueue(chunk);
      }
      // Good data is discarded
    }
  });
}

/**
 * Summarizes the stream into a final count of successes and errors.
 *
 * This operator waits for the stream to complete and then emits a single
 * object with the total counts.
 *
 * @example
 * ```ts
 * import { pipe, summarizeErrors, from } from "./helpers/mod.ts";
 *
 * // Stream behavior
 * const sourceStream = from([1, new ObservableError("fail"), 2, 3]);
 * const summary = await pipe(sourceStream, summarizeErrors()).toPromise();
 * // { successCount: 3, errorCount: 1, totalProcessed: 4, successRate: 0.75 }
 * ```
 *
 * ## Practical Use Case
 *
 * Use `summarizeErrors` at the end of a batch processing job to get a report
 * on how many items were processed successfully and how many failed. This is

 * useful for logging, monitoring, and generating reports.
 *
 * ## Key Insight
 *
 * `summarizeErrors` is a terminal operator that provides a high-level overview
 * of a stream's health and completeness.
 *
 * @template T The type of data in the source stream.
 * @returns An operator that emits a summary of successes and errors.
 */
export function summarizeErrors<T>(): Operator<T | ObservableError, {
  successCount: number;
  errorCount: number;
  totalProcessed: number;
  successRate: number;
}> {
  return createStatefulOperator<T | ObservableError,
    {
      successCount: number;
      errorCount: number;
      totalProcessed: number;
      successRate: number;
    },
    { successCount: number, errorCount: number }
  >({
    name: 'summarizeErrors',
    ignoreErrors: true,
    createState: () => ({ successCount: 0, errorCount: 0 }),
    transform(chunk, state) {
      if (isObservableError(chunk)) {
        state.errorCount++;
      } else {
        state.successCount++;
      }
    },
    flush(state, controller) {
      const total = state.successCount + state.errorCount;
      controller.enqueue({
        successCount: state.successCount,
        errorCount: state.errorCount,
        totalProcessed: total,
        successRate: total > 0 ? state.successCount / total : 0
      });
    }
  });
}

/**
 * Performs a side effect for each error without modifying the stream.
 *
 * Like `Array.prototype.forEach` but only for errors. It's useful for logging
 * or debugging without altering the data flow.
 *
 * @example
 * ```ts
 * import { pipe, tapError, from } from "./helpers/mod.ts";
 *
 * // Stream behavior
 * const sourceStream = from([1, new ObservableError("fail")]);
 * const tappedStream = pipe(
 *   sourceStream,
 *   tapError(err => console.error("Found an error:", err))
 * );
 * // Logs the error, then emits 1 and the error object.
 * ```
 *
 * ## Practical Use Case
 *
 * Use `tapError` to log errors to the console or a monitoring service as they
 * happen, without stopping or changing the stream. This is invaluable for
 * real-time debugging.
 *
 * ## Key Insight
 *
 * `tapError` gives you a window into the stream's errors without affecting the
 * stream itself.
 *
 * @template T The type of data in the stream.
 * @param sideEffect A function to call for each error.
 * @returns An operator that performs a side effect on errors.
 */
export function tapError<T>(
  sideEffect: (error: ObservableError) => void
): Operator<T | ObservableError, T | ObservableError> {
  return createOperator<T | ObservableError, T | ObservableError>({
    name: 'tapError',
    transform(chunk, controller) {
      try {
        if (isObservableError(chunk)) {
          sideEffect(chunk);
        }
      } catch (err) { throw err; }
      finally {
        controller.enqueue(chunk);
      }
    }
  });
}

/**
 * Emits a default value if the source stream completes without emitting any
 * values.
 *
 * If the stream emits any item (even `null` or `undefined`), the default value
 * is not used.
 *
 * @example
 * ```ts
 * import { pipe, orDefault, from } from "./helpers/mod.ts";
 *
 * // Stream behavior
 * const emptyStream = from([]);
 * const defaultStream = pipe(emptyStream, orDefault("default")); // Emits "default"
 *
 * const nonEmptyStream = from([1]);
 * const resultStream = pipe(nonEmptyStream, orDefault("default")); // Emits 1
 * ```
 *
 * ## Practical Use Case
 *
 * Use `orDefault` to ensure that a stream always produces at least one value,
 * which can simplify downstream logic. For example, if a database query
 * returns no results, you can provide a default empty array.
 *
 * ## Key Insight
 *
 * `orDefault` prevents a stream from being "empty" and guarantees a value,
 * making subsequent operations more predictable.
 *
 * @template T The type of data in the stream.
 * @template R The type of the default value.
 * @param defaultValue The value to emit if the stream is empty.
 * @returns An operator that provides a default value for an empty stream.
 */