/**
 * Combination operators start follow-up streams from each source value.
 *
 * They are useful when one value should trigger more async work, such as a
 * search term starting a fetch or a file path starting a file read. The outer
 * stream produces the trigger value. The inner stream does the follow-up work.
 *
 * The main question is what to do when a new outer value arrives before the old
 * inner work has finished:
 *
 * ```text
 * mergeMap   -> keep many inner streams running at once
 * concatMap  -> queue inner streams and run them one at a time
 * switchMap  -> cancel older inner work and keep only the latest
 * ```
 *
 * @module
 */

import type { SpecObservable } from "../../_spec.ts";
import type { ExcludeError, Operator } from "../_types.ts";
import type { Queue } from "../../queue.ts";

import { createStatefulOperator } from "../operators.ts";
import { isObservableError, ObservableError } from "../../error.ts";
import { pull } from "../../observable.ts";
import {
  createQueue,
  dequeue,
  enqueue,
  getSize,
  isFull,
  toArray,
} from "../../queue.ts";

/**
 * Creates a follow-up Observable for each source value.
 *
 * These higher-order operators all work in two stages:
 * they read an outer source value, then use this callback to start an inner
 * Observable whose values are forwarded according to the operator's policy.
 *
 * ```text
 * outer value ---> createFollowUp(value, index) ---> inner Observable
 * ```
 *
 * From there, each operator makes a different concurrency decision:
 *
 * ```text
 * mergeMap   -> keep many inners running at once
 * concatMap  -> queue inners and run one at a time
 * switchMap  -> cancel the old inner and keep only the latest one
 * ```
 *
 * @typeParam T - Value type from the outer source
 * @typeParam R - Value type emitted by each follow-up Observable
 */
export type FollowUpProject<T, R> = (
  value: ExcludeError<T>,
  index: number,
) => SpecObservable<R>;

/**
 * Tuple of values emitted by a source and one or more companion Observables.
 *
 * Operators such as `withLatestFrom`, `combineLatestWith`, and `zipWith`
 * return tuples so callers can decide how to shape the combined values in a
 * later `map()` step without losing type information.
 *
 * @typeParam T - Value type from the primary source
 * @typeParam TOthers - Value types from the companion Observables
 */
export type CombinationTuple<T, TOthers extends readonly unknown[]> = [
  T,
  ...TOthers,
];

/**
 * Tuple-shaped list of companion Observables used by the combination helpers.
 *
 * @typeParam TValues - Value types emitted by each companion Observable
 */
export type CombinationSources<TValues extends readonly unknown[]> = {
  [K in keyof TValues]: SpecObservable<TValues[K]>;
};

/**
 * Internal state for `mergeMap()`.
 *
 * Each outer value gets a numeric slot so its active iterator and task can be
 * tracked and cancelled independently. The buffer stores outer values that are
 * waiting for a free concurrency slot.
 */
interface MergeMapState<T, R> {
  /** Active inner iterators, keyed by the outer value index that created them. */
  activeIterators: Map<number, AsyncIterator<R | ObservableError>>;
  /** Running tasks that are currently draining inner iterators. */
  activeTasks: Set<Promise<void>>;
  /** Outer values waiting for a free merge slot. */
  buffer: Array<[ExcludeError<T>, number]>;
  /** Monotonic index used to label each outer value. */
  index: number;
  /** Number of inner streams currently being drained. */
  activeCount: number;
  /** Deferred used by `flush()` to wait for the final inner work to finish. */
  idleDeferred: PromiseWithResolvers<void> | null;
  /** Set once downstream cancellation says no more output is wanted. */
  isCancelled: boolean;
  /** Set once the outer source has finished producing values. */
  sourceCompleted: boolean;
}

/**
 * Internal state for `switchMap()`.
 *
 * `currentTaskToken` lets the draining task tell whether it is still the latest
 * inner stream. That matters because `switchMap()` intentionally abandons older
 * work when a newer source value arrives.
 */
interface SwitchMapState<R> {
  /** The iterator for the currently active inner Observable, if any. */
  currentIterator: AsyncIterator<R | ObservableError> | null;
  /** Task draining the currently active iterator into the controller. */
  currentTask: Promise<void> | null;
  /** Identity token used to detect stale tasks after a switch. */
  currentTaskToken: object | null;
  /** Set once downstream cancellation says the operator should stop work. */
  isCancelled: boolean;
  /** Monotonic index forwarded into the projection callback. */
  index: number;
}

/**
 * Internal state for `withLatestFrom()`.
 *
 * Companion Observables update cached latest values in the background, but the
 * source still decides when outputs happen.
 */
interface WithLatestFromState {
  /** Latest companion values in the same order as the `others` tuple. */
  latestValues: unknown[];
  /** Whether each companion has produced at least one value yet. */
  seenLatest: boolean[];
  /** Iterators used to watch companion Observables in the background. */
  iterators: Array<AsyncIterator<unknown | ObservableError>>;
  /** Tasks currently draining companion Observables. */
  tasks: Set<Promise<void>>;
  /** Set once downstream cancellation says no more output is wanted. */
  isCancelled: boolean;
}

/**
 * Internal state for `combineLatestWith()`.
 *
 * This keeps one latest value for the source and one for each companion. Once
 * every slot has been filled, any later update emits a full tuple.
 */
interface CombineLatestWithState<T> {
  /** The most recent source value. */
  sourceValue: ExcludeError<T> | null;
  /** Whether the source has produced at least one value yet. */
  hasSourceValue: boolean;
  /** Latest companion values in the same order as the `others` tuple. */
  latestValues: unknown[];
  /** Whether each companion has produced at least one value yet. */
  seenLatest: boolean[];
  /** Iterators used to watch companion Observables in the background. */
  iterators: Array<AsyncIterator<unknown | ObservableError>>;
  /** Tasks currently draining companion Observables. */
  tasks: Set<Promise<void>>;
  /** Set once the primary source has completed. */
  sourceCompleted: boolean;
  /** Set once downstream cancellation says no more output is wanted. */
  isCancelled: boolean;
}

/**
 * Internal state for `zipWith()`.
 *
 * `zipWith()` is queue-based, not latest-value-based. Each queue position
 * represents one future tuple that can only be emitted once every source has a
 * value for that position.
 */
interface ZipWithState<T> {
  /** Source values waiting to be paired with companion values. */
  sourceQueue: Queue<ExcludeError<T>>;
  /** Companion queues aligned by the same tuple positions as the source queue. */
  otherQueues: Array<Queue<unknown>>;
  /** Whether the primary source has completed. */
  sourceCompleted: boolean;
  /** Whether each companion Observable has completed. */
  otherCompleted: boolean[];
  /** Iterators used to watch companion Observables in the background. */
  iterators: Array<AsyncIterator<unknown | ObservableError>>;
  /** Tasks currently draining companion Observables. */
  tasks: Set<Promise<void>>;
  /** Set once downstream cancellation says no more output is wanted. */
  isCancelled: boolean;
  /** Prevents repeated termination after zip becomes impossible to continue. */
  isTerminated: boolean;
}

/**
 * Internal state for `raceWith()`.
 *
 * A winner is recorded once the first value arrives. After that point, all
 * other Observables are cancelled and ignored.
 */
interface RaceWithState {
  /** `source` if the primary source wins, or a companion index if another wins. */
  winner: 'source' | number | null;
  /** Iterators used to watch companion Observables in the background. */
  iterators: Array<AsyncIterator<unknown | ObservableError>>;
  /** Tasks currently draining companion Observables. */
  tasks: Set<Promise<void>>;
  /** Whether the primary source has completed. */
  sourceCompleted: boolean;
  /** Set once downstream cancellation says no more output is wanted. */
  isCancelled: boolean;
}

/**
 * Cancels an iterator if it exposes `return()`.
 *
 * Most iterators created through `pull()` do expose `return()`, and calling it
 * is the Observable equivalent of saying "the consumer is done, release any
 * held resources now".
 */
async function cancelIterator(
  iterator: AsyncIterator<unknown> | null | undefined,
): Promise<void> {
  if (iterator?.return) {
    await iterator.return();
  }
}

/**
 * Rebuilds the strongly typed tuple returned by the combination operators.
 *
 * The runtime data is stored in mutable `unknown[]` buffers because values are
 * filled over time. This helper isolates the final cast to one place, and the
 * cast is sound because every caller preserves the exact length and ordering of
 * the original companion Observable tuple.
 */
function toCombinationTuple<T, TOthers extends readonly unknown[]>(
  sourceValue: T,
  otherValues: readonly unknown[],
): CombinationTuple<T, TOthers> {
  return [
    sourceValue,
    ...(otherValues as unknown as TOthers),
  ] as CombinationTuple<T, TOthers>;
}

/**
 * Removes one queued value from each companion queue in order.
 *
 * Callers only use this after checking that every queue has at least one value.
 * That precondition is what makes the returned tuple complete instead of partly
 * `undefined`.
 */
function shiftQueuedValues<TOthers extends readonly unknown[]>(
  queues: Array<Queue<unknown>>,
): TOthers {
  return queues.map((queue) => dequeue(queue)) as unknown as TOthers;
}

/**
 * Starts zip queues small and lets them grow only when buffering actually
 * happens.
 *
 * `zipWith()` can run for a long time, so this avoids paying for large backing
 * arrays up front while still keeping steady-state dequeue work O(1).
 */
const INITIAL_ZIP_QUEUE_CAPACITY = 16;

/**
 * Returns whether a queue currently has at least one buffered value.
 */
function hasQueuedValue<T>(queue: Queue<T>): boolean {
  return getSize(queue) > 0;
}

/**
 * Appends a value to a queue, growing the underlying circular buffer when the
 * current capacity is exhausted.
 *
 * The shared queue utilities are fixed-capacity by design. `zipWith()` needs
 * unbounded logical buffering, so this helper preserves the queue API while
 * replacing the backing queue with a larger one only when necessary.
 */
function enqueueQueuedValue<T>(queue: Queue<T>, value: T): Queue<T> {
  if (!isFull(queue)) {
    enqueue(queue, value);
    return queue;
  }

  const grownQueue = createQueue<T>(Math.max(queue.capacity * 2, 1));

  for (const item of toArray(queue)) {
    enqueue(grownQueue, item);
  }

  enqueue(grownQueue, value);
  return grownQueue;
}

/**
 * Transforms each item into a new stream and merges their outputs, running
 * them in parallel.
 *
 * Like `Promise.all(items.map(project))` but for streams, with control over
 * concurrency. It's designed for high-throughput parallel processing.
 *
 * @example
 * ```ts
 * import { pipe, mergeMap, from } from "./helpers/mod.ts";
 * import { of } from "../../observable.ts";
 *
 * // Promise.all behavior
 * const ids = [1, 2, 3];
 * const promises = ids.map(id => Promise.resolve(`User ${id}`));
 * const users = await Promise.all(promises); // ["User 1", "User 2", "User 3"]
 *
 * // Stream behavior
 * const idStream = from(ids);
 * const userStream = pipe(
 *   idStream,
 *   mergeMap(id => of(`User ${id}`), 2) // Process 2 at a time
 * );
 *
 * // Results may arrive in any order, e.g., "User 2", "User 1", "User 3"
 * ```
 *
 * ## Practical Use Case
 *
 * Use `mergeMap` to fetch data for multiple items concurrently. For example,
 * given a stream of user IDs, you can fetch each user's profile in parallel.
 * This is much faster than fetching them one by one.
 *
 * ## Key Insight
 *
 * `mergeMap` is for parallel, high-throughput operations where the order of
 * results doesn't matter. It's the go-to for maximizing concurrency.
 *
 * @typeParam T - Type of values from the source Observable
 * @typeParam R - Type of values in the result Observable
 * @param project - Function that maps a source value to an Observable
 * @param concurrent - Maximum number of inner Observables being subscribed
 * to concurrently. Default is Infinity.
 * @returns An operator function that maps and flattens values
 */
export function mergeMap<T, R>(
  project: FollowUpProject<T, R>,
  concurrent: number = Infinity,
): Operator<T | ObservableError, R | ObservableError> {
  const maxConcurrent = concurrent > 0 ? concurrent : 1;

  return createStatefulOperator<
    T | ObservableError,
    R | ObservableError,
    MergeMapState<T, R>
  >({
    name: "mergeMap",
    errorMode: "pass-through",

    createState: () => ({
      activeIterators: new Map(),
      activeTasks: new Set(),
      buffer: [],
      index: 0,
      activeCount: 0,
      idleDeferred: null,
      isCancelled: false,
      sourceCompleted: false,
    }),

    transform(chunk, state, controller) {
      const value = chunk as ExcludeError<T>;
      const sourceIndex = state.index++;

      // `flush()` must wait for both active inners and buffered outers.
      // Resolving this gate too early would let the operator finish while inner
      // work is still producing values.
      const resolveIfIdle = (): void => {
        if (
          state.sourceCompleted &&
          state.activeCount === 0 &&
          state.buffer.length === 0 &&
          state.idleDeferred
        ) {
          state.idleDeferred.resolve();
          state.idleDeferred = null;
        }
      };

      // Keep filling free concurrency slots until either the buffer is empty or
      // the operator reaches its configured parallelism limit.
      const drainBuffer = (): void => {
        while (
          !state.isCancelled &&
          state.activeCount < maxConcurrent &&
          state.buffer.length > 0
        ) {
          const next = state.buffer.shift();
          if (!next) break;
          launchProjection(next[0], next[1]);
        }

        resolveIfIdle();
      };

      // Start draining one projected inner Observable and keep enough metadata
      // around to cancel or await it later.
      const launchProjection = (
        innerValue: ExcludeError<T>,
        innerIndex: number,
      ): void => {
        let innerObservable: SpecObservable<R>;

        try {
          innerObservable = project(innerValue, innerIndex);
        } catch (err) {
          try {
            controller.enqueue(
              ObservableError.from(
                err,
                "operator:stateful:mergeMap:project",
                innerValue,
              ),
            );
          } catch {
            // Downstream cancellation already decided the stream outcome.
          }

          drainBuffer();
          return;
        }

        state.activeCount++;
        const iterator = pull(innerObservable, { throwError: false })[
          Symbol.asyncIterator
        ]();
        state.activeIterators.set(innerIndex, iterator);

        const taskRef: { current: Promise<void> | null } = { current: null };
        const task = (async () => {
          try {
            while (!state.isCancelled) {
              const { value: emittedValue, done } = await iterator.next();

              if (done || state.isCancelled) {
                break;
              }

              try {
                controller.enqueue(emittedValue);
              } catch {
                break;
              }
            }
          } catch (err) {
            if (!state.isCancelled) {
              try {
                controller.enqueue(
                  ObservableError.from(
                    err,
                    "operator:stateful:mergeMap:innerObservable",
                    innerValue,
                  ),
                );
              } catch {
                // Downstream cancellation already decided the stream outcome.
              }
            }
          } finally {
            state.activeIterators.delete(innerIndex);
            if (taskRef.current) {
              state.activeTasks.delete(taskRef.current);
            }
            state.activeCount--;
            drainBuffer();
          }
        })();

        taskRef.current = task;
        state.activeTasks.add(task);
      };

      if (state.activeCount < maxConcurrent) {
        launchProjection(value, sourceIndex);
        return;
      }

      state.buffer.push([value, sourceIndex]);
    },

    async flush(state) {
      state.sourceCompleted = true;

      if (state.activeCount === 0 && state.buffer.length === 0) {
        return;
      }

      state.idleDeferred ??= Promise.withResolvers<void>();
      await state.idleDeferred.promise;
    },

    async cancel(state) {
      state.isCancelled = true;
      state.buffer.length = 0;

      const iterators = [...state.activeIterators.values()];
      state.activeIterators.clear();

      await Promise.allSettled(
        iterators.map((iterator) => iterator.return?.()),
      );

      await Promise.allSettled([...state.activeTasks]);

      state.activeTasks.clear();
      state.activeCount = 0;

      if (state.idleDeferred) {
        state.idleDeferred.resolve();
        state.idleDeferred = null;
      }
    },
  });
}

/**
 * Transforms each item into a new stream and runs them one after another, in
 * strict order.
 *
 * Like a series of `await` calls in a `for...of` loop, this ensures that each
 * new stream completes before the next one begins.
 *
 * @example
 * ```ts
 * import { pipe, concatMap, from } from "./helpers/mod.ts";
 * import { of } from "../../observable.ts";
 *
 * // Sequential awaits in a loop
 * async function processSequentially() {
 *   const results = [];
 *   for (const id of [1, 2, 3]) {
 *     const result = await Promise.resolve(`Step ${id}`);
 *     results.push(result);
 *   }
 *   return results; // ["Step 1", "Step 2", "Step 3"]
 * }
 *
 * // Stream behavior
 * const idStream = from([1, 2, 3]);
 * const processStream = pipe(
 *   idStream,
 *   concatMap(id => of(`Step ${id}`))
 * );
 *
 * // Results are guaranteed to be in order: "Step 1", "Step 2", "Step 3"
 * ```
 *
 * ## Practical Use Case
 *
 * Use `concatMap` for sequential operations where order matters, such as a
 * multi-step process where each step depends on the previous one (e.g., create
 * user, then create their profile, then send a welcome email).
 *
 * ## Key Insight
 *
 * `concatMap` guarantees order by waiting for each inner stream to complete
 * before starting the next. It's perfect for sequential tasks but is slower
 * than `mergeMap` because it doesn't run in parallel.
 *
 * @typeParam T - Type of values from the source Observable
 * @typeParam R - Type of values in the result Observable
 * @param project - Function that maps a source value to an Observable
 * @returns An operator function that maps and concatenates values
 */
export function concatMap<T, R>(
  project: FollowUpProject<T, R>,
): Operator<T | ObservableError, R | ObservableError> {
  // concatMap is just mergeMap with concurrency = 1
  return mergeMap(project, 1);
}

/**
 * Transforms items into new streams, but cancels the previous stream when a new
 * item arrives.
 *
 * Like an auto-cancelling search input, it only cares about the latest value
 * and discards any pending work from previous values.
 *
 * @example
 * ```ts
 * import { pipe, switchMap, from } from "./helpers/mod.ts";
 * import { of } from "../../observable.ts";
 *
 * // No direct Array equivalent, as it's about handling events over time.
 *
 * // Stream behavior for a search input
 * const queryStream = from(["cat", "cats", "cats rul"]);
 *
 * const searchResultStream = pipe(
 *   queryStream,
 *   switchMap(query => of(`Results for "${query}"`))
 * );
 *
 * // Assuming each query arrives before the last one "completes":
 * // The first two searches for "cat" and "cats" would be cancelled.
 * // The final output would only be: 'Results for "cats rul"'
 * ```
 *
 * ## Practical Use Case
 *
 * `switchMap` is essential for live search bars or any UI element that
 * triggers frequent events. It ensures that only the results for the most
 * recent event are processed, preventing outdated or out-of-order results.
 *
 * ## Key Insight
 *
 * `switchMap` is the operator of choice for handling rapid-fire events where
 * only the latest matters. It prevents race conditions and keeps your UI
 * responsive by cancelling stale, in-flight operations.
 *
 * @typeParam T - Type of values from the source Observable
 * @typeParam R - Type of values in the result Observable
 * @param project - Function that maps a source value to an Observable
 * @returns An operator function that maps and switches between values
 */
export function switchMap<T, R>(
  project: FollowUpProject<T, R>,
): Operator<T | ObservableError, R | ObservableError> {
  return createStatefulOperator<
    T | ObservableError,
    R | ObservableError,
    SwitchMapState<R>
  >({
    name: "switchMap",
    errorMode: "pass-through",

    createState: () => ({
      currentIterator: null,
      currentTask: null,
      currentTaskToken: null,
      isCancelled: false,
      index: 0,
    }),

    async transform(chunk, state, controller) {
      /**
       * Stops the current inner Observable before a newer one replaces it.
       *
       * The order matters: `return()` asks the iterator to clean up, then we
       * await the draining task so no stale emissions race with the next inner.
       */
      const stopCurrent = async (): Promise<void> => {
        const iterator = state.currentIterator;
        const task = state.currentTask;

        state.currentIterator = null;
        state.currentTask = null;
        state.currentTaskToken = null;

        if (iterator?.return) {
          await iterator.return();
        }

        if (task) {
          await task;
        }
      };

      if (state.currentTaskToken || state.currentIterator || state.currentTask) {
        await stopCurrent();
      }

      let innerObservable: SpecObservable<R>;

      try {
        // Apply projection function to get inner Observable
        innerObservable = project(chunk as ExcludeError<T>, state.index++);
      } catch (err) {
        // Forward any errors from the projection function
        controller.enqueue(
          ObservableError.from(
            err,
            "operator:stateful:switchMap:project",
            chunk,
          ) as R,
        );
        return;
      }

      const currentTaskToken = {};
      const iterator = pull(innerObservable, { throwError: false })[
        Symbol.asyncIterator
      ]();

      state.currentTaskToken = currentTaskToken;
      state.currentIterator = iterator;

      const currentTaskRef: { current: Promise<void> | null } = {
        current: null,
      };
      const currentTask = (async () => {
        const isActive = (): boolean => {
          return !state.isCancelled && state.currentTaskToken === currentTaskToken;
        };

        try {
          while (isActive()) {
            const { value: emittedValue, done } = await iterator.next();

            if (done || !isActive()) {
              break;
            }

            try {
              controller.enqueue(emittedValue);
            } catch {
              break;
            }
          }
        } catch (err) {
          if (isActive()) {
            try {
              controller.enqueue(
                ObservableError.from(
                  err,
                  "operator:stateful:switchMap:innerObservable",
                  chunk,
                ),
              );
            } catch {
              // Downstream cancellation already decided the stream outcome.
            }
          }
        } finally {
          if (state.currentIterator === iterator) {
            state.currentIterator = null;
          }

          if (state.currentTask === currentTaskRef.current) {
            state.currentTask = null;
          }

          if (state.currentTaskToken === currentTaskToken) {
            state.currentTaskToken = null;
          }
        }
      })();

      currentTaskRef.current = currentTask;
      state.currentTask = currentTask;
    },

    async flush(state) {
      if (state.currentTask) {
        await state.currentTask;
      }
    },

    async cancel(state) {
      state.isCancelled = true;

      if (state.currentIterator?.return) {
        await state.currentIterator.return();
      }

      if (state.currentTask) {
        await state.currentTask;
      }

      state.currentIterator = null;
      state.currentTask = null;
      state.currentTaskToken = null;
    },
  });
}

/**
 * Emits each source value together with the latest value from every companion
 * Observable.
 *
 * This operator waits until every companion Observable has produced at least
 * one value. After that gate opens, each new source value emits a tuple that
 * includes the source value followed by the most recent companion values.
 *
 * ```text
 * companion A: ---a----b-------c--
 * companion B: -----x-------y-----
 * source:      ------1--2------3--
 * output:      ------[1,a,x][2,b,x][3,c,y]
 * ```
 *
 * The source still decides when outputs happen. Companion Observables only
 * update the remembered latest values.
 *
 * @typeParam T - Value type from the primary source
 * @typeParam TOthers - Value types from the companion Observables
 * @param others - Companion Observables whose latest values should be attached
 * @returns An operator that emits tuples of the source value and latest others
 */
export function withLatestFrom<T, TOthers extends readonly unknown[]>(
  ...others: CombinationSources<TOthers>
): Operator<
  T | ObservableError,
  CombinationTuple<ExcludeError<T>, TOthers> | ObservableError
> {
  return createStatefulOperator<
    T | ObservableError,
    CombinationTuple<ExcludeError<T>, TOthers> | ObservableError,
    WithLatestFromState
  >({
    name: "withLatestFrom",
    errorMode: "pass-through",

    createState: () => ({
      latestValues: new Array(others.length),
      seenLatest: others.map(() => false),
      iterators: [],
      tasks: new Set(),
      isCancelled: false,
    }),

    start(state, controller) {
      // Companion Observables run in the background and only update cached
      // latest values. They never decide when to emit tuples themselves.
      others.forEach((observable, index) => {
        const iterator = pull(observable, { throwError: false })[
          Symbol.asyncIterator
        ]();
        state.iterators[index] = iterator;

        const taskRef: { current: Promise<void> | null } = { current: null };
        const task = (async () => {
          try {
            while (!state.isCancelled) {
              const { value, done } = await iterator.next();

              if (done || state.isCancelled) {
                break;
              }

              if (isObservableError(value)) {
                try {
                  controller.enqueue(value);
                } catch {
                  break;
                }
                continue;
              }

              state.latestValues[index] = value;
              state.seenLatest[index] = true;
            }
          } catch (err) {
            if (!state.isCancelled) {
              try {
                controller.enqueue(
                  ObservableError.from(
                    err,
                    "operator:stateful:withLatestFrom:companion",
                    { companionIndex: index },
                  ),
                );
              } catch {
                // Downstream cancellation already decided the stream outcome.
              }
            }
          } finally {
            if (taskRef.current) {
              state.tasks.delete(taskRef.current);
            }
          }
        })();

        taskRef.current = task;
        state.tasks.add(task);
      });
    },

    transform(chunk, state, controller) {
      if (!state.seenLatest.every(Boolean)) {
        return;
      }

      controller.enqueue(
        toCombinationTuple<ExcludeError<T>, TOthers>(
          chunk as ExcludeError<T>,
          state.latestValues,
        ),
      );
    },

    async flush(state) {
      await Promise.allSettled([...state.tasks]);
    },

    async cancel(state) {
      state.isCancelled = true;
      await Promise.allSettled(state.iterators.map((iterator) => cancelIterator(iterator)));
      await Promise.allSettled([...state.tasks]);
      state.tasks.clear();
      state.iterators.length = 0;
    },
  });
}

/**
 * Combines the source with companion Observables using combine-latest timing.
 *
 * Once every source has emitted at least one value, any new value from the
 * primary source or a companion Observable emits a new tuple containing the
 * latest value from each source.
 *
 * @typeParam T - Value type from the primary source
 * @typeParam TOthers - Value types from the companion Observables
 * @param others - Companion Observables that participate in the latest-value set
 * @returns An operator that emits tuples of the latest value from every source
 */
export function combineLatestWith<T, TOthers extends readonly unknown[]>(
  ...others: CombinationSources<TOthers>
): Operator<
  T | ObservableError,
  CombinationTuple<ExcludeError<T>, TOthers> | ObservableError
> {
  return createStatefulOperator<
    T | ObservableError,
    CombinationTuple<ExcludeError<T>, TOthers> | ObservableError,
    CombineLatestWithState<T>
  >({
    name: "combineLatestWith",
    errorMode: "pass-through",

    createState: () => ({
      sourceValue: null,
      hasSourceValue: false,
      latestValues: new Array(others.length),
      seenLatest: others.map(() => false),
      iterators: [],
      tasks: new Set(),
      sourceCompleted: false,
      isCancelled: false,
    }),

    start(state, controller) {
      /**
       * Emits the full latest tuple only after the source and every companion
       * have contributed at least one value.
       */
      const emitLatest = (): void => {
        if (!state.hasSourceValue || !state.seenLatest.every(Boolean)) {
          return;
        }

        controller.enqueue(
          toCombinationTuple<ExcludeError<T>, TOthers>(
            state.sourceValue as ExcludeError<T>,
            state.latestValues,
          ),
        );
      };

      others.forEach((observable, index) => {
        const iterator = pull(observable, { throwError: false })[
          Symbol.asyncIterator
        ]();
        state.iterators[index] = iterator;

        const taskRef: { current: Promise<void> | null } = { current: null };
        const task = (async () => {
          try {
            while (!state.isCancelled) {
              const { value, done } = await iterator.next();

              if (done || state.isCancelled) {
                break;
              }

              if (isObservableError(value)) {
                try {
                  controller.enqueue(value);
                } catch {
                  break;
                }
                continue;
              }

              state.latestValues[index] = value;
              state.seenLatest[index] = true;

              try {
                emitLatest();
              } catch {
                break;
              }
            }
          } catch (err) {
            if (!state.isCancelled) {
              try {
                controller.enqueue(
                  ObservableError.from(
                    err,
                    "operator:stateful:combineLatestWith:companion",
                    { companionIndex: index },
                  ),
                );
              } catch {
                // Downstream cancellation already decided the stream outcome.
              }
            }
          } finally {
            if (taskRef.current) {
              state.tasks.delete(taskRef.current);
            }
          }
        })();

        taskRef.current = task;
        state.tasks.add(task);
      });
    },

    transform(chunk, state, controller) {
      state.sourceValue = chunk as ExcludeError<T>;
      state.hasSourceValue = true;

      if (!state.seenLatest.every(Boolean)) {
        return;
      }

      controller.enqueue(
        toCombinationTuple<ExcludeError<T>, TOthers>(
          state.sourceValue,
          state.latestValues,
        ),
      );
    },

    async flush(state) {
      state.sourceCompleted = true;
      await Promise.allSettled([...state.tasks]);
    },

    async cancel(state) {
      state.isCancelled = true;
      await Promise.allSettled(state.iterators.map((iterator) => cancelIterator(iterator)));
      await Promise.allSettled([...state.tasks]);
      state.tasks.clear();
      state.iterators.length = 0;
    },
  });
}

/**
 * Pairs source values with companion values in strict arrival order.
 *
 * `zipWith` waits until it has one value from the source and one value from
 * each companion. It then emits a tuple and removes those values from the
 * queues before waiting for the next full set.
 *
 * @typeParam T - Value type from the primary source
 * @typeParam TOthers - Value types from the companion Observables
 * @param others - Companion Observables to align by arrival order
 * @returns An operator that emits tuples aligned by position instead of time
 */
export function zipWith<T, TOthers extends readonly unknown[]>(
  ...others: CombinationSources<TOthers>
): Operator<
  T | ObservableError,
  CombinationTuple<ExcludeError<T>, TOthers> | ObservableError
> {
  return createStatefulOperator<
    T | ObservableError,
    CombinationTuple<ExcludeError<T>, TOthers> | ObservableError,
    ZipWithState<T>
  >({
    name: "zipWith",
    errorMode: "pass-through",

    createState: () => ({
      sourceQueue: createQueue<ExcludeError<T>>(INITIAL_ZIP_QUEUE_CAPACITY),
      otherQueues: others.map(() => createQueue(INITIAL_ZIP_QUEUE_CAPACITY)),
      sourceCompleted: false,
      otherCompleted: others.map(() => false),
      iterators: [],
      tasks: new Set(),
      isCancelled: false,
      isTerminated: false,
    }),

    start(state, controller) {
      /**
       * Emits as many full zip tuples as are currently available.
       *
       * The termination logic is important: once a completed companion has no
       * queued value left, zip can never produce another full tuple, so the
       * operator terminates immediately instead of waiting for the source to end.
       */
      const emitAvailable = (): void => {
        while (
          !state.isTerminated &&
          hasQueuedValue(state.sourceQueue) &&
          state.otherQueues.every((queue) => hasQueuedValue(queue))
        ) {
          controller.enqueue(
            toCombinationTuple<ExcludeError<T>, TOthers>(
              dequeue(state.sourceQueue) as ExcludeError<T>,
              shiftQueuedValues<TOthers>(state.otherQueues),
            ),
          );
        }

        const blockedByCompletedCompanion = state.otherCompleted.some(
          (completed, index) => completed && !hasQueuedValue(state.otherQueues[index]),
        );

        if (
          !state.isTerminated &&
          (blockedByCompletedCompanion ||
            (state.sourceCompleted && !hasQueuedValue(state.sourceQueue)))
        ) {
          state.isTerminated = true;
          controller.terminate();
        }
      };

      others.forEach((observable, index) => {
        const iterator = pull(observable, { throwError: false })[
          Symbol.asyncIterator
        ]();
        state.iterators[index] = iterator;

        const taskRef: { current: Promise<void> | null } = { current: null };
        const task = (async () => {
          try {
            while (!state.isCancelled && !state.isTerminated) {
              const { value, done } = await iterator.next();

              if (done || state.isCancelled || state.isTerminated) {
                break;
              }

              if (isObservableError(value)) {
                try {
                  controller.enqueue(value);
                } catch {
                  break;
                }
                continue;
              }

              state.otherQueues[index] = enqueueQueuedValue(
                state.otherQueues[index],
                value,
              );
              emitAvailable();
            }
          } catch (err) {
            if (!state.isCancelled && !state.isTerminated) {
              try {
                controller.enqueue(
                  ObservableError.from(
                    err,
                    "operator:stateful:zipWith:companion",
                    { companionIndex: index },
                  ),
                );
              } catch {
                // Downstream cancellation already decided the stream outcome.
              }
            }
          } finally {
            state.otherCompleted[index] = true;
            if (taskRef.current) {
              state.tasks.delete(taskRef.current);
            }

            if (!state.isCancelled && !state.isTerminated) {
              emitAvailable();
            }
          }
        })();

        taskRef.current = task;
        state.tasks.add(task);
      });
    },

    transform(chunk, state, controller) {
      state.sourceQueue = enqueueQueuedValue(
        state.sourceQueue,
        chunk as ExcludeError<T>,
      );

      while (
        !state.isTerminated &&
        hasQueuedValue(state.sourceQueue) &&
        state.otherQueues.every((queue) => hasQueuedValue(queue))
      ) {
        controller.enqueue(
          toCombinationTuple<ExcludeError<T>, TOthers>(
            dequeue(state.sourceQueue) as ExcludeError<T>,
            shiftQueuedValues<TOthers>(state.otherQueues),
          ),
        );
      }

      const blockedByCompletedCompanion = state.otherCompleted.some(
        (completed, index) => completed && !hasQueuedValue(state.otherQueues[index]),
      );

      if (!state.isTerminated && blockedByCompletedCompanion) {
        state.isTerminated = true;
        controller.terminate();
      }
    },

    async flush(state, controller) {
      state.sourceCompleted = true;

      if (!state.isTerminated && !hasQueuedValue(state.sourceQueue)) {
        state.isTerminated = true;
        controller.terminate();
      }

      await Promise.allSettled([...state.tasks]);
    },

    async cancel(state) {
      state.isCancelled = true;
      await Promise.allSettled(state.iterators.map((iterator) => cancelIterator(iterator)));
      await Promise.allSettled([...state.tasks]);
      state.tasks.clear();
      state.iterators.length = 0;
    },
  });
}

/**
 * Mirrors whichever Observable emits first: the source or one of the
 * companions.
 *
 * If the primary source wins, future source values keep flowing and companion
 * Observables are cancelled. If a companion wins, the source is ignored from
 * that point on and the winning companion continues to drive the output.
 *
 * @typeParam T - Value type from the primary source
 * @typeParam TOthers - Value types from the companion Observables
 * @param others - Companion Observables racing against the source
 * @returns An operator that mirrors the winning Observable
 */
export function raceWith<T, TOthers extends readonly unknown[]>(
  ...others: CombinationSources<TOthers>
): Operator<T | ObservableError, ExcludeError<T> | TOthers[number] | ObservableError> {
  return createStatefulOperator<
    T | ObservableError,
    ExcludeError<T> | TOthers[number] | ObservableError,
    RaceWithState
  >({
    name: "raceWith",
    errorMode: "pass-through",

    createState: () => ({
      winner: null,
      iterators: [],
      tasks: new Set(),
      sourceCompleted: false,
      isCancelled: false,
    }),

    start(state, controller) {
      /**
       * Cancels every companion except the winning one.
       *
       * `raceWith()` is intentionally ruthless: once the first value arrives,
       * every loser is stopped so only one Observable continues to drive output.
       */
      const cancelLosers = async (winnerIndex: number): Promise<void> => {
        const loserIterators = state.iterators.filter((_, index) => index !== winnerIndex);
        await Promise.allSettled(loserIterators.map((iterator) => cancelIterator(iterator)));
      };

      others.forEach((observable, index) => {
        const iterator = pull(observable, { throwError: false })[
          Symbol.asyncIterator
        ]();
        state.iterators[index] = iterator;

        const taskRef: { current: Promise<void> | null } = { current: null };
        const task = (async () => {
          try {
            while (!state.isCancelled) {
              const { value, done } = await iterator.next();

              if (done || state.isCancelled) {
                break;
              }

              if (state.winner === null) {
                state.winner = index;
                await cancelLosers(index);
              }

              if (state.winner !== index) {
                break;
              }

              try {
                controller.enqueue(value as TOthers[number] | ObservableError);
              } catch {
                break;
              }
            }
          } catch (err) {
            if (!state.isCancelled && state.winner === index) {
              try {
                controller.enqueue(
                  ObservableError.from(
                    err,
                    "operator:stateful:raceWith:companion",
                    { companionIndex: index },
                  ),
                );
              } catch {
                // Downstream cancellation already decided the stream outcome.
              }
            }
          } finally {
            if (taskRef.current) {
              state.tasks.delete(taskRef.current);
            }
          }
        })();

        taskRef.current = task;
        state.tasks.add(task);
      });
    },

    async transform(chunk, state, controller) {
      if (state.winner === null) {
        state.winner = "source";
        await Promise.allSettled(state.iterators.map((iterator) => cancelIterator(iterator)));
      }

      if (state.winner !== "source") {
        return;
      }

      controller.enqueue(chunk as ExcludeError<T>);
    },

    async flush(state) {
      state.sourceCompleted = true;

      if (state.winner === "source") {
        return;
      }

      await Promise.allSettled([...state.tasks]);
    },

    async cancel(state) {
      state.isCancelled = true;
      await Promise.allSettled(state.iterators.map((iterator) => cancelIterator(iterator)));
      await Promise.allSettled([...state.tasks]);
      state.tasks.clear();
      state.iterators.length = 0;
    },
  });
}
