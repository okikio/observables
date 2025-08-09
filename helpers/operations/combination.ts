// helpers/combination.ts
// Operators that combine Observables or transform to new Observables
// Reimplemented using createStatefulOperator for better compatibility with streaming pipeline

import type { SpecObservable } from "../../_spec.ts";
import type { ExcludeError, Operator } from "../_types.ts";

import { createStatefulOperator } from "../operators.ts";
import { ObservableError, isObservableError } from "../../error.ts";
import { pull } from "../../observable.ts";

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
  project: (value: ExcludeError<T>, index: number) => SpecObservable<R>,
  concurrent: number = Infinity
): Operator<T | ObservableError, R | ObservableError> {
  return createStatefulOperator<T | ObservableError, R, {
    // State for tracking active subscriptions and buffer
    activeSubscriptions: Map<number, { unsubscribe: () => void }>;
    buffer: Array<[ExcludeError<T>, number]>;
    sourceCompleted: boolean;
    index: number;
    activeCount: number;
  }>({
    name: "mergeMap",

    // Initialize state
    createState: () => ({
      activeSubscriptions: new Map(),
      buffer: [],
      sourceCompleted: false,
      index: 0,
      activeCount: 0
    }),

    // Process each incoming chunk
    async transform(chunk, state, controller) {
      // If we're under the concurrency limit, process immediately
      if (state.activeCount < concurrent) {
        await subscribeToProjection(chunk as ExcludeError<T>, state.index++);
      } else {
        // Otherwise, buffer for later
        state.buffer.push([chunk as ExcludeError<T>, state.index++]);
      }

      // Helper function to subscribe to inner Observable
      async function subscribeToProjection(value: T, innerIndex: number) {
        let innerObservable: SpecObservable<R>;

        try {
          // Apply projection function to get inner Observable
          innerObservable = project(value as ExcludeError<T>, innerIndex);
        } catch (err) {
          // Forward any errors from the projection function
          controller.enqueue(ObservableError.from(err, "operator:stateful:mergeMap:project", value) as R);
          return;
        }

        state.activeCount++;

        // Use pull to iterate asynchronously
        try {
          for await (const innerValue of pull(innerObservable, { throwError: false })) {
            controller.enqueue(innerValue as R | ObservableError);
          }
        } catch (err) {
          controller.enqueue(ObservableError.from(err, "operator:stateful:mergeMap:innerObservable", value) as R);
        } finally {
          // Clean up after inner Observable completes
          state.activeSubscriptions.delete(innerIndex);
          state.activeCount--;

          // Process the buffer if we have space
          processBuffer();
        }
      }

      // Helper function to process the buffer
      async function processBuffer() {
        // While we have room for more inner Observables and
        // there are items in the buffer, subscribe to inner Observables
        while (state.activeCount < concurrent && state.buffer.length > 0) {
          const [value, bufferIndex] = state.buffer.shift()!;
          await subscribeToProjection(value, bufferIndex);
        }

        // If the source is completed and we have no active inner
        // subscriptions, complete the output stream
        if (state.sourceCompleted && state.activeCount === 0) {
          // Nothing more to do, transformation is complete
        }
      }
    },

    // Handle the end of the source stream
    flush(state) {
      // Mark the source as completed
      state.sourceCompleted = true;

      // If no active inner subscriptions, we're done
      if (state.activeCount === 0) {
        // Stream will close naturally
      }
      // Otherwise, let the active subscriptions complete
    },

    // Handle cancellation
    cancel(state) {
      // Clean up all inner subscriptions
      for (const subscription of state.activeSubscriptions.values()) {
        subscription.unsubscribe();
      }

      // Clear the buffer and state
      state.buffer.length = 0;
      state.activeSubscriptions.clear();
      state.activeCount = 0;
    }
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
  project: (value: ExcludeError<T>, index: number) => SpecObservable<R>
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
  project: (value: ExcludeError<T>, index: number) => SpecObservable<R>
): Operator<T | ObservableError, R | ObservableError> {
  return createStatefulOperator<T | ObservableError, R | ObservableError, {
    // State for tracking inner subscription
    currentController: AbortController | null;
    sourceCompleted: boolean;
    index: number;
  }>({
    name: "switchMap",

    // Initialize state
    createState: () => ({
      currentController: null,
      sourceCompleted: false,
      index: 0
    }),

    // Process each incoming chunk
    transform(chunk, state, controller) {
      if (isObservableError(chunk)) {
        // If the chunk is an error, we can immediately enqueue it
        controller.enqueue(chunk);
        return;
      }

      // Cancel any existing inner subscription
      if (state.currentController) {
        state.currentController.abort();
        state.currentController = null;
      }

      let innerObservable: SpecObservable<R>;

      try {
        // Apply projection function to get inner Observable
        innerObservable = project(chunk as ExcludeError<T>, state.index++);
      } catch (err) {
        // Forward any errors from the projection function
        controller.enqueue(ObservableError.from(err, "operator:stateful:switchMap:project", chunk) as R);
        return;
      }

      // Create a new abort controller for this inner subscription
      const abortController = new AbortController();
      state.currentController = abortController;

      // Subscribe to the new inner Observable
      (async () => {
        try {
          const iterator = pull(innerObservable, { throwError: false })[Symbol.asyncIterator]();

          while (!abortController.signal.aborted) {
            const { value, done } = await iterator.next();

            // If the controller is aborted or we're done, exit the loop
            if (abortController.signal.aborted || done) break;

            // Forward the value
            controller.enqueue(value);
          }
        } catch (err) {
          if (!abortController.signal.aborted) {
            controller.enqueue(ObservableError.from(err, "operator:stateful:switchMap:innerObservable", chunk) as R);
          }
        } finally {
          // Only handle completion if this is still the current controller
          if (state.currentController === abortController) {
            state.currentController = null;

            // If source is completed and we have no active inner, we're done
            if (state.sourceCompleted) {
              // Stream will close naturally
            }
          }
        }
      })();
    },

    // Handle the end of the source stream
    flush(state) {
      // Mark the source as completed
      state.sourceCompleted = true;

      // If there's no active inner subscription, we're done
      if (!state.currentController) {
        // Stream will close naturally
      }
      // Otherwise, let the active inner subscription complete
    },

    // Handle cancellation
    cancel(state) {
      // Cancel the current inner subscription
      if (state.currentController) {
        state.currentController.abort();
        state.currentController = null;
      }
    }
  });
}