/**
 * Observable creation and subscription benchmarks.
 * 
 * Measures overhead of Observable creation, subscription, and teardown
 * across various scenarios from simple to complex patterns.
 */

import { bench, run, do_not_optimize } from 'npm:mitata';
import { Observable } from '../observable.ts';
import { pipe } from '../helpers/pipe.ts';
import { map, filter, take } from '../helpers/operations/core.ts';

// Test data generation
function* numberGenerator(count: number) {
  for (let i = 0; i < count; i++) {
    yield i;
  }
}

// Arrange: Prepare test observables
const simpleObservable = new Observable<number>((observer) => {
  observer.next(42);
  observer.complete();
});

const rangeObservable = Observable.from(numberGenerator(1000));

bench('Observable.of(single value)', () => {
  // Act & Assert
  do_not_optimize(Observable.of(42));
});

bench('Observable.of(10 values)', () => {
  do_not_optimize(Observable.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10));
});

bench('Observable.from(array 100 items)', () => {
  const arr = Array.from({ length: 100 }, (_, i) => i);
  do_not_optimize(Observable.from(arr));
});

bench('Observable.from(generator 1000 items)', () => {
  do_not_optimize(Observable.from(numberGenerator(1000)));
}).gc('inner');

bench('new Observable (simple sync)', () => {
  do_not_optimize(
    new Observable<number>((observer) => {
      observer.next(42);
      observer.complete();
    })
  );
});

bench('new Observable (with cleanup)', () => {
  do_not_optimize(
    new Observable<number>((observer) => {
      observer.next(42);
      observer.complete();
      return () => {
        // Cleanup
      };
    })
  );
});

bench('subscribe + immediate complete', () => {
  const sub = simpleObservable.subscribe(() => {});
  do_not_optimize(sub);
  sub.unsubscribe();
});

bench('subscribe + collect 1000 values', async () => {
  const values: number[] = [];
  await new Promise<void>((resolve) => {
    rangeObservable.subscribe({
      next: (v) => values.push(v),
      complete: () => resolve(),
    });
  });
  do_not_optimize(values);
}).gc('inner');

bench('async iteration over 1000 values', async () => {
  const values: number[] = [];
  for await (const val of rangeObservable) {
    values.push(val);
  }
  do_not_optimize(values);
}).gc('inner');

bench('multiple subscribers (cold semantics)', () => {
  const obs = Observable.of(1, 2, 3);
  const sub1 = obs.subscribe(() => {});
  const sub2 = obs.subscribe(() => {});
  const sub3 = obs.subscribe(() => {});
  
  do_not_optimize([sub1, sub2, sub3]);
  
  sub1.unsubscribe();
  sub2.unsubscribe();
  sub3.unsubscribe();
});

bench('pipe with 3 operators', () => {
  const result = pipe(
    Observable.from(numberGenerator(100)),
    map((x: number) => x * 2),
    filter((x: number) => x % 4 === 0),
    take(10)
  );
  do_not_optimize(result);
});

await run();
