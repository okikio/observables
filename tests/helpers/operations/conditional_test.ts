import { test, expect } from "@libs/testing";

import { Observable } from "../../../observable.ts";
import { every, some, find } from "../../../helpers/operations/conditional.ts";
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
// every() operator tests
// -----------------------------------------------------------------------------

test("every returns true when all values match predicate", async () => {
  const source = Observable.of(2, 4, 6, 8);
  const result = pipe(source, ignoreErrors(), every((x: number) => x % 2 === 0));

  const values = await collectValues(result);

  expect(values).toEqual([true]);
});

test("every returns false when any value fails predicate", async () => {
  const source = Observable.of(2, 4, 5, 8);
  const result = pipe(source, ignoreErrors(), every((x: number) => x % 2 === 0));

  const values = await collectValues(result);

  expect(values).toEqual([false]);
});

test("every returns true for empty stream", async () => {
  const source = new Observable<number>(observer => {
    observer.complete();
    return () => { };
  });

  const result = pipe(source, ignoreErrors(), every((x: number) => x > 0));
  const values = await collectValues(result);

  expect(values).toEqual([true]);
});

test("every provides index parameter", async () => {
  const source = Observable.of(0, 1, 2, 3);
  const result = pipe(source, ignoreErrors(), every((x: number, i: number) => x === i));

  const values = await collectValues(result);

  expect(values).toEqual([true]);
});

// -----------------------------------------------------------------------------
// some() operator tests
// -----------------------------------------------------------------------------

test("some returns true when any value matches predicate", async () => {
  const source = Observable.of(1, 3, 4, 7);
  const result = pipe(source, ignoreErrors(), some((x: number) => x % 2 === 0));

  const values = await collectValues(result);

  expect(values).toEqual([true]);
});

test("some returns false when no values match predicate", async () => {
  const source = Observable.of(1, 3, 5, 7);
  const result = pipe(source, ignoreErrors(), some((x: number) => x % 2 === 0));

  const values = await collectValues(result);

  expect(values).toEqual([false]);
});

test("some returns false for empty stream", async () => {
  const source = new Observable<number>(observer => {
    observer.complete();
    return () => { };
  });

  const result = pipe(source, ignoreErrors(), some((x: number) => x > 0));
  const values = await collectValues(result);

  expect(values).toEqual([false]);
});

test("some provides index parameter", async () => {
  const source = Observable.of(5, 5, 2, 5);
  const result = pipe(source, ignoreErrors(), some((x: number, i: number) => x === i));

  const values = await collectValues(result);

  expect(values).toEqual([true]); // x=2, i=2 at index 2
});

// -----------------------------------------------------------------------------
// find() operator tests
// -----------------------------------------------------------------------------

test("find returns first matching value", async () => {
  const source = Observable.of(1, 3, 4, 6, 8);
  const result = pipe(source, ignoreErrors(), find((x) => x % 2 === 0));

  const values = await collectValues(result);

  expect(values).toEqual([4]); // First even number
});

test("find returns no value when nothing matches", async () => {
  const source = Observable.of(1, 3, 5, 7);
  const result = pipe(source, ignoreErrors(), find((x: number) => x % 2 === 0));

  const values = await collectValues(result);

  expect(values).toEqual([]); // No even numbers found
});

test("find returns no value for empty stream", async () => {
  const source = new Observable<number>(observer => {
    observer.complete();
    return () => { };
  });

  const result = pipe(source, ignoreErrors(), find((x: number) => x > 0));
  const values = await collectValues(result);

  expect(values).toEqual([]);
});

test("find provides index parameter", async () => {
  const source = Observable.of('a', 'b', 'c', 'd');
  const result = pipe(source, ignoreErrors(), find((_x: string, i: number) => i === 2));

  const values = await collectValues(result);

  expect(values).toEqual(['c']); // Value at index 2
});
