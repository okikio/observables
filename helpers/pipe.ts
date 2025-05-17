// helpers/pipe.ts
// Composition utility for Observable operators

import type { Operator } from "./utils.ts";
import { Observable } from "../observable.ts";
import { ObservableError } from "./error.ts";

/**
 * Pipe function with 9 overloads to handle up to 9 operators with proper typing.
 * Takes an Observable as input and returns an Observable as output, but uses
 * streams internally for efficiency.
 * 
 * @remarks
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
  source: Observable<T>,
  op1: Operator<T, A>
): Observable<A>;

// Overload 2: Two operators
export function pipe<T, A, B>(
  source: Observable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>
): Observable<B>;

// Overload 3: Three operators
export function pipe<T, A, B, C>(
  source: Observable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>
): Observable<C>;

// Overload 4: Four operators
export function pipe<T, A, B, C, D>(
  source: Observable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>
): Observable<D>;

// Overload 5: Five operators
export function pipe<T, A, B, C, D, E>(
  source: Observable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>
): Observable<E>;

// Overload 6: Six operators
export function pipe<T, A, B, C, D, E, F>(
  source: Observable<T>,
  op1: Operator<T, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>
): Observable<F>;

// Overload 7: Seven operators
export function pipe<T, A, B, C, D, E, F, G>(
  source: Observable<T>,
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
  source: Observable<T>,
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
  source: Observable<T>,
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
  source: Observable<T>,
  ...operators: Array<Operator<unknown, unknown>>
): Observable<R> {
  // Error if too many operators
  if (operators.length > 9) {
    throw new Error('pipe: Too many operators (maximum 9). Use compose to group operators.');
  }

  // Convert the source Observable to a ReadableStream
  let stream: ReadableStream<unknown> = toStream(
    Observable.pull(source)
  );

  // Apply each operator in sequence
  for (let i = 0; i < operators.length; i ++) {
    try {
      const operator = operators[i];
      stream = operator(stream);
    } catch (err) {
      return Observable.from(
        toStream([
          ObservableError.from(
            err,
            `pipe:operator[${i}]`
          )
        ])
      ) as Observable<R>;
    }
  }

  // Convert the resulting ReadableStream back to an Observable
  return Observable.from(stream) as Observable<R>;
}

/**
 * Composes multiple stream operators into a single stream operator
 * 
 * @remarks
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
  if (operators.length > 9) {
    throw new Error('compose: Too many operators (maximum 9). Use nested compose calls.');
  }

  // Return a new operator function that applies all the operators
  return (source: ReadableStream<T>): ReadableStream<R> => {
    // Apply each operator in sequence
    return operators.reduce(
      (stream, operator) => operator(stream),
      source as ReadableStream<unknown>
    ) as ReadableStream<R>;
  };
}

/**
 * Creates a ReadableStream from an iterable or async iterable
 * 
 * @remarks
 * This utility function creates a ReadableStream from any iterable or async iterable,
 * such as arrays, generators, or custom iterables.
 * 
 * @typeParam T - Type of values in the iterable
 * @param iterable - The iterable or async iterable to convert
 * @returns A ReadableStream that emits values from the iterable
 * 
 * @example
 * ```ts
 * import { fromIterable, pipe, map } from "./helpers/mod.ts";
 * 
 * // Create a stream from an array
 * const numbers = fromIterable([1, 2, 3, 4, 5]);
 * 
 * // Create a stream from a generator
 * function* generateNumbers() {
 *   for (let i = 0; i < 5; i++) {
 *     yield i;
 *   }
 * }
 * const generated = fromIterable(generateNumbers());
 * 
 * // Process with operators
 * const result = pipe(
 *   numbers,
 *   map(x => x * 2)
 * );
 * ```
 */
export function toStream<T>(
  iterable: Iterable<T> | AsyncIterable<T>
): ReadableStream<T | ObservableError> {
  // Not all runtimes support `ReadableStreams.from` yet
  if (typeof ReadableStream?.from === "function") 
    return ReadableStream.from(iterable);

  // Check if it's an async iterable
  const isAsync = Symbol.asyncIterator in Object(iterable);

  return new ReadableStream<T | ObservableError>({
    async start(controller) {
      try {
        if (isAsync) {
          for await (const item of iterable as AsyncIterable<T>) {
            controller.enqueue(item);
          }
        } else {
          for (const item of iterable as Iterable<T>) {
            controller.enqueue(item);
          }
        }
        
        controller.close();
      } catch (err) {
        controller.enqueue(ObservableError.from(err, "toStream"));
        controller.close();
      }
    }
  });
}