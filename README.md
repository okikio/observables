# @okikio/observables

[![Open Bundle](https://bundlejs.com/badge-light.svg)](https://bundlejs.com/?q=@okikio/observables&bundle "Check the total bundle size of @okikio/observables")

[NPM](https://www.npmjs.com/package/@okikio/observables) <span style="padding-inline: 1rem">|</span> [GitHub](https://github.com/okikio/observables#readme) <span style="padding-inline: 1rem">|</span> [JSR](https://jsr.io/@okikio/observables) <span style="padding-inline: 1rem">|</span> [Licence](./LICENSE)

A **spec-faithful** yet ergonomic TC39-inspired Observable implementation that gives you one consistent way to handle all async data in JavaScript.

**Observables** are a **push‑based stream abstraction** for events, data, and long‑running operations. Think of them as a **multi‑value Promise** that keeps sending values until you tell it to stop, where a Promise gives you one value eventually, an Observable can give you many values over time: mouse clicks, search results, chat messages, sensor readings.

[![Bundle Size](https://deno.bundlejs.com/badge?q=@okikio/observables&treeshake=[{+Observable,+pipe,+map,+filter+}]&style=flat)](https://bundlejs.com/?q=@okikio/observables&treeshake=[{+Observable,+pipe,+map,+filter+}])

If you've ever built a web app, you know this all too well: user clicks, API responses, WebSocket messages, timers, file uploads, they all arrive at different times and need different handling. Before Observables, we'd all end up with a mess of callbacks, Promise chains, event listeners, and async/await scattered throughout our code.

Let's say you're building a search box. You've probably written something like this:

```ts
// We've all been here: callbacks, timers, and manual cleanup 😫
let searchTimeout: number;
let lastRequest: Promise<any> | null = null;

searchInput.addEventListener('input', async (event) => {
  const query = event.target.value;
  
  // Debounce: wait 300ms after user stops typing
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    
    // Cancel previous request somehow?
    if (lastRequest) {
      // How do you cancel a fetch? 🤔
    }
    
    if (query.length < 3) return; // Skip short queries
    
    try {
      lastRequest = fetch(`/search?q=${query}`);
      const response = await lastRequest;
      const results = await response.json();
      
      // Update UI, but what if user already typed something new?
      updateSearchResults(results);
    } catch (error) {
      // Handle errors, but which errors? Network? Parsing?
      handleSearchError(error);
    }
  }, 300);
});

// Don't forget cleanup when component unmounts!
// (Spoiler: we all forget this and create memory leaks)
```

This works but it's fragile, hard to test, and easy to mess up. Plus, you have to remember to clean up event listeners, cancel timers, and handle edge cases manually.

We've all felt this pain before:

- **Memory Leaks**: Forgot to remove an event listener? Your app slowly eats memory
- **Race Conditions**: User clicks fast, requests arrive out of order, wrong results appear  
- **Error Handling**: Network failed? Now you need custom backoff and error recovery
- **Backpressure**: Producer too fast for consumer? Memory bloats until crash
- **Testing**: Complex async flows become nearly impossible to test reliably
- **Maintenance**: Each async pattern needs its own cleanup and error handling

Here's the same search box with Observables:

```ts
// Much cleaner: composable and robust ✨
import { pipe, debounce, filter, switchMap, map } from "@okikio/observables";

const searchResults = pipe(
  inputEvents,                          // Stream of input events
  debounce(300),                        // Wait 300ms after user stops typing
  filter(query => query.length >= 3),  // Skip short queries
  switchMap(query =>                    // Cancel previous requests automatically
    Observable.from(fetch(`/search?q=${query}`))
  ),
  map(response => response.json())      // Parse response
);

// Subscribe to results (with automatic cleanup!)
using subscription = searchResults.subscribe({
  next: results => updateSearchResults(results),
  error: error => handleSearchError(error)
});
// Subscription automatically cleaned up when leaving scope
```

Notice the difference? No manual timers, no cancellation logic, no memory leaks. The operators handle all the complex async coordination for you.

This library was built by developers who've felt these same frustrations. It focuses on:

- **Familiarity**: If you know `Array.map()`, you already understand operators
- **Performance**: Built on Web Streams with pre-compiled error handling  
- **Type Safety**: Full TypeScript support with intelligent inference
- **Standards**: Follows the TC39 Observable proposal for future compatibility
- **Practicality**: <4KB but includes everything you need for real apps
- **Flexibility**: 4 different error handling modes for different situations

## Installation

### Deno

```ts
import { Observable, pipe, map } from "jsr:@okikio/observables";
```

Or

```bash
deno add jsr:@okikio/observables
```

### Node.js

```bash
npx jsr add @okikio/observables
```

Or

```bash
pnpm install jsr:@okikio/observables
```

<details>
    <summary>Others</summary>

```bash
yarn add @okikio/observables@jsr:latest
```

Or 

```bash
bunx jsr add @okikio/observables
```

</details>

### Web

You can also use it via a CDN:

```ts
import { Observable, pipe, map } from "https://esm.sh/jsr/@okikio/observables";
```

## Quick Start

```ts
import { Observable, pipe, map, filter, debounce } from "@okikio/observables";

// Create from anything async
const clicks = new Observable(observer => {
  const handler = e => observer.next(e);
  button.addEventListener('click', handler);
  return () => button.removeEventListener('click', handler);
});

// Transform with operators (like Array.map, but for async data)
const doubleClicks = pipe(
  clicks,
  debounce(300),                    // Wait 300ms between clicks
  filter((_, index) => index % 2),  // Only odd-numbered clicks
  map(event => ({ x: event.clientX, y: event.clientY }))
);

// Subscribe to results
using subscription = doubleClicks.subscribe({
  next: coords => console.log('Double click at:', coords),
  error: err => console.error('Error:', err)
});
// Automatically cleaned up when leaving scope
```

## Showcase

A couple sites/projects that use `@okikio/observables`:

- Your site/project here...

## API

The API of `@okikio/observables` provides everything you need for reactive programming:

### Core Observable

```ts
import { Observable } from "@okikio/observables";

// Create observables
const timer = new Observable(observer => {
  const id = setInterval(() => observer.next(Date.now()), 1000);
  return () => clearInterval(id);
});

// Factory methods
Observable.of(1, 2, 3);                    // From values
Observable.from(fetch('/api/data'));       // From promises/iterables
```

### Operators (19+ included)

```ts
import { pipe, map, filter, debounce, switchMap } from "@okikio/observables";

// Transform data as it flows
pipe(
  source,
  map(x => x * 2),                    // Transform each value
  filter(x => x > 10),                // Keep only values > 10
  debounce(300),                      // Wait for quiet periods
  switchMap(x => fetchData(x))        // Cancel previous requests
);
```

### EventBus & EventDispatcher

```ts
import { EventBus, createEventDispatcher } from "@okikio/observables";

// Simple pub/sub
const bus = new EventBus<string>();
bus.events.subscribe(msg => console.log(msg));
bus.emit('Hello world!');

// Type-safe events
interface AppEvents {
  userLogin: { userId: string };
  cartUpdate: { items: number };
}

const events = createEventDispatcher<AppEvents>();
events.emit('userLogin', { userId: '123' });
events.on('cartUpdate', data => updateUI(data.items));
```

### Error Handling (4 modes)

```ts
import { createOperator } from "@okikio/observables";

// Choose your error handling strategy
const processor = createOperator({
  errorMode: 'pass-through',  // Errors become values (default)
  // errorMode: 'ignore',     // Skip errors silently
  // errorMode: 'throw',      // Fail fast
  // errorMode: 'manual',     // You handle everything
  
  transform(value, controller) {
    controller.enqueue(processValue(value));
  }
});
```

### Resource Management

```ts
// Automatic cleanup with 'using'
{
  using subscription = observable.subscribe(handleData);
  // Use subscription here...
} // Automatically cleaned up

// Async cleanup
async function example() {
  await using bus = new EventBus();
  // Do async work...
} // Awaits cleanup
```

### Pull API (Async Iteration)

```ts
// Process large datasets with backpressure
for await (const chunk of bigDataStream.pull({
  strategy: { highWaterMark: 8 } // Small buffer for large files
})) {
  await processChunk(chunk);
}
```

Look through the [tests/](./tests/) and [bench/](./bench/) folders for complex examples and multiple usage patterns.

## Advanced Usage

### Smart Search with Cancellation

```ts
import { pipe, debounce, filter, switchMap, map, catchErrors } from "@okikio/observables";

const searchResults = pipe(
  searchInput,
  debounce(300),                        // Wait for typing pause
  filter(query => query.length > 2),   // Skip short queries
  switchMap(query =>                    // Cancel old requests automatically
    pipe(
      Observable.from(fetch(`/search?q=${query}`)),
      map(res => res.json()),
      catchErrors([])                   // Return empty array on error
    )
  )
);

searchResults.subscribe(results => updateUI(results));
```

### Real-Time Dashboard

```ts
import { pipe, filter, scan, throttle } from "@okikio/observables";

const dashboardData = pipe(
  webSocketEvents,
  filter(event => event.type === 'metric'),    // Only metric events
  scan((acc, event) => ({                     // Build running totals
    total: acc.total + event.value,
    count: acc.count + 1,
    average: (acc.total + event.value) / (acc.count + 1)
  }), { total: 0, count: 0, average: 0 }),
  throttle(1000)                              // Update UI max once per second
);

dashboardData.subscribe(stats => updateDashboard(stats));
```

### Custom Operators

```ts
import { createOperator, createStatefulOperator } from "@okikio/observables";

// Simple transformation
function double<T extends number>() {
  return createOperator<T, T>({
    name: 'double',
    transform(value, controller) {
      controller.enqueue(value * 2);
    }
  });
}

// Stateful operation
function movingAverage(windowSize: number) {
  return createStatefulOperator<number, number, number[]>({
    name: 'movingAverage',
    createState: () => [],
    
    transform(value, arr, controller) {
      arr.push(value);
      if (arr.length > windowSize) arr.shift();
      
      const avg = arr.reduce((sum, n) => sum + n, 0) / arr.length;
      controller.enqueue(avg);
    }
  });
}
```

## Performance

We built this on Web Streams for good reason, native backpressure and memory efficiency come for free. Here's what you get:

- **Web Streams Foundation**: Handles backpressure automatically, no memory bloat
- **Pre-compiled Error Modes**: Skip runtime checks in hot paths  
- **Tree Shaking**: Import only what you use (most apps need <4KB)
- **TypeScript Native**: Zero runtime overhead for type safety

Performance varies by use case, but here's how different error modes stack up:

| Error Mode | Performance | When We Use It |
|------------|-------------|-----------------|
| `manual` | Fastest | Hot paths, custom logic |
| `ignore` | Very fast | Filtering bad data |
| `pass-through` | Fast | Error recovery, debugging |
| `throw` | Good | Fail-fast validation |

## Comparison

| Feature | @okikio/observables | RxJS | zen-observable |
|---------|-------------------|------|----------------|
| Bundle Size | <4KB | ~35KB | ~2KB |
| Operators | 19+ | 100+ | 5 |
| Error Modes | 4 modes | 1 mode | 1 mode |
| EventBus | ✅ Built-in | ❌ Separate | ❌ None |
| TC39 Compliance | ✅ Yes | ⚠️ Partial | ✅ Yes |
| TypeScript | ✅ Native | ✅ Yes | ⚠️ Basic |
| Tree Shaking | ✅ Perfect | ⚠️ Partial | ✅ Yes |
| Learning Curve | 🟢 Gentle | 🔴 Steep | 🟢 Gentle |

## Browser Support

| Chrome | Edge | Firefox | Safari | Node | Deno | Bun |
| ------ | ---- | ------- | ------ | ---- | ---- | --- |
| 80+    | 80+  | 72+     | 13+    | 16+  | 1.0+ | 1.0+ |

> Native support for Observables is excellent. Some advanced features like `Symbol.dispose` require newer environments or polyfills.

## FAQ

### What are Observables exactly?

Think of them as Promises that can send multiple values over time. Where a Promise gives you one result eventually, an Observable can keep sending values, like a stream of search results, mouse movements, or WebSocket messages.

### Why not just use RxJS?

RxJS is powerful but can be overwhelming. We've all been there, 100+ operators, steep learning curve, 35KB bundle size. This library gives you the essential Observable patterns you actually use day-to-day, following the TC39 proposal so you're future-ready.

### EventBus vs Observable, when do I use which?

Good question! Here's how we think about it:

- **Observable**: When you're transforming data one-to-one (API calls, processing user input)
- **EventBus**: When you need one-to-many communication (notifications, cross-component events)

### How should I handle errors?

Pick the mode that fits your situation:

- **`pass-through`**: Errors become values you can recover from
- **`ignore`**: Skip errors silently (great for filtering noisy data)  
- **`throw`**: Fail fast for validation
- **`manual`**: Handle everything yourself

### Is this actually production ready?

We use it in production. It follows the TC39 proposal, has comprehensive tests, and handles resource management properly. The Web Streams foundation is battle-tested across browsers and runtimes.

## Contributing

I encourage you to use [deno](https://deno.com/) to contribute to this repo, to setup deno you can install it via [mise](https://mise.jdx.dev/) or [manually](https://deno.land/manual/getting_started/installation). 

Setup Mise:

```bash
curl https://mise.run | sh
echo 'eval "$(~/.local/bin/mise activate bash)"' >> ~/.bashrc
```

Install Deno:

```bash
mise install
```

Then run tests:

```bash
deno task test
```

Run benchmarks:

```bash
deno task bench
```

> **Note**: This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) standard for commits, so please format your commits using the rules it sets out.

## Licence

See the [LICENSE](./LICENSE) file for license rights and limitations (MIT).