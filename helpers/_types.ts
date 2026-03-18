// deno-lint-ignore-file no-explicit-any
import type { ObservableError } from "../error.ts";
import type { Observable } from "../observable.ts";

/**
 * Type representing a stream operator function
 * Transforms a ReadableStream of type In to a ReadableStream of type Out
 */
export type Operator<In, Out> = (
  stream: ReadableStream<In>,
) => ReadableStream<Out>;

/**
 * Removes `ObservableError` from a type so operators can describe
 * error-filtered output channels.
 */
export type ExcludeError<T> = Exclude<T, ObservableError>;

/**
 * Represents an operator slot in a pipeline where the previous operator may
 * or may not have filtered `ObservableError` values out of the stream.
 */
export type OperatorItem<T, R> = Operator<T, R> | Operator<T, ExcludeError<R>>;

/**
 * Infers the item type contributed by either an Observable source or an
 * operator in a pipe chain.
 */
export type InferSourceType<TSource extends unknown> = TSource extends
  Observable<unknown> ? InferObservableType<TSource>
  : TSource extends OperatorItem<unknown, unknown>
    ? InferOperatorItemOutputType<TSource>
  : TSource;

/**
 * Extracts the chunk type emitted by an operator.
 */
export type InferOperatorItemOutputType<
  TSource extends OperatorItem<any, any>,
> = ReturnType<TSource> extends ReadableStream<infer T> ? T : never;

/**
 * Extracts the value type emitted by an Observable.
 */
export type InferObservableType<TSource extends Observable<unknown>> =
  TSource extends Observable<infer R> ? R : any;

/**
 * Returns the first item in a non-empty tuple.
 */
export type FirstTupleItem<TTuple extends readonly [unknown, ...unknown[]]> =
  TTuple[0];

/**
 * Returns the last item in any tuple shape.
 */
export type GenericLastTupleItem<T extends readonly any[]> = T extends
  [...infer _, infer L] ? L : never;

/**
 * Returns the last tuple item only when it is a valid operator item.
 */
export type LastTupleItem<T extends readonly unknown[]> =
  GenericLastTupleItem<T> extends OperatorItem<any, any>
    ? GenericLastTupleItem<T>
    : never;

/**
 * Computes the Observable type returned by a `pipe()` call from the source and
 * its final operator.
 */
export type ObservableWithPipe<
  TPipe extends readonly [Observable<unknown>, ...OperatorItem<any, unknown>[]],
> = Observable<InferOperatorItemOutputType<LastTupleItem<TPipe>>>;

/**
 * Type representing how to handle errors in operators
 * - "ignore" => errors wrapped in ObservableError will be used as values
 *               and can then be transformed as the operator sees fit
 * - "pass-through" => errors automatically pass through, meaning ObservableError
 *                     will not appear as a value
 * - "throw" => errors will cause the stream to throw and terminate
 * - "manual" => errors are passed to the transform function to handle manually
 */
export type OperatorErrorMode = "ignore" | "pass-through" | "throw" | "manual";

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
  stream: (opts: TransformStreamOptions<T, R>) => TransformStream<T, R>;
}

/**
 * Options for custom transformation logic
 */
export interface TransformFunctionOptions<T, R> extends BaseTransformOptions {
  /**
   * How to handle errors in the stream:
   * - "ignore" => errors wrapped in ObservableError will be used as values
   *               and can then be transformed as the operator sees fit
   * - "pass-through" => errors automatically pass through, meaning ObservableError
   *                     will not appear as a value
   * - "throw" => errors will cause the stream to throw and terminate
   * - "manual" => errors are passed to the transform function to handle manually
   * @default "pass-through"
   */
  errorMode?: OperatorErrorMode;

  /**
   * Function to transform each chunk
   * @param chunk - The input chunk
   * @param controller - The TransformStreamDefaultController
   * @returns The transformed chunk(s) or undefined to filter out the chunk
   */
  transform: (
    chunk: T,
    controller: TransformStreamDefaultController<R>,
  ) => R | undefined | void | null | Promise<R | undefined | void | null>;

  /**
   * Function called when the stream is about to close
   * Can enqueue final chunks before closing
   * @param controller - The TransformStreamDefaultController
   */
  flush?: (
    controller: TransformStreamDefaultController<R>,
  ) => void | Promise<void>;

  /**
   * Called when the stream starts, before processing any chunks
   * @param controller - The TransformStreamDefaultController
   */
  start?: (
    controller: TransformStreamDefaultController<R>,
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
export interface StatefulTransformFunctionOptions<T, R, S>
  extends BaseTransformOptions {
  /**
   * How to handle errors in the stream:
   * - "ignore" => errors wrapped in ObservableError will be used as values
   *               and can then be transformed as the operator sees fit
   * - "pass-through" => errors automatically pass through, meaning ObservableError
   *                     will not appear as a value
   * - "throw" => errors will cause the stream to throw and terminate
   * - "manual" => errors are passed to the transform function to handle manually
   * @default "pass-through"
   */
  errorMode?: OperatorErrorMode;

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
    controller: TransformStreamDefaultController<R>,
  ) => void | Promise<void>;

  /**
   * Function called when the stream is about to close
   * Can enqueue final chunks based on the state
   * @param state - The final state
   * @param controller - The TransformStreamDefaultController
   */
  flush?: (
    state: S,
    controller: TransformStreamDefaultController<R>,
  ) => void | Promise<void>;

  /**
   * Called when the stream starts, before processing any chunks
   * @param state - The initial state
   * @param controller - The TransformStreamDefaultController
   */
  start?: (
    state: S,
    controller: TransformStreamDefaultController<R>,
  ) => void | Promise<void>;

  /**
   * Called when the stream is cancelled before natural completion
   * @param state - The current state
   */
  cancel?: (
    state: S,
    reason?: unknown,
  ) => void | Promise<void>;
}

/**
 * Context for transform handlers
 * This interface provides additional information for the transform handler,
 * such as the operator name, whether it is
 * stateful, and any associated state.
 * @typeParam S - State type (if applicable)
 */
export interface TransformHandlerContext<S extends unknown = undefined> {
  /**
   * Human-readable operator name used in wrapped error messages.
   */
  operatorName?: string;
  /**
   * Indicates that the lifecycle handler should pass shared state through.
   */
  isStateful?: boolean;
  /**
   * Shared operator state for stateful transforms.
   */
  state?: S;
}
