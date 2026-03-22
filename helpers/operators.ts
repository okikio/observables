/**
 * Operators reshape a stream without consuming it.
 *
 * If `subscribe()` answers "what should happen when a value arrives?", an
 * operator answers "what should the next value look like, and when should it
 * arrive?" Operators let one Observable feed another, so a button click can
 * become a debounced search term, a search term can become a network request,
 * and a network request can become parsed JSON.
 *
 * Start with the array analogy, then extend it. `Array.map()` and
 * `Array.filter()` work on values you already have in memory. Observable
 * operators do similar jobs for values that arrive over time.
 *
 * ```text
 * array values      -> map/filter -> final array
 * stream values     -> operators  -> next Observable
 * ```
 *
 * That time dimension changes what the operator runtime has to manage:
 * cancellation, backpressure, teardown, and failures that might happen after
 * some values have already flowed downstream.
 *
 * These operator builders lean on `TransformStream` because it already models
 * "read one chunk, write zero or more chunks" well. The builders add the rules
 * that matter for Observable pipelines:
 *
 * - wrapped errors can keep moving downstream instead of killing the whole
 *   pipeline immediately
 * - cancellation from later stages tears earlier work down predictably
 * - stateful stages create fresh state per subscription instead of sharing it
 *   accidentally
 *
 * The default error mode is the biggest mental shift. In pass-through mode, a
 * thrown error becomes an `ObservableError` value. Later stages can recover,
 * drop, summarize, or rethrow it.
 *
 * ```text
 * clean value     -> transform callback runs -> transformed value
 * thrown error    -> wrapped as ObservableError -> downstream error stage decides
 * ```
 *
 * That is why built-in data operators such as `map()` and `filter()` keep your
 * callback focused on ordinary values. Wrapped errors bypass the callback and
 * keep moving until an error-oriented operator handles them.
 *
 * `createStatefulOperator()` adds one more piece: memory that belongs to one
 * subscription. That is useful for running totals, moving windows, and other
 * logic where later chunks depend on earlier ones.
 *
 * @example Building a simple custom operator
 * ```ts
 * const double = createOperator<number, number>({
 *   name: 'double',
 *   transform(value, controller) {
 *     controller.enqueue(value * 2);
 *   },
 * });
 *
 * pipe(
 *   Observable.from([1, 2, 3]),
 *   double,
 * ).subscribe(console.log);
 * // 2, 4, 6
 * ```
 *
 * @example Recovering from bad JSON without stopping the stream
 * ```ts
 * const parseJson = createOperator<string, unknown>({
 *   name: 'parseJson',
 *   errorMode: 'pass-through',
 *   transform(value, controller) {
 *     controller.enqueue(JSON.parse(value));
 *   },
 * });
 *
 * pipe(
 *   Observable.from(['{"ok":true}', 'bad json', '{"ok":false}']),
 *   parseJson,
 *   catchErrors({ ok: null }),
 * ).subscribe(console.log);
 * ```
 *
 * @example Keeping state per subscription
 * ```ts
 * const runningSum = createStatefulOperator<number, number, { sum: number }>({
 *   name: 'runningSum',
 *   createState: () => ({ sum: 0 }),
 *   transform(value, state, controller) {
 *     state.sum += value;
 *     controller.enqueue(state.sum);
 *   },
 * });
 *
 * pipe(
 *   Observable.from([1, 2, 3]),
 *   runningSum,
 * ).subscribe(console.log);
 * // 1, 3, 6
 * ```
 *
 * @module
 */

import type {
  CreateOperatorOptions,
  ExcludeError,
  Operator,
  OperatorErrorMode,
  StatefulTransformFunctionOptions,
  TransformFunctionOptions,
  TransformHandlerContext,
  TransformStreamOptions,
} from "./_types.ts";

import { injectError, isTransformStreamOptions } from "./utils.ts";
import { isObservableError, ObservableError } from "../error.ts";

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
// For "pass-through" error mode - output includes ObservableErrors
export function createOperator<
  T,
  R,
  O extends R | ObservableError = R | ObservableError,
>(
  options: TransformFunctionOptions<T, O> & { errorMode?: "pass-through" },
): Operator<T, O>;
/**
 * Creates a pass-through operator from a pre-built TransformStream factory.
 */
export function createOperator<
  T,
  R,
  O extends R | ObservableError = R | ObservableError,
>(
  options: TransformStreamOptions<T, O> & { errorMode?: "pass-through" },
): Operator<T, O>;

/**
 * Creates an ignore-mode operator from a transform callback.
 */
export function createOperator<
  T,
  R,
  O extends ExcludeError<R> = ExcludeError<R>,
>(
  options: TransformFunctionOptions<T, O> & { errorMode: "ignore" },
): Operator<T, O>;
/**
 * Creates an ignore-mode operator from a TransformStream factory.
 */
export function createOperator<
  T,
  R,
  O extends ExcludeError<R> = ExcludeError<R>,
>(
  options: TransformStreamOptions<T, O> & { errorMode: "ignore" },
): Operator<T, O>;

/**
 * Creates a throw-mode operator from a transform callback.
 */
export function createOperator<
  T,
  R,
  O extends ExcludeError<R> = ExcludeError<R>,
>(
  options: TransformFunctionOptions<T, O> & { errorMode: "throw" },
): Operator<T, O>;
/**
 * Creates a throw-mode operator from a TransformStream factory.
 */
export function createOperator<
  T,
  R,
  O extends ExcludeError<R> = ExcludeError<R>,
>(
  options: TransformStreamOptions<T, O> & { errorMode: "throw" },
): Operator<T, O>;

/**
 * Creates a manual-mode operator from a transform callback.
 */
export function createOperator<T, R, O = R>(
  options: TransformFunctionOptions<T, O> & { errorMode: "manual" },
): Operator<T, O>;
/**
 * Creates a manual-mode operator from a TransformStream factory.
 */
export function createOperator<T, R, O = R>(
  options: TransformStreamOptions<T, O> & { errorMode: "manual" },
): Operator<T, O>;

// Default case
export function createOperator<
  T,
  R,
  O extends R | ExcludeError<R> | ObservableError =
    | R
    | ExcludeError<R>
    | ObservableError,
>(
  options: CreateOperatorOptions<T, O>,
): Operator<T, unknown> {
  // Extract operator name from options or the function name for better error reporting
  const operatorName = `operator:${options.name || "unknown"}`;
  const errorMode = (options as TransformFunctionOptions<T, O>)?.errorMode ??
    "pass-through";

  // Extract only what we need to avoid retaining the full options object
  const transform = (options as TransformFunctionOptions<T, O>)?.transform;
  const start = (options as TransformFunctionOptions<T, O>)?.start;
  const flush = (options as TransformFunctionOptions<T, O>)?.flush;
  const cancel = (options as TransformFunctionOptions<T, O>)?.cancel;

  return (source) => {
    try {
      // Create a transform stream with the provided options
      const transformStream = isTransformStreamOptions(options)
        ? options.stream(options)
        : new TransformStream<T, O>(
          {
            // Transform function to process each chunk
            transform: handleTransform(errorMode, transform, { operatorName }),

            // Start function called when the stream is initialized
            start: handleStart(errorMode, start, { operatorName }),

            // Flush function called when the input is done
            flush: handleFlush(errorMode, flush, { operatorName }),
          },
          { highWaterMark: 1 },
          { highWaterMark: 0 },
        );

      // Pipe the source through the transform and bind downstream cancellation
      return wrapStreamWithCancel(source.pipeThrough(transformStream), {
        cancel: handleCancel(errorMode, cancel, { operatorName }),
      });
    } catch (err) {
      // If setup fails, return a stream that errors immediately
      return source.pipeThrough(
        injectError(err, `${operatorName}:setup`, options),
      );
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
    | TransformFunctionOptions<T, O>["transform"]
    | StatefulTransformFunctionOptions<T, O, S>["transform"],
  context: TransformHandlerContext<S> = {},
): Transformer<T, O>["transform"] {
  const operatorName = context.operatorName || `operator:unknown`;
  const isStateful = context.isStateful || false;
  const state = context.state;

  switch (errorMode) {
    case "pass-through":
      return async function (
        chunk: T,
        controller: TransformStreamDefaultController<O>,
      ) {
        if (isObservableError(chunk)) {
          controller.enqueue(chunk as O);
          return;
        }

        try {
          if (isStateful) {
            // If stateful, pass the state along
            return await (transform as StatefulTransformFunctionOptions<
              T,
              O,
              S
            >["transform"])(chunk, state as S, controller);
          }

          await (transform as TransformFunctionOptions<T, O>["transform"])(
            chunk,
            controller,
          );
        } catch (err) {
          controller.enqueue(
            ObservableError.from(err, operatorName, chunk) as O,
          );
        }
      };

    case "ignore":
      return async function (
        chunk: T,
        controller: TransformStreamDefaultController<O>,
      ) {
        if (isObservableError(chunk)) return;

        try {
          if (isStateful) {
            // If stateful, pass the state along
            return await (transform as StatefulTransformFunctionOptions<
              T,
              O,
              S
            >["transform"])(chunk, state as S, controller);
          }

          await (transform as TransformFunctionOptions<T, O>["transform"])(
            chunk,
            controller,
          );
        } catch (_) {
          // Silently ignore errors
          return;
        }
      };

    case "throw":
      return async function (
        chunk: T,
        controller: TransformStreamDefaultController<O>,
      ) {
        if (isObservableError(chunk)) {
          return controller.error(
            ObservableError.from(chunk, operatorName, chunk),
          );
        }

        try {
          if (isStateful) {
            // If stateful, pass the state along
            return await (transform as StatefulTransformFunctionOptions<
              T,
              O,
              S
            >["transform"])(chunk, state as S, controller);
          }

          await (transform as TransformFunctionOptions<T, O>["transform"])(
            chunk,
            controller,
          );
        } catch (err) {
          return controller.error(
            ObservableError.from(err, operatorName, chunk),
          );
        }
      };

    case "manual":
    default:
      return async function (
        chunk: T,
        controller: TransformStreamDefaultController<O>,
      ) {
        // In manual mode, user is expected to handle ALL errors
        // If they don't catch something, let it bubble up and error the stream
        if (isStateful) {
          // If stateful, pass the state along
          return await (transform as StatefulTransformFunctionOptions<
            T,
            O,
            S
          >["transform"])(chunk, state as S, controller);
        }

        await (transform as TransformFunctionOptions<T, O>["transform"])(
          chunk,
          controller,
        );
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
    | TransformFunctionOptions<T, O>["start"]
    | StatefulTransformFunctionOptions<T, O, S>["start"],
  context: TransformHandlerContext<S> = {},
): Transformer<T, O>["start"] {
  if (!start) return;

  const operatorName = context.operatorName || `operator:unknown`;
  const isStateful = context.isStateful || false;
  const state = context.state;

  return async function (controller: TransformStreamDefaultController<O>) {
    try {
      if (isStateful) {
        // If stateful, pass the state along
        return await (start as StatefulTransformFunctionOptions<
          unknown,
          O,
          S
        >["start"])!(state as S, controller);
      }

      return await (start as TransformFunctionOptions<unknown, O>["start"])!(
        controller,
      );
    } catch (err) {
      switch (errorMode) {
        case "ignore":
          controller.terminate();
          break;
        case "throw":
          return controller.error(
            ObservableError.from(err, `${operatorName}:start`),
          );
        case "pass-through":
          controller.enqueue(
            ObservableError.from(err, `${operatorName}:start`) as O,
          );
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
  flush?:
    | TransformFunctionOptions<T, O>["flush"]
    | StatefulTransformFunctionOptions<T, O, S>["flush"],
  context: TransformHandlerContext<S> = {},
): Transformer<T, O>["flush"] {
  if (!flush) return;

  const operatorName = context.operatorName || `operator:unknown`;
  const isStateful = context.isStateful || false;
  const state = context.state;

  return async function (controller: TransformStreamDefaultController<O>) {
    try {
      if (isStateful) {
        // If stateful, pass the state along
        return await (flush as StatefulTransformFunctionOptions<
          unknown,
          O,
          S
        >["flush"])!(state as S, controller);
      }

      return await (flush as TransformFunctionOptions<unknown, O>["flush"])!(
        controller,
      );
    } catch (err) {
      switch (errorMode) {
        case "ignore":
          controller.terminate();
          break;
        case "throw":
          return controller.error(
            ObservableError.from(err, `${operatorName}:flush`),
          );
        case "pass-through":
          controller.enqueue(
            ObservableError.from(err, `${operatorName}:flush`) as O,
          );
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
 * Lifecycle handling for downstream cancellation cleanup.
 *
 * `flush()` runs when the source ends normally. `cancel()` runs when a consumer
 * stops early, for example by unsubscribing, breaking out of `for await`, or
 * otherwise cancelling the pipeline before the source completes.
 *
 * ```text
 * source completes normally  -> flush()
 * consumer stops early       -> cancel(reason)
 * ```
 *
 * That distinction matters for operators that hold timers, inner
 * subscriptions, or abort controllers. Those resources should be released when
 * the consumer goes away, even if the source never reached completion.
 *
 * Cleanup here is intentionally not treated like transform output. If the
 * cleanup callback fails, the cancellation promise rejects, but no
 * `ObservableError` is emitted into the stream because the consumer has already
 * said it is no longer interested in more values.
 *
 * @typeParam T - Input chunk type
 * @typeParam O - Output chunk type
 * @typeParam S - State type (for stateful operators)
 * @param _errorMode - Unused here. Cancellation cleanup does not route through
 * the operator error modes because it is teardown, not part of the data path.
 * @param cancel - Your cancellation handler (stateless or stateful, optional)
 * @param context - Info about the operator, including name and state
 * @returns A function suitable for a ReadableStream `cancel` hook, or undefined
 */
export function handleCancel<T, O, S extends unknown = undefined>(
  _errorMode: OperatorErrorMode,
  cancel?:
    | TransformFunctionOptions<T, O>["cancel"]
    | StatefulTransformFunctionOptions<T, O, S>["cancel"],
  context: TransformHandlerContext<S> = {},
): ((reason?: unknown) => Promise<void>) | undefined {
  if (!cancel) return;

  const operatorName = context.operatorName || `operator:unknown`;
  const isStateful = context.isStateful || false;
  const state = context.state;

  return async function (reason?: unknown): Promise<void> {
    try {
      if (isStateful) {
        await (cancel as StatefulTransformFunctionOptions<T, O, S>["cancel"])!(
          state as S,
          reason,
        );
        return;
      }

      await (cancel as TransformFunctionOptions<T, O>["cancel"])!(reason);
    } catch (err) {
      throw ObservableError.from(err, `${operatorName}:cancel`, reason);
    }
  };
}

/**
 * Wraps a transformed stream so operator-level cleanup runs when a downstream
 * consumer stops early.
 *
 * This wrapper has a deliberately narrow job: it forwards readable-side
 * cancellation to an operator cleanup callback while preserving the chunks
 * coming from the wrapped stream. It does not try to redefine TransformStream
 * semantics or reinterpret cancellation as a normal data-path error.
 *
 * ```text
 * source -> TransformStream -> wrapped readable -> consumer
 *                                |
 *                                +-> cancel(reason)
 * ```
 *
 * @typeParam T - Output chunk type of the wrapped stream
 * @param stream - The transformed stream to expose downstream
 * @param options - Cancellation behavior for the wrapped stream
 * @returns A readable stream that preserves output values and forwards cancel
 */
export function wrapStreamWithCancel<T>(
  stream: ReadableStream<T>,
  options: {
    /**
     * Cleanup to run if the consumer cancels the stream before it completes.
     */
    cancel?: (reason?: unknown) => void | Promise<void>;
  } = {},
): ReadableStream<T> {
  if (!options.cancel) return stream;

  const reader = stream.getReader();
  let settled = false;

  // The wrapper acquires an exclusive reader, so releasing it exactly once
  // keeps teardown predictable even when both cancel and read completion race.
  const release = (): void => {
    if (settled) return;
    settled = true;

    try {
      reader.releaseLock();
    } catch {
      // Releasing the reader is best-effort during teardown.
    }
  };

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        // Forward chunks one-by-one so downstream backpressure still controls
        // how quickly we read from the wrapped stream.
        const { done, value } = await reader.read();

        if (done) {
          release();
          controller.close();
          return;
        }

        controller.enqueue(value);
      } catch (err) {
        release();
        controller.error(err);
      }
    },

    async cancel(reason) {
      try {
        // Run operator cleanup first so resources such as timers or inner
        // subscriptions are released before we cancel the wrapped reader.
        await options.cancel?.(reason);
      } finally {
        try {
          // Cancelling the reader tells the wrapped stream that nobody wants
          // more output. Any rejection here is surfaced through the returned
          // cancellation promise instead of being emitted as a chunk.
          await reader.cancel(reason);
        } finally {
          release();
        }
      }
    },
  });
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

// For "pass-through" error mode - output includes ObservableErrors
export function createStatefulOperator<
  T,
  R,
  S,
  O extends R | ObservableError = R | ObservableError,
>(
  options: StatefulTransformFunctionOptions<T, O, S> & {
    errorMode?: "pass-through";
  },
): Operator<T, O>;

/**
 * Creates an ignore-mode stateful operator.
 */
export function createStatefulOperator<
  T,
  R,
  S,
  O extends ExcludeError<R> = ExcludeError<R>,
>(
  options: StatefulTransformFunctionOptions<T, O, S> & { errorMode: "ignore" },
): Operator<T, O>;

/**
 * Creates a throw-mode stateful operator.
 */
export function createStatefulOperator<
  T,
  R,
  S,
  O extends ExcludeError<R> = ExcludeError<R>,
>(
  options: StatefulTransformFunctionOptions<T, O, S> & { errorMode: "throw" },
): Operator<T, O>;

/**
 * Creates a manual-mode stateful operator.
 */
export function createStatefulOperator<T, R, S, O = R>(
  options: StatefulTransformFunctionOptions<T, O, S> & { errorMode: "manual" },
): Operator<T, O>;

// Default case
export function createStatefulOperator<
  T,
  R,
  S,
  O extends R | ExcludeError<R> | ObservableError =
    | R
    | ExcludeError<R>
    | ObservableError,
>(
  options: StatefulTransformFunctionOptions<T, O, S>,
): Operator<T, unknown> {
  // Extract operator name from options or the function name for better error reporting
  const operatorName = `operator:stateful:${options.name || "unknown"}`;
  const errorMode =
    (options as StatefulTransformFunctionOptions<T, O, S>)?.errorMode ??
      "pass-through";

  // Extract only what we need to avoid retaining the full options object
  const transform = (options as StatefulTransformFunctionOptions<T, O, S>)
    ?.transform;
  const start = (options as StatefulTransformFunctionOptions<T, O, S>)?.start;
  const flush = (options as StatefulTransformFunctionOptions<T, O, S>)?.flush;
  const cancel = (options as StatefulTransformFunctionOptions<T, O, S>)?.cancel;

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
          injectError(err, `${operatorName}:create:state`, options),
        );
      }

      // Create a transform stream with the provided options
      const transformStream = new TransformStream<T, O>(
        {
          // Transform function to process each chunk
          start: handleStart(errorMode, start, {
            operatorName,
            isStateful: true,
            state,
          }),

          // Start function called when the stream is initialized
          transform: handleTransform(errorMode, transform, {
            operatorName,
            isStateful: true,
            state,
          }),

          // Flush function called when the input is done
          flush: handleFlush(errorMode, flush, {
            operatorName,
            isStateful: true,
            state,
          }),
        },
        { highWaterMark: 1 },
        { highWaterMark: 0 },
      );

      // Pipe the source through the transform and bind downstream cancellation
      return wrapStreamWithCancel(source.pipeThrough(transformStream), {
        cancel: handleCancel(errorMode, cancel, {
          operatorName,
          isStateful: true,
          state,
        }),
      });
    } catch (err) {
      // If setup fails, return a stream that errors immediately
      return source.pipeThrough(
        injectError(err, `${operatorName}:setup`, options),
      );
    }
  };
}
