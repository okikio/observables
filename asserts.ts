import type { SpecObserver } from "./_spec.ts";
import { ObservableError } from "./error.ts";

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