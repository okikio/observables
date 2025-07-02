import type { Operator, CreateOperatorOptions, StatefulTransformFunctionOptions, TransformFunctionOptions, TransformStreamOptions, SafeOperator } from "./_types.ts";

import { injectError, isTransformStreamOptions } from "./utils.ts";
import { ObservableError } from "../error.ts";

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
export function createOperator<T, R>(options: TransformFunctionOptions<T, R> & { ignoreErrors: true }): SafeOperator<T, R>;
export function createOperator<T, R>(options: TransformStreamOptions<T, R> & { ignoreErrors: true }): SafeOperator<T, R>;
export function createOperator<T, R>(options: TransformFunctionOptions<T, R>  & { ignoreErrors?: false | undefined }): Operator<T, R | ObservableError>;
export function createOperator<T, R>(options: TransformStreamOptions<T, R> & { ignoreErrors?: false | undefined }): Operator<T, R | ObservableError>;
export function createOperator<T, R>(options: CreateOperatorOptions<T, R>): Operator<T, unknown> {
  // Extract operator name from options or the function name for better error reporting
  const operatorName = `operator:${options.name || 'unknown'}`;
  const ignoreErrors = (options as TransformFunctionOptions<T, R>)?.ignoreErrors ?? false;

  return (source) => {
    try {
      // Create a transform stream with the provided options
      const transformStream = isTransformStreamOptions(options) ? options.stream :
        new TransformStream<T, R | ObservableError>({
          // Transform function to process each chunk
          async transform(chunk, controller) {
            if (ignoreErrors && chunk instanceof ObservableError) return;

            try {
              const result = await options.transform(chunk, controller);
              controller.enqueue(result as R);
            } catch (err) {
              // If an error occurs during transformation, wrap it with context
              if (ignoreErrors) return;
              controller.enqueue(ObservableError.from(err, operatorName, chunk));
            }
          },

          // Start function called when the stream is initialized
          async start(controller) {
            if (!options.start) return;

            try {
              return await options.start(controller);
            } catch (err) {
              if (!ignoreErrors)
                controller.enqueue(ObservableError.from(err, `${operatorName}:start`));
              controller.terminate();
            }
          },

          // Flush function called when the input is done
          async flush(controller) {
            if (!options.flush) return;

            try {
              await options.flush(controller);
            } catch (err) {
              if (!ignoreErrors)
                controller.enqueue(ObservableError.from(err, `${operatorName}:flush`));
              controller.terminate();
            }
          },
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
  options: StatefulTransformFunctionOptions<T, R, S> & { ignoreErrors: true }
): Operator<T, R>;
export function createStatefulOperator<T, R, S>(
  options: StatefulTransformFunctionOptions<T, R, S> & { ignoreErrors?: false | undefined }
): Operator<T, R | ObservableError>;
export function createStatefulOperator<T, R, S>(
  options: StatefulTransformFunctionOptions<T, R, S>
): Operator<T, unknown> {
  // Extract operator name from options or the function name for better error reporting
  const operatorName = `operator:stateful:${options.name || 'unknown'}`;
  const ignoreErrors = options?.ignoreErrors ?? false;

  return (source) => {
    try {
      // Create state only when the stream is used
      let state: S;

      try {
        // Initialize the state
        state = options.createState();
      } catch (err) {
        if (ignoreErrors) return source;

        // If state creation fails, return a stream that errors immediately
        return source.pipeThrough(
          injectError(err, `${operatorName}:create:state`, options)
        );
      }

      // Create a transform stream with the provided options
      const transformStream = new TransformStream<T, R | ObservableError>({
        start(controller) {
          if (!options.start) return;

          try {
            return options.start(state, controller);
          } catch (err) {
            // If an error occurs during transformation, wrap it with context
            if (!ignoreErrors)
              controller.enqueue(ObservableError.from(err, `${operatorName}:start`, { state }));
            controller.terminate();
          }
        },

        transform(chunk, controller) {
          if (ignoreErrors && chunk instanceof ObservableError) return; 

          try {
            // Apply the transform function with the current state
            return options.transform(chunk, state, controller);
          } catch (err) {
            if (ignoreErrors) return;

            // If an error occurs during transformation, wrap it with context
            controller.enqueue(ObservableError.from(err, `${operatorName}:transform`, { chunk, state }));
          }
        },

        flush(controller) {
          if (!options.flush) return;
          
          try {
            // Call the flush function if provided
            return options.flush(state, controller);
          } catch (err) {
            // If an error occurs during transformation, wrap it with context
            if (!ignoreErrors)
              controller.enqueue(ObservableError.from(err, `${operatorName}:flush`, { state }));
            controller.terminate();
          }
        },
      },
        { highWaterMark: 1 },
        { highWaterMark: 0 }
      );

      // Pipe the source through the transform
      return source.pipeThrough(transformStream);
    } catch (err) {
      if (ignoreErrors) return source;
      
      // If setup fails, return a stream that errors immediately
      return source.pipeThrough(injectError(err, `${operatorName}:setup`, options));
    }
  }; 
}
