import { test, expect, fn } from "@libs/testing";

import { Observable } from "../../observable.ts";
import { Symbol } from "../../symbol.ts";

// -----------------------------------------------------------------------------
// Observable.from Tests with Real World Examples
// -----------------------------------------------------------------------------

test("Observable.from with an iterable object", () => {
  const results: string[] = [];
  const iterable = ["mercury", "venus", "earth"];

  Observable.from(iterable).subscribe({
    next(value) {
      results.push(value);
    },
    complete() {
      results.push("done");
    }
  });

  expect(results).toEqual(["mercury", "venus", "earth", "done"]);
});

test("Observable.from with Symbol.observable object", () => {
  const results: string[] = [];
  const observable = {
    [Symbol.observable]() {
      return new Observable<string>(observer => {
        // Simulate async behavior
        setTimeout(() => {
          observer.next("hello");
          observer.next("world");
          observer.complete();
        }, 0);

        return () => results.push("cleaned up");
      });
    }
  };

  const subscription = Observable.from(observable).subscribe({
    next(value) {
      results.push(value);
    },
    complete() {
      results.push("done");
    }
  });

  // Initially empty due to setTimeout
  expect(results).toEqual([]);

  // Wait for setTimeout to complete
  return new Promise<void>(resolve => {
    setTimeout(() => {
      expect(results).toEqual(["hello", "world", "done", "cleaned up"]);
      resolve();
    }, 10);
  });
});

test("Observable.from returns the same Observable if passed an Observable", () => {
  const original = new Observable(observer => { });
  const result = Observable.from(original);

  expect(result).toBe(original);
});

test("Observable.from with an async iterable", async () => {
  // Create an async iterable
  async function* asyncGenerator() {
    yield "async";
    yield "is";
    yield "awesome";
  }

  const asyncIterable = asyncGenerator();

  // Convert to Observable
  const observable = Observable.from(asyncIterable);

  // Collect results using for-await and AsyncIterator
  const results = [];
  for await (const value of observable) {
    results.push(value);
  }

  expect(results).toEqual(["async", "is", "awesome"]);
});