# @okikio/observables

[![CI](https://github.com/okikio/observables/actions/workflows/ci.yml/badge.svg)](https://github.com/okikio/observables/actions/workflows/ci.yml)
[![JSR](https://jsr.io/badges/@okikio/observables)](https://jsr.io/@okikio/observables)
[![npm version](https://img.shields.io/npm/v/%40okikio%2Fobservables?logo=npm&label=npm)](https://www.npmjs.com/package/@okikio/observables)
[![Bundle Size](https://deno.bundlejs.com/badge?q=@okikio/observables&treeshake=[{+Observable,+pipe,+map,+filter+}]&style=flat)](https://bundlejs.com/?q=@okikio/observables&treeshake=[{+Observable,+pipe,+map,+filter+}])
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[Documentation](https://jsr.io/@okikio/observables) •
[npm](https://www.npmjs.com/package/@okikio/observables) •
[GitHub](https://github.com/okikio/observables#readme) • [License](./LICENSE)

<!-- [![Open Bundle](https://bundlejs.com/badge-light.svg)](https://bundlejs.com/?q=@okikio/observables&bundle "Check the total bundle size of @okikio/observables") -->

A **spec-faithful** yet ergonomic TC39-inspired Observable implementation that
gives you one consistent way to handle all async data in JavaScript.

Built for Deno v2+, Node, Bun, and modern browsers, `@okikio/observables` keeps
the TC39 Observable proposal's mental model while adding the parts that make
day-to-day app code easier to write:

- **Observable pipelines that feel familiar** if you already know `Array.map()`
  and `Array.filter()`
- **Web Streams-powered backpressure** so fast producers do not silently bloat
  memory
- **Deterministic cleanup** via `unsubscribe()`, `using`, and `Symbol.dispose`
- **Built-in event primitives** for pub/sub and type-safe event dispatch
- **Four error modes** so you can choose between recovery, filtering, and
  fail-fast behavior

**Start here:** [Installation](#installation) • [Quick Start](#quick-start) •
[API](#api) • [Advanced Usage](#advanced-usage) • [FAQ](#faq) •
[Contributing](#contributing)

## Start Here

Install with the package manager that matches your runtime:

```bash
# Deno / JSR
deno add jsr:@okikio/observables

# npm-compatible runtimes
npm install @okikio/observables
# pnpm add @okikio/observables
# yarn add @okikio/observables
# bun add @okikio/observables
```

Then build a small pipeline:

```ts
import { filter, map, Observable, pipe } from "@okikio/observables";

const values = pipe(
  Observable.of(1, 2, 3, 4),
  filter((value) => value % 2 === 0),
  map((value) => value * 10),
);

values.subscribe((value) => console.log(value));
// 20
// 40
```

**Observables** are a **push‑based stream abstraction** for events, data, and
long‑running operations. Think of them as a **multi‑value Promise** that keeps
sending values until you tell it to stop, where a Promise gives you one value
eventually, an Observable can give you many values over time: mouse clicks,
search results, chat messages, sensor readings.

If you've ever built a web app, you know this all too well: user clicks, API
responses, WebSocket messages, timers, file uploads, they all arrive at
different times and need different handling. Before Observables, we'd all end up
with a mess of callbacks, Promise chains, event listeners, and async/await
scattered throughout our code.

Let's say you're building a search box. You've probably written something like
this:

```ts
// We've all been here: callbacks, timers, and manual cleanup 😫
let searchTimeout: number;
let lastRequest: Promise<any> | null = null;

searchInput.addEventListener("input", async (event) => {
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

This works but it's fragile, hard to test, and easy to mess up. Plus, you have
to remember to clean up event listeners, cancel timers, and handle edge cases
manually.

We've all felt this pain before:

- **Memory Leaks**: Forgot to remove an event listener? Your app slowly eats
  memory
- **Race Conditions**: User clicks fast, requests arrive out of order, wrong
  results appear
- **Error Handling**: Network failed? Now you need custom backoff and error
  recovery
- **Backpressure**: Producer too fast for consumer? Memory bloats until crash
- **Testing**: Complex async flows become nearly impossible to test reliably
- **Maintenance**: Each async pattern needs its own cleanup and error handling

Here's the same search box with Observables:

```ts
// Much cleaner: composable and robust ✨
import { debounce, filter, map, pipe, switchMap } from "@okikio/observables";

const searchResults = pipe(
  inputEvents, // Stream of input events
  debounce(300), // Wait 300ms after user stops typing
  filter((query) => query.length >= 3), // Skip short queries
  switchMap((query) =>
    // Cancel previous requests automatically
    Observable.from(fetch(`/search?q=${query}`))
  ),
  map((response) => response.json()), // Parse response
);

// Subscribe to results (with automatic cleanup!)
using subscription = searchResults.subscribe({
  next: (results) => updateSearchResults(results),
  error: (error) => handleSearchError(error),
});
// Subscription automatically cleaned up when leaving scope
```

Notice the difference? No manual timers, no cancellation logic, no memory leaks.
The operators handle all the complex async coordination for you.

This library was built by developers who've felt these same frustrations. It
focuses on:

- **Familiarity**: If you know `Array.map()`, you already understand operators
- **Performance**: Built on Web Streams with pre-compiled error handling
- **Type Safety**: Full TypeScript support with intelligent inference
- **Standards**: Follows the TC39 Observable proposal for future compatibility
- **Practicality**: <4KB but includes everything you need for real apps
- **Flexibility**: 4 different error handling modes for different situations

## Installation

### Deno

```ts
import { map, Observable, pipe } from "jsr:@okikio/observables";
```

Or

```bash
deno add jsr:@okikio/observables
```

### Node.js and Bun

```bash
npm install @okikio/observables
# pnpm add @okikio/observables
# yarn add @okikio/observables
# bun add @okikio/observables
```

If you prefer to install through the JSR bridge instead of the npm registry:

```bash
npx jsr add @okikio/observables
```

<details>
    <summary>Others</summary>

```bash
pnpm add jsr:@okikio/observables
```

Or

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

```ts ignore
import { map, Observable, pipe } from "https://esm.sh/jsr/@okikio/observables";
```

## Quick Start

```ts
import { debounce, filter, map, Observable, pipe } from "@okikio/observables";

// Create from anything async
const clicks = new Observable((observer) => {
  const handler = (e) => observer.next(e);
  button.addEventListener("click", handler);
  return () => button.removeEventListener("click", handler);
});

// Transform with operators (like Array.map, but for async data)
const doubleClicks = pipe(
  clicks,
  debounce(300), // Wait 300ms between clicks
  filter((_, index) => index % 2), // Only odd-numbered clicks
  map((event) => ({ x: event.clientX, y: event.clientY })),
);

// Subscribe to results
using subscription = doubleClicks.subscribe({
  next: (coords) => console.log("Double click at:", coords),
  error: (err) => console.error("Error:", err),
});
// Automatically cleaned up when leaving scope
```

## Showcase

A couple sites/projects that use `@okikio/observables`:

- Your site/project here...

## API

The API of `@okikio/observables` provides everything you need for reactive
programming:

### Core Observable

```ts
import { Observable } from "@okikio/observables";

// Create observables
const timer = new Observable((observer) => {
  const id = setInterval(() => observer.next(Date.now()), 1000);
  return () => clearInterval(id);
});

// Factory methods
Observable.of(1, 2, 3); // From values
Observable.from(fetch("/api/data")); // From promises/iterables
```

### Operators (including combination, conditional, and recovery helpers)

```ts
import { debounce, filter, map, pipe, switchMap } from "@okikio/observables";

// Transform data as it flows
pipe(
  source,
  map((x) => x * 2), // Transform each value
  filter((x) => x > 10), // Keep only values > 10
  debounce(300), // Wait for quiet periods
  switchMap((x) => fetchData(x)), // Cancel previous requests
);
```

The built-in operator set covers the common array-like transforms plus the
stream-specific coordination helpers you usually reach for next:

- `map`, `filter`, `scan`, `take`, `drop`
- `find`, `findIndex`, `first`, `elementAt`
- `mergeMap`, `concatMap`, `switchMap`
- `withLatestFrom`, `combineLatestWith`, `zipWith`, `raceWith`
- `changed`, `unique`, `catchErrors`, `ignoreErrors`

### EventBus & EventDispatcher

```ts
import { createEventDispatcher, EventBus } from "@okikio/observables";

// Simple pub/sub
const bus = new EventBus<string>();
bus.events.subscribe((msg) => console.log(msg));
bus.emit("Hello world!");

// Type-safe events
interface AppEvents {
  userLogin: { userId: string };
  cartUpdate: { items: number };
}

const events = createEventDispatcher<AppEvents>();
events.emit("userLogin", { userId: "123" });
events.on("cartUpdate", (data) => updateUI(data.items));
```

### Error Handling (4 modes)

```ts
import { createOperator } from "@okikio/observables";

// Choose your error handling strategy
const processor = createOperator({
  errorMode: "pass-through", // Errors become values (default)
  // errorMode: 'ignore',     // Skip errors silently
  // errorMode: 'throw',      // Fail fast
  // errorMode: 'manual',     // You handle everything

  transform(value, controller) {
    controller.enqueue(processValue(value));
  },
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
for await (
  const chunk of bigDataStream.pull({
    strategy: { highWaterMark: 8 }, // Small buffer for large files
  })
) {
  await processChunk(chunk);
}
```

### Behavior Notes and Differences

This package stays close to the TC39 Observable proposal, but a few practical
choices matter when you compare it with RxJS, `zen-observable`, or older
proposal examples.

- Operators are function-first. Instead of adding lots of prototype helpers to
  `Observable`, this package puts transformation and coordination logic in
  `pipe(...)` plus operator functions such as `map`, `filter`, `switchMap`, and
  `tap`.
- There is no instance `observable.forEach()` today. In-pipeline side effects
  live in `tap(...)`, and terminal consumption lives in `subscribe(...)`,
  `for await ... of`, or `observable.pull()`.
- Side effects inside a pipeline belong in `tap(...)`. Terminal consumption
  belongs in `subscribe(...)`, `for await ... of observable`, or
  `observable.pull()`.
- `for await` and `pull()` are the backpressure-aware path. They are great when
  the consumer is asynchronous or the producer can outpace it. They also carry
  async-iterator overhead, so plain `subscribe(...)` is still the lower-overhead
  path for tight synchronous workflows.
- This package exposes `observer.start(subscription)` before the subscriber body
  runs. That hook is useful for inspection and early cancellation, but it is not
  a teardown registration point.
- If you allocate resources only inside `start()`, this package will not clean
  them up for you automatically. Automatic teardown only knows about cleanup
  returned from the subscriber function or cleanup attached to resources that
  manage themselves.
- An already-aborted `AbortSignal` still creates the subscription facade and
  still calls `start(subscription)`, but `subscription.closed` is already `true`
  and the subscriber body is skipped.

In practice, `start()` should stay lightweight. Use it to observe or cancel the
subscription early. Put long-lived resource allocation in the subscriber
function so the returned teardown can release it deterministically.

For a fuller comparison against RxJS and `zen-observable`, see
[docs/observable-comparison-matrix.md](./docs/observable-comparison-matrix.md).

Look through the [tests/](./tests/) and [bench/](./bench/) folders for complex
examples and multiple usage patterns.

## Advanced Usage

### Smart Search with Cancellation

```ts
import {
  catchErrors,
  debounce,
  filter,
  map,
  pipe,
  switchMap,
} from "@okikio/observables";

const searchResults = pipe(
  searchInput,
  debounce(300), // Wait for typing pause
  filter((query) => query.length > 2), // Skip short queries
  switchMap((query) =>
    // Cancel old requests automatically
    pipe(
      Observable.from(fetch(`/search?q=${query}`)),
      map((res) => res.json()),
      catchErrors([]), // Return empty array on error
    )
  ),
);

searchResults.subscribe((results) => updateUI(results));
```

### Real-Time Dashboard

```ts
import { filter, pipe, scan, throttle } from "@okikio/observables";

const dashboardData = pipe(
  webSocketEvents,
  filter((event) => event.type === "metric"), // Only metric events
  scan((acc, event) => ({ // Build running totals
    total: acc.total + event.value,
    count: acc.count + 1,
    average: (acc.total + event.value) / (acc.count + 1),
  }), { total: 0, count: 0, average: 0 }),
  throttle(1000), // Update UI max once per second
);

dashboardData.subscribe((stats) => updateDashboard(stats));
```

### Custom Operators

```ts
import { createOperator, createStatefulOperator } from "@okikio/observables";

// Simple transformation
function double<T extends number>() {
  return createOperator<T, T>({
    name: "double",
    transform(value, controller) {
      controller.enqueue(value * 2);
    },
  });
}

// Stateful operation
function movingAverage(windowSize: number) {
  return createStatefulOperator<number, number, number[]>({
    name: "movingAverage",
    createState: () => [],

    transform(value, arr, controller) {
      arr.push(value);
      if (arr.length > windowSize) arr.shift();

      const avg = arr.reduce((sum, n) => sum + n, 0) / arr.length;
      controller.enqueue(avg);
    },
  });
}
```

### Native Stream and RxJS Interop

The library stays on Web Streams internally, but you can still bring in
platform transforms and foreign operator ecosystems when that is the cheapest
way to solve a problem.

If you already have a readable/writable pair such as `CompressionStream`, use
`fromStreamPair()` to treat it like a normal operator:

```ts
import {
  fromStreamPair,
  Observable,
  pipe,
} from "@okikio/observables";

const gzip = fromStreamPair<Uint8Array, Uint8Array>(
  () => new CompressionStream("gzip"),
);

const compressed = pipe(
  Observable.of(new TextEncoder().encode("hello world")),
  gzip,
);
```

If you want to reuse RxJS operator functions, `fromObservableOperator()` wraps
that operator shape and keeps the rest of your pipeline in this library.

That helper is intentionally a little wider than `Observable.from()`. The
runtime `Observable.from()` entrypoint keeps its own explicit signature, but it
primarily accepts spec-style and collection-style inputs such as iterables,
promises, async iterables, array-like values, and objects that implement
`[Symbol.observable]()`. The interop helper goes one step wider by also
accepting direct subscribables returned by third-party operator ecosystems, so
you can reuse an RxJS stage without first forcing its output through the
non-subscribable conversion path.

Use the standard RxJS names when you are only talking to RxJS inside the
adapter:

```ts
import { fromObservableOperator, Observable, pipe } from "@okikio/observables";
import { from, map, pipe as rxPipe, take } from "rxjs";

const rxStage = fromObservableOperator<number, number>(
  rxPipe(
    map((value) => value + 1),
    take(2),
  ),
  { sourceAdapter: (source) => from(source) },
);

const result = pipe(Observable.of(1, 2, 3), rxStage);
```

Alias the RxJS imports when you want local operators and RxJS operators in the
same file:

```ts
import {
  fromObservableOperator,
  map,
  Observable,
  pipe,
} from "@okikio/observables";
import {
  from as rxFrom,
  map as rxMap,
  pipe as rxPipe,
  take as rxTake,
} from "rxjs";

const result = pipe(
  Observable.of(1, 2, 3, 4),
  map((value) => value * 10),
  fromObservableOperator<number, number>(
    rxPipe(
      rxMap((value) => value + 1),
      rxTake(2),
    ),
    { sourceAdapter: (source) => rxFrom(source) },
  ),
);
```

`sourceAdapter` is the important piece for standard RxJS operators. RxJS
operator functions expect an RxJS `Observable` on the input side, so the
adapter converts this library's Observable into that source shape before the
foreign operator runs. On the output side, `fromObservableOperator()` can read
either a normal `Observable.from()`-compatible input or a direct subscribable
returned by RxJS. If that foreign subscribable throws during subscription
setup, the bridge wraps the failure as an `ObservableError` value instead of
tearing the readable side down immediately.

Some operators have the same name in both ecosystems, such as `switchMap`,
`mergeMap`, `concatMap`, `findIndex`, `first`, and `elementAt`. Others map by
intent rather than by exact name. For example, this library's `changed()` is
closest to RxJS `distinctUntilChanged()`.

## Performance

We built this on Web Streams for good reason, native backpressure and memory
efficiency come for free. Here's what you get:

- **Web Streams Foundation**: Handles backpressure automatically, no memory
  bloat
- **Pre-compiled Error Modes**: Skip runtime checks in hot paths
- **Tree Shaking**: Import only what you use (most apps need <4KB)
- **TypeScript Native**: Zero runtime overhead for type safety

Interop helpers are intentionally thin, but they still add one adaptation
boundary. If raw throughput is the main goal, prefer built-in operators first,
then reach for `fromStreamPair()` or `fromObservableOperator()` when reusing an
existing platform transform or foreign operator saves more code than it costs
in adapter overhead.

Performance varies by use case, but here's how different error modes stack up:

| Error Mode     | Performance | When We Use It            |
| -------------- | ----------- | ------------------------- |
| `manual`       | Fastest     | Hot paths, custom logic   |
| `ignore`       | Very fast   | Filtering bad data        |
| `pass-through` | Fast        | Error recovery, debugging |
| `throw`        | Good        | Fail-fast validation      |

## Comparison

| Feature         | @okikio/observables | RxJS        | zen-observable |
| --------------- | ------------------- | ----------- | -------------- |
| Bundle Size     | <4KB                | ~35KB       | ~2KB           |
| Operators       | 19+                 | 100+        | 5              |
| Error Modes     | 4 modes             | 1 mode      | 1 mode         |
| EventBus        | ✅ Built-in         | ❌ Separate | ❌ None        |
| TC39 Compliance | ✅ Yes              | ⚠️ Partial  | ✅ Yes         |
| TypeScript      | ✅ Native           | ✅ Yes      | ⚠️ Basic       |
| Tree Shaking    | ✅ Perfect          | ⚠️ Partial  | ✅ Yes         |
| Learning Curve  | 🟢 Gentle           | 🔴 Steep    | 🟢 Gentle      |

## Browser Support

| Chrome | Edge | Firefox | Safari | Node | Deno | Bun  |
| ------ | ---- | ------- | ------ | ---- | ---- | ---- |
| 80+    | 80+  | 72+     | 13+    | 16+  | 1.0+ | 1.0+ |

> Native support for Observables is excellent. Some advanced features like
> `Symbol.dispose` require newer environments or polyfills.

## FAQ

### What are Observables exactly?

Think of them as Promises that can send multiple values over time. Where a
Promise gives you one result eventually, an Observable can keep sending values,
like a stream of search results, mouse movements, or WebSocket messages.

### Why not just use RxJS?

RxJS is powerful but can be overwhelming. 100+ operators, a steep learning curve, 35KB bundle size, it can be very overwhelming. `@okikio/observables` gives you the essential
Observable patterns you actually need day-to-day, following the TC39 proposal so
you're future-ready.

### EventBus vs Observable, when do I use which?

Good question! Here's how we think about it:

- **Observable**: When you're transforming data one-to-one (API calls,
  processing user input)
- **EventBus**: When you need one-to-many communication (notifications,
  cross-component events)

### How should I handle errors?

Pick the mode that fits your situation:

- **`pass-through`**: Errors become values you can recover from
- **`ignore`**: Skip errors silently (great for filtering noisy data)
- **`throw`**: Fail fast for validation
- **`manual`**: Handle everything yourself

### Is this actually production ready?

It follows the TC39 proposal, has comprehensive tests,
and handles resource management properly. The Web Streams foundation is
battle-tested across browsers and runtimes. I'd say it's good enough for prime-time, but as with any library, test it in your specific use case first.

## Contributing

Contributions are welcome. This project targets Deno v2+ and keeps a tight
feedback loop around formatting, linting, docs, tests, and npm packaging, so a
good contribution usually starts by getting the local validation commands
working first.

Install Deno with [mise](https://mise.jdx.dev/) or by following the
[manual installation guide](https://deno.land/manual/getting_started/installation).

### Setup with Mise

```bash
curl https://mise.run | sh
echo 'eval "$(~/.local/bin/mise activate bash)"' >> ~/.bashrc
```

Then install the toolchain:

```bash
mise install
```

### Validate your change

```bash
deno fmt
deno lint
deno check **/*.ts
deno doc --lint mod.ts
deno task test
deno task build:npm
```

If your change is performance-sensitive, also run:

```bash
deno task bench
```

This repository uses
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), so
please format commit messages accordingly.

## License

See the [LICENSE](./LICENSE) file for license rights and limitations (MIT).
