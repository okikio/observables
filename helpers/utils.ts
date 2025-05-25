import { ObservableError } from "./error.ts";

/**
 * Represents an operator that only produces clean results (no ObservableError).
 * This is what safeCompose returns - guaranteed error-free output.
 */
export type BaseOperator<T, R> = (stream: ReadableStream<T>) => ReadableStream<R>;

/**
 * Type representing a stream operator function
 * Transforms a ReadableStream of type T to a ReadableStream of type R
 */
export type Operator<T, R> = BaseOperator<T, R | ObservableError>;

/**
 * Represents an operator that only produces clean results (no ObservableError).
 * This is what safeCompose returns - guaranteed error-free output.
 */
export type SafeOperator<T, R> = Operator<
  Exclude<T, ObservableError>,
  Exclude<R, ObservableError>
>;

/**
 * Base interface with properties shared across all transform options
 */
export interface BaseTransformOptions {
  /**
   * Optional name for the operator (used in error reporting)
   */
  name?: string;
}

// ========================================
// 2. CREATEOPERATOR INTERFACES
// ========================================

/**
 * Options for using an existing TransformStream
 */
export interface TransformStreamOptions<T, R> extends BaseTransformOptions {
  /**
   * An existing TransformStream to use for transformation
   */
  stream: TransformStream<T, R>;
}

/**
 * Options for custom transformation logic
 */
export interface TransformFunctionOptions<T, R> extends BaseTransformOptions {
  /**
   * Whether to allow errors to just pass through as a value or not,
   * - true => when true errors wrapped in ObservableError will be used as values
   *            and can then be transformed as the operator sees fit
   * - false => when false errors automatically pass through, meaning ObservableError 
   *           will not appear as a value,
   * @default false
   */
  expectErrors?: boolean;

  /**
   * Function to transform each chunk
   * @param chunk - The input chunk
   * @param controller - The TransformStreamDefaultController
   * @returns The transformed chunk(s) or undefined to filter out the chunk
   */
  transform: (
    chunk: T,
    controller: TransformStreamDefaultController<R>
  ) => R | undefined | void | null | Promise<R | undefined | void | null>;

  /**
   * Function called when the stream is about to close
   * Can enqueue final chunks before closing
   * @param controller - The TransformStreamDefaultController
   */
  flush?: (
    controller: TransformStreamDefaultController<R>
  ) => void | Promise<void>;

  /**
   * Called when the stream starts, before processing any chunks
   * @param controller - The TransformStreamDefaultController
   */
  start?: (
    controller: TransformStreamDefaultController<R>
  ) => void | Promise<void>;

  /**
   * Called when the stream is cancelled before natural completion
   */
  cancel?: (reason?: unknown) => void | Promise<void>;
}

/**
 * Union type for all createOperator options
 */
export type CreateOperatorOptions<T, R> =
  | TransformStreamOptions<T, R>
  | TransformFunctionOptions<T, R>;

// ========================================
// 3. CREATESTATEFULOPERATOR INTERFACES
// ========================================

/**
 * Options for stateful transformation logic
 */
export interface StatefulTransformFunctionOptions<T, R, S> extends BaseTransformOptions {
  /**
   * Whether to allow errors to just pass through as a value or not,
   * - true => when true errors wrapped in ObservableError will be used as values
   *            and can then be transformed as the operator sees fit
   * - false => when false errors automatically pass through, meaning ObservableError 
   *           will not appear as a value,
   * @default false
   */
  expectErrors?: boolean;

  /**
   * Function to create the initial state
   * @returns The initial state
   */
  createState: () => S;

  /**
   * Function to transform each chunk, with access to the current state
   * @param chunk - The input chunk
   * @param state - The current state (can be modified)
   * @param controller - The TransformStreamDefaultController
   */
  transform: (
    chunk: T,
    state: S,
    controller: TransformStreamDefaultController<R>
  ) => void | Promise<void>;

  /**
   * Function called when the stream is about to close
   * Can enqueue final chunks based on the state
   * @param state - The final state
   * @param controller - The TransformStreamDefaultController
   */
  flush?: (
    state: S,
    controller: TransformStreamDefaultController<R>
  ) => void | Promise<void>;

  /**
   * Called when the stream starts, before processing any chunks
   * @param state - The initial state
   * @param controller - The TransformStreamDefaultController
   */
  start?: (
    state: S,
    controller: TransformStreamDefaultController<R>
  ) => void | Promise<void>;

  /**
   * Called when the stream is cancelled before natural completion
   * @param state - The current state
   */
  cancel?: (
    state: S,
    reason?: unknown
  ) => void | Promise<void>;
}

export function isTransformStreamOptions<T, R>(
  options: CreateOperatorOptions<T, R>
): options is TransformStreamOptions<T, R> {
  return 'stream' in options;
}

export function isTransformFunctionOptions<T, R>(
  options: CreateOperatorOptions<T, R>
): options is TransformFunctionOptions<T, R> {
  return 'transform' in options;
}

/**
 * Creates a stream operator with the specified transformation logic
 * 
 * This is a utility function that simplifies the creation of stream operators.
 * It handles the details of creating and configuring a TransformStream with
 * the provided transformation logic.
 * 
 * @typeParam T - Input chunk type
 * @typeParam R - Output chunk type
 * @param options - Configuration options for the transform
 * @returns A stream operator function
 * 
 * @example
 * ```ts
 * // Create a simple map operator
 * function map<T, R>(fn: (value: T) => R): Operator<T, R> {
 *   return createOperator({
 *     transform(chunk, controller) {
 *       controller.enqueue(fn(chunk));
 *     }
 *   });
 * }
 * 
 * // Create a filter operator
 * function filter<T>(predicate: (value: T) => boolean): Operator<T, T> {
 *   return createOperator({
 *     transform(chunk, controller) {
 *       if (predicate(chunk)) {
 *         controller.enqueue(chunk);
 *       }
 *     }
 *   });
 * }
 * 
 * // Using TransformStream
 * const compressor = createOperator({
 *   name: 'compressor',
 *   stream: new TransformStream({
 *     transform(chunk, controller) {
 *       controller.enqueue(`compressed:${chunk}`);
 *     }
 *   })
 * });
 * 
 * // Using transform function
 * const mapper = createOperator({
 *   name: 'doubler',
 *   transform(chunk, controller) {
 *     controller.enqueue(chunk * 2);
 *   }
 * });
 * ```
 */
export function createOperator<T, R>(options: CreateOperatorOptions<T, R>): Operator<T, R> {
  // Extract operator name from options or the function name for better error reporting
  const operatorName = `operator:${options.name || 'unknown'}`;
  const expectErrors = (options as TransformFunctionOptions<T, R>)?.expectErrors ?? false;

  return (source) => {
    try {
      // Create a transform stream with the provided options
      const transformStream = isTransformStreamOptions(options) ? options.stream : 
        new TransformStream<T, R | ObservableError>({
            // Transform function to process each chunk
            async transform(chunk, controller) {
            if (!expectErrors && chunk instanceof ObservableError) {
                controller.enqueue(chunk as unknown as R); // pass through untouched
                return;                              // nothing else to do
              }
              
              try {
                const result = await options.transform(chunk, controller);

                // If the transform returns a value (not undefined),
                // enqueue it unless it's already been handled by the controller
                if (result !== undefined && result !== null) {
                  controller.enqueue(result);
                }
              } catch (err) {
                // If an error occurs during transformation, wrap it with context
                controller.enqueue(ObservableError.from(err, operatorName, chunk));
              }
            },

            // Start function called when the stream is initialized
            async start(controller) {
              try {
                if (options.start)
                  return await options.start(controller);
              } catch (err) {
                controller.enqueue(ObservableError.from(err, `${operatorName}:start`));
                controller.terminate();
              }
            },

            // Flush function called when the input is done
            async flush(controller) {
              try {
                if (options.flush)
                  await options.flush(controller);
              } catch (err) {
                controller.enqueue(ObservableError.from(err, `${operatorName}:flush`));
                controller.terminate();
              }
            },

            // Cancel function called if the stream is cancelled
            async cancel(reason) {
              try {
                if (options.cancel)
                  return await options.cancel(reason);
              } catch (err) {
                // Just log cancellation errors as they can't be propagated
                console.warn(`Error in ${operatorName} cancel:`, err);
              }
            }
          },
          { highWaterMark: 1 },
          { highWaterMark: 0 }
        );

      // Pipe the source through the transform
      return source.pipeThrough(transformStream);
    } catch (err) {
      // If setup fails, return a stream that errors immediately
      return source.pipeThrough(injectError(err, `${operatorName}:setup`, options));
    }
  };
}

/**
 * Creates a stateful stream operator
 * 
 * 
 * This utility simplifies the creation of operators that need to maintain
 * state across chunks, such as `scan`, `reduce`, or `buffer`.
 * 
 * @typeParam T - Input chunk type
 * @typeParam R - Output chunk type
 * @typeParam S - State type
 * @param options - Configuration options for the stateful operator
 * @returns A stream operator function
 * 
 * @example
 * ```ts
 * // Create a scan operator that accumulates values
 * function scan<T, R>(
 *   accumulator: (acc: R, value: T, index: number) => R,
 *   seed: R
 * ): Operator<T, R> {
 *   return createStatefulOperator<T, R, { acc: R, index: number }>({
 *     createState: () => ({ acc: seed, index: 0 }),
 *     transform(chunk, state, controller) {
 *       state.acc = accumulator(state.acc, chunk, state.index++);
 *       controller.enqueue(state.acc);
 *     }
 *   });
 * }
 * 
 * // Create a buffer operator that groups items
 * function buffer<T>(size: number): Operator<T, T[]> {
 *   return createStatefulOperator<T, T[], T[]>({
 *     createState: () => [],
 *     transform(chunk, buffer, controller) {
 *       buffer.push(chunk);
 *       
 *       if (buffer.length >= size) {
 *         controller.enqueue([...buffer]);
 *         buffer.length = 0;
 *       }
 *     },
 *     flush(buffer, controller) {
 *       if (buffer.length > 0) {
 *         controller.enqueue([...buffer]);
 *       }
 *     }
 *   });
 * }
 * // Using TransformStream (stateless)
 * const batcher = createStatefulOperator({
 *   name: 'batcher',
 *   transformStream: batchingTransform
 * });
 * 
 * // Using stateful transform function
 * const counter = createStatefulOperator({
 *   name: 'counter',
 *   createState: () => ({ count: 0 }),
 *   transform(chunk, state, controller) {
 *     state.count++;
 *     controller.enqueue({ item: chunk, count: state.count });
 *   }
 * });
 * ```
 */
export function createStatefulOperator<T, R, S>(
  options: StatefulTransformFunctionOptions<T, R, S>
): Operator<T, R> {
  // Extract operator name from options or the function name for better error reporting
  const operatorName = `operator:stateful:${options.name || 'unknown'}`;
  const expectErrors = options?.expectErrors ?? false;

  return (source) => {
    try {
      // Create state only when the stream is used
      let state: S;

      try {
        // Initialize the state
        state = options.createState();
      } catch (err) {
        // If state creation fails, return a stream that errors immediately
        return source.pipeThrough(
          injectError(err, `${operatorName}:create:state`, options)
        );
      }

      // Create a transform stream with the provided options
      const transformStream = new TransformStream<T, R | ObservableError>({
          start(controller) {
            try {
              // Call the start function if provided
              if (options.start)
                return options.start(state, controller);
            } catch (err) {
              // If an error occurs during transformation, wrap it with context
              controller.enqueue(ObservableError.from(err, `${operatorName}:start`, { state }));
              controller.terminate();
            }
          },

          transform(chunk, controller) {
            if (!expectErrors && chunk instanceof ObservableError) {
              controller.enqueue(chunk as unknown as R); // pass through untouched
              return;                              // nothing else to do
            }

            try {
              // Apply the transform function with the current state
              return options.transform(chunk, state, controller);
            } catch (err) {
              // If an error occurs during transformation, wrap it with context
              controller.enqueue(ObservableError.from(err, operatorName, { chunk, state }));
            }
          },

          flush(controller) {
            try {
              // Call the flush function if provided
              if (options.flush)
                return options.flush(state, controller);
            } catch (err) {
              // If an error occurs during transformation, wrap it with context
              controller.enqueue(ObservableError.from(err, `${operatorName}:flush`, { state }));
              controller.terminate();
            }
          },

          cancel(reason) {
            try {
              // Call the cancel function if provided
              if (options.cancel)
                return options.cancel(state, reason);
            } catch (err) {
              // Just log cancellation errors as they can't be propagated
              console.warn(`Error in ${operatorName} cancel:`, err);
            }
          }
        },
        { highWaterMark: 1 },
        { highWaterMark: 0 }
      );

      // Pipe the source through the transform
      return source.pipeThrough(transformStream);
    } catch (err) {
      // If setup fails, return a stream that errors immediately
      return source.pipeThrough(injectError(err, `${operatorName}:setup`, options));
    }
  };
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
