/**
 * Operators are the building blocks of Observable pipelines.
 * 
 * If you've ever used `Array.map` or `Array.filter`, you already know the core idea:
 * an **operator** takes a sequence of values and transforms, filters, or combines them
 * into a new sequence. Operators let you build data pipelines—think of them as the
 * Lego bricks for working with streams of data.
 * 
 * Think of an operator as a function that takes a stream of values and returns a new stream,
 * transforming, filtering, or combining the data as it flows through.
 * 
 * For example, to double every number in an array:
 * ```ts
 * [1, 2, 3].map(x => x * 2); // [2, 4, 6]
 * ```
 * 
 * With Observables, you want to do the same thing, but for values that arrive over time:
 * ```ts
 * // Double every number in a stream
 * const double = createOperator({
 *   transform(chunk, controller) {
 *     controller.enqueue(chunk * 2);
 *   }
 * });
 * 
 * // Only allow even numbers through
 * const evens = createOperator({
 *   transform(chunk, controller) {
 *     if (chunk % 2 === 0) controller.enqueue(chunk);
 *   }
 * });
 * 
 * // Use them together in a pipeline
 * pipe(
 *   Observable.from([1, 2, 3, 4]),
 *   double,
 *   evens
 * ).subscribe(console.log); // Output: 4, 8
 * ```
 * 
 * This module lets you build your own operators using the Web Streams API under the hood.
 * Why streams? Because they're fast, memory-efficient, and let you process data as it arrives,
 * not just after everything is loaded. This is especially useful for things like file processing,
 * network requests, or any situation where you want to handle data piece-by-piece.
 * 
 * ## Why Streams? Why Not Just Arrays?
 *
 * Arrays are great for data you already have. But what about data that arrives slowly,
 * or is too big to fit in memory? Think files, network responses, or user events.
 * That's where **streams** shine: they let you process data piece-by-piece, as it arrives,
 * without waiting for everything or loading it all at once.
 * 
 * The Web Streams API (and Node.js streams) are the standard way to do this in modern JavaScript.
 * But using them directly is verbose and error-prone:
 * ```ts
 * // Native TransformStream: double every number
 * const stream = new TransformStream({
 *   transform(chunk, controller) {
 *     controller.enqueue(chunk * 2);
 *   }
 * });
 * ```
 * Your operator helpers let you write the same thing, but with less boilerplate and
 * built-in error handling:
 * ```ts
 * const double = createOperator({
 *   transform(chunk, controller) {
 *     controller.enqueue(chunk * 2);
 *   }
 * });
 * ```
 * 
 * By building operators on top of streams, you get:
 * - **Backpressure**: Slow consumers don't overwhelm fast producers.
 * - **Low memory usage**: Process data chunk-by-chunk, not all at once.
 * - **Composable pipelines**: Easily chain transformations.
 * 
 * ## Connecting Operators: Pipelines
 *
 * Operators are most powerful when you chain them together. This is called a pipeline.
 * 
 * It's just like chaining `map` and `filter` on arrays, but for streams:
 * ```ts
 * pipe(
 *   Observable.from([1, 2, 3, 4]),
 *   createOperator({
 *     transform(chunk, controller) {
 *       controller.enqueue(chunk * 2);
 *     }
 *   }),
 *   createOperator({
 *     transform(chunk, controller) {
 *       if (chunk % 3 === 0) controller.enqueue(chunk);
 *     }
 *   })
 * ).subscribe(console.log); // Output: 6
 * ```
 * 
 * Compare to arrays:
 * ```ts
 * [1, 2, 3, 4]
 *  .map(x => x * 2)
 *  .filter(x => x % 3 === 0)
 *  .forEach(console.log); // [2, 4, 8]
 * ```
 * 
 * Of course, no one wants to write operators from scratch every time. 
 * So we provide some core operations via basic familiar operators,
 * plus error handling utilities to make your pipelines robust.
 * 
 * Aka, `map`, `filter`, `reduce`, `batch`, `catchErrors`, `ignoreErrors`, and more.
 * So really the example above becomes:
 * ```ts
 * pipe(
 *   Observable.from([1, 2, 3, 4]),
 *   map(x => x * 2),
 *   filter(x => x % 3 === 0)
 * ).subscribe(console.log); // Output: 2, 4, 8
 * ```
 * 
 * The example is not ideal given arrays have functions for this already, 
 * but you get the idea. It's meant more for streams of data that arrive over time.
 * 
 * ## Error Handling: Real-World Data is Messy
 * 
 * Real-world data is messy. Sometimes things go wrong aka, maybe a chunk is malformed, or a network
 * request fails. Our operators let you choose how to handle errors, with four modes:
 * 
 * - `"pass-through"` (default): Errors become special values in the stream, so you can handle them downstream. Imagine almost like bubble wrap over error since they are dangerous allowing us to make sure we don't break the flow.
 * - `"ignore"`: Errors are silently skipped. The stream keeps going as if nothing happened. Imagine that we're basically just remove any errors from the stream while it's flowing (pretty stressful ngl). 
 * - `"throw"`: The stream stops immediately on the first error. Basically start screaming bloody murder, an error has occured so everything must stop.
 * - `"manual"`: You handle all errors yourself. If you don't catch them, the stream will error. This is primarily for operators who have special error handling requirements.
 * 
 * Example: parsing JSON safely
 * ```ts
 * // Pass-through: errors become ObservableError values (
 * // we basically package errors in bubble wrap which we call a ObservableError
 * const safeParse = createOperator({
 *   errorMode: "pass-through",
 *   transform(chunk, controller) {
 *     controller.enqueue(JSON.parse(chunk));
 *   }
 * });
 *
 * // Ignore: errors are dropped
 * const ignoreParse = createOperator({
 *   errorMode: "ignore",
 *   transform(chunk, controller) {
 *     controller.enqueue(JSON.parse(chunk));
 *   }
 * });
 *
 * // Throw: stream stops on first error
 * const strictParse = createOperator({
 *   errorMode: "throw",
 *   transform(chunk, controller) {
 *     controller.enqueue(JSON.parse(chunk));
 *   }
 * });
 * ```
 * 
 * Compare to native TransformStream error handling:
 * ```ts
 * // Native: you must handle errors yourself
 * const stream = new TransformStream({
 *   transform(chunk, controller) {
 *     try {
 *       controller.enqueue(JSON.parse(chunk));
 *     } catch (err) {
 *       controller.error(err); // This kills the stream
 *     }
 *   }
 * });
 * ```
 * 
 * ## Stateful Operators: Remembering Across Chunks
 * 
 * Sometimes you need to keep track of things as data flows through—like running totals,
 * buffers, or windows. Your `createStatefulOperator` lets you do this easily:
 * 
 * ```ts
 * // Running sum
 * const runningSum = createStatefulOperator({
 *   createState: () => ({ sum: 0 }),
 *   transform(chunk, state, controller) {
 *     state.sum += chunk;
 *     controller.enqueue(state.sum);
 *   }
 * });
 * 
 * pipe(
 *   Observable.from([1, 2, 3]),
 *   runningSum
 * ).subscribe(console.log); // Output: 1, 3, 6
 * ```
 * 
 * Native TransformStream can't do this as cleanly, you'd have to manage state outside the stream,
 * which gets messy, error-prone and annoying real quick.
 * 
 * ## Performance and Memory
 *
 * - **Hot path optimization**: The error handling logic is generated for each operator,
 *   so there are no runtime branches inside your data processing loop.
 * - **Memory safety**: Only the functions and state you need are kept alive; everything else
 *   can be garbage collected.
 * - **Streams scale**: You can process gigabytes of data with minimal RAM, and your operators
 *   work just as well for infinite streams as for arrays (though arrays have better performance through 
 *   their built-in `filter`, `map`, `forEach`, etc..., methods).
 * 
 * ## Summary
 * 
 * - Operators are like `Array.map`/`filter`, but for async streams of data.
 * - You can build pipelines that transform, filter, buffer, or combine data.
 * - Error handling is flexible and explicit.
 * - Streams make your code scalable and memory-efficient.
 * - State is easy to manage for advanced use cases.
 * - The helpers make working with streams as easy as working with arrays.
 * 
 * @module
 */

import type { Operator, CreateOperatorOptions, StatefulTransformFunctionOptions, TransformFunctionOptions, TransformStreamOptions, ExcludeError, OperatorErrorMode, TransformHandlerContext } from "./_types.ts";

import { injectError, isTransformStreamOptions } from "./utils.ts";
import { ObservableError, isObservableError } from "../error.ts";

/**
 * Creates optimized stream operators with consistent error handling
 * 
 * The Web Streams API's TransformStream is powerful but requires boilerplate for
 * error handling, lifecycle management, and memory optimization. This function
 * eliminates that complexity while providing four error handling strategies:
 * 
 * - **pass-through**: Errors become observable values in the stream (default)
 * - **ignore**: Silently skip errors and continue processing
 * - **throw**: Stop stream immediately on first error
 * - **manual**: No automatic error handling - you're in full control
 * 
 * Performance: Pre-compiles error handling logic to avoid runtime checks on every chunk.
 * Memory: Extracts only needed functions from options to enable garbage collection.
 * 
 * @example
 * ```ts
 * // Stream continues even if mapping fails for some items
 * const safeMap = <T, R>(fn: (x: T) => R) => createOperator({
 *   name: 'safeMap',
 *   errorMode: 'pass-through', // Errors become ObservableError values
 *   transform(chunk, controller) {
 *     controller.enqueue(fn(chunk)); // If fn() throws, error gets enqueued
 *   }
 * });
 * 
 * // Stream stops immediately on any error
 * const strictMap = <T, R>(fn: (x: T) => R) => createOperator({
 *   name: 'strictMap', 
 *   errorMode: 'throw', // Stream terminates on first error
 *   transform(chunk, controller) {
 *     controller.enqueue(fn(chunk));
 *   }
 * });
 * 
 * // You handle all errors manually
 * const customMap = <T, R>(fn: (x: T) => R) => createOperator({
 *   name: 'customMap',
 *   errorMode: 'manual',
 *   transform(chunk, controller) {
 *     try {
 *       controller.enqueue(fn(chunk));
 *     } catch (err) {
 *       // Your custom error logic here
 *       controller.enqueue(err.message);
 *     }
 *   }
 * });
 * ```
 */
// For "ignore" error mode - no ObservableErrors in output
export function createOperator<T, R, O extends ExcludeError<R> = ExcludeError<R>>(
  options: TransformFunctionOptions<T, O> & { errorMode: "ignore" }
): Operator<T, O>;
export function createOperator<T, R, O extends ExcludeError<R> = ExcludeError<R>>(
  options: TransformStreamOptions<T, O> & { errorMode: "ignore" }
): Operator<T, O>;

// For "throw" error mode - no ObservableErrors in output
export function createOperator<T, R, O extends ExcludeError<R> = ExcludeError<R>>(
  options: TransformFunctionOptions<T, O> & { errorMode: "throw" }
): Operator<T, O>;
export function createOperator<T, R, O extends ExcludeError<R> = ExcludeError<R>>(
  options: TransformStreamOptions<T, O> & { errorMode: "throw" }
): Operator<T, O>;

// For "pass-through" error mode - output includes ObservableErrors
export function createOperator<T, R, O extends R | ObservableError = R | ObservableError>(
  options: TransformFunctionOptions<T, O> & { errorMode?: "pass-through" }
): Operator<T, O>;
export function createOperator<T, R, O extends R | ObservableError = R | ObservableError>(
  options: TransformStreamOptions<T, O> & { errorMode?: "pass-through" }
): Operator<T, O>;

// For "manual" error mode - output is entirely up to the implementation
export function createOperator<T, R, O = R>(
  options: TransformFunctionOptions<T, O> & { errorMode: "manual" }
): Operator<T, O>;
export function createOperator<T, R, O = R>(
  options: TransformStreamOptions<T, O> & { errorMode: "manual" }
): Operator<T, O>;

// Default case
export function createOperator<T, R, O extends R | ExcludeError<R> | ObservableError = R | ExcludeError<R> | ObservableError>(
  options: CreateOperatorOptions<T, O>
): Operator<T, unknown> {
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
 * Hot-path optimized error handling for transform functions
 * 
 * Problem: Transform functions are called for EVERY chunk in a stream. Doing
 * error mode checks and type checks on every call kills performance.
 * 
 * Solution: Pre-compile the error handling logic into optimized functions.
 * Each error mode gets its own specialized function with zero runtime overhead.
 * 
 * Memory optimization: Only references the specific transform function and state,
 * not the entire options object, enabling garbage collection of unused properties.
 * 
 * @example
 * ```ts
 * // Instead of this slow approach:
 * function slowTransform(chunk, controller) {
 *   if (errorMode === 'ignore' && isObservableError(chunk)) return;
 *   if (errorMode === 'pass-through' && isObservableError(chunk)) {
 *     controller.enqueue(chunk);
 *     return;
 *   }
 *   // ... more runtime checks
 * }
 * 
 * // handleTransform pre-compiles to this:
 * function fastIgnoreTransform(chunk, controller) {
 *   if (isObservableError(chunk)) return; // Only one check needed
 *   try {
 *     userTransform(chunk, controller);
 *   } catch (_) { return; } // Pre-compiled error handling
 * }
 * ```
 * 
 * @typeParam T - Input chunk type
 * @typeParam O - Output chunk type
 * @typeParam S - State type (for stateful operators)
 * @param errorMode - How to handle errors ("pass-through", "ignore", "throw", "manual")
 * @param transform - Your transform function (stateless or stateful)
 * @param context - Info about the operator, including name and state
 * @returns A function suitable for TransformStream's `transform` property
 */
export function handleTransform<T, O, S = never>(
  errorMode: OperatorErrorMode,
  transform: 
    TransformFunctionOptions<T, O>['transform'] |
    StatefulTransformFunctionOptions<T, O, S>['transform'],
  context: TransformHandlerContext<S> = { }
): Transformer<T, O>['transform'] {
  const operatorName = context.operatorName || `operator:unknown`;
  const isStateful = context.isStateful || false;
  const state = context.state;

  switch (errorMode) {
    case "pass-through":
      return async function (chunk: T, controller: TransformStreamDefaultController<O>) {
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
      return async function (chunk: T, controller: TransformStreamDefaultController<O>) {
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
      return async function (chunk: T, controller: TransformStreamDefaultController<O>) {
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
      return async function (chunk: T, controller: TransformStreamDefaultController<O>) {
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
 * Lifecycle error handling for the start of the stream
 * 
 * The start() lifecycle method runs once when a TransformStream is created.
 * Unlike transform(), performance isn't critical here, but error handling
 * consistency is. This wrapper ensures start() failures are handled the
 * same way across all error modes.
 * 
 * Key difference: Start errors often indicate setup failures that should
 * terminate the stream immediately (unlike transform errors which might
 * be recoverable).
 * 
 * @example
 * ```ts
 * // Database connection setup that might fail
 * createOperator({
 *   errorMode: 'pass-through',
 *   start(controller) {
 *     // If this throws, it becomes an ObservableError in the stream
 *     this.db = connectToDatabase(); 
 *   },
 *   transform(chunk, controller) {
 *     const result = this.db.process(chunk);
 *     controller.enqueue(result);
 *   }
 * });
 * ```
 * 
 * @typeParam T - Input chunk type
 * @typeParam O - Output chunk type
 * @typeParam S - State type (for stateful operators)
 * @param errorMode - How to handle errors ("pass-through", "ignore", "throw", "manual")
 * @param start - Your start function (stateless or stateful, optional)
 * @param context - Info about the operator, including name and state
 * @returns A function suitable for TransformStream's `start` property, or undefined
 */
export function handleStart<T, O, S extends unknown = undefined>(
  errorMode: OperatorErrorMode,
  start?: 
    TransformFunctionOptions<T, O>['start'] |
    StatefulTransformFunctionOptions<T, O, S>['start'],
  context: TransformHandlerContext<S> = { }
): Transformer<T, O>['start'] {
  if (!start) return;

  const operatorName = context.operatorName || `operator:unknown`;
  const isStateful = context.isStateful || false;
  const state = context.state;

  return async function (controller: TransformStreamDefaultController<O>) {
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
 * Lifecycle error handling for stream cleanup
 * 
 * The flush() method runs once when the input stream ends. This is your
 * last chance to emit final values or clean up resources. Flush errors
 * should typically terminate the stream since there's no more input to process.
 * 
 * Common use cases: Emitting buffered data, closing file handles,
 * sending final aggregated results.
 * 
 * @example
 * ```ts
 * // Buffer that flushes remaining items on stream end
 * createOperator({
 *   errorMode: 'throw', // Any flush error should fail the stream
 *   transform(chunk, controller) {
 *     this.buffer.push(chunk);
 *     if (this.buffer.length >= 10) {
 *       controller.enqueue([...this.buffer]);
 *       this.buffer.length = 0;
 *     }
 *   },
 *   flush(controller) {
 *     // Emit any remaining buffered items
 *     if (this.buffer.length > 0) {
 *       controller.enqueue([...this.buffer]);
 *     }
 *     // If this throws, stream fails (as intended)
 *     this.cleanup();
 *   }
 * });
 * ```
 * 
 * @typeParam T - Input chunk type
 * @typeParam O - Output chunk type
 * @typeParam S - State type (for stateful operators)
 * @param errorMode - How to handle errors ("pass-through", "ignore", "throw", "manual")
 * @param flush - Your flush function (stateless or stateful, optional)
 * @param context - Info about the operator, including name and state
 * @returns A function suitable for TransformStream's `flush` property, or undefined
 */
export function handleFlush<T, O, S extends unknown = undefined>(
  errorMode: OperatorErrorMode,
  flush?: TransformFunctionOptions<T, O>['flush'] |
    StatefulTransformFunctionOptions<T, O, S>['flush'],
  context: TransformHandlerContext<S> = { }
): Transformer<T, O>['flush'] {
  if (!flush) return;

  const operatorName = context.operatorName || `operator:unknown`;
  const isStateful = context.isStateful || false;
  const state = context.state;
  
  return async function (controller: TransformStreamDefaultController<O>) {
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
 * Creates operators that maintain state across stream chunks
 * 
 * Problem: Many stream operations need memory (scanning, buffering, counting, etc.)
 * but TransformStream doesn't provide built-in state management.
 * 
 * Solution: This function handles state creation, lifecycle integration, and
 * memory cleanup automatically. State is created once per stream and passed
 * to all lifecycle methods.
 * 
 * Memory safety: State is held in closure only for the stream's lifetime.
 * When the stream ends, state becomes eligible for garbage collection.
 * 
 * Performance: State access is direct (no lookups), and error handling
 * is pre-compiled just like createOperator().
 * 
 * @example
 * ```ts
 * // Running average that needs to remember previous values
 * const runningAverage = () => createStatefulOperator({
 *   name: 'runningAverage',
 *   createState: () => ({ sum: 0, count: 0 }),
 *   
 *   transform(chunk, state, controller) {
 *     state.sum += chunk;
 *     state.count++;
 *     controller.enqueue(state.sum / state.count);
 *   },
 *   
 *   // State automatically cleaned up when stream ends
 * });
 * 
 * // Time-based window that needs periodic cleanup
 * const timeWindow = (ms) => createStatefulOperator({
 *   name: 'timeWindow',
 *   createState: () => ({ items: [], timer: null }),
 *   
 *   start(state, controller) {
 *     // Set up timer using state
 *     state.timer = setInterval(() => {
 *       if (state.items.length > 0) {
 *         controller.enqueue([...state.items]);
 *         state.items.length = 0;
 *       }
 *     }, ms);
 *   },
 *   
 *   transform(chunk, state, controller) {
 *     state.items.push(chunk);
 *   },
 *   
 *   flush(state, controller) {
 *     clearInterval(state.timer); // Cleanup
 *     if (state.items.length > 0) {
 *       controller.enqueue([...state.items]);
 *     }
 *   }
 * });
 * ```
 */
// For "ignore" error mode - no ObservableErrors in output
export function createStatefulOperator<T, R, S, O extends ExcludeError<R> = ExcludeError<R>>(
  options: StatefulTransformFunctionOptions<T, O, S> & { errorMode: "ignore" }
): Operator<T, O>;

// For "throw" error mode - no ObservableErrors in output
export function createStatefulOperator<T, R, S, O extends ExcludeError<R> = ExcludeError<R>>(
  options: StatefulTransformFunctionOptions<T, O, S> & { errorMode: "throw" }
): Operator<T, O>;

// For "pass-through" error mode - output includes ObservableErrors
export function createStatefulOperator<T, R, S, O extends R | ObservableError = R | ObservableError>(
  options: StatefulTransformFunctionOptions<T, O, S> & { errorMode?: "pass-through" }
): Operator<T, O>;

// For "manual" error mode - output is entirely up to the implementation
export function createStatefulOperator<T, R, S, O = R>(
  options: StatefulTransformFunctionOptions<T, O, S> & { errorMode: "manual" }
): Operator<T, O>;

// Default case
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
          // Transform function to process each chunk
          start: handleStart(errorMode, start, { operatorName, isStateful: true, state }),

          // Start function called when the stream is initialized
          transform: handleTransform(errorMode, transform, { operatorName, isStateful: true, state }),

          // Flush function called when the input is done
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
