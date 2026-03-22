/**
 * Error operators decide what should happen after a stage fails.
 *
 * In pass-through mode, a thrown error can keep moving downstream as an
 * `ObservableError` value.
 *
 * ```text
 * ordinary value -> map() -> filter() -> consumer
 * thrown error   -> ObservableError -> catchErrors()/ignoreErrors()/throwErrors()
 * ```
 *
 * These operators decide what should happen next: drop the failure, replace
 * it, inspect it, count it, or throw it.
 *
 * @module
 */
import type { ExcludeError, Operator } from "../_types.ts";
import { isObservableError, ObservableError } from "../../error.ts";
import { createOperator, createStatefulOperator } from "../operators.ts";

/**
 * Removes wrapped failures and keeps only successful values.
 *
 * @example Drop failed values
 * ```ts
 * import { ObservableError, from, ignoreErrors, pipe } from "./helpers/mod.ts";
 *
 * const sourceStream = from([
 *   1,
 *   ObservableError.from(new Error("fail"), "example"),
 *   2,
 *   3,
 * ]);
 *
 * const cleanStream = pipe(sourceStream, ignoreErrors());
 * ```
 */
export function ignoreErrors<T>(): Operator<
  T | ObservableError,
  ExcludeError<T>
> {
  return createOperator<T | ObservableError, T>({
    name: "ignoreErrors",
    errorMode: "ignore",
    transform(chunk, controller) {
      controller.enqueue(chunk as ExcludeError<T>);
    },
  });
}

/**
 * Replaces each wrapped failure with a fallback value.
 *
 * @example Fall back to a default value
 * ```ts
 * import { ObservableError, catchErrors, from, pipe } from "./helpers/mod.ts";
 *
 * const sourceStream = from([
 *   1,
 *   ObservableError.from(new Error("fail"), "example"),
 * ]);
 *
 * const safeStream = pipe(sourceStream, catchErrors("default"));
 * ```
 */
export function catchErrors<T, R>(
  fallback: R,
): Operator<T | ObservableError, ExcludeError<T> | R> {
  return createOperator<T | ObservableError, ExcludeError<T> | R>({
    name: "catchErrors",
    errorMode: "manual",
    transform(chunk, controller) {
      if (isObservableError(chunk)) {
        controller.enqueue(fallback);
      } else {
        controller.enqueue(chunk as ExcludeError<T>);
      }
    },
  });
}

/**
 * Turns each wrapped failure into a new value.
 *
 * @example Map failures to status objects
 * ```ts
 * import { ObservableError, from, mapErrors, pipe } from "./helpers/mod.ts";
 *
 * const sourceStream = from([
 *   1,
 *   ObservableError.from(new Error("Not Found"), "lookup"),
 *   ObservableError.from(new Error("Server Error"), "lookup"),
 * ]);
 *
 * const handledStream = pipe(
 *   sourceStream,
 *   mapErrors((err) => {
 *     if (err.message === "Not Found") return { status: 404 };
 *     return { status: 500 };
 *   }),
 * );
 * ```
 */
export function mapErrors<T, E>(
  errorMapper: (error: ObservableError) => E,
): Operator<T | ObservableError, ExcludeError<T> | E> {
  return createOperator<T | ObservableError, ExcludeError<T> | E>({
    name: "mapErrors",
    errorMode: "manual",
    transform(chunk, controller) {
      if (isObservableError(chunk)) {
        try {
          const mappedError = errorMapper(chunk);
          controller.enqueue(mappedError);
        } catch (mapperError) {
          controller.error(
            new ObservableError(
              [mapperError, chunk],
              `Your error mapper function threw an error: ${mapperError}`,
              {
                operator: "operator:mapErrors:mapper",
                value: mapperError,
                cause: chunk,
                tip:
                  "The function passed to mapErrors threw an error. Check its implementation.",
              },
            ),
          );
        }
      } else {
        controller.enqueue(chunk as ExcludeError<T>);
      }
    },
  });
}

/**
 * Keeps only wrapped failures and drops successful values.
 *
 * @example Split failures into their own stream
 * ```ts
 * import { ObservableError, from, onlyErrors, pipe } from "./helpers/mod.ts";
 *
 * const sourceStream = from([
 *   1,
 *   ObservableError.from(new Error("fail"), "example"),
 *   2,
 * ]);
 *
 * const errorStream = pipe(sourceStream, onlyErrors());
 * ```
 */
export function onlyErrors<T>(): Operator<
  T | ObservableError,
  ObservableError
> {
  return createOperator<T | ObservableError, ObservableError>({
    name: "onlyErrors",
    errorMode: "manual",
    transform(chunk, controller) {
      if (isObservableError(chunk)) {
        controller.enqueue(chunk);
      }
    },
  });
}

/**
 * Counts how many values succeeded and how many failed.
 *
 * @example Build a final summary
 * ```ts
 * import { ObservableError, from, pipe, summarizeErrors } from "./helpers/mod.ts";
 *
 * const sourceStream = from([
 *   1,
 *   ObservableError.from(new Error("fail"), "example"),
 *   2,
 *   3,
 * ]);
 *
 * const summary = await pipe(sourceStream, summarizeErrors()).toPromise();
 * ```
 */
export function summarizeErrors<T>(): Operator<T | ObservableError, {
  successCount: number;
  errorCount: number;
  totalProcessed: number;
  successRate: number;
}> {
  return createStatefulOperator<T | ObservableError, {
    successCount: number;
    errorCount: number;
    totalProcessed: number;
    successRate: number;
  }, { successCount: number; errorCount: number }>({
    name: "summarizeErrors",
    errorMode: "manual",
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
        successRate: total > 0 ? state.successCount / total : 0,
      });
    },
  });
}

/**
 * Runs side effects for failures without changing the stream.
 *
 * @example Log each failure and keep going
 * ```ts
 * import { ObservableError, from, pipe, tapError } from "./helpers/mod.ts";
 *
 * const sourceStream = from([
 *   1,
 *   ObservableError.from(new Error("fail"), "example"),
 * ]);
 *
 * const tappedStream = pipe(
 *   sourceStream,
 *   tapError((err) => console.error("Found an error:", err)),
 * );
 * ```
 */
export function tapError<T>(
  sideEffect: (error: ObservableError) => void,
): Operator<T | ObservableError, T | ObservableError> {
  return createOperator<T | ObservableError, T | ObservableError>({
    name: "tapError",
    errorMode: "manual",
    transform(chunk, controller) {
      try {
        if (isObservableError(chunk)) {
          sideEffect(chunk);
        }
      } catch (_) {
        /* no empty */
      } finally {
        controller.enqueue(chunk);
      }
    },
  });
}

/**
 * Throws as soon as a wrapped failure appears.
 *
 * @example Stop on the first failure
 * ```ts
 * import { ObservableError, from, pipe, throwErrors } from "./helpers/mod.ts";
 *
 * const sourceStream = from([
 *   1,
 *   ObservableError.from(new Error("fail"), "example"),
 *   2,
 * ]);
 *
 * const throwingStream = pipe(sourceStream, throwErrors());
 *
 * for await (const item of throwingStream) {
 *   console.log(item);
 * }
 * ```
 */
export function throwErrors<T>(): Operator<T | ObservableError, T> {
  return createOperator({
    name: "throwErrors",
    errorMode: "throw",
    transform(chunk, controller) {
      controller.enqueue(chunk as T);
    },
  });
}
