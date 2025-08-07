// @filename: error.ts
/**
 * Error handling utilities for Observable operators
 * 
 * @module
 */

import type { SpecObserver } from "./_spec.ts";

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

  /** Helpful potential fixes for errors */
  readonly tip?: unknown;

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
      tip?: unknown;
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
    this.tip = options?.tip;
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

    if (this.tip) {
      result += `\n  tip: ${this.tip}`
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
    value?: unknown,
    tip?: unknown
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
            cause: error.cause,
            tip: error.tip
          }
        );
      }
      return error;
    }

    // Create a new ObservableError
    return new ObservableError(
      error,
      error instanceof Error ? error.message : String(error),
      { operator, value, cause: error, tip }
    );
  }
}


/**
 * Asserts that a value is not an ObservableError and narrows the TypeScript type.
 * 
 * This function acts as a TypeScript assertion function that:
 * 1. **Type Narrowing**: If the function returns normally, TypeScript knows the value is definitely T (not T | ObservableError)
 * 2. **Error Handling**: If the value is an ObservableError, either delegates to observer.error or throws
 * 3. **Never Returns on Error**: When value is ObservableError, this function never returns normally
 * 
 * **Key Behavior Changes**:
 * - Now uses TypeScript's `asserts value is T` for proper type narrowing
 * - When observer handles error, the function still doesn't return normally (assertion still fails)
 * - Only returns normally when value is definitely not an ObservableError
 * 
 * **Intent**: Provide type-safe error checking with automatic TypeScript type narrowing.
 * 
 * **Usage Patterns**:
 * ```typescript
 * // Type narrowing in operator results
 * const result: string | ObservableError = someOperation();
 * assertObservableError(result); // Throws if error
 * // TypeScript now knows result is string, not string | ObservableError
 * console.log(result.toUpperCase()); // ✅ No type error
 * 
 * // With observer error handling
 * const observer = { error: err => console.error('Error:', err) };
 * assertObservableError(result, observer); 
 * // Still throws/doesn't return normally on error, but observer is notified first
 * 
 * // In subscribe callbacks
 * observable.subscribe({
 *   next(value) { // value is T | ObservableError  
 *     assertObservableError(value); 
 *     // value is now narrowed to T
 *     processCleanValue(value);
 *   }
 * });
 * ```
 * 
 * @template T - The expected type of the value when it's not an error
 * @param value - The value to check, which may be either T or ObservableError
 * @param obs - Optional observer that may contain an error handler function
 * 
 * @throws {ObservableError} When value is an ObservableError (after notifying observer if provided)
 * 
 * @example Basic type narrowing
 * ```typescript
 * const mixed: string | ObservableError = getValue();
 * assertObservableError(mixed); // Throws if ObservableError
 * console.log(mixed.length); // ✅ TypeScript knows mixed is string
 * ```
 * 
 * @example With error observer  
 * ```typescript
 * const observer = {
 *   error: (err) => analytics.track('error', { message: err.message })
 * };
 * 
 * const mixed: User | ObservableError = fetchUser();
 * assertObservableError(mixed, observer); // Observer notified, then throws
 * console.log(mixed.name); // ✅ TypeScript knows mixed is User
 * ```
 * 
 * @example In operator pipeline
 * ```typescript
 * import { pipe, map, tap } from './helpers/mod.ts';
 * 
 * pipe(
 *   source,
 *   map(x => processX(x)), // Returns T | ObservableError
 *   tap(result => {
 *     assertObservableError(result); // Type narrows from T | ObservableError to T
 *     sendAnalytics(result); // ✅ result is definitely T
 *   })
 * )
 * ```
 */
export function assertObservableError<T>(value: T | ObservableError, obs?: SpecObserver<T>): asserts value is T { 
  if (value instanceof ObservableError) {
    // Notify observer first if available
    if (typeof obs?.error === "function") {
      try {
        obs.error(value);
      } catch (observerError) {
        // If observer throws, still throw the original error
        // but log the observer error to avoid losing it
        console.error("Observer error handler threw:", observerError);
      }
    }
    
    // Always throw when value is ObservableError
    // This ensures the function never returns normally for errors
    throw value;
  }
  
  // If we reach here, value is definitely T (not T | ObservableError)
  // TypeScript assertion function automatically narrows the type
}

/**
 * Checks if a value is an ObservableError without throwing exceptions.
 * 
 * When working with Observable pipelines, you often receive values that could be either successful 
 * results or errors. This creates a dilemma: how do you safely check what you got without risking 
 * crashes or poor performance? That's exactly what this function solves.
 * 
 * **Why This Function Exists**:
 * 
 * Imagine you're processing a stream of data where some items might be errors. Without a proper 
 * way to distinguish between good data and errors, you'd have to either:
 * - Risk calling methods on errors (which crashes your app)
 * - Write repetitive `instanceof` checks everywhere (which clutters your code)
 * - Use try/catch blocks for control flow (which hurts performance)
 * 
 * This function eliminates all those problems by giving you a clean, fast way to ask: 
 * "Is this thing an error?" If yes, you can handle it appropriately. If no, you can 
 * safely process it as valid data.
 * 
 * **How It Fits With Other Functions**:
 * 
 * Think of this as the gentle cousin of `assertObservableError()`. While `assertObservableError()` 
 * says "this better not be an error or I'm throwing an exception," this function politely asks 
 * "excuse me, are you an error?" and gives you a yes/no answer.
 * 
 * This makes it perfect for situations where you want to handle both success and error cases 
 * gracefully, rather than just crashing when something goes wrong.
 * 
 * **Performance Story**:
 * 
 * Under the hood, this function uses a simple `instanceof` check. Now, you might wonder: 
 * "Why not just use `instanceof` directly?" The answer lies in convenience and consistency.
 * 
 * Here's what actually happens performance-wise:
 * - This function IS an `instanceof` check (no performance difference there)
 * - Modern JavaScript engines are extremely good at optimizing `instanceof`
 * - The real performance win comes from avoiding try/catch blocks for control flow
 * - When the engine inlines this function, the overhead becomes virtually zero
 * 
 * **Performance Reality Check**:
 * - `isObservableError(value)` and `value instanceof ObservableError` perform identically
 * - Both are fast enough that you'll never notice the difference in real applications
 * - The real performance benefit is architectural: avoiding exceptions for normal control flow
 * - Exception throwing/catching can be 10-100x slower, but that's comparing apples to oranges
 * 
 * In practice, use this function because it's clearer and more consistent with the library's 
 * design patterns, not because of micro-optimizations.
 * 
 * **Common Ways to Use This Function**:
 * 
 * Let's walk through the most common scenarios where this function shines:
 * 
 * ```typescript
 * // Scenario 1: Branching logic in data processing
 * function processItem<T>(item: T | ObservableError) {
 *   if (isObservableError(item)) {
 *     // TypeScript now knows item is an ObservableError
 *     console.error('Something went wrong:', item.message);
 *     return null; // or however you want to handle errors
 *   }
 *   
 *   // TypeScript now knows item is T - no more type errors!
 *   return transformData(item);
 * }
 * 
 * // Scenario 2: Filtering out errors from a collection
 * // Note: You need proper type predicates for TypeScript to understand
 * const cleanData = mixedResults.filter((item): item is T => !isObservableError(item));
 * // cleanData is now properly typed as T[]
 * 
 * // Scenario 3: Separating errors from successes
 * const errors = results.filter(isObservableError);
 * const successes = results.filter((item): item is T => !isObservableError(item));
 * // Now you can handle each group with proper typing
 * 
 * // Scenario 4: Early exit optimization
 * function expensiveCalculation<T, U>(input: T | ObservableError): U | ObservableError {
 *   if (isObservableError(input)) {
 *     return input; // Don't waste time processing errors
 *   }
 *   
 *   // Only do expensive work on valid data
 *   return performComplexOperation(input);
 * }
 * ```
 * 
 * **What Makes This Function Safe**:
 * 
 * Unlike functions that might throw exceptions, this one is designed to never fail. 
 * It gracefully handles all the weird edge cases you might encounter:
 * - Null or undefined values? Returns false (they're not errors)
 * - Numbers, strings, or other primitives? Returns false (can't be ObservableErrors)
 * - Objects that aren't ObservableErrors? Returns false (not what we're looking for)
 * - Subclasses of ObservableError? Returns true (proper inheritance support)
 * 
 * This means you can safely call it on anything without worrying about crashes.
 * 
 * **When to Use This vs Other Options**:
 * 
 * Choose `isObservableError()` when:
 * - You want to handle both error and success cases in your code
 * - You're filtering or sorting mixed arrays of results and errors
 * - You're building conditional logic that branches based on error state
 * - You want to avoid exceptions and prefer explicit error handling
 * 
 * Choose `assertObservableError()` instead when:
 * - You expect the value to NOT be an error, and want to crash if it is
 * - You're in a context where errors should stop processing immediately
 * - You want TypeScript to automatically narrow types via assertion
 * 
 * @template T - The expected type for successful (non-error) values
 * @param value - Any value that might or might not be an ObservableError
 * @returns true if the value is an ObservableError, false otherwise
 * 
 * @example Simple error checking
 * ```typescript
 * const result: string | ObservableError = fetchData();
 * 
 * if (isObservableError(result)) {
 *   console.error('Oops, something went wrong:', result.message);
 *   // result is typed as ObservableError here
 *   return;
 * }
 * 
 * // result is typed as string here
 * console.log('Success! Got:', result.toUpperCase());
 * ```
 * 
 * @example Filtering errors from a list
 * ```typescript
 * const mixedResults: (User | ObservableError)[] = await fetchAllUsers();
 * 
 * // Get only the successful results (with proper type predicate)
 * const validUsers = mixedResults.filter((item): item is User => !isObservableError(item));
 * // validUsers is now correctly typed as User[]
 * 
 * // Get only the errors  
 * const errors = mixedResults.filter(isObservableError);
 * // errors is now typed as ObservableError[]
 * 
 * // Process each group separately
 * if (errors.length > 0) {
 *   console.error(`Found ${errors.length} errors:`, errors);
 * }
 * console.log(`Processing ${validUsers.length} valid users`);
 * ```
 * 
 * @example Building error-resilient operators
 * ```typescript
 * import { pipe } from './helpers/mod.ts';
 * 
 * function safeMap<T, U>(transform: (value: T) => U) {
 *   return (source: Observable<T | ObservableError>) => {
 *     return pipe(
 *       source,
 *       map(value => {
 *         // Skip processing errors - just pass them through
 *         if (isObservableError(value)) return value;
 *         
 *         // Only transform valid values
 *         try {
 *           return transform(value);
 *         } catch (error) {
 *           return ObservableError.from(error, 'safeMap', value);
 *         }
 *       })
 *     );
 *   };
 * }
 * 
 * // Usage
 * const result = pipe(
 *   mixedDataStream,
 *   safeMap(user => user.name.toUpperCase())
 * );
 * ```
 */
export function isObservableError<T = unknown>(value: T | ObservableError): value is ObservableError {
  // This is just a straightforward instanceof check
  // Modern JavaScript engines optimize this extremely well
  return value instanceof ObservableError;
}


