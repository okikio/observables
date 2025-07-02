import type { ObservableError } from "../error.ts";

/**
 * Type representing a stream operator function
 * Transforms a ReadableStream of type In to a ReadableStream of type Out
 */
export type Operator<In, Out> = (stream: ReadableStream<In>) => ReadableStream<Out>;
export type ExcludeError<T> = Exclude<T, ObservableError>;

/**
 * Represents an operator that only produces clean results (no ObservableError).
 * This is what safeCompose returns - guaranteed error-free output.
 */
export type SafeOperator<T, R> = Operator<
  T | ObservableError,
  ExcludeError<R>
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
  ignoreErrors?: boolean;

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
  ignoreErrors?: boolean;

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
