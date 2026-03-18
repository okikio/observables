/**
 * Operator pipeline benchmarks.
 * 
 * Measures performance of various operator combinations that represent
 * real-world Observable usage patterns.
 */

import { bench, run, do_not_optimize } from 'npm:mitata';
import { Observable } from '../observable.ts';
import { isObservableError } from '../error.ts';
import { pipe } from '../helpers/pipe.ts';
import { map, filter, scan, take, tap } from '../helpers/operations/core.ts';
import { debounce, delay, throttle } from '../helpers/operations/timing.ts';
import { batch, toArray } from '../helpers/operations/batch.ts';

function* numberStream(count: number) {
  for (let i = 0; i < count; i++) {
    yield i;
  }
}

bench('Operators: map only (1000 items)', async () => {
  const result = pipe(
    Observable.from(numberStream(1000)),
    map((x: number) => x * 2)
  );
  
  const values: number[] = [];
  for await (const val of result) {
    if (!isObservableError(val)) values.push(val);
  }
  
  do_not_optimize(values);
}).gc('inner');

bench('Operators: filter only (1000 items)', async () => {
  const result = pipe(
    Observable.from(numberStream(1000)),
    filter((x: number) => x % 2 === 0)
  );
  
  const values: number[] = [];
  for await (const val of result) {
    if (!isObservableError(val)) values.push(val);
  }
  
  do_not_optimize(values);
}).gc('inner');

bench('Operators: map + filter chain', async () => {
  const result = pipe(
    Observable.from(numberStream(1000)),
    map((x: number) => x * 2),
    filter((x: number) => x % 4 === 0),
    map((x: number) => x / 2)
  );
  
  const values: number[] = [];
  for await (const val of result) {
    if (!isObservableError(val)) values.push(val);
  }
  
  do_not_optimize(values);
}).gc('inner');

bench('Operators: map + filter + take', async () => {
  const result = pipe(
    Observable.from(numberStream(10000)),
    map((x: number) => x * 2),
    filter((x: number) => x % 4 === 0),
    take(100)
  );
  
  const values: number[] = [];
  for await (const val of result) {
    if (!isObservableError(val)) values.push(val);
  }
  
  do_not_optimize(values);
});

bench('Operators: scan (running sum)', async () => {
  const result = pipe(
    Observable.from(numberStream(1000)),
    scan((acc: number, val: number) => acc + val, 0)
  );
  
  const values: number[] = [];
  for await (const val of result) {
    if (!isObservableError(val)) values.push(val);
  }
  
  do_not_optimize(values);
}).gc('inner');

bench('Operators: complex chain (5 operators)', async () => {
  const result = pipe(
    Observable.from(numberStream(1000)),
    map((x: number) => x * 2),
    filter((x: number) => x % 4 === 0),
    scan((acc: number, val: number) => acc + val, 0),
    map((x: number) => x / 100),
    take(500)
  );
  
  const values: number[] = [];
  for await (const val of result) {
    if (!isObservableError(val)) values.push(val);
  }
  
  do_not_optimize(values);
}).gc('inner');

bench('Operators: tap (side effects)', async () => {
  let sideEffectCount = 0;
  
  const result = pipe(
    Observable.from(numberStream(1000)),
    tap(() => { sideEffectCount++; }),
    map((x: number) => x * 2)
  );
  
  const values: number[] = [];
  for await (const val of result) {
    if (!isObservableError(val)) values.push(val);
  }
  
  do_not_optimize({ values, sideEffectCount });
}).gc('inner');

bench('Operators: batch (groups of 10)', async () => {
  const result = pipe(
    Observable.from(numberStream(1000)),
    batch(10)
  );
  
  const batches: number[][] = [];
  for await (const batch of result) {
    if (!isObservableError(batch)) batches.push(batch);
  }
  
  do_not_optimize(batches);
}).gc('inner');

bench('Operators: toArray collector', async () => {
  const result = pipe(
    Observable.from(numberStream(1000)),
    map((x: number) => x * 2),
    toArray()
  );
  
  const arrays: number[][] = [];
  for await (const arr of result) {
    if (!isObservableError(arr)) arrays.push(arr);
  }
  
  do_not_optimize(arrays);
}).gc('inner');

bench('Operators: deep chain (10 operators)', async () => {
  const result = pipe(
    Observable.from(numberStream(1000)),
    map((x: number) => x + 1),
    filter((x: number) => x % 2 === 0),
    map((x: number) => x * 2),
    filter((x: number) => x < 5000),
    scan((acc: number, val: number) => acc + val, 0),
    map((x: number) => x / 10),
    filter((x: number) => x > 0),
    map((x: number) => Math.floor(x)),
    take(100),
    tap(() => {})
  );
  
  const values: number[] = [];
  for await (const val of result) {
    if (!isObservableError(val)) values.push(val);
  }
  
  do_not_optimize(values);
}).gc('inner');

await run();
