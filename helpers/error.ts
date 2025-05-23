// @filename: helpers/error.ts
/**
 * Error handling utilities for Observable operators
 * 
 * @module
 */

/**
 * Represents an error that occurred during Observable operations,
 * with the ability to aggregate multiple underlying errors.
 * 
 * 
 * This class extends AggregateError to provide additional context about
 * where and how errors occurred in an Observable pipeline. It can collect
 * multiple errors that occur during a chain of operations while preserving
 * the contextual information about each error.
 * 
 * In addition, this class solves a crucial problem with error handling in ReadableStreams. When we call
 * `controller.error()` on a ReadableStream, it immediately puts the stream in an errored state,
 * which can cause values emitted before the error to be lost. By wrapping errors as special
 * values that flow through the normal value channel, we ensure all values emitted before an
 * error are properly processed.
 * 
 * Key features:
 * - Tracks which operator caused the error
 * - Captures the value being processed when the error occurred
 * - Aggregates multiple errors from a pipeline
 * - Preserves the original error objects
 * - Builds an error chain showing the full path of error propagation
 */
export class ObservableError extends AggregateError {
  /** The operator where the error occurred */
  readonly operator?: string;

  /** The value being processed when the error occurred */
  readonly value?: unknown;

  /**
   * Creates a new ObservableError.
   *
   * @param errors - The error(s) that caused this error
   * @param message - The error message
   * @param options - Additional error context
   */
  constructor(
    errors: Error | Error[] | unknown | unknown[],
    message: string,
    options?: {
      operator?: string;
      value?: unknown;
      cause?: unknown;
    }
  ) {
    // Normalize errors to an array of Error objects
    const errorArray = Array.isArray(errors) ? errors : [errors];
    const normalizedErrors = errorArray.map(err =>
      err instanceof Error ? err : new Error(String(err))
    );

    super(normalizedErrors, message, { cause: options?.cause });
    this.name = 'ObservableError';
    this.operator = options?.operator;
    this.value = options?.value;
  }

  /**
   * Returns a string representation of the error including the operator
   * and value context if available.
   */
  override toString(): string {
    let result = `${this.name}: ${this.message}`;

    if (this.operator) {
      result += `\n  in operator: ${this.operator}`;
    }

    if (this.value !== undefined) {
      const valueStr = typeof this.value === 'object'
        ? JSON.stringify(this.value).slice(0, 100) // Truncate long objects
        : String(this.value);

      result += `\n  processing value: ${valueStr}`;
    }

    if (this.errors.length > 0) {
      result += '\n  with errors:';
      this.errors.forEach((err, i) => {
        result += `\n    ${i + 1}) ${err}`;
      });
    }

    return result;
  }

  /**
   * Creates an ObservableError from any error that occurs during
   * operator execution.
   * 
   * @param error - The original error
   * @param operator - The operator name
   * @param value - The value being processed
   * @returns An ObservableError
   */
  static from(
    error: unknown,
    operator?: string,
    value?: unknown
  ): ObservableError {
    if (error instanceof ObservableError) {
      // If it's already an ObservableError, add context if not present
      if (!error.operator && operator) {
        return new ObservableError(
          error.errors,
          error.message,
          {
            operator,
            value: error.value || value,
            cause: error.cause
          }
        );
      }
      return error;
    }

    // Create a new ObservableError
    return new ObservableError(
      error,
      error instanceof Error ? error.message : String(error),
      { operator, value, cause: error }
    );
  }
}
