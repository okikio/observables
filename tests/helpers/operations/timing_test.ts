import { test, expect } from "@libs/testing";
import { delay as stdDelay } from "@std/async";

import { Observable } from "../../../observable.ts";
import { delay, debounce, throttle } from "../../../helpers/operations/timing.ts";
import { ignoreErrors } from "../../../helpers/operations/errors.ts";
import { pipe } from "../../../helpers/pipe.ts";

// Helper to collect all values from an observable
async function collectValues<T>(obs: Observable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of obs) {
    values.push(value);
  }
  return values;
}

// Helper to measure timing
function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  return fn().then(result => ({
    result,
    duration: Date.now() - start
  }));
}

// -----------------------------------------------------------------------------
// delay() operator tests
// -----------------------------------------------------------------------------

test("delay postpones emission by specified time", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, delay(100));

  const [{ result: values, duration }] = await Promise.all([
    measureTime(() => collectValues(result)),
    stdDelay(500)
  ]);

  expect(values).toEqual([1, 2, 3]);
  expect(duration).toBeGreaterThanOrEqual(100);
  expect(duration).toBeLessThan(200); // Allow some margin
});

test("delay with zero time emits immediately", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), delay(0));

  const [{ result: values, duration }] = await Promise.all([
    measureTime(() => collectValues(result)),
    stdDelay(500)
  ]);

  expect(values).toEqual([1, 2, 3]);
  expect(duration).toBeLessThan(50); // Should be very fast
});

// -----------------------------------------------------------------------------
// debounce() operator tests
// -----------------------------------------------------------------------------

test("debounce emits last value after quiet period", async () => {
  // Create a source that emits values with timing
  const source = new Observable<number>(observer => {
    observer.next(1);
    setTimeout(() => observer.next(2), 50);
    setTimeout(() => observer.next(3), 100);
    setTimeout(() => observer.complete(), 200);
    return () => { };
  });

  const result = pipe(source, ignoreErrors(), debounce(75));
  const values = await collectValues(result);

  // Should only emit the last value (3) since it's followed by completion
  expect(values).toEqual([3]);
});

// -----------------------------------------------------------------------------
// throttle() operator tests
// -----------------------------------------------------------------------------

test("throttle limits emission rate", async () => {
  // Create a source that emits values rapidly
  const source = new Observable<number>(observer => {
    observer.next(1);
    setTimeout(() => observer.next(2), 10);
    setTimeout(() => observer.next(3), 20);
    setTimeout(() => observer.next(4), 30);
    setTimeout(() => observer.complete(), 150);
    return () => { };
  });

  const result = pipe(source, ignoreErrors(), throttle(50));
  const values = await collectValues(result);

  // Should throttle to fewer values than input
  expect(values.length).toBeLessThanOrEqual(3);
  expect(values[0]).toBe(1); // First value should always pass through
});
