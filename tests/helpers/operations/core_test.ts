import { test, expect } from "@libs/testing";

import { Observable } from "../../../observable.ts";
import { map, filter, take, drop, tap, scan } from "../../../helpers/operations/core.ts";
import { ignoreErrors } from "../../../helpers/operations/errors.ts";
import { pipe } from "../../../helpers/pipe.ts";

// Helper to collect all values from an observable
async function collectValues<T>(obs: Observable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of obs) {
    values.push(value);
  }
  console.log("Collected values:", values);
  return values;
}

// -----------------------------------------------------------------------------
// map() operator tests
// -----------------------------------------------------------------------------

test("map transforms each value", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), map((x) => x * 2));

  const values = await collectValues(result);
  expect(values).toEqual([2, 4, 6]);
});

test("map provides index parameter", async () => {
  const source = Observable.of('a', 'b', 'c');
  const result = pipe(source, map((x, i) => `${x}${i}`));

  const values = await collectValues(result);
  expect(values).toEqual(['a0', 'b1', 'c2']);
});

// -----------------------------------------------------------------------------
// filter() operator tests
// -----------------------------------------------------------------------------

test("filter keeps only matching values", async () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const result = pipe(source, ignoreErrors(), filter((x: number) => x % 2 === 0));

  const values = await collectValues(result);
  expect(values).toEqual([2, 4]);
});

test("filter provides index parameter", async () => {
  const source = Observable.of('a', 'b', 'c', 'd');
  const result = pipe(source, ignoreErrors(), filter((_x: string, i: number) => i % 2 === 0));

  const values = await collectValues(result);
  expect(values).toEqual(['a', 'c']);
});

// -----------------------------------------------------------------------------
// take() operator tests
// -----------------------------------------------------------------------------

test("take limits number of values", async () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const result = pipe(source, ignoreErrors(), take(3));

  const values = await collectValues(result);
  expect(values).toEqual([1, 2, 3]);
});

test("take with count 0 emits no values", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), take(0));

  const values = await collectValues(result);
  expect(values).toEqual([]);
});

test("take with negative count emits no values", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), take(-1));

  const values = await collectValues(result);
  expect(values).toEqual([]);
});

// -----------------------------------------------------------------------------
// drop() operator tests
// -----------------------------------------------------------------------------

test("drop skips initial values", async () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const result = pipe(source, ignoreErrors(), drop(2));

  const values = await collectValues(result);
  expect(values).toEqual([3, 4, 5]);
});

test("drop with count 0 emits all values", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), drop(0));

  const values = await collectValues(result);
  expect(values).toEqual([1, 2, 3]);
});

test("drop more than available emits no values", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), drop(5));

  const values = await collectValues(result);
  expect(values).toEqual([]);
});

// -----------------------------------------------------------------------------
// tap() operator tests
// -----------------------------------------------------------------------------

test("tap executes side effect without changing values", async () => {
  const sideEffects: number[] = [];
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), tap((x: number) => {
    sideEffects.push(x * 10);
  }));

  const values = await collectValues(result);

  expect(values).toEqual([1, 2, 3]);
  expect(sideEffects).toEqual([10, 20, 30]);
});

// -----------------------------------------------------------------------------
// mapValue() operator tests
// -----------------------------------------------------------------------------

test("mapValue transforms only non-error values", async () => {
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, map(x => x * 2));

  const values = await collectValues(result);
  expect(values).toEqual([2, 4, 6]);
});

// -----------------------------------------------------------------------------
// filterValue() operator tests
// -----------------------------------------------------------------------------

test("filterValue filters only non-error values", async () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const result = pipe(source, filter((x) => x % 2 === 0));

  const values = await collectValues(result);
  expect(values).toEqual([2, 4]);
});

// -----------------------------------------------------------------------------
// takeValue() operator tests
// -----------------------------------------------------------------------------

test("takeValue limits only non-error values", async () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const result = pipe(source, take(3));

  const values = await collectValues(result);
  expect(values).toEqual([1, 2, 3]);
});

// -----------------------------------------------------------------------------
// dropValue() operator tests
// -----------------------------------------------------------------------------

test("dropValue skips only non-error values", async () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const result = pipe(source, ignoreErrors(), drop(2));

  const values = await collectValues(result);
  expect(values).toEqual([3, 4, 5]);
});

// -----------------------------------------------------------------------------
// tapValue() operator tests
// -----------------------------------------------------------------------------

test("tapValue executes side effects only on non-error values", async () => {
  const sideEffects: number[] = [];
  const source = Observable.of(1, 2, 3);
  const result = pipe(source, tap(x => {
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
  const result = pipe(source, scan((acc: number, value) => acc + value, 0));

  const values = await collectValues(result);
  expect(values).toEqual([0, 1, 3, 6, 10]); // seed + running sum
});
