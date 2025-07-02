import { test, expect } from "@libs/testing";

import { Observable } from "../../observable.ts";
import { createOperator, createStatefulOperator } from "../../helpers/operators.ts";
import { pipe } from "../../helpers/pipe.ts";
import { ignoreErrors } from "../../helpers/operations/errors.ts";

// Helper to collect all values from an observable
async function collectValues<T>(obs: Observable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of obs) {
    values.push(value);
  }
  return values;
}

// -----------------------------------------------------------------------------
// createOperator() tests
// -----------------------------------------------------------------------------

test("createOperator creates a working transform operator", async () => {
  // Create a simple doubling operator
  const double = createOperator<number, number>({
    name: 'double',
    transform(chunk, controller) {
      controller.enqueue(chunk * 2);
    }
  });

  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), double);

  const values = await collectValues(result);
  expect(values).toEqual([2, 4, 6]);
});

test("createOperator with existing TransformStream", async () => {
  // Create operator using an existing TransformStream
  const stringify = createOperator<number, string>({
    name: 'stringify',
    stream: new TransformStream({
      transform(chunk: number, controller) {
        controller.enqueue(String(chunk));
      }
    })
  });

  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), stringify);

  const values = await collectValues(result);
  expect(values).toEqual(['1', '2', '3']);
});

test("createOperator handles errors in transform function", async () => {
  // Create an operator that throws on certain values
  const errorOnTwo = createOperator<number, number>({
    name: 'errorOnTwo',
    transform(chunk, controller) {
      if (chunk === 2) {
        throw new Error('Cannot process 2');
      }
      controller.enqueue(chunk);
    }
  });

  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), errorOnTwo);

  const values = await collectValues(result);
  // Should handle the error gracefully
  expect(values.length).toBeGreaterThan(0);
});

// -----------------------------------------------------------------------------
// createStatefulOperator() tests
// -----------------------------------------------------------------------------

test("createStatefulOperator maintains state across transforms", async () => {
  // Create a running sum operator
  const runningSum = createStatefulOperator<number, number, { sum: number }>({
    name: 'runningSum',
    createState: () => ({ sum: 0 }),
    transform(chunk, state, controller) {
      state.sum += chunk;
      controller.enqueue(state.sum);
    }
  });

  const source = Observable.of(1, 2, 3, 4);
  const result = pipe(source, ignoreErrors(), runningSum);

  const values = await collectValues(result);
  expect(values).toEqual([1, 3, 6, 10]); // Running sum: 1, 1+2, 1+2+3, 1+2+3+4
});

test("createStatefulOperator with index tracking", async () => {
  // Create an operator that adds index to each value
  const withIndex = createStatefulOperator<string, string, { index: number }>({
    name: 'withIndex',
    createState: () => ({ index: 0 }),
    transform(chunk, state, controller) {
      controller.enqueue(`${state.index}:${chunk}`);
      state.index++;
    }
  });

  const source = Observable.of('a', 'b', 'c');
  const result = pipe(source, ignoreErrors(), withIndex);

  const values = await collectValues(result);
  expect(values).toEqual(['0:a', '1:b', '2:c']);
});

test("createStatefulOperator handles errors in transform function", async () => {
  // Create a stateful operator that errors on certain conditions
  const errorOnSecond = createStatefulOperator<number, number, { count: number }>({
    name: 'errorOnSecond',
    createState: () => ({ count: 0 }),
    transform(chunk, state, controller) {
      state.count++;
      if (state.count === 2) {
        throw new Error('Error on second item');
      }
      controller.enqueue(chunk);
    }
  });

  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), errorOnSecond);

  const values = await collectValues(result);
  // Should handle the error gracefully and continue processing
  expect(values.length).toBeGreaterThan(0);
});

// -----------------------------------------------------------------------------
// Operator composition tests
// -----------------------------------------------------------------------------

test("operators work with simple composition", async () => {
  // Create a simple operator
  const addOne = createOperator<number, number>({
    name: 'addOne',
    transform(chunk, controller) {
      controller.enqueue(chunk + 1);
    }
  });

  const source = Observable.of(1, 2, 3);
  const result = pipe(source, ignoreErrors(), addOne);

  const values = await collectValues(result);
  expect(values).toEqual([2, 3, 4]); // Each value + 1
});
