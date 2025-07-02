import { test, expect } from "@libs/testing";

import { Observable } from "../../../observable.ts";
import { mapValue, filterValue, takeValue, dropValue, tapValue, scanValue } from "../../../helpers/operations/values.ts";
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
// mapValue() operator tests
// -----------------------------------------------------------------------------

test("mapValue transforms only non-error values", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, mapValue(x => x * 2));

  const values = await collectValues(result);
  expect(values).toEqual([2, 4, 6]);
});

// -----------------------------------------------------------------------------
// filterValue() operator tests
// -----------------------------------------------------------------------------

test("filterValue filters only non-error values", async () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const result = pipe(source, filterValue((x) => x % 2 === 0));

  const values = await collectValues(result);
  expect(values).toEqual([2, 4]);
});

// -----------------------------------------------------------------------------
// takeValue() operator tests
// -----------------------------------------------------------------------------

test("takeValue limits only non-error values", async () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const result = pipe(source, takeValue(3));

  const values = await collectValues(result);
  expect(values).toEqual([1, 2, 3]);
});

// -----------------------------------------------------------------------------
// dropValue() operator tests
// -----------------------------------------------------------------------------

test("dropValue skips only non-error values", async () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const result = pipe(source, ignoreErrors(), dropValue(2));

  const values = await collectValues(result);
  expect(values).toEqual([3, 4, 5]);
});

// -----------------------------------------------------------------------------
// tapValue() operator tests
// -----------------------------------------------------------------------------

test("tapValue executes side effects only on non-error values", async () => {
  const sideEffects: number[] = [];
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, tapValue(x => {
    sideEffects.push(x * 10);
  }));

  const values = await collectValues(result);

  expect(values).toEqual([1, 2, 3]);
  expect(sideEffects).toEqual([10, 20, 30]);
});

// -----------------------------------------------------------------------------
// scanValue() operator tests
// -----------------------------------------------------------------------------

test("scanValue accumulates only non-error values", async () => {
  const source = Observable.of(1, 2, 3, 4);
  const result = pipe(source, scanValue((acc: number, value) => acc + value, 0));

  const values = await collectValues(result);
  expect(values).toEqual([0, 1, 3, 6, 10]); // seed + running sum
});
