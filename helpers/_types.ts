import type { ObservableError } from "../error.ts";
import type { Observable } from "../observable.ts";

/**
 * Type representing a stream operator function
 * Transforms a ReadableStream of type In to a ReadableStream of type Out
 */
export type Operator<In, Out> = (stream: ReadableStream<In>) => ReadableStream<Out>;
export type ExcludeError<T> = Exclude<T, ObservableError>;

// Combines Operator and SafeOperator.
// Why: Supports mixed operators. Solves pipeline flexibility.
export type OperatorItem<T, R> = Operator<T, R> | Operator<T, ExcludeError<R>>;

// Inference Types
// Figures out the source type (Observable or Operator).
// Why: Ensures correct input type. Solves type safety in pipelines.
export type InferSourceType<TSource extends unknown> = 
  TSource extends Observable<unknown> ? InferObservableType<TSource> : 
  TSource extends OperatorItem<unknown, unknown> ? InferOperatorItemOutputType<TSource> : 
  TSource;

// Gets the output type of an OperatorItem.
// Why: Tracks operator output. Solves pipeline type resolution.
export type InferOperatorItemOutputType<TSource extends OperatorItem<any, any>> = 
  ReturnType<TSource> extends ReadableStream<infer T> ? T : never;

// Gets the data type an Observable emits.
// Why: Extracts Observable data type. Solves type-safe data access.
export type InferObservableType<TSource extends Observable<unknown>> = 
  TSource extends Observable<infer R> ? R : any;

// Utility Types
// Gets the first item of a tuple.
// Why: Accesses pipeline start. Solves type extraction.
export type FirstTupleItem<TTuple extends readonly [unknown, ...unknown[]]> = TTuple[0];

// Gets the last item of a tuple.
// Why: Finds final operator. Solves pipeline output typing.
export type GenericLastTupleItem<T extends readonly any[]> = 
  T extends [...infer _, infer L] ? L : never;

// Ensures last tuple item is an OperatorItem.
// Why: Validates pipeline end. Solves output type safety.
export type LastTupleItem<T extends readonly unknown[]> =
  GenericLastTupleItem<T> extends OperatorItem<any, any> ? GenericLastTupleItem<T> : never;

// Pipeline final type
// Defines Observable output based on last operator.
// Why: Sets pipeline result type. Solves type-safe output.
export type ObservableWithPipe<
  TPipe extends readonly [Observable<unknown>, ...OperatorItem<any, unknown>[]],
> = Observable<InferOperatorItemOutputType<LastTupleItem<TPipe>>>;

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
