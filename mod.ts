/**
 * A **spec-faithful** yet ergonomic TC39-inspired Observable implementation with 
 * detailed TSDocs and examples.
 * 
 * Observables are a **push‑based stream abstraction** for events, data, and long‑running
 * operations. 
 *
 * If you've ever built a web app, you know the pain: user clicks, API responses, WebSocket messages,
 * timers, file uploads, they all arrive at different times and need different handling. Before Observables,
 * you'd end up with a mess of callbacks, Promise chains, event listeners, and async/await scattered
 * throughout your code.
 * 
 * **Observables solve this by giving you one consistent way to handle all async data.**
 * 
 * Think of it as a **multi‑value Promise** that keeps sending values until you tell it to stop. 
 * Where a Promise gives you one value eventually, an Observable can give you many values over time, 
 * mouse clicks, search results, chat messages, sensor readings. And just like Promises have 
 * `.then()` and `.catch()`, Observables have operators like `map()`, `filter()`, and `debounce()` 
 * to transform data as it flows.
 *
 * ## Why This Exists
 * Apps juggle many async sources, mouse clicks, HTTP requests, timers,
 * WebSockets, file watchers. Before Observables you glued those together with a
 * mish‑mash of callbacks, Promises, `EventTarget`s and async iterators, each
 * with different rules for cleanup and error handling. **Observables give you
 * one mental model** for subscription → cancellation → propagation → teardown.
 * 
 * 
 * Let's say you're building a search box. Without Observables, you might write something like this:
 * 
 * ```ts
 * // The messy way: callbacks, timers, and manual cleanup 😫
 * let searchTimeout: number;
 * let lastRequest: Promise<any> | null = null;
 * 
 * searchInput.addEventListener('input', async (event) => {
 *   const query = event.target.value;
 *   
 *   // Debounce: wait 300ms after user stops typing
 *   clearTimeout(searchTimeout);
 *   searchTimeout = setTimeout(async () => {
 *     
 *     // Cancel previous request somehow?
 *     if (lastRequest) {
 *       // How do you cancel a fetch? 🤔
 *     }
 *     
 *     if (query.length < 3) return; // Skip short queries
 *     
 *     try {
 *       lastRequest = fetch(`/search?q=${query}`);
 *       const response = await lastRequest;
 *       const results = await response.json();
 *       
 *       // Update UI, but what if user already typed something new?
 *       updateSearchResults(results);
 *     } catch (error) {
 *       // Handle errors, but which errors? Network? Parsing?
 *       handleSearchError(error);
 *     }
 *   }, 300);
 * });
 * 
 * // Don't forget cleanup when component unmounts!
 * // (Spoiler: everyone forgets this and creates memory leaks)
 * ```
 * 
 * This works, but it's fragile, hard to test, and easy to mess up. Plus, you have to remember to
 * clean up event listeners, cancel timers, and handle edge cases manually.
 *
 * ## The Solution: Observable Pipelines
 * 
 * Here's the same search box with Observables:
 * 
 * ```ts
 * // The Observable way: clean, composable, and robust ✨
 * import { pipe, debounce, filter, switchMap, map } from './mod.ts';
 * 
 * const searchResults = pipe(
 *   inputEvents,                          // Stream of input events
 *   debounce(300),                        // Wait 300ms after user stops typing
 *   filter(query => query.length >= 3),  // Skip short queries
 *   switchMap(query =>                    // Cancel previous requests automatically
 *     Observable.from(fetch(`/search?q=${query}`))
 *   ),
 *   map(response => response.json())      // Parse response
 * );
 * 
 * // Subscribe to results (with automatic cleanup!)
 * using subscription = searchResults.subscribe({
 *   next: results => updateSearchResults(results),
 *   error: error => handleSearchError(error)
 * });
 * // Subscription automatically cleaned up when leaving scope
 * ```
 * 
 * Notice how much cleaner this is? No manual timers, no cancellation logic, no memory leaks.
 * **The operators handle all the complex async stuff for you.**
 * 
 * Observables aren't just "nice to have", they solve real problems that bite every developer:
 * 
 * - **🧹 Memory Leaks**: Forgot to remove an event listener? Observable subscriptions can clean themselves up.
 * - **🏃‍♂️ Race Conditions**: User clicks fast, requests arrive out of order? `switchMap` cancels old requests.
 * - **🔄 Retry Logic**: Network failed? Built-in retry operators handle backoff and error recovery.
 * - **⚡ Backpressure**: Producer too fast for consumer? Built-in flow control prevents memory bloat.
 * - **🧪 Testing**: Complex async flows become simple to test with predictable, pure operators.
 * - **🎯 Composability**: Mix and match operators like Lego blocks to build exactly what you need.
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
 * - **Tiny surface** – <3 kB min+gzip of logic; treeshakes cleanly.
 * - **Rich operator library** – functional composition via `pipe()` with full
 *   type safety and backpressure support.
 * - **EventBus & EventDispatcher** – built-in multicast event buses for pub/sub patterns.
 * - **Advanced error handling** – 4-mode error handling system (pass-through, ignore, throw, manual).
 * - **High-performance operators** – Web Streams-based operators with pre-compiled error handling.
 *
 * ## What Makes This Observables Implementation Special
 * 
 * `@okikio/observables` isn't just another Observable library. It's designed to be:
 * 
 * - **Beginner-friendly**: If you know `Array.map()`, you already understand operators
 * - **Performance-first**: Built on Web Streams with pre-compiled error handling for speed
 * - **TypeScript-native**: Full type safety with intelligent inference  
 * - **Standards-compliant**: Follows the TC39 Observable proposal for future compatibility
 * - **Tiny but complete**: <3KB but includes everything you need for real apps
 * - **Error-resilient**: 4 different error handling modes for every situation
 *
 * ## Getting Started: Your First Observable
 *
 * Let's start simple. Here's how to create and use an Observable:
 *
 * @example Creating Observables
 * ```ts
 * import { Observable } from './observable.ts';
 *
 * // Method 1: From scratch (like creating a custom Promise)
 * const timer = new Observable(observer => {
 *   let count = 0;
 *   const id = setInterval(() => {
 *     observer.next(count++);  // Send values
 *     if (count > 5) {
 *       observer.complete();   // Finish
 *     }
 *   }, 1000);
 *
 *   // Return cleanup function (like Promise.finally)
 *   return () => clearInterval(id);
 * });
 *
 * // Method 2: From existing values (like Promise.resolve)
 * const numbers = Observable.of(1, 2, 3, 4, 5);
 *
 * // Method 3: From promises, arrays, or other async sources
 * const apiData = Observable.from(fetch('/api/users'));
 * const listData = Observable.from([1, 2, 3, 4, 5]);
 * ```
 *
 * @example Consuming Observables
 * ```ts
 * // Method 1: Subscribe with callbacks (like Promise.then)
 * const subscription = timer.subscribe({
 *   next: value => console.log('Got:', value),      // Handle each value
 *   error: err => console.error('Error:', err),     // Handle errors
 *   complete: () => console.log('All done!')        // Handle completion
 * });
 *
 * // Don't forget to clean up! (or you'll get memory leaks)
 * subscription.unsubscribe();
 *
 * // Method 2: Use modern "using" syntax for automatic cleanup
 * {
 *   using sub = timer.subscribe(value => console.log(value));
 *   // Code here...
 * } // Automatically unsubscribed at block end!
 *
 * // Method 3: Async iteration (like for-await with arrays)
 * for await (const value of timer) {
 *   console.log('Value:', value);
 *   if (value > 3) break; // Stop early if needed
 * } // Automatically cleaned up when loop exits
 * ```
 *
 * That's it! You now know the basics. But the real power comes from **operators**...
 *
 * ## Operators
 *
 *
 * If you've used `Array.map()` or `Array.filter()`, you already understand operators.
 * They're just like array methods, but for data that arrives over time:
 *
 * ```ts
 * // With arrays (data you already have):
 * [1, 2, 3, 4, 5]
 *   .filter(x => x % 2 === 0)  // Keep even numbers: [2, 4]
 *   .map(x => x * 10)          // Multiply by 10: [20, 40]
 *   .slice(0, 1)               // Take first: [20]
 *
 * // With Observables (data arriving over time):
 * pipe(
 *   numberStream,
 *   filter(x => x % 2 === 0),  // Keep even numbers
 *   map(x => x * 10),          // Multiply by 10
 *   take(1)                    // Take first
 * )
 * ```
 *
 * The difference? Arrays process everything at once. Observables process data
 * piece-by-piece as it arrives, without loading everything into memory.
 *
 * @example Real-World Example: User Search
 * ```ts
 * import { pipe, debounce, filter, switchMap, map } from './helpers/mod.ts';
 *
 * // Transform raw input events into search results
 * const searchResults = pipe(
 *   userInput,                            // Raw keystrokes
 *   debounce(300),                        // Wait for typing pause
 *   filter(query => query.length > 2),   // Skip short queries
 *   switchMap(query =>                    // Cancel old searches
 *     Observable.from(fetch(`/search?q=${query}`))
 *   ),
 *   map(response => response.json())      // Parse JSON
 * );
 *
 * // Use the results
 * searchResults.subscribe(results => {
 *   updateUI(results);
 * });
 * ```
 *
 * Each operator transforms the data in some way, and you can chain as many as you need.
 * It's like building a data processing pipeline where each step does one thing well.
 *
 * ## Operator Categories
 *
 * Operators enables powerful functional composition patterns using the `pipe()` function.
 * All operators are **type-safe**, **tree-shakable**, **support automatic backpressure**, and feature
 * **advanced error handling** with 4 distinct modes: pass-through, ignore, throw, and manual.
 *
 * There are many operators, but they fall into clear categories. You don't need to learn
 * them all at once, start with the ones you need:
 *
 * ### 🔄 **Transformation**: Change data as it flows
 * ```ts
 * pipe(
 *   numbers,
 *   map(x => x * 2),           // Transform each value: 1 → 2, 2 → 4
 *   scan((sum, x) => sum + x)  // Running total: 2, 6, 12, 20...
 * )
 * ```
 * - `map(fn)` – Transform each value (like `Array.map`)
 * - `scan(fn, seed)` – Running accumulation (like `Array.reduce` over time)
 * - `batch(size)` – Group values into arrays
 * - `toArray()` – Collect everything into one array
 *
 * ### 🚰 **Filtering**: Control what data gets through
 * ```ts
 * pipe(
 *   allClicks,
 *   filter(event => event.target.matches('button')),  // Only button clicks
 *   take(5)                                          // Stop after 5 clicks
 * )
 * ```
 * - `filter(predicate)` – Keep values that pass a test (like `Array.filter`)
 * - `take(count)` – Take only the first N values
 * - `drop(count)` – Skip the first N values
 * - `find(predicate)` – Find first matching value and stop
 *
 * ### ⏰ **Timing**: Control when things happen
 * ```ts
 * pipe(
 *   keystrokes,
 *   debounce(300),    // Wait 300ms after last keystroke
 *   delay(100)        // Add 100ms delay to everything
 * )
 * ```
 * - `debounce(ms)` – Wait for silence before emitting
 * - `throttle(ms)` – Limit emission rate
 * - `delay(ms)` – Delay all emissions by time
 * - `timeout(ms)` – Cancel if nothing happens within time
 *
 * ### 🔀 **Combination**: Merge multiple streams
 * ```ts
 * pipe(
 *   searchQueries,
 *   switchMap(query =>           // For each query...
 *     fetch(`/search?q=${query}`) // ...start a request (cancel previous)
 *   )
 * )
 * ```
 * - `mergeMap(fn)` – Start multiple operations, merge results
 * - `concatMap(fn)` – Start operations one at a time
 * - `switchMap(fn)` – Cancel previous operation when new one starts
 *
 * ### ⚠️ **Error Handling**: Deal with things going wrong
 * ```ts
 * pipe(
 *   riskyOperations,
 *   catchErrors('fallback'),     // Replace errors with fallback
 *   ignoreErrors()              // Skip errors, keep going
 * )
 * ```
 * - `catchErrors(fallback)` – Replace errors with fallback values
 * - `ignoreErrors()` – Skip errors silently
 * - `tapError(fn)` – Log errors without changing the stream
 * - `mapErrors(fn)` – Transform error values
 *
 * ### 🔧 **Utilities**: Side effects and debugging
 * ```ts
 * pipe(
 *   dataStream,
 *   tap(x => console.log('Debug:', x)),    // Log without changing values
 *   tap(x => analytics.track(x))           // Send to analytics
 * )
 * ```
 * - `tap(fn)` – Run side effects without changing values
 *
 * ## Real-World Examples: See It In Action
 *
 * Let's see how these operators solve actual problems you face every day:
 *
 * @example Smart Search with Debouncing
 * ```ts
 * import { pipe, debounce, filter, switchMap, map, catchErrors } from './helpers/mod.ts';
 *
 * // Problem: User types fast, you don't want to spam the API
 * // Solution: Debounce + cancel previous requests
 * const searchResults = pipe(
 *   searchInput,
 *   debounce(300),                        // Wait for typing pause
 *   filter(query => query.length > 2),   // Skip short queries
 *   switchMap(query =>                    // Cancel old requests automatically
 *     pipe(
 *       Observable.from(fetch(`/search?q=${query}`)),
 *       map(res => res.json()),
 *       catchErrors([])                   // Return empty array on error
 *     )
 *   )
 * );
 *
 * searchResults.subscribe(results => updateUI(results));
 * ```
 *
 * @example Real-Time Data Dashboard
 * ```ts
 * import { pipe, filter, scan, throttle, batch } from './helpers/mod.ts';
 *
 * // Problem: WebSocket sends lots of data, UI can't keep up
 * // Solution: Filter, accumulate, and throttle updates
 * const dashboardData = pipe(
 *   webSocketEvents,
 *   filter(event => event.type === 'metric'),    // Only metric events
 *   scan((acc, event) => ({                     // Build running totals
 *     ...acc,
 *     total: acc.total + event.value,
 *     count: acc.count + 1,
 *     average: (acc.total + event.value) / (acc.count + 1)
 *   }), { total: 0, count: 0, average: 0 }),
 *   throttle(1000)                              // Update UI max once per second
 * );
 *
 * dashboardData.subscribe(stats => updateDashboard(stats));
 * ```
 *
 * @example File Upload with Progress
 * ```ts
 * import { pipe, map, scan, tap } from './helpers/mod.ts';
 *
 * // Problem: Show upload progress and handle completion
 * // Solution: Transform progress events into UI updates
 * const uploadProgress = pipe(
 *   fileUploadEvents,
 *   map(event => ({                             // Extract useful info
 *     loaded: event.loaded,
 *     total: event.total,
 *     percent: Math.round((event.loaded / event.total) * 100)
 *   })),
 *   tap(progress => updateProgressBar(progress.percent)), // Update UI
 *   filter(progress => progress.percent === 100),         // Only completion
 *   map(() => 'Upload complete!')                        // Success message
 * );
 *
 * uploadProgress.subscribe(message => showSuccess(message));
 * ```
 *
 * @example Background Data Sync
 * ```ts
 * import { pipe, mergeMap, delay, catchErrors, tap } from './helpers/mod.ts';
 *
 * // Problem: Sync data in background, retry on failure, don't overwhelm server
 * // Solution: Batch processing with concurrency control and error recovery
 * const syncResults = pipe(
 *   pendingItems,
 *   batch(10),                                  // Process 10 items at a time
 *   mergeMap(batch =>                          // Process up to 3 batches concurrently
 *     pipe(
 *       Observable.from(syncBatch(batch)),
 *       delay(100),                             // Be nice to the server
 *       catchErrors(null),                      // Don't fail everything on one error
 *       tap(result => updateSyncStatus(result))
 *     ),
 *     3  // Max 3 concurrent operations
 *   ),
 *   filter(result => result !== null)          // Skip failed syncs
 * );
 *
 * syncResults.subscribe(result => logSyncSuccess(result));
 * ```
 *
 * Notice the pattern? Each operator does one job well, and you combine them to solve
 * complex problems. It's like having a Swiss Army knife for async data.
 *
 * ## Building Your Own Operators
 *
 * Sometimes the built-in operators aren't enough. That's fine! You can build your own.
 * Think of it like creating custom functions, but for streams:
 *
 * @example Simple Custom Operator
 * ```ts
 * import { createOperator } from './helpers/mod.ts';
 *
 * // Create a "double" operator (like multiplying every array element by 2)
 * function double<T extends number>() {
 *   return createOperator<T, T>({
 *     name: 'double',                    // For debugging
 *     transform(value, controller) {
 *       controller.enqueue(value * 2);  // Send doubled value
 *     }
 *   });
 * }
 *
 * // Use it like any other operator
 * pipe(
 *   Observable.of(1, 2, 3),
 *   double()
 * ).subscribe(console.log); // 2, 4, 6
 * ```
 *
 * @example Stateful Custom Operator
 * ```ts
 * import { createStatefulOperator } from './helpers/mod.ts';
 *
 * // Create a "moving average" operator that remembers previous values
 * function movingAverage(windowSize: number) {
 *   return createStatefulOperator<number, number, number[]>({
 *     name: 'movingAverage',
 *     createState: () => [],             // Start with empty array
 *
 *     transform(value, arr, controller) {
 *       arr.push(value);              // Add new value
 *       if (arr.length > windowSize) {
 *         arr.shift();                // Remove old values
 *       }
 *
 *       // Calculate and emit average
 *       const avg = arr.reduce((sum, n) => sum + n, 0) / arr.length;
 *       controller.enqueue(avg);
 *     }
 *   });
 * }
 *
 * // Use it to smooth noisy sensor data
 * pipe(
 *   noisySensorData,
 *   movingAverage(5)  // 5-value moving average
 * ).subscribe(smoothValue => updateDisplay(smoothValue));
 * ```
 *
 * The beauty of this system is that your custom operators work exactly like the built-in ones.
 * You can combine them, test them separately, and reuse them across projects.
 *
 * ## Error Handling: When Things Go Wrong
 *
 * Real-world data is messy. Networks fail, users input bad data, APIs return errors.
 * This library gives you **four ways** to handle errors, so you can choose what makes
 * sense for your situation:
 *
 * ```ts
 * // 1. "pass-through" (default): Errors become values in the stream
 * const safeParser = createOperator({
 *   errorMode: 'pass-through',  // Errors become ObservableError values
 *   transform(jsonString, controller) {
 *     controller.enqueue(JSON.parse(jsonString)); // If this fails, error flows as value
 *   }
 * });
 *
 * // 2. "ignore": Skip errors silently
 * const lenientParser = createOperator({
 *   errorMode: 'ignore',        // Errors are silently skipped
 *   transform(jsonString, controller) {
 *     controller.enqueue(JSON.parse(jsonString)); // Bad JSON just disappears
 *   }
 * });
 *
 * // 3. "throw": Stop everything on first error
 * const strictParser = createOperator({
 *   errorMode: 'throw',         // Errors terminate the stream
 *   transform(jsonString, controller) {
 *     controller.enqueue(JSON.parse(jsonString)); // Bad JSON kills the stream
 *   }
 * });
 *
 * // 4. "manual": You handle everything yourself
 * const customParser = createOperator({
 *   errorMode: 'manual',        // You're in control
 *   transform(jsonString, controller) {
 *     try {
 *       controller.enqueue(JSON.parse(jsonString));
 *     } catch (err) {
 *       // Your custom error logic here
 *       controller.enqueue({ error: err.message, input: jsonString });
 *     }
 *   }
 * });
 * ```
 *
 * **When to use which mode?**
 * - **pass-through**: When you want to handle errors downstream (most common)
 * - **ignore**: When bad data should just be filtered out
 * - **throw**: When any error means the whole operation failed
 * - **manual**: When you need custom error handling logic
 *
 * ## EventBus: For Pub/Sub Patterns
 *
 * Sometimes you need **one-to-many communication**, like a chat app where one message
 * goes to multiple users, or a shopping cart that updates multiple UI components.
 * That's where EventBus comes in:
 *
 * @example Simple EventBus
 * ```ts
 * import { EventBus } from './events.ts';
 *
 * // Create a bus for chat messages
 * const chatBus = new EventBus<string>();
 *
 * // Multiple components can listen
 * chatBus.events.subscribe(msg => updateChatWindow(msg));
 * chatBus.events.subscribe(msg => updateNotificationBadge(msg));
 * chatBus.events.subscribe(msg => logMessage(msg));
 *
 * // One emit reaches everyone
 * chatBus.emit('Hello everyone!');
 * // All three subscribers receive the message
 *
 * chatBus.close(); // Clean up when done
 * ```
 *
 * @example EventBus with async iteration
 * ```ts
 * import { EventBus } from './events.ts';
 *
 * const statusBus = new EventBus<{ status: string; data: any }>();
 *
 * // Listen using for-await (great for async processing)
 * async function handleStatusUpdates() {
 *   for await (const update of statusBus.events) {
 *     console.log('Status changed:', update.status);
 *
 *     if (update.status === 'error') {
 *       await handleError(update.data);
 *     } else if (update.status === 'complete') {
 *       await finalizeProcess(update.data);
 *       break; // Exit the loop
 *     }
 *   }
 * }
 *
 * // Start listening
 * handleStatusUpdates();
 *
 * // Emit updates from anywhere in your app
 * statusBus.emit({ status: 'processing', data: { progress: 50 } });
 * statusBus.emit({ status: 'complete', data: { result: 'success' } });
 * ```
 *
 * @example EventBus with operators
 * ```ts
 * import { EventBus } from './events.ts';
 * import { pipe, filter, map, debounce } from './helpers/mod.ts';
 *
 * const clickBus = new EventBus<{ x: number; y: number; target: string }>();
 *
 * // Process clicks with operators
 * const buttonClicks = pipe(
 *   clickBus.events,
 *   filter(click => click.target === 'button'),     // Only button clicks
 *   debounce(100),                                  // Prevent double-clicks
 *   map(click => ({ ...click, timestamp: Date.now() })) // Add timestamp
 * );
 *
 * buttonClicks.subscribe(click => {
 *   console.log('Button clicked at', click.x, click.y);
 * });
 *
 * // Emit clicks (maybe from a global click handler)
 * document.addEventListener('click', (e) => {
 *   clickBus.emit({
 *     x: e.clientX,
 *     y: e.clientY,
 *     target: e.target.tagName.toLowerCase()
 *   });
 * });
 * ```
 *
 * @example Typed EventDispatcher
 * ```ts
 * import { createEventDispatcher } from './events.ts';
 *
 * // Define your event types (TypeScript ensures you use them correctly)
 * interface AppEvents {
 *   userLogin: { userId: string; timestamp: number };
 *   userLogout: { userId: string };
 *   cartUpdate: { items: number; total: number };
 *   notification: { message: string; type: 'info' | 'warning' | 'error' };
 * }
 *
 * const events = createEventDispatcher<AppEvents>();
 *
 * // Type-safe event emission
 * events.emit('userLogin', { userId: '123', timestamp: Date.now() });
 * events.emit('cartUpdate', { items: 3, total: 29.99 });
 * events.emit('notification', { message: 'Welcome!', type: 'info' });
 *
 * // Type-safe event handling - listen to specific events
 * events.on('userLogin', (data) => {
 *   analytics.track('login', data.userId);  // TypeScript knows data.userId exists
 *   console.log('User logged in at', new Date(data.timestamp));
 * });
 *
 * events.on('cartUpdate', (data) => {
 *   updateCartIcon(data.items);             // TypeScript knows data.items is a number
 *   updateCartTotal(data.total);
 * });
 *
 * // Listen to ALL events (useful for debugging or logging)
 * events.events.subscribe(event => {
 *   console.log('Event:', event.type, 'Data:', event.payload);
 * });
 *
 * // Use async iteration for event processing
 * async function processNotifications() {
 *   for await (const event of events.events) {
 *     if (event.type === 'notification') {
 *       await showNotification(event.payload.message, event.payload.type);
 *     }
 *   }
 * }
 * ```
 *
 * @example Advanced EventBus patterns
 * ```ts
 * import { EventBus, withReplay, waitForEvent } from './events.ts';
 *
 * // Create a bus that replays the last 5 events to new subscribers
 * const statusBus = new EventBus<string>();
 * const replayableStatus = withReplay(statusBus.events, { count: 5 });
 *
 * // Emit some events
 * statusBus.emit('initializing');
 * statusBus.emit('loading data');
 * statusBus.emit('processing');
 *
 * // New subscribers get the last 5 events immediately
 * replayableStatus.subscribe(status => {
 *   console.log('Status:', status); // Will log all 3 previous events first
 * });
 *
 * // Wait for a specific event (useful for async coordination)
 * async function waitForCompletion() {
 *   try {
 *     const result = await waitForEvent(
 *       { events: statusBus.events },
 *       'complete',
 *       { signal: AbortSignal.timeout(5000) } // 5 second timeout
 *     );
 *     console.log('Operation completed:', result);
 *   } catch (error) {
 *     console.log('Timed out or aborted');
 *   }
 * }
 *
 * waitForCompletion();
 * statusBus.emit('complete'); // This will resolve the waitForEvent promise
 * ```
 *
 * @example EventBus resource management
 * ```ts
 * import { EventBus } from './events.ts';
 *
 * // EventBus supports using/await using for automatic cleanup
 * {
 *   using messageBus = new EventBus<string>();
 *
 *   // Set up listeners
 *   messageBus.events.subscribe(msg => console.log('Received:', msg));
 *
 *   // Use the bus
 *   messageBus.emit('Hello world!');
 *
 * } // Bus automatically closed and all resources cleaned up
 *
 * // Also works with async using
 * async function setupEventSystem() {
 *   await using eventSystem = new EventBus<any>();
 *
 *   // Set up complex event handling
 *   eventSystem.events.subscribe(processEvents);
 *
 *   // Do async work...
 *   await someAsyncOperation();
 *
 * } // Async cleanup happens automatically
 * ```
 *
 * **When to use EventBus vs Observable?**
 * - **Observable**: One-to-one, like transforming API data or handling user input
 * - **EventBus**: One-to-many, like app-wide notifications, state updates, or cross-component communication
 * - **EventDispatcher**: Type-safe pub/sub with multiple event types in one system
 *
 * **EventBus Consumption Patterns:**
 * - **subscribe()**: For imperative event handling with callbacks
 * - **for await**: For sequential async processing of events
 * - **pipe() + operators**: For transforming and filtering events
 * - **waitForEvent()**: For waiting for specific events in async functions
 *
 * ## Performance: Built for Speed
 *
 * This isn't just a learning library, it's built for production apps that need to handle
 * lots of data efficiently:
 *
 * ### Web Streams Foundation
 * Under the hood, operators use **Web Streams**, which gives you:
 * - **Native backpressure**: Fast producers don't overwhelm slow consumers
 * - **Memory efficiency**: Process data piece-by-piece, not all at once
 * - **Browser optimization**: Built-in browser optimizations kick in
 *
 * ### Pre-compiled Error Handling
 * Instead of checking error modes on every piece of data (slow), we generate
 * optimized functions for each error mode (fast):
 *
 * | Error Mode | Performance | When to Use |
 * |------------|-------------|-------------|
 * | `manual` | Fastest | Hot paths where you handle errors yourself |
 * | `ignore` | Very fast | Filtering bad data |
 * | `pass-through` | Fast | Error recovery, debugging |
 * | `throw` | Good | Fail-fast validation |
 *
 * ### Memory Management
 * - **Automatic cleanup**: `using` syntax and `Symbol.dispose` prevent leaks
 * - **Circular buffer queues**: O(1) operations for high-throughput data
 * - **Smart resource management**: Resources freed immediately when streams end
 *
 * @example Performance Tuning
 * ```ts
 * // For high-throughput data processing
 * const optimized = pipe(
 *   highVolumeStream,
 *
 *   // Use manual error mode for maximum speed
 *   createOperator({
 *     errorMode: 'manual',
 *     transform(chunk, controller) {
 *       try {
 *         controller.enqueue(processChunk(chunk));
 *       } catch (err) {
 *         logError(err); // Handle as needed
 *       }
 *     }
 *   }),
 *
 *   batch(100),                    // Process in efficient batches
 *   mergeMap(batch => processBatch(batch), 3) // Limit concurrency
 * );
 *
 * // For memory-constrained environments
 * for await (const chunk of bigDataStream.pull({
 *   strategy: { highWaterMark: 8 } // Small buffer
 * })) {
 *   await processLargeChunk(chunk);
 * }
 * ```
 *
 * ## Common Gotchas & How to Avoid Them
 *
 * Even with great tools, there are some things that can trip you up. Here's how to avoid them:
 *
 * **🔥 Memory Leaks**: The #1 Observable mistake
 * ```ts
 * // ❌ Bad: Creates memory leak
 * const timer = new Observable(obs => {
 *   setInterval(() => obs.next(Date.now()), 1000);
 *   // Missing cleanup function!
 * });
 * timer.subscribe(console.log); // This will run forever
 *
 * // ✅ Good: Always provide cleanup
 * const timer = new Observable(obs => {
 *   const id = setInterval(() => obs.next(Date.now()), 1000);
 *   return () => clearInterval(id); // Cleanup function
 * });
 * using sub = timer.subscribe(console.log); // Auto-cleanup with 'using'
 * ```
 *
 * **🏁 Race Conditions**: When requests finish out of order
 * ```ts
 * // ❌ Bad: Last request might not be latest
 * searchInput.subscribe(query => {
 *   fetch(`/search?q=${query}`)
 *     .then(response => response.json())
 *     .then(results => updateUI(results)); // Wrong results might appear!
 * });
 *
 * // ✅ Good: Use switchMap to cancel old requests
 * pipe(
 *   searchInput,
 *   switchMap(query => Observable.from(fetch(`/search?q=${query}`)))
 * ).subscribe(response => updateUI(response));
 * ```
 *
 * **❄️ Cold vs Hot Confusion**: Understanding when side effects happen
 *
 * Observable (cold): Side effect runs once per subscription.
 * EventBus (hot): Single source shared among multiple subscribers.
 *
 * **🚧 Operator Limits**: TypeScript has recursion limits
 *
 * Break into smaller, reusable functions for complex pipelines.
 *
 * ## Getting Started: Your First Steps
 *
 * 1. **Start simple**: Convert a Promise to an Observable
 * 2. **Add operators**: Try transformation and filtering first
 * 3. **Handle timing**: Add debouncing to a search input
 * 4. **Manage errors**: Use error catching for graceful degradation
 * 5. **Combine streams**: Use switching operators for request cancellation
 *
 * The operators work just like array methods, if you know transformation and filtering,
 * you're already halfway there. The real power comes from combining operators to
 * solve complex async problems with simple, composable code.
 *
 * **Implementation Notes:**
 * - Follows TC39 Observable proposal for future compatibility
 * - Built on Web Streams for performance and native backpressure
 * - Fully tree-shakable - import only what you use
 * - Comprehensive TypeScript support with intelligent inference
 * - Multiple error handling modes for different use cases
 * - Extensive test suite ensuring reliability
 *
 * @module
 */
export * from "./observable.ts";
export * from "./error.ts";
export * from "./events.ts";
export * from "./helpers/mod.ts";

export type * from "./_types.ts";