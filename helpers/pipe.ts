// helpers/pipe.ts
// Composition utility for Observable operators

import type { ExcludeError, Operator, SafeOperator } from "./_types.ts";
import type { ObservableError } from "../error.ts";
import type { SpecObservable } from "../_spec.ts";

import { ignoreErrors } from "./operations/errors.ts";

import { Observable, pull } from "../observable.ts";
import { applyOperator, toStream } from "./utils.ts";
import { Symbol } from "../symbol.ts";

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
 * 
 * // For ignoring errors in operators use safeCompose (not for production use):
 * const result = pipe(
 *   sourceObservable,
 *   safeCompose(
 *     map(x => x * 2),
 *     filter(x => x > 10)
 *   ),
 *   safeCompose(
 *     take(5),
 *     map(x => x.toString())
 *   )
 * );
 * ```
 */

// Overload 0: No operator
export function pipe<T>(
  source: SpecObservable<T>,
): Observable<T>;

// Overload 1: Single operator
export function pipe<T, A>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>
): Observable<A>;

// Overload 2: Two operators
export function pipe<T, A, B>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>
): Observable<B>;

// Overload 3: Three operators
export function pipe<T, A, B, C>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>
): Observable<C>;

// Overload 4: Four operators
export function pipe<T, A, B, C, D>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>
): Observable<D>;

// Overload 5: Five operators
export function pipe<T, A, B, C, D, E>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>
): Observable<E>;

// Overload 6: Six operators
export function pipe<T, A, B, C, D, E, F>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>
): Observable<F>;

// Overload 7: Seven operators
export function pipe<T, A, B, C, D, E, F, G>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
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
  op1: Operator<T | ObservableError, A>,
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
  op1: Operator<T | ObservableError, A>,
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
export function pipe<T, A, B, C, D, E, F, G, H, I>(
  source: SpecObservable<T>,
  op1?: Operator<T | ObservableError, A>,
  op2?: Operator<A, B>,
  op3?: Operator<B, C>,
  op4?: Operator<C, D>,
  op5?: Operator<D, E>,
  op6?: Operator<E, F>,
  op7?: Operator<F, G>,
  op8?: Operator<G, H>,
  op9?: Operator<H, I>
): Observable<
  typeof op9 extends Operator<H, I> ? I :
  typeof op8 extends Operator<G, H> ? H :
  typeof op7 extends Operator<F, G> ? G :
  typeof op6 extends Operator<E, F> ? F :
  typeof op5 extends Operator<D, E> ? E :
  typeof op4 extends Operator<C, D> ? D :
  typeof op3 extends Operator<B, C> ? C :
  typeof op2 extends Operator<A, B> ? B :
  typeof op1 extends Operator<T | ObservableError, A> ? A :
  T
> {
  // Ignore the source argument
  const len = arguments.length - 1;
  if (len === 0) return source as Observable<T>;
  if (len > 9) {
    throw new Error('pipe: Too many operators (maximum 9). Use compose to group operators.');
  }

  if (typeof source[Symbol.observable] !== "function") {
    throw new TypeError('pipe: source must be an Observable');
  }

  // Convert the source Observable to a ReadableStream
  let result: ReadableStream<unknown> = toStream(pull(source));

  const errorPrefix = 'pipe:operator';
  if (op1) result = applyOperator(result, op1, { message: errorPrefix + `[1]` });
  if (op2) result = applyOperator(result, op2, { message: errorPrefix + `[2]` });
  if (op3) result = applyOperator(result, op3, { message: errorPrefix + `[3]` });
  if (op4) result = applyOperator(result, op4, { message: errorPrefix + `[4]` });
  if (op5) result = applyOperator(result, op5, { message: errorPrefix + `[5]` });
  if (op6) result = applyOperator(result, op6, { message: errorPrefix + `[6]` });
  if (op7) result = applyOperator(result, op7, { message: errorPrefix + `[7]` });
  if (op8) result = applyOperator(result, op8, { message: errorPrefix + `[8]` });
  if (op9) result = applyOperator(result, op9, { message: errorPrefix + `[9]` });

  // Convert the resulting ReadableStream back to an Observable
  return Observable.from(result) as Observable<
    typeof op9 extends Operator<H, I> ? I :
    typeof op8 extends Operator<G, H> ? H :
    typeof op7 extends Operator<F, G> ? G :
    typeof op6 extends Operator<E, F> ? F :
    typeof op5 extends Operator<D, E> ? E :
    typeof op4 extends Operator<C, D> ? D :
    typeof op3 extends Operator<B, C> ? C :
    typeof op2 extends Operator<A, B> ? B :
    typeof op1 extends Operator<T | ObservableError, A> ? A :
    T
  >;
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

// Overload 0: No operator
export function compose<T>(): Operator<T, T>;

// Overload 1: Single operator
export function compose<T, A>(
  op1: Operator<T, A>
): Operator<T, A | ObservableError>;

// Overload 2: Two operators
export function compose<T, A, B>(
  op1: Operator<T, A>,
  op2: Operator<A, B>
): Operator<T, B | ObservableError>;

// Overload 3: Three operators
export function compose<T, A, B, C>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>
): Operator<T, C | ObservableError>;

// Overload 4: Four operators
export function compose<T, A, B, C, D>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>
): Operator<T, D | ObservableError>;

// Overload 5: Five operators
export function compose<T, A, B, C, D, E>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>
): Operator<T, E | ObservableError>;

// Overload 6: Six operators
export function compose<T, A, B, C, D, E, F>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>
): Operator<T, F | ObservableError>;

// Overload 7: Seven operators
export function compose<T, A, B, C, D, E, F, G>(
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>
): Operator<T, G | ObservableError>;

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
): Operator<T, H | ObservableError>;

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
): Operator<T, I | ObservableError>;

// Implementation
export function compose<T, A, B, C, D, E, F, G, H, I>(
  op1?: Operator<T, A>,
  op2?: Operator<A, B>,
  op3?: Operator<B, C>,
  op4?: Operator<C, D>,
  op5?: Operator<D, E>,
  op6?: Operator<E, F>,
  op7?: Operator<F, G>,
  op8?: Operator<G, H>,
  op9?: Operator<H, I>
): 
  typeof op9 extends Operator<H, I> ? Operator<H, I> :
  typeof op8 extends Operator<G, H> ? Operator<G, H> :
  typeof op7 extends Operator<F, G> ? Operator<F, G> :
  typeof op6 extends Operator<E, F> ? Operator<E, F> :
  typeof op5 extends Operator<D, E> ? Operator<D, E> :
  typeof op4 extends Operator<C, D> ? Operator<C, D> :
  typeof op3 extends Operator<B, C> ? Operator<B, C> :
  typeof op2 extends Operator<A, B> ? Operator<A, B> :
  typeof op1 extends Operator<T, A> ? Operator<T, A> :
  Operator<T, T | ObservableError> {
  // Error if too many operators
  const len = arguments.length;
  if (len === 0) return (source) => source;
  if (len > 9) {
    throw new Error('safeCompose: Too many operators (maximum 9). Use nested safeCompose calls.');
  }

  // Return a new operator function that applies all the operators
  return ((source) => {
    let result = source;

    const errorPrefix = 'compose:operator';
    if (op1) result = applyOperator(result, op1, { message: errorPrefix + `[1]` });
    if (op2) result = applyOperator(result, op2, { message: errorPrefix + `[2]` });
    if (op3) result = applyOperator(result, op3, { message: errorPrefix + `[3]` });
    if (op4) result = applyOperator(result, op4, { message: errorPrefix + `[4]` });
    if (op5) result = applyOperator(result, op5, { message: errorPrefix + `[5]` });
    if (op6) result = applyOperator(result, op6, { message: errorPrefix + `[6]` });
    if (op7) result = applyOperator(result, op7, { message: errorPrefix + `[7]` });
    if (op8) result = applyOperator(result, op8, { message: errorPrefix + `[8]` });
    if (op9) result = applyOperator(result, op9, { message: errorPrefix + `[9]` });

    return result;
  }) as
    typeof op9 extends Operator<H, I> ? Operator<H, I> :
    typeof op8 extends Operator<G, H> ? Operator<G, H> :
    typeof op7 extends Operator<F, G> ? Operator<F, G> :
    typeof op6 extends Operator<E, F> ? Operator<E, F> :
    typeof op5 extends Operator<D, E> ? Operator<D, E> :
    typeof op4 extends Operator<C, D> ? Operator<C, D> :
    typeof op3 extends Operator<B, C> ? Operator<B, C> :
    typeof op2 extends Operator<A, B> ? Operator<A, B> :
    typeof op1 extends Operator<T  | ObservableError, A> ? Operator<T | ObservableError, A> :
    Operator<T, T | ObservableError>;
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

// Overload 0: Single operator
export function safeCompose<T>(): SafeOperator<T, T>;

// Overload 1: Single operator
export function safeCompose<T, A>(
  op1: Operator<ExcludeError<T>, A>
): SafeOperator<T, A>;

// Overload 2: Two operators
export function safeCompose<T, A, B>(
  op1: Operator<ExcludeError<T>, A>,
  op2: Operator<ExcludeError<A>, B>
): SafeOperator<T, B>;

// Overload 3: Three operators
export function safeCompose<T, A, B, C>(
  op1: Operator<ExcludeError<T>, A>,
  op2: Operator<ExcludeError<A>, B>,
  op3: Operator<ExcludeError<B>, C>
): SafeOperator<T, C>;

// Overload 4: Four operators
export function safeCompose<T, A, B, C, D>(
  op1: Operator<ExcludeError<T>, A>,
  op2: Operator<ExcludeError<A>, B>,
  op3: Operator<ExcludeError<B>, C>,
  op4: Operator<ExcludeError<C>, D>
): SafeOperator<T, D>;

// Overload 5: Five operators
export function safeCompose<T, A, B, C, D, E>(
  op1: Operator<ExcludeError<T>, A>,
  op2: Operator<ExcludeError<A>, B>,
  op3: Operator<ExcludeError<B>, C>,
  op4: Operator<ExcludeError<C>, D>,
  op5: Operator<ExcludeError<D>, E>
): SafeOperator<T, E>;

// Overload 6: Six operators
export function safeCompose<T, A, B, C, D, E, F>(
  op1: Operator<ExcludeError<T>, A>,
  op2: Operator<ExcludeError<A>, B>,
  op3: Operator<ExcludeError<B>, C>,
  op4: Operator<ExcludeError<C>, D>,
  op5: Operator<ExcludeError<D>, E>,
  op6: Operator<ExcludeError<E>, F>
): SafeOperator<T, F>;

// Overload 7: Seven operators
export function safeCompose<T, A, B, C, D, E, F, G>(
  op1: Operator<ExcludeError<T>, A>,
  op2: Operator<ExcludeError<A>, B>,
  op3: Operator<ExcludeError<B>, C>,
  op4: Operator<ExcludeError<C>, D>,
  op5: Operator<ExcludeError<D>, E>,
  op6: Operator<ExcludeError<E>, F>,
  op7: Operator<ExcludeError<F>, G>
): SafeOperator<T, G>;

// Overload 8: Eight operators
export function safeCompose<T, A, B, C, D, E, F, G, H>(
  op1: Operator<ExcludeError<T>, A>,
  op2: Operator<ExcludeError<A>, B>,
  op3: Operator<ExcludeError<B>, C>,
  op4: Operator<ExcludeError<C>, D>,
  op5: Operator<ExcludeError<D>, E>,
  op6: Operator<ExcludeError<E>, F>,
  op7: Operator<ExcludeError<F>, G>,
  op8: Operator<ExcludeError<G>, H>
): SafeOperator<T, H>;

// Overload 9: Nine operators
export function safeCompose<T, A, B, C, D, E, F, G, H, I>(
  op1: Operator<ExcludeError<T>, A>,
  op2: Operator<ExcludeError<A>, B>,
  op3: Operator<ExcludeError<B>, C>,
  op4: Operator<ExcludeError<C>, D>,
  op5: Operator<ExcludeError<D>, E>,
  op6: Operator<ExcludeError<E>, F>,
  op7: Operator<ExcludeError<F>, G>,
  op8: Operator<ExcludeError<G>, H>,
  op9: Operator<ExcludeError<H>, I>
): SafeOperator<T, I>;

// Implementation
export function safeCompose<T, A, B, C, D, E, F, G, H, I>(
  op1?: Operator<ExcludeError<T>, A>,
  op2?: Operator<ExcludeError<A>, B>,
  op3?: Operator<ExcludeError<B>, C>,
  op4?: Operator<ExcludeError<C>, D>,
  op5?: Operator<ExcludeError<D>, E>,
  op6?: Operator<ExcludeError<E>, F>,
  op7?: Operator<ExcludeError<F>, G>,
  op8?: Operator<ExcludeError<G>, H>,
  op9?: Operator<ExcludeError<H>, I>
): 
  typeof op9 extends Operator<ExcludeError<H>, I> ? SafeOperator<H, I> :
  typeof op8 extends Operator<ExcludeError<G>, H> ? SafeOperator<G, H> :
  typeof op7 extends Operator<ExcludeError<F>, G> ? SafeOperator<F, G> :
  typeof op6 extends Operator<ExcludeError<E>, F> ? SafeOperator<E, F> :
  typeof op5 extends Operator<ExcludeError<D>, E> ? SafeOperator<D, E> :
  typeof op4 extends Operator<ExcludeError<C>, D> ? SafeOperator<C, D> :
  typeof op3 extends Operator<ExcludeError<B>, C> ? SafeOperator<B, C> :
  typeof op2 extends Operator<ExcludeError<A>, B> ? SafeOperator<A, B> :
  typeof op1 extends Operator<ExcludeError<T>, A> ? SafeOperator<T, A> :
  SafeOperator<T, T> {
  // Error if too many operators
  const len = arguments.length;
  if (len === 0) return ignoreErrors<T>();
  if (len > 9) {
    throw new Error('safeCompose: Too many operators (maximum 9). Use nested safeCompose calls.');
  }

  // Return a new operator function that applies all the operators
  return ((source) => {
    let result = ignoreErrors<T>()(source as ReadableStream<T>);

    const errorPrefix = 'safeCompose:operator';
    if (op1) result = applyOperator(result, op1, { error: false, message: errorPrefix + `[1]` });
    if (op2) result = applyOperator(result, op2, { error: false, message: errorPrefix + `[2]` });
    if (op3) result = applyOperator(result, op3, { error: false, message: errorPrefix + `[3]` });
    if (op4) result = applyOperator(result, op4, { error: false, message: errorPrefix + `[4]` });
    if (op5) result = applyOperator(result, op5, { error: false, message: errorPrefix + `[5]` });
    if (op6) result = applyOperator(result, op6, { error: false, message: errorPrefix + `[6]` });
    if (op7) result = applyOperator(result, op7, { error: false, message: errorPrefix + `[7]` });
    if (op8) result = applyOperator(result, op8, { error: false, message: errorPrefix + `[8]` });
    if (op9) result = applyOperator(result, op9, { error: false, message: errorPrefix + `[9]` });

    return result;
  }) as
    typeof op9 extends Operator<ExcludeError<H>, I> ? SafeOperator<H, I> :
    typeof op8 extends Operator<ExcludeError<G>, H> ? SafeOperator<G, H> :
    typeof op7 extends Operator<ExcludeError<F>, G> ? SafeOperator<F, G> :
    typeof op6 extends Operator<ExcludeError<E>, F> ? SafeOperator<E, F> :
    typeof op5 extends Operator<ExcludeError<D>, E> ? SafeOperator<D, E> :
    typeof op4 extends Operator<ExcludeError<C>, D> ? SafeOperator<C, D> :
    typeof op3 extends Operator<ExcludeError<B>, C> ? SafeOperator<B, C> :
    typeof op2 extends Operator<ExcludeError<A>, B> ? SafeOperator<A, B> :
    typeof op1 extends Operator<ExcludeError<T>, A> ? SafeOperator<T, A> :
    SafeOperator<T, T>;
}