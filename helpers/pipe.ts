// helpers/pipe.ts
// Composition utility for Observable operators

import type { Operator, SafeOperator } from "./utils.ts";
import type { ObservableError } from "./error.ts";
import type { SpecObservable } from "../_spec.ts";

import { filter, ignoreErrors, map, scan, take } from "./operators.ts";
import { Observable, of, pull } from "../observable.ts";
import { injectError, toStream } from "./utils.ts";

/**
 * Pipe function with 9 overloads to handle up to 9 operators with proper typing.
 * Takes an Observable as input and returns an Observable as output, but uses
 * streams internally for efficiency.
 * 
 * 
 * This function takes an Observable as input and applies a series of operators
 * to transform it. Due to TypeScript's recursion limits, it's limited to
 * 9 operators. For more complex pipelines, use the `compose` operator to group
 * operators together.
 * 
 * Internally, this function converts the Observable to a ReadableStream,
 * applies the stream operators, then converts back to an Observable.
 * 
 * @returns A new Observable with all transforms applied
 * 
 * @example
 * ```ts
 * // Basic pipeline with 3 operators
 * const result = pipe(
 *   sourceObservable,
 *   map(x => x * 2),
 *   filter(x => x > 10),
 *   take(5)
 * );
 * 
 * // For more than 9 operators, use compose:
 * const result = pipe(
 *   sourceObservable,
 *   compose(
 *     map(x => x * 2),
 *     filter(x => x > 10)
 *   ),
 *   compose(
 *     take(5),
 *     map(x => x.toString())
 *   )
 * );
 * ```
 */

// Overload 1: Single operator
export function pipe<T, A>(
  source: SpecObservable<T>,
  op1: Operator<T, A>
): Observable<A>;

// Overload 2: Two operators
export function pipe<T, A, B>(
  source: SpecObservable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>
): Observable<B>;

// Overload 3: Three operators
export function pipe<T, A, B, C>(
  source: SpecObservable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>
): Observable<C>;

// Overload 4: Four operators
export function pipe<T, A, B, C, D>(
  source: SpecObservable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>
): Observable<D>;

// Overload 5: Five operators
export function pipe<T, A, B, C, D, E>(
  source: SpecObservable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>
): Observable<E>;

// Overload 6: Six operators
export function pipe<T, A, B, C, D, E, F>(
  source: SpecObservable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>
): Observable<F>;

// Overload 7: Seven operators
export function pipe<T, A, B, C, D, E, F, G>(
  source: SpecObservable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>
): Observable<G>;

// Overload 8: Eight operators
export function pipe<T, A, B, C, D, E, F, G, H>(
  source: SpecObservable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>
): Observable<H>;

// Overload 9: Nine operators
export function pipe<T, A, B, C, D, E, F, G, H, I>(
  source: SpecObservable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>
): Observable<I>;

// Implementation
export function pipe<T, R>(
  source: SpecObservable<T>,
  ...operators: Array<Operator<unknown, unknown>>
): Observable<R> {
  // Error if too many operators
  const len = operators.length;
  if (len > 9) {
    throw new Error('pipe: Too many operators (maximum 9). Use compose to group operators.');
  }

  // Convert the source Observable to a ReadableStream
  let stream: ReadableStream<unknown> = toStream(
    pull(source)
  );

  // Apply each operator in sequence
  for (let i = 0; i < len; i ++) {
    try {
      const operator = operators[i];
      stream = operator(stream);
    } catch (err) {
      stream = stream.pipeThrough(injectError(err, `pipe:operator[${i}]`));
    }
  }

  // Convert the resulting ReadableStream back to an Observable
  return Observable.from(stream) as Observable<R>;
}

/**
 * Composes multiple stream operators into a single stream operator
 * 
 * 
 * This function combines multiple stream operators into a single operator,
 * which is useful for grouping operators together when you need more than 9
 * operators in a pipeline.
 * 
 * Note that this function works with ReadableStreams internally, not Observables.
 * The composed function should be used with the `pipe` function.
 * 
 * @returns A single stream operator function that applies all the composed operators
 * 
 * @example
 * ```ts
 * // Group related transformations together
 * const processNumbers = compose(
 *   filter(x => x % 2 === 0),
 *   map(x => x * 10),
 *   take(5)
 * );
 * 
 * // Use the composed operator in a pipe
 * const result = pipe(
 *   sourceObservable,
 *   processNumbers,
 *   map(x => `Number: ${x}`)
 * );
 * ```
 */

// Overload 1: Single operator
export function compose<T, A>(
  op1: Operator<T, A>
): Operator<T, A>;

// Overload 2: Two operators
export function compose<T, A, B>(
  op1: Operator<T, A>,
  op2: Operator<A, B>
): Operator<T, B>;

// Overload 3: Three operators
export function compose<T, A, B, C>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>
): Operator<T, C>;

// Overload 4: Four operators
export function compose<T, A, B, C, D>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>
): Operator<T, D>;

// Overload 5: Five operators
export function compose<T, A, B, C, D, E>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>
): Operator<T, E>;

// Overload 6: Six operators
export function compose<T, A, B, C, D, E, F>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>
): Operator<T, F>;

// Overload 7: Seven operators
export function compose<T, A, B, C, D, E, F, G>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>
): Operator<T, G>;

// Overload 8: Eight operators
export function compose<T, A, B, C, D, E, F, G, H>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>
): Operator<T, H>;

// Overload 9: Nine operators
export function compose<T, A, B, C, D, E, F, G, H, I>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>
): Operator<T, I>;

// Implementation
export function compose<T, R>(
  ...operators: Array<Operator<unknown, unknown>>
): Operator<T, R> {
  // Error if too many operators
  const len = operators.length;
  if (len > 9) {
    throw new Error('compose: Too many operators (maximum 9). Use nested compose calls.');
  }

  // Return a new operator function that applies all the operators
  return (source: ReadableStream<T | ObservableError>) => {
    let stream: ReadableStream<unknown> = source;

    // Apply each operator in sequence
    for (let i = 0; i < len; i++) {
      try {
        const operator = operators[i];
        stream = operator(stream);
      } catch (err) {
        return stream.pipeThrough(
          injectError(err, `compose:operator[${i}]`)
        ) as ReadableStream<R | ObservableError>;
      }
    }

    return stream as ReadableStream<R | ObservableError>;
  };
}

// ========================================
// 2. SAFE COMPOSE FOR ERROR-IGNORING BEHAVIOR
// ========================================

/**
 * Composes operators and automatically ignores any errors they produce.
 * 
 * ## What this does
 * This is like `compose()` but with a safety net. It groups your operators together and
 * automatically filters out any errors that happen inside the group. Only successful
 * results make it through to the rest of your pipeline.
 * 
 * ## Why you'd want this
 * Perfect for demos, prototypes, or scenarios where you're processing lots of data and
 * some failures are expected and acceptable. Instead of making your entire pipeline
 * error-ignoring, you can be surgical about which parts should be "safe."
 * 
 * ## How it works
 * All your operators get composed into a single operation, then `ignoreErrors()` gets
 * automatically applied to the result. Any failures from any operator in the group
 * get silently filtered out.
 * 
 * ## The philosophy
 * Make risky behavior explicit and contained. Instead of a global "ignore errors" setting,
 * you deliberately choose which parts of your pipeline should be fault-tolerant.
 * 
 * ## When to use this
 * - **Demos and prototypes**: Keep your output clean without manual error handling
 * - **Partial processing**: When some failures are expected and acceptable  
 * - **Data exploration**: When you want to see what works without being stopped by what doesn't
 * - **External integrations**: When third-party services are unreliable but optional
 * 
 * ## When NOT to use this
 * - **Critical data processing**: Where every error matters
 * - **Financial calculations**: Where silent failures could be dangerous
 * - **Security operations**: Where errors might indicate problems
 * - **Debugging**: When you need to see what's failing
 * 
 * ## The trade-offs
 * **Good**: Clean output, pipeline never breaks, great for demos
 * **Bad**: You lose error visibility, might hide real problems
 * **Gotcha**: High error rates mean very sparse output
 * 
 * @template T Input type to the composed operators
 * @template R Output type from the composed operators (without errors)
 * 
 * @param operators Stream operators to compose and make safe
 * 
 * @returns A single operator that applies all transformations and ignores errors
 * 
 * @example
 * ```typescript
 * // Create a safe processing block for unreliable operations
 * const processImages = safeCompose(
 *   map(async url => {
 *     const response = await fetch(url);
 *     if (!response.ok) throw new Error(`Failed: ${url}`);
 *     return response.blob();
 *   }),
 *   map(blob => ({ blob, size: blob.size })),
 *   filter(img => img.size > 1000) // Filter tiny images
 * );
 * 
 * // Use in a larger pipeline
 * const imageGallery = pipe(
 *   imageUrls,
 *   processImages, // This whole block ignores errors
 *   map(img => ({ ...img, processed: Date.now() })),
 *   take(20)
 * );
 * 
 * // Result: Only successfully processed images, no error handling needed
 * ```
 * 
 * @example
 * ```typescript
 * // Mixed safety levels in one pipeline
 * const smartAnalytics = pipe(
 *   userData,
 *   
 *   // Critical processing - errors preserved
 *   map(user => validateUser(user)),
 *   filter(user => user.isValid),
 *   
 *   // Optional enrichment - errors ignored
 *   safeCompose(
 *     map(user => enrichWithSocialData(user)), // Might fail
 *     map(user => addLocationInfo(user)),       // Might fail
 *     map(user => getPreferences(user))         // Might fail
 *   ),
 *   
 *   // Back to critical processing - handle any remaining errors
 *   map(user => ({ ...user, processed: Date.now() })),
 *   catchErrors(createFallbackUser())
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // API integration with fault tolerance
 * const multiServiceData = pipe(
 *   requestIds,
 *   
 *   // Primary service - errors matter
 *   map(id => fetchPrimaryData(id)),
 *   
 *   // Optional enrichment from unreliable services
 *   safeCompose(
 *     map(data => addWeatherInfo(data)),     // Weather API might be down
 *     map(data => addSocialStats(data)),     // Social API might rate limit
 *     map(data => addLocationData(data))     // Location service might timeout
 *   ),
 *   
 *   // Final processing
 *   map(data => finalizeData(data)),
 *   take(100)
 * );
 * 
 * // You get primary data with whatever optional enrichments worked
 * ```
 */

// Overload 1: Single operator
export function safeCompose<T, A>(
  op1: Operator<T, A>
): SafeOperator<T, A>;

// Overload 2: Two operators
export function safeCompose<T, A, B>(
  op1: Operator<T, A>,
  op2: Operator<A, B>
): SafeOperator<T, B>;

// Overload 3: Three operators
export function safeCompose<T, A, B, C>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>
): SafeOperator<T, C>;

// Overload 4: Four operators
export function safeCompose<T, A, B, C, D>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>
): SafeOperator<T, D>;

// Overload 5: Five operators
export function safeCompose<T, A, B, C, D, E>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>
): SafeOperator<T, E>;

// Overload 6: Six operators
export function safeCompose<T, A, B, C, D, E, F>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>
): SafeOperator<T, F>;

// Overload 7: Seven operators
export function safeCompose<T, A, B, C, D, E, F, G>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>
): SafeOperator<T, G>;

// Overload 8: Eight operators
export function safeCompose<T, A, B, C, D, E, F, G, H>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>
): SafeOperator<T, H>;

// Overload 9: Nine operators
export function safeCompose<T, A, B, C, D, E, F, G, H, I>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>
): SafeOperator<T, I>;

// Implementation
export function safeCompose<T, R>(
  ...operators: Array<Operator<unknown, unknown>>
): SafeOperator<T, R> {
  // Error if too many operators
  const len = operators.length;
  if (len > 9) {
    throw new Error('safeCompose: Too many operators (maximum 9). Use nested safeCompose calls.');
  }

  // Return a new operator function that applies all the operators
  return (source) => {
    let stream: ReadableStream<unknown> = ignoreErrors<T>()(source);

    // Apply each operator in sequence
    for (let i = 0; i < len; i++) {
      try {
        const operator = operators[i];
        const operatorResult = operator(stream);
        stream = ignoreErrors<unknown>()(operatorResult);
      } catch (err) { 
        console.warn(`Setup error in safeCompose operator[${i}]:`, err);
        // Continue with remaining operators
      }
    }

    return stream as ReadableStream<Exclude<R, ObservableError>>;
  };
}

const source = of(1, 2, 4, 5)
pipe(source,
  safeCompose(
    filter(x => x % 2 === 0),
    map(x => x * 2),
    scan((acc, x) => acc + x, 0),
    map(x => x.toString()),
    map(x => x),
    take(50)
  )
).subscribe({});

pipe(source,
  filter(x => x % 2 === 0),
  map(x => x * 2),
  scan((acc, x) => acc + x, 0),
  map(x => x.toString()),
  map(x => x),
  take(50)
).subscribe({})