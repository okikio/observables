import { ObservableError } from "./error.ts";

/**
 * Type representing a stream operator function
 * Transforms a ReadableStream of type T to a ReadableStream of type R
 */
export type Operator<T, R> = (stream: ReadableStream<T>) => ReadableStream<R | Iterable<R> | R[] | ObservableError>;

/**
 * Options for creating a transform operator
 */
export interface TransformOptions<T, R> {
  /**
   * Function to transform each chunk
   * @param chunk - The input chunk
   * @param controller - The TransformStreamDefaultController
   * @returns The transformed chunk(s) or undefined to filter out the chunk
   */
  transform: (
    chunk: T,
    controller: TransformStreamDefaultController<R>
  ) => R | Iterable<R> | R[] | undefined | void | Promise<R | Iterable<R> | R[] | undefined | void>;

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
 * Creates a stream operator with the specified transformation logic
 * 
 * @remarks
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
 * ```
 */
export function createOperator<T, R>(options: TransformOptions<T, R>): Operator<T, R> {
  return (source: ReadableStream<T>): ReadableStream<R | Iterable<R> | R[] | ObservableError> => {
    // Create a transform stream with the provided options
    const transformStream = new TransformStream<T, R | Iterable<R> | R[] | ObservableError>({
      // Transform function to process each chunk
      async transform(chunk, controller) {
        try {
          const result = await options.transform(chunk, controller);

          // If the transform returns a value (not undefined),
          // enqueue it unless it's already been handled by the controller
          if (result !== undefined && result !== null) {
            controller.enqueue(result);
          }
        } catch (err) {
          // If an error occurs during transformation, error the stream
          controller.enqueue(ObservableError.from(err, "operator"));
        }
      },

      // Start function called when the stream is initialized
      start: options.start,

      // Flush function called when the input is done
      flush: options.flush,

      // Cancel function called if the stream is cancelled
      cancel: options.cancel
    });

    // Pipe the source through the transform
    return source.pipeThrough(transformStream);
  };
}

/**
 * Options for creating a stateful operator
 */
export interface StatefulOperatorOptions<T, R, S> {
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

/**
 * Creates a stateful stream operator
 * 
 * @remarks
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
 * ```
 */
export function createStatefulOperator<T, R, S>(
  options: StatefulOperatorOptions<T, R, S>
): Operator<T, R> {
  return (source: ReadableStream<T>): ReadableStream<R | Iterable<R> | R[] | ObservableError> => {
    // Create state only when the stream is used
    let state: S;

    // Create a transform stream with the provided options
    const transformStream = new TransformStream<T, R | Iterable<R> | R[] | ObservableError>({
      start(controller) {
        // Initialize the state
        state = options.createState();

        // Call the start function if provided
        if (options.start) {
          return options.start(state, controller);
        }
      },

      transform(chunk, controller) {
        // Apply the transform function with the current state
        return options.transform(chunk, state, controller);
      },

      flush(controller) {
        // Call the flush function if provided
        if (options.flush) {
          return options.flush(state, controller);
        }
      },

      cancel(reason) {
        // Call the cancel function if provided
        if (options.cancel) {
          return options.cancel(state, reason);
        }
      }
    });

    // Pipe the source through the transform
    return source.pipeThrough(transformStream);
  };
}