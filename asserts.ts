import type { SpecObserver } from "./_spec.ts";
import { ObservableError } from "./error.ts";

/**
 * Asserts and handles observable error values, throwing or delegating to error handlers as appropriate.
 * 
 * This function checks if a given value is an ObservableError instance and handles it according to
 * the provided observer's error handling strategy. If no error handler is available, it throws the error.
 * 
 * **Intent**: Provide a centralized way to handle ObservableError instances in observable streams,
 * allowing for graceful error handling when observers are present or fail-fast behavior when they're not.
 * 
 * **Behavior**: 
 * - If value is not an ObservableError, the function returns undefined and execution continues
 * - If value is an ObservableError and observer has an error handler, calls the handler
 * - If value is an ObservableError and no error handler exists, throws the error
 * 
 * **Edge Cases**:
 * - Observer with undefined or null error property: Error will be thrown
 * - Observer with non-function error property: Error will be thrown
 * - Null or undefined observer: Error will be thrown if value is ObservableError
 * 
 * **Type Safety**: 
 * - The generic type T ensures type safety for non-error values
 * - Runtime instanceof check provides reliable error detection
 * - Optional observer parameter allows flexible usage patterns
 * 
 * **Error Handling Strategy**:
 * This function implements a fail-fast approach when no error handling mechanism is available,
 * while supporting graceful degradation when proper error handlers are provided through observers.
 * 
 * @template T - The expected type of the value when it's not an error
 * @param value - The value to check, which may be either the expected type T or an ObservableError
 * @param obs - Optional observer that may contain an error handler function
 * 
 * @throws {ObservableError} When value is an ObservableError and no observer error handler is provided
 * 
 * @example
 * ```typescript
 * // Basic usage with error throwing
 * const result = someOperation();
 * assertObservableError(result); // Throws if result is ObservableError
 * 
 * // Usage with observer error handler
 * const observer = {
 *   error: (err) => console.error('Handled error:', err),
 *   next: (value) => console.log('Success:', value)
 * };
 * assertObservableError(result, observer); // Calls observer.error if result is ObservableError
 * 
 * // Safe usage in observable chains
 * observable.subscribe({
 *   next: (value) => {
 *     assertObservableError(value, this);
 *     // Process value knowing it's not an error
 *   }
 * });
 * ```
 */
export function assertObservableError<T>(value: T | ObservableError, obs?: SpecObserver<T>) { 
  if (value instanceof ObservableError) {
    if (typeof obs?.error === "function") {
      obs.error(value);
      return true;
    }
    
    throw value;
  }
}