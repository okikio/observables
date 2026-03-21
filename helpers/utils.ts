import type {
  ObservableInputLike,
  ObservableOperatorInterop,
  TransformFunctionOptions,
  StreamPair,
  TransformStreamOptions,
} from "./_types.ts";
import type { CreateOperatorOptions, Operator } from "./_types.ts";
import { ObservableError } from "../error.ts";
import { Observable } from "../observable.ts";

/**
 * Type guard to check if options is a TransformStreamOptions
 *
 * This checks if the options object has a 'stream' property,
 * indicating it is using an existing TransformStream.
 *
 * @typeParam T - Input type
 * @typeParam R - Output type
 * @param options - The options object to check
 * @returns True if options is TransformStreamOptions, false otherwise
 */
export function isTransformStreamOptions<T, R>(
  options: CreateOperatorOptions<T, R>,
): options is TransformStreamOptions<T, R> {
  return "stream" in options;
}

/**
 * Type guard to check if options is a TransformFunctionOptions
 *
 * This checks if the options object has a 'transform' property,
 * indicating it is using a custom transformation function.
 *
 * @typeParam T - Input type
 * @typeParam R - Output type
 * @param options - The options object to check
 * @returns True if options is TransformFunctionOptions, false otherwise
 */
export function isTransformFunctionOptions<T, R>(
  options: CreateOperatorOptions<T, R>,
): options is TransformFunctionOptions<T, R> {
  return "transform" in options;
}

/**
 * Applies an operator to a ReadableStream, handling errors gracefully.
 *
 * This function attempts to apply the given operator to the input stream.
 * If the operator throws an error, it injects that error into the stream
 * using `injectError`, allowing downstream consumers to handle it.
 *
 * @param input - The ReadableStream to apply the operator to
 * @param operator - The operator function to apply
 * @param message - Optional message for error context
 * @returns A new ReadableStream with the operator applied or an error injected
 */
export function applyOperator(
  input: ReadableStream<unknown>,
  // deno-lint-ignore no-explicit-any
  operator: Operator<any, any>,
  { message = `pipe:operator` } = {},
): ReadableStream<unknown> {
  try {
    const result = operator(input);
    return result;
  } catch (err) {
    return input.pipeThrough(injectError(err, message));
  }
}

/**
 * Creates a ReadableStream from an iterable or async iterable
 *
 * This utility function creates a ReadableStream from any iterable or async iterable,
 * such as arrays, generators, or custom iterables.
 *
 * @typeParam T - Type of values in the iterable
 * @param iterable - The iterable or async iterable to convert
 * @returns A ReadableStream that emits values from the iterable
 *
 * @example
 * ```ts
 * import { fromIterable, pipe, map } from "./helpers/mod.ts";
 *
 * // Create a stream from an array
 * const numbers = fromIterable([1, 2, 3, 4, 5]);
 *
 * // Create a stream from a generator
 * function* generateNumbers() {
 *   for (let i = 0; i < 5; i++) {
 *     yield i;
 *   }
 * }
 * const generated = fromIterable(generateNumbers());
 *
 * // Process with operators
 * const result = pipe(
 *   numbers,
 *   map(x => x * 2)
 * );
 * ```
 */
export function toStream<T>(
  iterable: Iterable<T> | AsyncIterable<T>,
): ReadableStream<T | ObservableError> {
  // Check if it's an async iterable
  const isAsync =
    typeof (iterable as AsyncIterable<T>)[Symbol.asyncIterator] === "function";

  return new ReadableStream<T | ObservableError>({
    async start(controller) {
      try {
        if (isAsync) {
          for await (const item of iterable as AsyncIterable<T>) {
            controller.enqueue(item);
          }
        } else {
          for (const item of iterable as Iterable<T>) {
            controller.enqueue(item);
          }
        }

        try {
          controller.close();
        } catch {
          // Downstream may already be closed or errored.
        }
      } catch (err) {
        try {
          controller.enqueue(ObservableError.from(err, "toStream"));
          controller.close();
        } catch {
          // If downstream is already unavailable, the original failure has
          // already decided the stream outcome. Do not surface a second error.
        }
      }
    },
  });
}

/**
 * Adapts a readable/writable stream pair into an Observable operator.
 *
 * Some platform transforms, such as `CompressionStream`, expose a writable side
 * and a readable side without being created through this library's operator
 * builders. This helper turns that pair into a normal `Operator` so it can be
 * used inside `pipe()` like any built-in operator.
 *
 * A fresh pair is created for each operator application. That preserves the
 * cold semantics of the surrounding Observable pipeline and avoids reusing a
 * consumed stream pair across subscriptions.
 *
 * @typeParam TIn - Chunk type written into the pair
 * @typeParam TOut - Chunk type read from the pair
 * @param createPair - Factory that returns a fresh readable/writable pair
 * @returns An operator that pipes input through the created pair
 *
 * @example
 * ```ts
 * const gzip = fromStreamPair<Uint8Array, Uint8Array>(
 *   () => new CompressionStream('gzip')
 * );
 * ```
 */
export function fromStreamPair<TIn, TOut>(
  createPair: () => StreamPair<TIn, TOut>,
): Operator<TIn, TOut> {
  return (source) => source.pipeThrough(createPair());
}

/**
 * Wraps a `ReadableStream` as an Observable so foreign Observable-style
 * operators can subscribe to it directly.
 *
 * This avoids first converting the stream into an async-iterable Observable via
 * `Observable.from()`, which would add an extra adaptation layer before the
 * foreign operator even starts running.
 */
export function streamAsObservable<T>(stream: ReadableStream<T>): Observable<T> {
  return new Observable<T>((observer) => {
    const reader = stream.getReader();
    let cancelled = false;

    void (async () => {
      try {
        while (!cancelled && !observer.closed) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          observer.next(value);
        }

        if (!cancelled && !observer.closed) {
          observer.complete();
        }
      } catch (err) {
        if (!cancelled && !observer.closed) {
          observer.error(err);
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Releasing the reader is best-effort during teardown.
        }
      }
    })();

    return () => {
      cancelled = true;
      void reader.cancel();
    };
  });
}

/**
 * Subscribes to an Observable-like output and exposes it as a ReadableStream.
 *
 * Foreign operators are allowed to return any shape that `Observable.from()`
 * understands. Converting the result with a direct subscription avoids the
 * extra async-generator and stream layers that `pull(...)+toStream()` would add.
 */
export function observableInputToStream<T>(
  input: ObservableInputLike<T>,
  errorContext: string,
): ReadableStream<T | ObservableError> {
  return new ReadableStream<T | ObservableError>({
    start(controller) {
      const observable = Observable.from(input);

      return observable.subscribe({
        next(value) {
          try {
            controller.enqueue(value);
          } catch {
            // Downstream cancellation already decided the stream outcome.
          }
        },
        error(error) {
          try {
            controller.enqueue(ObservableError.from(error, errorContext));
            controller.close();
          } catch {
            // Downstream cancellation already decided the stream outcome.
          }
        },
        complete() {
          try {
            controller.close();
          } catch {
            // Downstream cancellation already decided the stream outcome.
          }
        },
      });
    },
  });
}

/**
 * Adapts a foreign Observable-style operator into a stream operator.
 *
 * Libraries such as RxJS model operators as functions from one Observable-like
 * source to another Observable-like result. This helper bridges that shape into
 * this library's `Operator` contract by:
 *
 * 1. wrapping the input stream as an Observable-like source
 * 2. calling the foreign operator
 * 3. converting the resulting Observable-like output back into a stream
 *
 * The result keeps this library's buffered error behavior by reading the
 * foreign output through `pull(..., { throwError: false })` before converting it
 * back to a `ReadableStream`.
 *
 * @typeParam TIn - Value type accepted by the foreign operator
 * @typeParam TOut - Value type produced by the foreign operator
 * @param operator - Foreign operator function to adapt
 * @returns An operator compatible with this library's `pipe()`
 *
 * @example
 * ```ts
 * const foreignTakeOne = fromObservableOperator<number, number>((source) =>
 *   rxTake(1)(source)
 * );
 * ```
 */
export function fromObservableOperator<TIn, TOut>(
  operator: ObservableOperatorInterop<TIn, TOut>,
): Operator<TIn, TOut | ObservableError> {
  return (source) => {
    const observableSource = streamAsObservable(source);
    const output = operator(observableSource) as ObservableInputLike<TOut>;

    return observableInputToStream(
      output,
      "operator:fromObservableOperator:output",
    );
  };
}

/**
 * Creates a TransformStream that injects an error at the start and passes through all original data.
 *
 * ## What this does
 * Think of this as creating a "tee" in your stream pipeline where an error gets injected at the
 * beginning, but all your original data continues to flow through unchanged. It's like adding
 * a warning sign at the start of a conveyor belt while keeping everything else moving.
 *
 * ## Why you need this
 * When operator setup fails, you want to signal the error but not lose all your data. This creates
 * a transform that does exactly that - it marks the problem but preserves your stream's content.
 *
 * ## How it works
 * The transform immediately outputs the error when the stream starts, then passes every chunk
 * from the source unchanged. Your downstream consumers see the error first, then all the data.
 *
 * ## When to use this
 * - **Operator setup failures**: When building an operator fails but the source data is still valid
 * - **Warning injection**: When you want to flag a problem but continue processing
 * - **Error preservation**: When you need both error information and data preservation
 *
 * ## What the output looks like
 * ```typescript
 * // Original stream: [1, 2, 3, 4, 5]
 * // After error injection: [ObservableError("setup failed"), 1, 2, 3, 4, 5]
 * // The error appears first, then all original data flows through
 * ```
 *
 * @param error The error to inject at the start of the stream
 * @param context Context string for error reporting (where it happened)
 *
 * @returns A TransformStream that injects the error and passes through data
 *
 * @example
 * ```typescript
 * // Handle operator setup failure
 * function createSafeOperator<T, R>(
 *   operatorBuilder: () => Operator<T, R>,
 *   context: string
 * ): Operator<T, R | ObservableError> {
 *   return (source: ReadableStream<T>) => {
 *     try {
 *       return operatorBuilder()(source);
 *     } catch (err) {
 *       return source.pipeThrough(
 *         createErrorInjectionTransform(err, context)
 *       );
 *     }
 *   };
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Add warning to stream without breaking it
 * const warningStream = dataStream.pipeThrough(
 *   createErrorInjectionTransform(
 *     new Error("Data quality issue detected"),
 *     "data-validation"
 *   )
 * );
 *
 * // Consumers will see: [Error, ...originalData]
 * ```
 */
export function injectError<T>(
  error?: Error | Error[] | unknown | unknown[],
  context?: string,
  value?: unknown,
): TransformStream<T, ObservableError> {
  return new TransformStream({
    start(controller) {
      // Inject the error as the first item in the stream
      controller.enqueue(ObservableError.from(error, context, value));
    },
  });
}
