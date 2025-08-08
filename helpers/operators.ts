import type { Operator, CreateOperatorOptions, StatefulTransformFunctionOptions, TransformFunctionOptions, TransformStreamOptions, ExcludeError, OperatorErrorMode, TransformHandlerContext } from "./_types.ts";

import { injectError, isTransformStreamOptions } from "./utils.ts";
import { ObservableError, isObservableError } from "../error.ts";

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
export function createOperator<T, R, O extends ExcludeError<R> = ExcludeError<R>>(options: TransformFunctionOptions<T, O> & { ignoreErrors: true }): Operator<T, O>;
export function createOperator<T, R, O extends ExcludeError<R> = ExcludeError<R>>(options: TransformStreamOptions<T, O> & { ignoreErrors: true }): Operator<T, O>;
export function createOperator<T, R, O extends R | ObservableError = R | ObservableError>(options: TransformFunctionOptions<T, O> & { ignoreErrors?: false }): Operator<T, O>;
export function createOperator<T, R, O extends R | ObservableError = R | ObservableError>(options: TransformStreamOptions<T, O> & { ignoreErrors?: false }): Operator<T, O>;
export function createOperator<T, R, O extends R | ExcludeError<R> | ObservableError = R | ExcludeError<R> | ObservableError>(options: CreateOperatorOptions<T, O>): Operator<T, unknown> {
  // Extract operator name from options or the function name for better error reporting
  const operatorName = `operator:${options.name || 'unknown'}`;
  const errorMode = (options as TransformFunctionOptions<T, O>)?.errorMode ?? "pass-through";

  // Extract only what we need to avoid retaining the full options object
  const transform = (options as TransformFunctionOptions<T, O>)?.transform;
  const start = (options as TransformFunctionOptions<T, O>)?.start;
  const flush = (options as TransformFunctionOptions<T, O>)?.flush;
  
  return (source) => {
    try {
      // Create a transform stream with the provided options
      const transformStream = isTransformStreamOptions(options) ?
        options.stream(options) :
        new TransformStream<T, O>({
            // Transform function to process each chunk
            transform: handleTransform(errorMode, transform, { operatorName }),

            // Start function called when the stream is initialized
            start: handleStart(errorMode, start, { operatorName }),

            // Flush function called when the input is done
            flush: handleFlush(errorMode, flush, { operatorName }),
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
 * Wraps a transform function to handle errors based on the specified error mode
 * 
 * This utility function takes a transform function and wraps it to handle errors
 * according to the specified error mode. It supports modes like "ignore", "pass-through",
 * "throw", and "manual".
 * 
 * @typeParam T - Input chunk type
 * @typeParam O - Output chunk type
 * @typeParam S - State type (if applicable)
 * @param S - State type (if applicable)
 * @param errorMode - The error handling mode
 * @param transform - The transform function to wrap
 * @param context - The transform function options
 * @returns A wrapped transform function with error handling
 */
export function handleTransform<T, O, S = never>(
  errorMode: OperatorErrorMode,
  transform: 
    TransformFunctionOptions<T, O>['transform'] |
    StatefulTransformFunctionOptions<T, O, S>['transform'],
  context: TransformHandlerContext = { }
): Transformer<T, O>['transform'] {
  const operatorName = context.operatorName || `operator:unknown`;
  const isStateful = context.isStateful || false;
  const state = context.state;

  switch (errorMode) {
    case "pass-through":
      return async (chunk: T, controller: TransformStreamDefaultController<O>) => {
        if (isObservableError(chunk)) {
          controller.enqueue(chunk as O);
          return;
        }
        
        try {
          if (isStateful) {
            // If stateful, pass the state along
            return await (transform as StatefulTransformFunctionOptions<T, O, S>['transform'])(chunk, state as S, controller);
          }

          await (transform as TransformFunctionOptions<T, O>['transform'])(chunk, controller);
        } catch (err) {
          controller.enqueue(ObservableError.from(err, operatorName, chunk) as O);
        }
      };
      
    case "ignore":
      return async (chunk: T, controller: TransformStreamDefaultController<O>) => {
        if (isObservableError(chunk)) return;
        
        try {
          if (isStateful) {
            // If stateful, pass the state along
            return await (transform as StatefulTransformFunctionOptions<T, O, S>['transform'])(chunk, state as S, controller);
          }

          await (transform as TransformFunctionOptions<T, O>['transform'])(chunk, controller);
        } catch (_) {
          // Silently ignore errors
          return;
        }
      };
      
    case "throw":
      return async (chunk: T, controller: TransformStreamDefaultController<O>) => {
        if (isObservableError(chunk)) {
          return controller.error(ObservableError.from(chunk, operatorName, chunk));
        }
        
        try {
          if (isStateful) {
            // If stateful, pass the state along
            return await (transform as StatefulTransformFunctionOptions<T, O, S>['transform'])(chunk, state as S, controller);
          }

          await (transform as TransformFunctionOptions<T, O>['transform'])(chunk, controller);
        } catch (err) {
          return controller.error(ObservableError.from(err, operatorName, chunk));
        }
      };
      
    case "manual":
    default:
      return async (chunk: T, controller: TransformStreamDefaultController<O>) => {
        // In manual mode, user is expected to handle ALL errors
        // If they don't catch something, let it bubble up and error the stream
        if (isStateful) {
          // If stateful, pass the state along
          return await (transform as StatefulTransformFunctionOptions<T, O, S>['transform'])(chunk, state as S, controller);
        }

        await (transform as TransformFunctionOptions<T, O>['transform'])(chunk, controller);
      };
  }
}

/**
 * Wraps a start function to handle errors based on the specified error mode
 * 
 * @typeParam O - Output chunk type
 * @param errorMode - The error handling mode
 * @param start - The start function to wrap
 * @param operatorName - The name of the operator for error context
 * @returns A wrapped start function with error handling
 */

export function handleStart<T, O, S extends undefined = undefined>(
  errorMode: OperatorErrorMode,
  start?: 
    TransformFunctionOptions<T, O>['start'] |
    StatefulTransformFunctionOptions<T, O, S>['start'],
  context: TransformHandlerContext = { }
): Transformer<T, O>['start'] {
  if (!start) return;

  const operatorName = context.operatorName || `operator:unknown`;
  const isStateful = context.isStateful || false;
  const state = context.state;

  return async (controller: TransformStreamDefaultController<O>) => {
    try {
      if (isStateful) {
        // If stateful, pass the state along
        return await (start as StatefulTransformFunctionOptions<unknown, O, S>['start'])!(state as S, controller);
      }

      return await (start as TransformFunctionOptions<unknown, O>['start'])!(controller);
    } catch (err) {
      switch (errorMode) {
        case "ignore":
          controller.terminate();
          break;
        case "throw":
          throw ObservableError.from(err, `${operatorName}:start`);
        case "pass-through":
          controller.enqueue(ObservableError.from(err, `${operatorName}:start`) as O);
          controller.terminate();
          break;
        case "manual":
        default:
          throw err;
      }
    }
  };
}

/**
 * Wraps a flush function to handle errors based on the specified error mode
 * 
 * @typeParam O - Output chunk type
 * @param errorMode - The error handling mode
 * @param flush - The flush function to wrap
 * @param operatorName - The name of the operator for error context
 * @returns A wrapped flush function with error handling
 */
export function handleFlush<T, O, S extends undefined = undefined>(
  errorMode: OperatorErrorMode,
  flush?: TransformFunctionOptions<T, O>['flush'] |
    StatefulTransformFunctionOptions<T, O, S>['flush'],
  context: TransformHandlerContext = { }
): Transformer<T, O>['flush'] {
  if (!flush) return;

  const operatorName = context.operatorName || `operator:unknown`;
  const isStateful = context.isStateful || false;
  const state = context.state;
  
  return async (controller: TransformStreamDefaultController<O>) => {
    try {
      if (isStateful) {
        // If stateful, pass the state along
        return await (flush as StatefulTransformFunctionOptions<unknown, O, S>['flush'])!(state as S, controller);
      }

      return await (flush as TransformFunctionOptions<unknown, O>['flush'])!(controller);
    } catch (err) {
      switch (errorMode) {
        case "ignore":
          controller.terminate();
          break;
        case "throw":
          throw ObservableError.from(err, `${operatorName}:flush`);
        case "pass-through":
          controller.enqueue(ObservableError.from(err, `${operatorName}:flush`) as O);
          controller.terminate();
          break;
        case "manual":
        default:
          throw err;
      }
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
export function createStatefulOperator<T, R, S, O extends ExcludeError<R> = ExcludeError<R>>(
  options: StatefulTransformFunctionOptions<T, O, S> & { ignoreErrors: true }
): Operator<T, O>;
export function createStatefulOperator<T, R, S, O extends R | ObservableError = R | ObservableError>(
  options: StatefulTransformFunctionOptions<T, O, S> & { ignoreErrors?: false }
): Operator<T, O>;
export function createStatefulOperator<T, R, S, O extends R | ExcludeError<R> | ObservableError = R | ExcludeError<R> | ObservableError>(
  options: StatefulTransformFunctionOptions<T, O, S>
): Operator<T, unknown> {
  // Extract operator name from options or the function name for better error reporting
  const operatorName = `operator:stateful:${options.name || 'unknown'}`;
  const errorMode = (options as StatefulTransformFunctionOptions<T, O, S>)?.errorMode ?? "pass-through";

  // Extract only what we need to avoid retaining the full options object
  const transform = (options as StatefulTransformFunctionOptions<T, O, S>)?.transform;
  const start = (options as StatefulTransformFunctionOptions<T, O, S>)?.start;
  const flush = (options as StatefulTransformFunctionOptions<T, O, S>)?.flush;

  return (source) => {
    try {
      // Create state only when the stream is used
      let state: S;

      try {
        // Initialize the state
        state = options.createState();
      } catch (err) {
        switch (errorMode) {
          case "ignore":
            return source;
          case "manual":
          case "throw":
            throw err;
        }

        // If state creation fails, return a stream that errors immediately
        return source.pipeThrough(
          injectError(err, `${operatorName}:create:state`, options)
        );
      }

      // Create a transform stream with the provided options
      const transformStream = new TransformStream<T, O>(
        {
          start: handleStart(errorMode, start, { operatorName, isStateful: true, state }),
          transform: handleTransform(errorMode, transform, { operatorName, isStateful: true, state }),
          flush: handleFlush(errorMode, flush, { operatorName, isStateful: true, state }),
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
