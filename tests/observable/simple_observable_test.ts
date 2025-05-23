import { test, expect } from "@libs/testing";

import { Observable } from "../../observable.ts";
import { Symbol } from "../../symbol.ts";
import { captureUnhandledOnce } from "../_utils/_uncaught.ts";

// -----------------------------------------------------------------------------
// Basic Push API Tests
// -----------------------------------------------------------------------------

test("Observable.of emits values then completes", () => {
  const results: number[] = [];
  let completed = false;

  const subscription = Observable.of(1, 2, 3).subscribe({
    next: (v) => results.push(v),
    complete: () => { completed = true; },
  });

  // All values emitted synchronously
  expect(results).toEqual([1, 2, 3]);
  // Completion callback invoked
  expect(completed).toBe(true);
  // Subscription closed after complete
  expect(subscription.closed).toBe(true);
});


test("unsubscribe before completion stops emissions and calls teardown", () => {
  const results: number[] = [];
  let cleaned = false;

  // Teardown records cleanup
  const obs = new Observable<number>((observer) => {
    // Emit a value then schedule a second emission
    observer.next(10);
    const id = setTimeout(() => observer.next(20), 1);
    return () => { clearTimeout(id); cleaned = true; };
  });

  const subscription = obs.subscribe((v) => results.push(v));
  // Only first value arrives
  expect(results).toEqual([10]);

  // Unsubscribe stops further emissions and calls teardown
  subscription.unsubscribe();
  expect(cleaned).toBe(true);
  expect(subscription.closed).toBe(true);
});


test("subscribe trims callback overloads correctly", () => {
  const results: number[] = [];
  const completes: boolean[] = [];

  const subscription = Observable.of(4, 5).subscribe(
    (v) => results.push(v),
    undefined,
    () => completes.push(true),
  );

  expect(results).toEqual([4, 5]);
  expect(completes).toEqual([true]);
  expect(subscription.closed).toBe(true);
});

// -----------------------------------------------------------------------------
// Error Handling Tests
// -----------------------------------------------------------------------------

test("error in subscribeFn triggers observer.error and closes subscription", () => {
  const errorObj = new Error("failure");
  let caught: unknown;

  const faulty = new Observable<number>(() => {
    throw errorObj;
  });

  const subscription = faulty.subscribe({
    error: (e) => { caught = e; },
  });

  expect(caught).toBe(errorObj);
  expect(subscription.closed).toBe(true);
});

// -----------------------------------------------------------------------------
// Async Iterable Tests
// -----------------------------------------------------------------------------

test("for-await iteration yields values from Observable.of", async () => {
  const result: number[] = [];
  for await (const v of Observable.of(7, 8, 9)) {
    result.push(v);
  }
  expect(result).toEqual([7, 8, 9]);
});

// -----------------------------------------------------------------------------
// Static `from` Tests
// -----------------------------------------------------------------------------

test("static from wraps Observable-like objects", () => {
  const values = ["x", "y"];
  const foreign = {
    [Symbol.observable]() {
      return Observable.of(...values);
    }
  };

  const obs = Observable.from(foreign);
  const result: string[] = [];
  obs.subscribe({ next: (v) => result.push(v) });

  expect(result).toEqual(values);
});


test("static from iterable emits all items", () => {
  const arr = [1, 2, 3];
  const received: number[] = [];

  Observable.from(arr).subscribe({ next: (v) => received.push(v) });
  expect(received).toEqual(arr);
});


test("static from async iterable emits all items", async () => {
  async function* gen() {
    yield 100;
    yield 200;
  }

  const received: number[] = [];
  const obs = Observable.from(gen());

  for await (const v of obs) {
    received.push(v);
  }

  expect(received).toEqual([100, 200]);
});

// -----------------------------------------------------------------------------
// Teardown on Complete Tests
// -----------------------------------------------------------------------------

test("teardown called on complete", async () => {
  let cleaned = false;

  const obs = new Observable<number>((observer) => {
    observer.next(1);
    observer.complete();

    return () => {
      cleaned = true;
    };
  });

  const result: number[] = [];
  obs.subscribe({ next: (v) => result.push(v) });

  await Promise.resolve();

  expect(result).toEqual([1]);
  expect(cleaned).toBe(true);
});

// -----------------------------------------------------------------------------
// Documentation Example Tests
// -----------------------------------------------------------------------------

test("Basic subscription example calls start, next, complete in order", () => {
  const calls: string[] = [];

  // from docs: Observable.of(1,2,3).subscribe({...})
  const subscription = Observable.of(1, 2, 3).subscribe({
    start() { calls.push("start"); },
    next(v) { calls.push(`next:${v}`); },
    complete() { calls.push("complete"); },
  });

  // should have fired start → next:1 → next:2 → next:3 → complete
  expect(calls).toEqual([
    "start",
    "next:1",
    "next:2",
    "next:3",
    "complete",
  ]);
  // after complete, subscription.closed must be true
  expect(subscription.closed).toBe(true);
});

test("Pull‐with‐strategy example yields all values with backpressure", async () => {
  // from docs: Observable.from([1,2,3,4,5]).pull({ highWaterMark: 2 })
  const nums = Observable.from([1, 2, 3, 4, 5]);
  const pulled: number[] = [];

  for await (const n of nums.pull({ strategy: { highWaterMark: 2 } })) {
    pulled.push(n);
  }

  expect(pulled).toEqual([1, 2, 3, 4, 5]);
});


////////////////////////////////////////////////////////////////////////////////
// 2) Simple async-iteration example
////////////////////////////////////////////////////////////////////////////////

test("Simple async-iteration example works", async () => {
  const result: string[] = [];

  for await (const x of Observable.of("a", "b", "c")) {
    result.push(x);
  }

  expect(result).toEqual(["a", "b", "c"]);
});

////////////////////////////////////////////////////////////////////////////////
// 3) Pull with strategy example
////////////////////////////////////////////////////////////////////////////////

test("Pull with highWaterMark strategy example works", async () => {
  const pulled: number[] = [];
  const nums = Observable.from([1, 2, 3, 4, 5]);

  for await (const n of nums.pull({ strategy: { highWaterMark: 2 } })) {
    pulled.push(n);
  }

  expect(pulled).toEqual([1, 2, 3, 4, 5]);
});

////////////////////////////////////////////////////////////////////////////////
// 4) Symbol.observable interop example
////////////////////////////////////////////////////////////////////////////////

test("Observable[Symbol.observable]() returns self", () => {
  const obs = Observable.of(42);
  const same = obs[Symbol.observable]();
  expect(same).toBe(obs);
});

////////////////////////////////////////////////////////////////////////////////
// 5) Symbol.dispose interop cleanup example
////////////////////////////////////////////////////////////////////////////////

test("Subscription[Symbol.dispose]() calls unsubscribe", () => {
  let cleaned = false;
  const obs = new Observable<number>(o => {
    const id = setInterval(() => o.next(0), 10);
    return () => {
      clearInterval(id);
      cleaned = true;
    };
  });

  const sub = obs.subscribe(() => { });
  // cleanup via Symbol.dispose
  sub[Symbol.dispose]();
  expect(cleaned).toBe(true);
  expect(sub.closed).toBe(true);
});

////////////////////////////////////////////////////////////////////////////////
// 6) Symbol.asyncDispose interop cleanup example
////////////////////////////////////////////////////////////////////////////////

test("Subscription[Symbol.asyncDispose]() calls unsubscribe", async () => {
  let cleaned = false;
  const obs = new Observable<number>(o => {
    const id = setTimeout(() => o.next(0), 10);
    return () => {
      clearTimeout(id);
      cleaned = true;
    };
  });

  const sub = obs.subscribe(() => { });
  // cleanup via Symbol.asyncDispose
  await sub[Symbol.asyncDispose]();
  expect(cleaned).toBe(true);
  expect(sub.closed).toBe(true);
});

test("teardown works when error/complete called before teardown function returned", () => {
  const log: string[] = [];

  // This is the critical test case - observer.error called BEFORE return
  new Observable(observer => {
    observer.error(new Error("test error"));
    log.push("after error"); // This should still run
    return () => {
      log.push("teardown called");
    };
  }).subscribe({
    error: () => log.push("error callback")
  });

  // Need to wait for microtask queue to flush
  // await new Promise(resolve => setTimeout(resolve, 0));

  expect(log).toEqual([
    "error callback",
    "after error",
    "teardown called"
  ]);
});

test("errors in next callback are forwarded to error handler", () => {
  const errorObj = new Error("next callback error");
  let caughtError = null;

  Observable.of(1).subscribe({
    next() { throw errorObj; },
    error(err) { caughtError = err; }
  });

  expect(caughtError).toBe(errorObj);
});

test("errors in error handler are reported to host", async () => {
  const errorObj = new Error("error in error handler");

  Observable.of(1).subscribe({
    next() { throw new Error("initial error"); },
    error() { throw errorObj; }
  });

  const unhandledError = await captureUnhandledOnce();
  expect(unhandledError).toBe(errorObj);
});