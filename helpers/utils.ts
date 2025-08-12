import type { TransformStreamOptions, TransformFunctionOptions } from "./_types.ts";
import type { CreateOperatorOptions, Operator } from "./_types.ts";
import { ObservableError } from "../error.ts";

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
  options: CreateOperatorOptions<T, R>
): options is TransformStreamOptions<T, R> {
  return 'stream' in options;
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
  options: CreateOperatorOptions<T, R>
): options is TransformFunctionOptions<T, R> {
  return 'transform' in options;
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
  operator: Operator<any, any>,
  { message = `pipe:operator` } = { }
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
  iterable: Iterable<T> | AsyncIterable<T>
): ReadableStream<T | ObservableError> {
  // Check if it's an async iterable
  const isAsync = typeof (iterable as AsyncIterable<T>)[Symbol.asyncIterator] === "function";

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

        controller.close();
      } catch (err) {
        controller.enqueue(ObservableError.from(err, "toStream"));
        controller.close();
      }
    }
  });
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
  value?: unknown
): TransformStream<T, ObservableError> {
  return new TransformStream({
    start(controller) {
      // Inject the error as the first item in the stream
      controller.enqueue(ObservableError.from(error, context, value));
    },
  });
}
