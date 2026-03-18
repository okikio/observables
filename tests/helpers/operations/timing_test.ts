// deno-lint-ignore-file no-import-prefix
import type { ObservableError } from "../../../error.ts";
import { expect, test } from "jsr:@libs/testing@^5";
import { delay as stdDelay } from "jsr:@std/async@^1";

import { isObservableError } from "../../../error.ts";
import { createOperator } from "../../../helpers/operators.ts";
import { Observable, pull } from "../../../observable.ts";
import {
  debounce,
  delay,
  throttle,
  timeout,
} from "../../../helpers/operations/timing.ts";
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

async function collectValuesAllowErrors<T>(
  obs: Observable<T>,
): Promise<Array<T | ObservableError>> {
  const values: Array<T | ObservableError> = [];
  for await (const value of pull(obs, { throwError: false })) {
    values.push(value);
  }
  return values;
}

// Helper to measure timing
function measureTime<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  return fn().then((result) => ({
    result,
    duration: Date.now() - start,
  }));
}

// -----------------------------------------------------------------------------
// delay() operator tests
// -----------------------------------------------------------------------------

const SLOW_PROMISE_DELAY_MS = 50;
const LEAK_SETTLE_BUFFER_MS = 10;

test("delay postpones emission by specified time", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, delay(100));

  const [{ result: values, duration }] = await Promise.all([
    measureTime(() => collectValues(result)),
    stdDelay(500),
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
    stdDelay(500),
  ]);

  expect(values).toEqual([1, 2, 3]);
  expect(duration).toBeLessThan(50); // Should be very fast
});

// -----------------------------------------------------------------------------
// debounce() operator tests
// -----------------------------------------------------------------------------

test("debounce emits last value after quiet period", async () => {
  // Create a source that emits values with timing
  const source = new Observable<number>((observer) => {
    observer.next(1);
    setTimeout(() => observer.next(2), 50);
    setTimeout(() => observer.next(3), 100);
    setTimeout(() => observer.complete(), 200);
    return () => {};
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
  const source = new Observable<number>((observer) => {
    observer.next(1);
    setTimeout(() => observer.next(2), 10);
    setTimeout(() => observer.next(3), 20);
    setTimeout(() => observer.next(4), 30);
    setTimeout(() => observer.complete(), 150);
    return () => {};
  });

  const result = pipe(source, ignoreErrors(), throttle(50));
  const values = await collectValues(result);

  // Should throttle to fewer values than input
  expect(values.length).toBeLessThanOrEqual(3);
  expect(values[0]).toBe(1); // First value should always pass through
});

test("timeout resolves promise-like chunks before the deadline", async () => {
  const source = Observable.of(1);
  const resolveQuickly = createOperator<
    number | ObservableError,
    Promise<number> | ObservableError
  >({
    name: "resolveQuickly",
    transform(chunk, controller) {
      if (isObservableError(chunk)) {
        controller.enqueue(chunk);
        return;
      }
      controller.enqueue(Promise.resolve(chunk));
    },
  });
  const result = pipe(source, resolveQuickly, timeout<number>(50));
  const values = await collectValues(result);

  expect(values).toEqual([1]);
});

test("timeout emits an ObservableError when a promise-like chunk is too slow", async () => {
  const source = Observable.of(1);
  const resolveSlowly = createOperator<
    number | ObservableError,
    Promise<number> | ObservableError
  >({
    name: "resolveSlowly",
    transform(chunk, controller) {
      if (isObservableError(chunk)) {
        controller.enqueue(chunk);
        return;
      }
      controller.enqueue(
        new Promise<number>((resolve) =>
          setTimeout(() => resolve(chunk), SLOW_PROMISE_DELAY_MS)
        ),
      );
    },
  });
  const result = pipe(source, resolveSlowly, timeout<number>(10));
  const values = await collectValuesAllowErrors(result);

  expect(values).toHaveLength(1);
  expect(isObservableError(values[0])).toBe(true);

  if (isObservableError(values[0])) {
    expect(values[0].operator).toBe("operator:timeout");
    expect(values[0].message).toContain("timed out");
  }

  // Let the intentionally slow upstream promise finish so --trace-leaks does
  // not report its still-pending timer after timeout() has already emitted.
  await stdDelay(SLOW_PROMISE_DELAY_MS + LEAK_SETTLE_BUFFER_MS);
});
