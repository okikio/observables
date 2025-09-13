import { test, expect } from "@libs/testing";

import { Observable } from "../../../observable.ts";
import { toArray, batch } from "../../../helpers/operations/batch.ts";
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

// -----------------------------------------------------------------------------
// toArray() operator tests
// -----------------------------------------------------------------------------

test("toArray collects all values into single array", async () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const result = pipe(source, ignoreErrors(), toArray());

  const values = await collectValues(result);

  expect(values).toHaveLength(1);
  expect(values[0]).toEqual([1, 2, 3, 4, 5]);
});

test("toArray handles empty stream", async () => {
  const source = new Observable<number>(observer => {
    observer.complete();
    return () => { };
  });

  const result = pipe(source, ignoreErrors(), toArray());
  const values = await collectValues(result);

  expect(values).toHaveLength(1);
  expect(values[0]).toEqual([]);
});

test("toArray with single value", async () => {
  const source = Observable.of(42);
  const result = pipe(source, ignoreErrors(), toArray());

  const values = await collectValues(result);

  expect(values).toHaveLength(1);
  expect(values[0]).toEqual([42]);
});

// -----------------------------------------------------------------------------
// batch() operator tests
// -----------------------------------------------------------------------------

test("batch groups values into fixed-size arrays", async () => {
  const source = Observable.of(1, 2, 3, 4, 5, 6, 7);
  const result = pipe(source, ignoreErrors(), batch(3));

  const values = await collectValues(result);

  expect(values).toEqual([
    [1, 2, 3],
    [4, 5, 6],
    [7] // Last batch can be smaller
  ]);
});

test("batch with size 1 emits individual values as arrays", async () => {
  const source = Observable.of('a', 'b', 'c');
  const result = pipe(source, ignoreErrors(), batch(1));

  const values = await collectValues(result);

  expect(values).toEqual([['a'], ['b'], ['c']]);
});

test("batch with size larger than stream emits single batch", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), batch(10));

  const values = await collectValues(result);

  expect(values).toEqual([[1, 2, 3]]);
});

test("batch with zero size emits empty arrays", () => {
  expect(() => {
    const source = Observable.of(1, 2, 3); 
    pipe(source, batch(0));
  }).toThrow("batch: size must be greater than 0");
});

test("batch handles empty stream", async () => {
  const source = new Observable<number>(observer => {
    observer.complete();
    return () => { };
  });

  const result = pipe(source, ignoreErrors(), batch(3));
  const values = await collectValues(result);

  expect(values).toEqual([]);
});
