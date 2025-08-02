// helpers/pipe.ts
// Composition utility for Observable operators

import type { ObservableError } from "../error.ts";
import type { SpecObservable } from "../_spec.ts";
import type { Operator } from "./_types.ts";

import { Observable, pull } from "../observable.ts";
import { applyOperator, toStream } from "./utils.ts";
import { Symbol } from "../symbol.ts";

/**
 * Pipe function with 19 overloads to handle up to 19 operators with proper typing.
 * Takes an Observable as input and returns an Observable as output, but uses
 * streams internally for efficiency.
 * 
 * 
 * This function takes an Observable as input and applies a series of operators
 * to transform it. It supports up to 19 operators with full type safety.
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
 *   mapValue(x => x * 2),
 *   filterValue(x => x > 10),
 *   takeValue(5)
 * );
 * 
 * // Complex pipeline with many operators
 * const result = pipe(
 *   sourceObservable,
 *   mapValue(x => x * 2),
 *   filterValue(x => x > 10),
 *   takeValue(5),
 *   mapValue(x => x.toString()),
 *   filterValue(x => x.length > 1),
 *   mapValue(x => x.toUpperCase()),
 *   // ... up to 19 operators total
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

// Overload 10: Ten operators
export function pipe<T, A, B, C, D, E, F, G, H, I, J>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>,
  op10: Operator<I, J>
): Observable<J>;

// Overload 11: Eleven operators
export function pipe<T, A, B, C, D, E, F, G, H, I, J, K>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>,
  op10: Operator<I, J>,
  op11: Operator<J, K>
): Observable<K>;

// Overload 12: Twelve operators
export function pipe<T, A, B, C, D, E, F, G, H, I, J, K, L>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>,
  op10: Operator<I, J>,
  op11: Operator<J, K>,
  op12: Operator<K, L>
): Observable<L>;

// Overload 13: Thirteen operators
export function pipe<T, A, B, C, D, E, F, G, H, I, J, K, L, M>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>,
  op10: Operator<I, J>,
  op11: Operator<J, K>,
  op12: Operator<K, L>,
  op13: Operator<L, M>
): Observable<M>;

// Overload 14: Fourteen operators
export function pipe<T, A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>,
  op10: Operator<I, J>,
  op11: Operator<J, K>,
  op12: Operator<K, L>,
  op13: Operator<L, M>,
  op14: Operator<M, N>
): Observable<N>;

// Overload 15: Fifteen operators
export function pipe<T, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>,
  op10: Operator<I, J>,
  op11: Operator<J, K>,
  op12: Operator<K, L>,
  op13: Operator<L, M>,
  op14: Operator<M, N>,
  op15: Operator<N, O>
): Observable<O>;

// Overload 16: Sixteen operators
export function pipe<T, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>,
  op10: Operator<I, J>,
  op11: Operator<J, K>,
  op12: Operator<K, L>,
  op13: Operator<L, M>,
  op14: Operator<M, N>,
  op15: Operator<N, O>,
  op16: Operator<O, P>
): Observable<P>;

// Overload 17: Seventeen operators
export function pipe<T, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>,
  op10: Operator<I, J>,
  op11: Operator<J, K>,
  op12: Operator<K, L>,
  op13: Operator<L, M>,
  op14: Operator<M, N>,
  op15: Operator<N, O>,
  op16: Operator<O, P>,
  op17: Operator<P, Q>
): Observable<Q>;

// Overload 18: Eighteen operators
export function pipe<T, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>,
  op10: Operator<I, J>,
  op11: Operator<J, K>,
  op12: Operator<K, L>,
  op13: Operator<L, M>,
  op14: Operator<M, N>,
  op15: Operator<N, O>,
  op16: Operator<O, P>,
  op17: Operator<P, Q>,
  op18: Operator<Q, R>
): Observable<R>;

// Overload 19: Nineteen operators
export function pipe<T, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
  op9: Operator<H, I>,
  op10: Operator<I, J>,
  op11: Operator<J, K>,
  op12: Operator<K, L>,
  op13: Operator<L, M>,
  op14: Operator<M, N>,
  op15: Operator<N, O>,
  op16: Operator<O, P>,
  op17: Operator<P, Q>,
  op18: Operator<Q, R>,
  op19: Operator<R, S>
): Observable<S>;

// Implementation
export function pipe<T, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(
  source: SpecObservable<T>,
  op1?: Operator<T | ObservableError, A>,
  op2?: Operator<A, B>,
  op3?: Operator<B, C>,
  op4?: Operator<C, D>,
  op5?: Operator<D, E>,
  op6?: Operator<E, F>,
  op7?: Operator<F, G>,
  op8?: Operator<G, H>,
  op9?: Operator<H, I>,
  op10?: Operator<I, J>,
  op11?: Operator<J, K>,
  op12?: Operator<K, L>,
  op13?: Operator<L, M>,
  op14?: Operator<M, N>,
  op15?: Operator<N, O>,
  op16?: Operator<O, P>,
  op17?: Operator<P, Q>,
  op18?: Operator<Q, R>,
  op19?: Operator<R, S>
): Observable<
  typeof op19 extends Operator<R, S> ? S :
  typeof op18 extends Operator<Q, R> ? R :
  typeof op17 extends Operator<P, Q> ? Q :
  typeof op16 extends Operator<O, P> ? P :
  typeof op15 extends Operator<N, O> ? O :
  typeof op14 extends Operator<M, N> ? N :
  typeof op13 extends Operator<L, M> ? M :
  typeof op12 extends Operator<K, L> ? L :
  typeof op11 extends Operator<J, K> ? K :
  typeof op10 extends Operator<I, J> ? J :
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
  if (len > 19) {
    throw new Error('pipe: Too many operators (maximum 19).');
  }

  if (typeof source[Symbol.observable] !== "function") {
    throw new TypeError('pipe: source must be an Observable');
  }

  // Convert the source Observable to a ReadableStream
  let result: ReadableStream<unknown> = toStream(pull(source, { throwError: false }));

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
  if (op10) result = applyOperator(result, op10, { message: errorPrefix + `[10]` });
  if (op11) result = applyOperator(result, op11, { message: errorPrefix + `[11]` });
  if (op12) result = applyOperator(result, op12, { message: errorPrefix + `[12]` });
  if (op13) result = applyOperator(result, op13, { message: errorPrefix + `[13]` });
  if (op14) result = applyOperator(result, op14, { message: errorPrefix + `[14]` });
  if (op15) result = applyOperator(result, op15, { message: errorPrefix + `[15]` });
  if (op16) result = applyOperator(result, op16, { message: errorPrefix + `[16]` });
  if (op17) result = applyOperator(result, op17, { message: errorPrefix + `[17]` });
  if (op18) result = applyOperator(result, op18, { message: errorPrefix + `[18]` });
  if (op19) result = applyOperator(result, op19, { message: errorPrefix + `[19]` });

  // Convert the resulting ReadableStream back to an Observable
  return Observable.from(result) as Observable<
    typeof op19 extends Operator<R, S> ? S :
    typeof op18 extends Operator<Q, R> ? R :
    typeof op17 extends Operator<P, Q> ? Q :
    typeof op16 extends Operator<O, P> ? P :
    typeof op15 extends Operator<N, O> ? O :
    typeof op14 extends Operator<M, N> ? N :
    typeof op13 extends Operator<L, M> ? M :
    typeof op12 extends Operator<K, L> ? L :
    typeof op11 extends Operator<J, K> ? K :
    typeof op10 extends Operator<I, J> ? J :
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
