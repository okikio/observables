// @filename: error.ts
/**
 * Error values in this library can be handled as part of the value flow.
 *
 * In pass-through mode, one item can fail without forcing the whole pipeline
 * to stop right away. Wrapping that failure as an `ObservableError` keeps the
 * original error, where it happened, and which value caused it, so a later
 * step can replace it, skip it, log it, or throw it.
 *
 * ```text
 * source value -> operator throws -> ObservableError -> recovery operator
 * ```
 *
 * @module
 */

import type { SpecObserver } from './_spec.ts';

/**
 * `ObservableError` carries a failure through the value channel with the
 * details needed to handle it well.
 *
 * A plain `Error` tells you that something failed. `ObservableError` also keeps
 * the operator name, the value being worked on, and the original error list.
 * That extra context helps when one bad item should not erase the rest of the
 * stream.
 */
export class ObservableError extends AggregateError {
  /** Operator label recorded by the stage that wrapped the failure. */
  readonly operator?: string;

  /** Input value that triggered the failure. */
  readonly value?: unknown;

  /** Optional hint that can guide debugging or recovery. */
  readonly tip?: unknown;

  /**
    * Builds one wrapped error from one or many underlying failures.
   */
  constructor(
    errors: Error | Error[] | unknown | unknown[],
    message: string,
    options?: {
      operator?: string;
      value?: unknown;
      cause?: unknown;
      tip?: unknown;
    },
  ) {
    const errorArray = Array.isArray(errors) ? errors : [errors];
    const normalizedErrors = errorArray.map((error) =>
      error instanceof Error ? error : new Error(String(error))
    );

    super(normalizedErrors, message, { cause: options?.cause });
    this.name = 'ObservableError';
    this.operator = options?.operator;
    this.value = options?.value;
    this.tip = options?.tip;
  }

  /**
    * Formats the error in a way that shows where it came from and what failed.
   */
  override toString(): string {
    let result = `${this.name}: ${this.message}`;

    if (this.operator) {
      result += `\n  in operator: ${this.operator}`;
    }

    if (this.value !== undefined) {
      const valueString = typeof this.value === 'object'
        ? JSON.stringify(this.value).slice(0, 100)
        : String(this.value);

      result += `\n  processing value: ${valueString}`;
    }

    if (this.errors.length > 0) {
      result += '\n  with errors:';
      this.errors.forEach((error, index) => {
        result += `\n    ${index + 1}) ${error}`;
      });
    }

    if (this.tip) {
      result += `\n  tip: ${this.tip}`;
    }

    return result;
  }

  /**
    * Turns any thrown value into an `ObservableError`.
   */
  static from(
    error: unknown,
    operator?: string,
    value?: unknown,
    tip?: unknown,
  ): ObservableError {
    if (error instanceof ObservableError) {
      if (!error.operator && operator) {
        return new ObservableError(error.errors, error.message, {
          operator,
          value: error.value ?? value,
          cause: error.cause,
          tip: error.tip,
        });
      }

      return error;
    }

    return new ObservableError(
      error,
      error instanceof Error ? error.message : String(error),
      { operator, value, cause: error, tip },
    );
  }
}

/**
 * Treats the value as normal data or throws if it is an `ObservableError`.
 *
 * Use it the same way you would use an early `throw` in ordinary JavaScript:
 * stop right away if recovery already failed upstream. If an observer is
 * provided, its `error()` callback runs before the error is thrown again.
 *
 * @example Stop early when recovery already failed
 * ```ts
 * const result: string | ObservableError = getResult();
 * assertObservableError(result);
 * console.log(result.toUpperCase());
 * ```
 *
 * @example Report the failure, then stop
 * ```ts
 * const result: User | ObservableError = getUser();
 * assertObservableError(result, {
 *   error(error) {
 *     console.error(error.message);
 *   },
 * });
 *
 * console.log(result.name);
 * ```
 */
export function assertObservableError<T>(
  value: T | ObservableError,
  obs?: SpecObserver<T>,
): asserts value is T {
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
 * Returns `true` when a value is a wrapped stream error.
 *
 * Use it the same way you would use `Array.isArray()` or `value instanceof Error`:
 * branch on the shape, then handle the success and failure paths deliberately.
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
export function isObservableError<T = unknown>(
  value: T | ObservableError,
): value is ObservableError {
  // This is just a straightforward instanceof check
  // Modern JavaScript engines optimize this extremely well
  return value instanceof ObservableError;
}
