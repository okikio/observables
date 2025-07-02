import { test, expect } from "@libs/testing";

import { Observable } from "../../../observable.ts";

// Helper to collect all values from an observable
async function collectValues<T>(obs: Observable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of obs) {
    values.push(value);
  }
  return values;
}

// -----------------------------------------------------------------------------
// Basic error handling tests
// -----------------------------------------------------------------------------

test("Observable handles simple values", async () => {
  const source = Observable.of(1, 2, 3);
  const values = await collectValues(source);
  expect(values).toEqual([1, 2, 3]);
});

test("Observable handles empty stream", async () => {
  const source = new Observable<number>(observer => {
    observer.complete();
    return () => { };
  });

  const values = await collectValues(source);
  expect(values).toEqual([]);
});

test("Observable handles single value", async () => {
  const source = Observable.of(42);
  const values = await collectValues(source);
  expect(values).toEqual([42]);
});
