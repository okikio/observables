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

/**
 * Pipes a source through an operator chain with one applied operator.
 */
export function pipe<T, A>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
): Observable<A>;

/**
 * Pipes a source through an operator chain with two applied operators.
 */
export function pipe<T, A, B>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
): Observable<B>;

/**
 * Pipes a source through an operator chain with three applied operators.
 */
export function pipe<T, A, B, C>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
): Observable<C>;

/**
 * Pipes a source through an operator chain with four applied operators.
 */
export function pipe<T, A, B, C, D>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
): Observable<D>;

/**
 * Pipes a source through an operator chain with five applied operators.
 */
export function pipe<T, A, B, C, D, E>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
): Observable<E>;

/**
 * Pipes a source through an operator chain with six applied operators.
 */
export function pipe<T, A, B, C, D, E, F>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
): Observable<F>;

/**
 * Pipes a source through an operator chain with seven applied operators.
 */
export function pipe<T, A, B, C, D, E, F, G>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
): Observable<G>;

/**
 * Pipes a source through an operator chain with eight applied operators.
 */
export function pipe<T, A, B, C, D, E, F, G, H>(
  source: SpecObservable<T>,
  op1: Operator<T | ObservableError, A>,
  op2: Operator<A, B>,
  op3: Operator<B, C>,
  op4: Operator<C, D>,
  op5: Operator<D, E>,
  op6: Operator<E, F>,
  op7: Operator<F, G>,
  op8: Operator<G, H>,
): Observable<H>;

/**
 * Pipes a source through an operator chain with nine applied operators.
 */
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
  op9: Operator<H, I>,
): Observable<I>;

/**
 * Pipes a source through an operator chain with ten applied operators.
 */
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
  op10: Operator<I, J>,
): Observable<J>;

/**
 * Pipes a source through an operator chain with eleven applied operators.
 */
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
  op11: Operator<J, K>,
): Observable<K>;

/**
 * Pipes a source through an operator chain with twelve applied operators.
 */
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
  op12: Operator<K, L>,
): Observable<L>;

/**
 * Pipes a source through an operator chain with thirteen applied operators.
 */
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
  op13: Operator<L, M>,
): Observable<M>;

/**
 * Pipes a source through an operator chain with fourteen applied operators.
 */
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
  op14: Operator<M, N>,
): Observable<N>;

/**
 * Pipes a source through an operator chain with fifteen applied operators.
 */
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
  op15: Operator<N, O>,
): Observable<O>;

/**
 * Pipes a source through an operator chain with sixteen applied operators.
 */
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
  op16: Operator<O, P>,
): Observable<P>;

/**
 * Pipes a source through an operator chain with seventeen applied operators.
 */
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
  op17: Operator<P, Q>,
): Observable<Q>;

/**
 * Pipes a source through an operator chain with eighteen applied operators.
 */
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
  op18: Operator<Q, R>,
): Observable<R>;

/**
 * Pipes a source through an operator chain with nineteen applied operators.
 */
export function pipe<
  T,
  A,
  B,
  C,
  D,
  E,
  F,
  G,
  H,
  I,
  J,
  K,
  L,
  M,
  N,
  O,
  P,
  Q,
  R,
  S,
>(
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
  op19: Operator<R, S>,
): Observable<S>;

// Implementation
export function pipe<
  T,
  A,
  B,
  C,
  D,
  E,
  F,
  G,
  H,
  I,
  J,
  K,
  L,
  M,
  N,
  O,
  P,
  Q,
  R,
  S,
>(
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
  op19?: Operator<R, S>,
): Observable<
  typeof op19 extends Operator<R, S> ? S
    : typeof op18 extends Operator<Q, R> ? R
    : typeof op17 extends Operator<P, Q> ? Q
    : typeof op16 extends Operator<O, P> ? P
    : typeof op15 extends Operator<N, O> ? O
    : typeof op14 extends Operator<M, N> ? N
    : typeof op13 extends Operator<L, M> ? M
    : typeof op12 extends Operator<K, L> ? L
    : typeof op11 extends Operator<J, K> ? K
    : typeof op10 extends Operator<I, J> ? J
    : typeof op9 extends Operator<H, I> ? I
    : typeof op8 extends Operator<G, H> ? H
    : typeof op7 extends Operator<F, G> ? G
    : typeof op6 extends Operator<E, F> ? F
    : typeof op5 extends Operator<D, E> ? E
    : typeof op4 extends Operator<C, D> ? D
    : typeof op3 extends Operator<B, C> ? C
    : typeof op2 extends Operator<A, B> ? B
    : typeof op1 extends Operator<T | ObservableError, A> ? A
    : T
> {
  // Ignore the source argument
  const len = arguments.length - 1;
  if (len === 0) return source as Observable<T>;
  if (len > 19) {
    throw new Error("pipe: Too many operators (maximum 19).");
  }

  if (typeof source[Symbol.observable] !== "function") {
    throw new TypeError("pipe: source must be an Observable");
  }

  return new Observable((observer) => {
    let result: ReadableStream<unknown> = toStream(
      pull(source, { throwError: false }),
    );

    const errorPrefix = "pipe:operator";
    if (op1) {
      result = applyOperator(result, op1, { message: errorPrefix + `[1]` });
    }
    if (op2) {
      result = applyOperator(result, op2, { message: errorPrefix + `[2]` });
    }
    if (op3) {
      result = applyOperator(result, op3, { message: errorPrefix + `[3]` });
    }
    if (op4) {
      result = applyOperator(result, op4, { message: errorPrefix + `[4]` });
    }
    if (op5) {
      result = applyOperator(result, op5, { message: errorPrefix + `[5]` });
    }
    if (op6) {
      result = applyOperator(result, op6, { message: errorPrefix + `[6]` });
    }
    if (op7) {
      result = applyOperator(result, op7, { message: errorPrefix + `[7]` });
    }
    if (op8) {
      result = applyOperator(result, op8, { message: errorPrefix + `[8]` });
    }
    if (op9) {
      result = applyOperator(result, op9, { message: errorPrefix + `[9]` });
    }
    if (op10) {
      result = applyOperator(result, op10, { message: errorPrefix + `[10]` });
    }
    if (op11) {
      result = applyOperator(result, op11, { message: errorPrefix + `[11]` });
    }
    if (op12) {
      result = applyOperator(result, op12, { message: errorPrefix + `[12]` });
    }
    if (op13) {
      result = applyOperator(result, op13, { message: errorPrefix + `[13]` });
    }
    if (op14) {
      result = applyOperator(result, op14, { message: errorPrefix + `[14]` });
    }
    if (op15) {
      result = applyOperator(result, op15, { message: errorPrefix + `[15]` });
    }
    if (op16) {
      result = applyOperator(result, op16, { message: errorPrefix + `[16]` });
    }
    if (op17) {
      result = applyOperator(result, op17, { message: errorPrefix + `[17]` });
    }
    if (op18) {
      result = applyOperator(result, op18, { message: errorPrefix + `[18]` });
    }
    if (op19) {
      result = applyOperator(result, op19, { message: errorPrefix + `[19]` });
    }

    const reader = result.getReader();
    let cancelled = false;

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          observer.next(value as never);

          if (observer.closed) {
            cancelled = true;
            try {
              await reader.cancel();
            } catch {
              // Ignore cancellation failures while the subscription is closing.
            }
            break;
          }
        }

        if (!cancelled) {
          cancelled = true;
          observer.complete();
        }
      } catch (err) {
        if (!cancelled) {
          cancelled = true;
          observer.error(err);
          try {
            await reader.cancel(err);
          } catch {
            // Ignore cancellation failures while surfacing the original error.
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Ignore release failures during cancellation.
        }
      }
    })();

    return () => {
      cancelled = true;
      void reader.cancel();
    };
  }) as Observable<
    typeof op19 extends Operator<R, S> ? S
      : typeof op18 extends Operator<Q, R> ? R
      : typeof op17 extends Operator<P, Q> ? Q
      : typeof op16 extends Operator<O, P> ? P
      : typeof op15 extends Operator<N, O> ? O
      : typeof op14 extends Operator<M, N> ? N
      : typeof op13 extends Operator<L, M> ? M
      : typeof op12 extends Operator<K, L> ? L
      : typeof op11 extends Operator<J, K> ? K
      : typeof op10 extends Operator<I, J> ? J
      : typeof op9 extends Operator<H, I> ? I
      : typeof op8 extends Operator<G, H> ? H
      : typeof op7 extends Operator<F, G> ? G
      : typeof op6 extends Operator<E, F> ? F
      : typeof op5 extends Operator<D, E> ? E
      : typeof op4 extends Operator<C, D> ? D
      : typeof op3 extends Operator<B, C> ? C
      : typeof op2 extends Operator<A, B> ? B
      : typeof op1 extends Operator<T | ObservableError, A> ? A
      : T
  >;
}
