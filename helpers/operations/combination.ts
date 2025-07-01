// helpers/combination.ts
// Operators that combine Observables or transform to new Observables
// Reimplemented using createStatefulOperator for better compatibility with streaming pipeline

import type { SpecObservable } from "../../_spec.ts";
import type { Operator } from "../_types.ts";

import { createStatefulOperator } from "../operators.ts";
import { ObservableError } from "../../error.ts";
import { pull } from "../../observable.ts";

/**
 * Transforms each value from the source Observable into an Observable, then
 * flattens the emissions from these inner Observables into a single Observable.
 * 
 * 
 * The `mergeMap` operator maps each value to an Observable, subscribes to them, 
 * and emits their values to the output Observable. It maintains multiple active 
 * inner subscriptions concurrently.
 * 
 * @typeParam T - Type of values from the source Observable
 * @typeParam R - Type of values in the result Observable
 * @param project - Function that maps a source value to an Observable
 * @param concurrent - Maximum number of inner Observables being subscribed
 *                    to concurrently. Default is Infinity.
 * @returns An operator function that maps and flattens values
 * 
 * @example
 * ```ts
 * import { pipe, mergeMap } from "./helpers/mod.ts";
 * import { Observable } from "./observable.ts";
 * 
 * // Simulate an HTTP request
 * function fetchData(id: number): Observable<string> {
 *   return new Observable<string>(observer => {
 *     console.log(`Fetching data for ID ${id}...`);
 *     
 *     // Simulate async response
 *     const timeout = setTimeout(() => {
 *       observer.next(`Data for ID ${id}`);
 *       observer.complete();
 *     }, 1000 + Math.random() * 1000); // Random delay
 *     
 *     return () => clearTimeout(timeout);
 *   });
 * }
 * 
 * // Source of IDs to fetch
 * const ids = Observable.from([1, 2, 3, 4, 5]);
 * 
 * // Map each ID to a data request, with at most 2 concurrent requests
 * const data = pipe(
 *   ids,
 *   mergeMap(id => fetchData(id), 2)
 * );
 * 
 * data.subscribe({
 *   next: data => console.log('Received:', data),
 *   complete: () => console.log('All data fetched!')
 * });
 * ```
 */
export function mergeMap<T, R>(
  project: (value: T, index: number) => SpecObservable<R>,
  concurrent: number = Infinity
): Operator<T, R | ObservableError> {
  return createStatefulOperator<T, R, {
    // State for tracking active subscriptions and buffer
    activeSubscriptions: Map<number, { unsubscribe: () => void }>;
    buffer: Array<[T, number]>;
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
        await subscribeToProjection(chunk, state.index++);
      } else {
        // Otherwise, buffer for later
        state.buffer.push([chunk, state.index++]);
      }

      // Helper function to subscribe to inner Observable
      async function subscribeToProjection(value: T, innerIndex: number) {
        let innerObservable: SpecObservable<R>;

        try {
          // Apply projection function to get inner Observable
          innerObservable = project(value, innerIndex);
        } catch (err) {
          // Forward any errors from the projection function
          controller.enqueue(ObservableError.from(err, "mergeMap:project", value) as R);
          return;
        }

        state.activeCount++;

        // Use pull to iterate asynchronously
        try {
          for await (const innerValue of pull(innerObservable)) {
            controller.enqueue(innerValue);
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
 * Transforms each value from the source Observable to an Observable,
 * then projects values from these inner Observables in sequence.
 * 
 * 
 * The `concatMap` operator is similar to mergeMap, but instead of handling
 * multiple inner Observables concurrently, it subscribes to them one at a time,
 * in order. Only when an inner Observable completes will the next one be subscribed.
 * 
 * @typeParam T - Type of values from the source Observable
 * @typeParam R - Type of values in the result Observable
 * @param project - Function that maps a source value to an Observable
 * @returns An operator function that maps and concatenates values
 * 
 * @example
 * ```ts
 * import { pipe, concatMap } from "./helpers/mod.ts";
 * import { Observable } from "./observable.ts";
 * 
 * // Process requests sequentially
 * const responses = pipe(
 *   ids,
 *   concatMap(id => simulateRequest(id))
 * );
 * 
 * responses.subscribe({
 *   next: response => console.log('Received:', response),
 *   complete: () => console.log('All requests completed!')
 * });
 * ```
 */
export function concatMap<T, R>(
  project: (value: T, index: number) => SpecObservable<R>
): Operator<T, R | ObservableError> {
  // concatMap is just mergeMap with concurrency = 1
  return mergeMap(project, 1);
}

/**
 * Transforms each value from the source Observable into an Observable, then
 * flattens the emissions from the most recent inner Observable into a single Observable,
 * cancelling previous inner Observables.
 * 
 * 
 * The `switchMap` operator is a key transformation operator that combines mapping and flattening
 * with an important switching behavior: when a new value arrives from the source, any previous
 * inner Observable is cancelled before subscribing to the new one.
 * 
 * ## Core Behavior
 * 
 * For each value from the source Observable:
 * 1. The projection function creates a new inner Observable
 * 2. Any previous inner Observable subscription is cancelled
 * 3. The new inner Observable is subscribed to
 * 4. Values from the new inner Observable are forwarded to the output
 * 
 * @typeParam T - Type of values from the source Observable
 * @typeParam R - Type of values in the result Observable
 * @param project - Function that maps a source value to an Observable
 * @returns An operator function that maps and switches between values
 * 
 * @example Basic search
 * ```ts
 * import { pipe, switchMap, debounceTime } from "./helpers/mod.ts";
 * import { Observable } from "./observable.ts";
 * 
 * // Simulate a search API request
 * function searchApi(query: string): Observable<string[]> {
 *   return new Observable<string[]>(observer => {
 *     console.log(`Searching for "${query}"...`);
 *     
 *     // Simulate network request
 *     const timeout = setTimeout(() => {
 *       const results = [`${query} result 1`, `${query} result 2`];
 *       observer.next(results);
 *       observer.complete();
 *     }, 500 + Math.random() * 1000); // Random delay
 *     
 *     // Cleanup function called when cancelled
 *     return () => {
 *       console.log(`Search for "${query}" cancelled`);
 *       clearTimeout(timeout);
 *     };
 *   });
 * }
 * 
 * // For each input, wait for typing to pause, then switch to a new search request
 * const searchResults = pipe(
 *   searchInput,
 *   debounceTime(300), // Wait for typing to pause
 *   switchMap(query => searchApi(query))
 * );
 * ```
 */
export function switchMap<T, R>(
  project: (value: T, index: number) => SpecObservable<R>
): Operator<T, R | ObservableError> {
  return createStatefulOperator<T, R, {
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
      // Cancel any existing inner subscription
      if (state.currentController) {
        state.currentController.abort();
        state.currentController = null;
      }

      let innerObservable: SpecObservable<R>;

      try {
        // Apply projection function to get inner Observable
        innerObservable = project(chunk, state.index++);
      } catch (err) {
        // Forward any errors from the projection function
        controller.enqueue(ObservableError.from(err, "switchMap:project", chunk) as R);
        return;
      }

      // Create a new abort controller for this inner subscription
      const abortController = new AbortController();
      state.currentController = abortController;

      // Subscribe to the new inner Observable
      (async () => {
        try {
          const iterator = pull(innerObservable)[Symbol.asyncIterator]();

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