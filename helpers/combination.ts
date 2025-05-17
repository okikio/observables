// helpers/combination.ts
// Operators that combine Observables or transform to new Observables

import type { Subscription } from "../_types.ts";
import { Observable } from "../observable.ts";

/**
 * Transforms each value from the source Observable into an Observable, then
 * flattens the emissions from these inner Observables into a single Observable.
 * 
 * @remarks
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
 * const ids$ = Observable.from([1, 2, 3, 4, 5]);
 * 
 * // Map each ID to a data request, with at most 2 concurrent requests
 * const data$ = pipe(
 *   ids$,
 *   mergeMap(id => fetchData(id), 2)
 * );
 * 
 * data$.subscribe({
 *   next: data => console.log('Received:', data),
 *   complete: () => console.log('All data fetched!')
 * });
 * ```
 */
export function mergeMap<T, R>(
  project: (value: T, index: number) => Observable<R>, 
  concurrent: number = Infinity
): (source: Observable<T>) => Observable<R> {
  return (source: Observable<T>): Observable<R> => {
    return new Observable<R>(observer => {
      // Track active inner subscriptions
      const activeSubscriptions = new Map<number, Subscription>();
      // Queue of source values waiting for subscription slots
      const buffer: Array<[T, number]> = [];
      // Track source completion
      let sourceCompleted = false;
      // Track the source index
      let index = 0;
      // Track number of active inner subscriptions
      let activeCount = 0;
      
      // Process the buffer if we're under the concurrency limit
      const processBuffer = () => {
        // While we have room for more inner Observables and
        // there are items in the buffer, subscribe to inner Observables
        while (activeCount < concurrent && buffer.length > 0) {
          const [value, bufferIndex] = buffer.shift()!;
          subscribeToProjection(value, bufferIndex);
        }
        
        // If the source is completed and we have no active inner
        // subscriptions, complete the output Observable
        if (sourceCompleted && activeCount === 0) {
          observer.complete();
        }
      };
      
      // Subscribe to an inner Observable created from a source value
      const subscribeToProjection = (value: T, innerIndex: number) => {
        let innerObservable: Observable<R>;
        
        try {
          // Apply projection function to get inner Observable
          innerObservable = project(value, innerIndex);
        } catch (err) {
          // Forward any errors from the projection function
          observer.error(err);
          return;
        }
        
        activeCount++;
        
        // Subscribe to the inner Observable
        const innerSubscription = innerObservable.subscribe({
          next(innerValue) {
            // Forward values from the inner Observable
            observer.next(innerValue);
          },
          error(err) {
            // Forward errors from the inner Observable
            observer.error(err);
          },
          complete() {
            // When an inner Observable completes, clean up and check if we're done
            activeSubscriptions.delete(innerIndex);
            activeCount--;
            
            // Process the buffer in case we have pending items
            processBuffer();
          },
        });
        
        // Store the subscription for cleanup
        activeSubscriptions.set(innerIndex, innerSubscription);
      };
      
      // Subscribe to the source Observable
      const sourceSubscription = source.subscribe({
        next(value) {
          // If we're under the concurrency limit, subscribe immediately
          if (activeCount < concurrent) {
            subscribeToProjection(value, index++);
          } else {
            // Otherwise, buffer the value for later
            buffer.push([value, index++]);
          }
        },
        error(err) {
          // Forward errors from the source
          observer.error(err);
        },
        complete() {
          // Mark the source as completed
          sourceCompleted = true;
          
          // If no active inner subscriptions, complete the output
          if (activeCount === 0) {
            observer.complete();
          }
          // Otherwise, completion will happen when all inners complete
        },
      });
      
      // Return a teardown function to clean up all subscriptions
      return () => {
        sourceSubscription.unsubscribe();
        
        // Clean up all inner subscriptions
        for (const subscription of activeSubscriptions.values()) {
          subscription.unsubscribe();
        }
        
        // Clear the buffer and state
        buffer.length = 0;
        activeSubscriptions.clear();
        activeCount = 0;
      };
    });
  };
}

/**
 * Transforms each value from the source Observable to an Observable,
 * then projects values from these inner Observables in sequence.
 * 
 * @remarks
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
 * const responses$ = pipe(
 *   ids$,
 *   concatMap(id => simulateRequest(id))
 * );
 * 
 * responses$.subscribe({
 *   next: response => console.log('Received:', response),
 *   complete: () => console.log('All requests completed!')
 * });
 * ```
 */
export function concatMap<T, R>(
  project: (value: T, index: number) => Observable<R>
): (source: Observable<T>) => Observable<R> {
  // concatMap is just mergeMap with concurrency = 1
  return mergeMap(project, 1);
}

/**
 * Transforms each value from the source Observable into an Observable, then
 * flattens the emissions from the most recent inner Observable into a single Observable,
 * cancelling previous inner Observables.
 * 
 * @remarks
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
 * ## When to Use switchMap
 * 
 * `switchMap` is ideal for scenarios where:
 * 
 * - You only care about the results from the most recent action
 * - Older in-progress operations should be cancelled when a new one starts
 * - Resources tied to previous operations should be released
 * 
 * Common use cases include:
 * 
 * - Search operations where new input invalidates previous searches
 * - UI interactions where only the latest user action matters
 * - Navigation where previous data loading should be cancelled
 * - Auto-complete where only the latest typed string matters
 * 
 * ## Comparison to Other Flattening Operators
 * 
 * - **switchMap**: Cancels previous inner Observables when a new one starts (keeps 1 active)
 * - **mergeMap**: Maintains multiple active inner Observables concurrently
 * - **concatMap**: Processes inner Observables sequentially, one after another
 * 
 * ## Important Nuances
 * 
 * - **Cancellation Effects**: When an inner Observable is cancelled, it stops emitting 
 *   values, but any side effects it already produced aren't reversed. Understanding this 
 *   is critical when working with irreversible operations.
 * 
 * - **Race Condition Handling**: `switchMap` effectively handles race conditions by ensuring
 *   only the latest request's results are used.
 * 
 * - **Completion Behavior**: The output Observable completes when both the source Observable
 *   completes and the final inner Observable completes.
 * 
 * ## Potential Pitfalls
 * 
 * - **Lost Data**: Values from previous inner Observables are completely ignored once
 *   a new source value arrives. If you need all results, consider using `mergeMap` instead.
 * 
 * - **Side Effect Duplication**: If your projection function has side effects (like HTTP requests),
 *   they'll still occur even if the subscription is later cancelled.
 * 
 * - **Resource Usage**: Frequent source emissions can cause rapid creation and disposal
 *   of inner Observables. Consider adding a `debounceTime` before `switchMap` for
 *   high-frequency events.
 * 
 * @typeParam T - Type of values from the source Observable
 * @typeParam R - Type of values in the result Observable
 * @param project - Function that maps a source value to an Observable
 * @returns An operator function that maps and switches between values
 * 
 * @example
 * Basic search implementation:
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
 * // Simulate user typing in a search box
 * const searchInput$ = ["user input events"];
 * 
 * // For each input, wait for typing to pause, then switch to a new search request
 * const searchResults$ = pipe(
 *   searchInput$,
 *   debounceTime(300), // Wait for typing to pause
 *   switchMap(query => searchApi(query))
 * );
 * 
 * searchResults$.subscribe({
 *   next: results => console.log('Results:', results),
 *   complete: () => console.log('Search completed')
 * });
 * ```
 * 
 * @example
 * Handling navigation with route parameters:
 * ```ts
 * import { pipe, switchMap, catchError } from "./helpers/mod.ts";
 * 
 * // Route change events with route parameters
 * const route$ = ["route change events"];
 * 
 * // For each route change, load data for that route
 * const pageData$ = pipe(
 *   route$,
 *   switchMap(route => {
 *     // Previous data loading is cancelled when route changes
 *     return pipe(
 *       loadDataForRoute(route.id),
 *       catchError(err => {
 *         console.error(`Failed to load data for route ${route.id}:`, err);
 *         return Observable.of({ error: true, route: route.id });
 *       })
 *     );
 *   })
 * );
 * 
 * // Only data for the current route is displayed
 * pageData$.subscribe(data => {
 *   updatePageDisplay(data);
 * });
 * ```
 */
export function switchMap<T, R>(
  project: (value: T, index: number) => Observable<R>
): (source: Observable<T>) => Observable<R> {
  return (source: Observable<T>): Observable<R> => {
    return new Observable<R>(observer => {
      // Track current inner subscription
      let innerSubscription: Subscription | null = null;
      // Track if source has completed
      let sourceCompleted = false;
      // Track the source index
      let index = 0;
      
      // Subscribe to the source Observable
      const sourceSubscription = source.subscribe({
        next(value) {
          // Cancel any existing inner subscription
          if (innerSubscription) {
            innerSubscription.unsubscribe();
            innerSubscription = null;
          }
          
          let innerObservable: Observable<R>;
          
          try {
            // Apply projection function to get inner Observable
            innerObservable = project(value, index++);
          } catch (err) {
            // Forward any errors from the projection function
            observer.error(err);
            return;
          }
          
          // Subscribe to the new inner Observable
          innerSubscription = innerObservable.subscribe({
            next(innerValue) {
              // Forward values from the inner Observable
              observer.next(innerValue);
            },
            error(err) {
              // Forward errors from the inner Observable
              observer.error(err);
            },
            complete() {
              // When inner completes, clear reference
              innerSubscription = null;
              
              // If source has already completed, complete output
              if (sourceCompleted) {
                observer.complete();
              }
            },
          });
        },
        error(err) {
          // Forward errors from the source
          observer.error(err);
        },
        complete() {
          // Mark source as completed
          sourceCompleted = true;
          
          // If there's no active inner subscription, complete output
          if (!innerSubscription) {
            observer.complete();
          }
          // Otherwise, output will complete when inner completes
        },
      });
      
      // Return a teardown function to clean up all subscriptions
      return () => {
        sourceSubscription.unsubscribe();
        
        if (innerSubscription) {
          innerSubscription.unsubscribe();
          innerSubscription = null;
        }
      };
    });
  };
}