/**
 * A **spec-faithful** yet ergonomic TC39-inspired Observable implementation with detailed TSDocs and examples.
 *
 * Observables are a **push‑based stream abstraction** for events, data, and long‑running
 * operations. Think of it as a **multi‑value Promise** that keeps sending
 * values until you tell it to stop.
 *
 * ## Why This Exists
 * Apps juggle many async sources—mouse clicks, HTTP requests, timers,
 * WebSockets, file watchers. Before Observables you glued those together with a
 * mish‑mash of callbacks, Promises, `EventTarget`s and async iterators, each
 * with different rules for cleanup and error handling. **Observables give you
 * one mental model** for subscription → cancellation → propagation → teardown.
 *
 * ## ✨ Feature Highlights
 * - **Unified push + pull** – use callbacks *or* `for await … of` on the same
 *   stream.
 * - **Cold by default** – each subscriber gets an independent execution (great
 *   for predictable side‑effects).
 * - **Deterministic teardown** – return a function/`unsubscribe`/`[Symbol.dispose]`
 *   and it *always* runs once, even if the observable errors synchronously.
 * - **Back‑pressure helper** – `pull()` converts to an `AsyncGenerator` backed
 *   by `ReadableStream` so the producer slows down when the consumer lags.
 * - **Tiny surface** – <1 kB min+gzip of logic; treeshakes cleanly.
 * - **Rich operator library** – functional composition via `pipe()` with full
 *   type safety and backpressure support.
 *
 * ## Core Observable API
 *
 * @example Creation
 * ```ts
 * // From scratch
 * const timer = new Observable(observer => {
 *   const id = setInterval(() => observer.next(Date.now()), 1000);
 *   return () => clearInterval(id);
 * });
 *
 * // From values
 * const numbers = Observable.of(1, 2, 3, 4, 5);
 *
 * // From iterables/promises
 * const data = Observable.from(fetch('/api/data'));
 * const items = Observable.from([1, 2, 3]);
 * ```
 *
 * @example Consumption
 * ```ts
 * // Push-based (callbacks)
 * using subscription = timer.subscribe({
 *   next: time => console.log('Time:', time),
 *   error: err => console.error('Error:', err),
 *   complete: () => console.log('Done')
 * });
 *
 * // Pull-based (async iteration)
 * for await (const time of timer) {
 *   console.log('Time:', time);
 *   if (shouldStop) break; // Auto-cleanup
 * }
 *
 * // Pull with backpressure control
 * for await (const item of data.pull({ strategy: { highWaterMark: 5 } })) {
 *   await processSlowly(item); // Producer pauses when buffer fills
 * }
 * ```
 *
 * ## Functional Composition with Operators
 *
 * The operator library enables powerful functional composition patterns using the `pipe()` function.
 * All operators are **type-safe**, **tree-shakable**, and support **automatic backpressure**.
 *
 * @example Basic Transformation Pipeline
 * ```ts
 * import { pipe, map, filter, take } from './helpers/mod.ts';
 *
 * const result = pipe(
 *   Observable.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
 *   filter(x => x % 2 === 0),     // Keep even numbers: 2, 4, 6, 8, 10
 *   map(x => x * 10),             // Multiply by 10: 20, 40, 60, 80, 100
 *   take(3)                       // Take first 3: 20, 40, 60
 * );
 *
 * result.subscribe(x => console.log(x)); // 20, 40, 60
 * ```
 *
 * ### Operator Categories
 *
 * **Transformation Operators**
 * - `map(fn)` – Transform each value
 * - `scan(fn, seed)` – Accumulate with intermediate values
 * - `batch(size)` – Group values into arrays
 * - `toArray()` – Collect all values into single array
 *
 * **Filtering Operators**  
 * - `filter(predicate)` – Keep values that pass test
 * - `take(count)` – Limit to first N values
 * - `drop(count)` – Skip first N values
 * - `find(predicate)` – Emit first matching value
 *
 * **Timing Operators**
 * - `delay(ms)` – Delay all emissions by time
 * - `debounce(ms)` – Emit only after silence period
 * - `throttle(ms)` – Limit emission rate
 *
 * **Combination Operators**
 * - `mergeMap(fn, concurrent?)` – Flatten with concurrency control
 * - `concatMap(fn)` – Flatten sequentially  
 * - `switchMap(fn)` – Cancel previous, switch to latest
 *
 * **Conditional Operators**
 * - `every(predicate)` – Test if all values pass
 * - `some(predicate)` – Test if any value passes
 * - `takeUntil(notifier)` – Stop when notifier emits
 *
 * **Utility Operators**
 * - `tap(fn)` – Side effects without modification
 * - `compose(op1, op2, ...)` – Group operators together
 *
 * ### Advanced Composition Patterns
 *
 * @example HTTP Request with Retry Logic
 * ```ts
 * import { pipe, switchMap, map, filter, take } from './helpers/mod.ts';
 *
 * const searchResults = pipe(
 *   searchInput,
 *   debounce(300),                    // Wait for typing pause
 *   filter(query => query.length > 2), // Skip short queries
 *   switchMap(query =>                // Cancel previous searches
 *     pipe(
 *       Observable.from(fetch(`/search?q=${query}`)),
 *       map(res => res.json())
 *     )
 *   )
 * );
 * ```
 *
 * @example Real-time Data Processing
 * ```ts
 * const processedStream = pipe(
 *   webSocketMessages,
 *   map(msg => JSON.parse(msg.data)),
 *   filter(data => data.type === 'metric'),
 *   scan((acc, data) => ({
 *     ...acc,
 *     total: acc.total + data.value,
 *     count: acc.count + 1,
 *     average: (acc.total + data.value) / (acc.count + 1)
 *   }), { total: 0, count: 0, average: 0 }),
 *   throttle(1000)                    // Update UI max once per second
 * );
 * ```
 *
 * @example Complex Async Operations
 * ```ts
 * const batchProcessor = pipe(
 *   dataStream,
 *   batch(50),                        // Process in batches of 50
 *   mergeMap(batch =>                 // Process up to 3 batches concurrently
 *     pipe(
 *       Observable.from(processBatch(batch)),
 *       map(results => ({ batch, results, timestamp: Date.now() }))
 *     ),
 *     3 // Max 3 concurrent batch operations
 *   ),
 *   scan((acc, result) => ({
 *     processed: acc.processed + result.batch.length,
 *     results: [...acc.results, result]
 *   }), { processed: 0, results: [] })
 * );
 * ```
 *
 * @example Operator Composition Limits & Solutions
 * ```ts
 * // Due to TypeScript recursion limits, `pipe()` supports up to 9 operators: 
 * // ✅ Works - 9 operators
 * pipe(source, op1, op2, op3, op4, op5, op6, op7, op8, op9);
 *
 * // ❌ Too many - compilation error
 * pipe(source, op1, op2, op3, op4, op5, op6, op7, op8, op9, op10);
 *
 * // ✅ Solution - use compose() to group operators
 * const processData = compose(
 *   filter(x => x > 0),
 *   map(x => x * 2),
 *   debounce(100)
 * );
 *
 * const formatOutput = compose(
 *   take(10),
 *   map(x => `Result: ${x}`),
 *   tap(x => console.log(x))
 * );
 *
 * pipe(source, processData, formatOutput);
 * ```
 *
 * @example Custom Operators
 * ```ts
 * import { createOperator, createStatefulOperator } from './helpers/mod.ts';
 *
 * // Create reusable operators with the utility functions:
 * // Stateless operator
 * function double<T extends number>() {
 *   return createOperator<T, T>({
 *     transform(chunk, controller) {
 *       controller.enqueue(chunk * 2);
 *     }
 *   });
 * }
 *
 * // Stateful operator  
 * function movingAverage(windowSize: number) {
 *   return createStatefulOperator<number, number, number[]>({
 *     createState: () => [],
 *     transform(value, window, controller) {
 *       window.push(value);
 *       if (window.length > windowSize) window.shift();
 *       
 *       const avg = window.reduce((sum, n) => sum + n, 0) / window.length;
 *       controller.enqueue(avg);
 *     }
 *   });
 * }
 *
 * // Usage
 * const smoothed = pipe(
 *   noisyData,
 *   movingAverage(5),
 *   double()
 * );
 * ```
 *
 * ## Error Propagation Policy
 * 1. **Local catch** – If your observer supplies an `error` callback, **all**
 *    upstream errors funnel there.
 * 2. **Unhandled‑rejection style** – If no `error` handler is provided the
 *    exception is re‑thrown on the micro‑task queue (same timing semantics as
 *    an unhandled Promise rejection).
 * 3. **Observer callback failures** – Exceptions thrown inside `next()` or
 *    `complete()` are routed to `error()` if present, otherwise bubble as in
 *    (2).
 * 4. **Errors inside `error()`** – A second‑level failure is *always* queued to
 *    the micro‑task queue to avoid infinite recursion.
 * 5. **Operator errors** – Wrapped as `ObservableError` values in pull mode to
 *    preserve buffered data; thrown normally in push mode.
 *
 * ## Edge‑Cases & Gotchas
 * - `subscribe()` can synchronously call `complete()`/`error()` and still have
 *   its teardown captured – **ordering is guaranteed**.
 * - Subscribing twice to a *cold* observable triggers two side‑effects (e.g.
 *   two HTTP requests). Share the source if you want fan‑out.
 * - Infinite streams leak unless you call `unsubscribe()` or wrap them in a
 *   `using` block.
 * - The helper `pull()` encodes thrown errors as `ObservableError` *values* so
 *   buffered items are not lost – remember to `instanceof` check if you rely
 *   on it.
 * - Operators in `pipe()` are limited to 9 due to TypeScript recursion limits;
 *   use `compose()` to group operators for larger pipelines.
 *
 * @example Common Patterns
 * ```ts
 * // DOM events → Observable
 * const clicks = new Observable<Event>(obs => {
 *   const h = (e: Event) => obs.next(e);
 *   button.addEventListener("click", h);
 *   return () => button.removeEventListener("click", h);
 * });
 *
 * // HTTP polling every 5 s
 * const poll = new Observable<Response>(obs => {
 *   const id = setInterval(async () => {
 *     try { obs.next(await fetch("/api/data")); }
 *     catch (e) { obs.error(e); }
 *   }, 5000);
 *   return () => clearInterval(id);
 * });
 *
 * // WebSocket stream with graceful close
 * const live = new Observable<string>(obs => {
 *   const ws = new WebSocket("wss://example.com");
 *   ws.onmessage = e => obs.next(e.data);
 *   ws.onerror   = e => obs.error(e);
 *   ws.onclose   = () => obs.complete();
 *   return () => ws.close();
 * });
 * ```
 * 
 * @example Basic subscription:
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * // Emit 1,2,3 then complete
 * const subscription = Observable.of(1, 2, 3).subscribe({
 *   start(sub) { console.log('Subscribed'); },
 *   next(val)  { console.log('Value:', val); },
 *   complete() { console.log('Complete'); }
 * });
 *
 * // Cancel manually if needed
 * subscription.unsubscribe();
 * ```
 *
 * @example Resource-safe usage with `using` statement:
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * {
 *   using subscription = Observable.of(1, 2, 3).subscribe({
 *     next(val) { console.log('Value:', val); }
 *   });
 *
 *   // Code that uses the subscription
 *   doSomething();
 *
 * } // Subscription automatically unsubscribed at block end
 * ```
 *
 * @example Simple async iteration:
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * (async () => {
 *   for await (const x of Observable.of('a', 'b', 'c')) {
 *     console.log(x);
 *   }
 * })();
 * ```
 *
 * @example Pull with backpressure:
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * const nums = Observable.from([1,2,3,4,5]);
 * (async () => {
 *   for await (const n of nums.pull({ strategy: { highWaterMark: 2 } })) {
 *     console.log('Pulled:', n);
 *     await new Promise(r => setTimeout(r, 1000)); // Slow consumer
 *   }
 * })();
 * ```
 *
 * @example Functional pipeline with operators:
 * ```ts
 * import { Observable, pipe, map, filter, take, debounce } from './mod.ts';
 *
 * // Process user search input
 * const searchResults = pipe(
 *   userInput,
 *   debounce(300),                          // Wait for typing pause
 *   filter(query => query.length > 2),     // Skip short queries  
 *   map(query => query.toLowerCase()),      // Normalize
 *   switchMap(query =>                      // Cancel previous searches
 *     Observable.from(fetch(`/search?q=${query}`))
 *   ),
 *   map(response => response.json()),
 *   take(10)                                // Limit results
 * );
 *
 * searchResults.subscribe({
 *   next: results => updateUI(results),
 *   error: err => showError(err)
 * });
 * ```
 *
 * @example Advanced data processing pipeline:
 * ```ts
 * import { Observable, pipe, batch, mergeMap, scan, throttle } from './mod.ts';
 *
 * // Real-time analytics processing
 * const analytics = pipe(
 *   rawEvents,
 *   filter(event => event.type === 'user_action'),
 *   batch(100),                           // Process in batches
 *   mergeMap(batch =>                     // Process up to 3 batches concurrently
 *     Observable.from(enrichBatch(batch)),
 *     3
 *   ),
 *   scan((acc, enrichedEvents) => ({     // Accumulate metrics
 *     totalEvents: acc.totalEvents + enrichedEvents.length,
 *     uniqueUsers: new Set([...acc.uniqueUsers, ...enrichedEvents.map(e => e.userId)]),
 *     hourlyBreakdown: updateHourlyStats(acc.hourlyBreakdown, enrichedEvents)
 *   }), { totalEvents: 0, uniqueUsers: new Set(), hourlyBreakdown: {} }),
 *   throttle(5000)                        // Update dashboard every 5 seconds
 * );
 * ```
 *
 * ## Spec Compliance & Notable Deviations
 * | Area                       | Proposal Behaviour                     | This Library                                                                            |
 * |----------------------------|----------------------------------------|-----------------------------------------------------------------------------------------|
 * | `subscribe` parameters     | Only **observer object**               | Adds `(next, error?, complete?)` triple‑param overload.                                 |
 * | Teardown shape             | Function or `{ unsubscribe() }`        | Also honours `[Symbol.dispose]` **and** `[Symbol.asyncDispose]`.                        |
 * | Pull‑mode iteration        | *Not in spec*                          | `pull()` helper returns an `AsyncGenerator` with `ReadableStream`‑backed back‑pressure. |
 * | Error propagation in pull  | Stream **error** ends iteration        | Error encoded as `ObservableError` value so buffered items drain first.                 |
 * | `Symbol.toStringTag`       | Optional                               | Provided for `Observable` and `SubscriptionObserver`.                                   |
 * | Operator library           | *Not in spec*                          | Full functional operator library with `pipe()` composition and type safety.             |
 *
 * Anything not listed above matches the TC39 draft (**May 2025**).
 *
 * ## Lifecycle State Machine
 * ```text
 * (inactive) --subscribe()--> [  active  ]
 *     ^                         |  next()
 *     |   unsubscribe()/error() |  complete()
 *     |<------------------------|  (closed)
 * ```
 * *Teardown executes exactly once on the leftward arrow.*
 *
 * @example Type‑Parameter Primer
 * ```ts
 * Observable<number>                     // counter
 * Observable<Response>                   // fetch responses
 * Observable<{x:number;y:number}>        // mouse coords
 * Observable<never>                      // signal‑only (no payload)
 * Observable<string | ErrorPayload>      // unions are fine
 * ```
 *
 * @example Interop Cheat‑Sheet
 * ```ts
 * // Promise → Observable (single value then complete)
 * Observable.from(fetch("/api"));
 *
 * // Observable → async iterator (back‑pressure aware)
 * for await (const chunk of obs) {
 *   …
 * }
 *
 * // Observable → Promise (first value only)
 * const first = (await obs.pull().next()).value;
 *
 * // Functional composition with operators
 * const processed = pipe(obs, map(x => x * 2), filter(x => x > 10));
 * ```
 *
 * ## Performance Cookbook 
 * 
 * ### Pull Mode (`pull()`)
 * | Producer speed | Consumer speed | Suggested `highWaterMark` | Notes                                   |
 * |---------------:|---------------:|--------------------------:|-----------------------------------------|
 * | 🔥 Very fast   | 🐢 Slow         | 1‑8                       | Minimal RAM; heavy throttling.          |
 * | ⚡ Fast         | 🚶 Moderate     | 16‑64 (default 64)        | Good balance for most apps.             |
 * | 🚀 Bursty      | 🚀 Bursty       | 128‑512                   | Smooths spikes at the cost of memory.   |
 *
 * ### Operator Pipelines
 * | Pipeline complexity | Recommendation | Notes |
 * |-------------------|----------------|-------|
 * | 1-9 operators | Use `pipe()` directly | Full type inference |
 * | 10+ operators | Use `compose()` to group | Avoids TypeScript recursion limits |
 * | Reusable logic | Extract to functions | Better maintainability |
 * | Hot paths | Minimize operator count | Each operator adds overhead |
 *
 * ➜ If RSS climbs steadily, halve `highWaterMark`; if you're dropping messages
 * under load, raise it (RAM permitting).
 *
 * ## Memory Management
 *
 * **Critical**: Infinite Observables need manual cleanup via `unsubscribe()` or `using` blocks
 * to prevent memory leaks. Finite Observables auto-cleanup on complete/error.
 *
 * @example Quick start - DOM events
 * ```ts
 * const clicks = new Observable(observer => {
 *   const handler = e => observer.next(e);
 *   button.addEventListener('click', handler);
 *   return () => button.removeEventListener('click', handler);
 * });
 *
 * using subscription = clicks.subscribe(event => console.log('Clicked!'));
 * // Auto-cleanup when leaving scope
 * ```
 *
 * @example Network with backpressure
 * ```ts
 * const dataStream = new Observable(observer => {
 *   const ws = new WebSocket('ws://api.com/live');
 *   ws.onmessage = e => observer.next(JSON.parse(e.data));
 *   ws.onerror = e => observer.error(e);
 *   return () => ws.close();
 * });
 *
 * // Consume at controlled pace
 * for await (const data of dataStream.pull({ strategy: { highWaterMark: 10 } })) {
 *   await processSlowly(data); // Producer pauses when buffer fills
 * }
 * ```
 *
 * @example Testing & Debugging Tips
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { pipe, toArray, tap } from './helpers/mod.ts';
 *
 * Deno.test("emits three ticks then completes", async () => {
 *   const ticks = Observable.of(1, 2, 3);
 *   const out: number[] = [];
 *   for await (const n of ticks) out.push(n);
 *   assertEquals(out, [1, 2, 3]);
 * });
 *
 * // Quick console probe with operators
 * const debugged = pipe(
 *   obs,
 *   tap(v => console.log("[DEBUG]", v)),
 *   map(v => v * 2),
 *   tap(v => console.log("[AFTER MAP]", v))
 * );
 *
 * // Collect all values for testing
 * const allValues = await pipe(obs, toArray()).pull().next();
 * ```
 *
 * ## FAQ
 * - **Why does my network request fire twice?** Cold observables run once per
 *   subscribe. Reuse a single subscription or share the source.
 * - **Why does `next()` throw after `complete()`?** The stream is closed; calls
 *   are ignored by design.
 * - **Memory leak on interval** — Infinite streams require `unsubscribe()` or
 *   `using`.
 * - **Too many operators in pipe?** — Use `compose()` to group operators and avoid
 *   TypeScript recursion limits.
 * - **Operators not working as expected?** — Check that you're importing from 
 *   `./helpers/mod.ts` and using `pipe()` for composition.
 *
 * @module
 */
export * from "./observable.ts";
export * from "./events.ts";
export * from "./helpers/mod.ts";

export type * from "./_types.ts";