/**
 * Low-latency benchmarks for primitive operations.
 *
 * These focus on fixed overhead rather than bulk throughput. The intent is to
 * measure the cost a caller pays for one subscription, one emission, or one
 * single-value operator hop.
 */

import { bench, do_not_optimize, run } from 'npm:mitata';

import { EventBus } from '../events.ts';
import { isObservableError } from '../error.ts';
import { Observable } from '../observable.ts';
import { pipe } from '../helpers/pipe.ts';
import { filter, map } from '../helpers/operations/core.ts';

const noEmissionObservable = new Observable<number>(() => {
  return () => {};
});

bench('Latency: subscribe + unsubscribe (no emissions)', () => {
  const subscription = noEmissionObservable.subscribe(() => {});
  subscription.unsubscribe();
  do_not_optimize(subscription);
  do_not_optimize(subscription.closed);
});

bench('Latency: Observable.of(1) -> subscribe', () => {
  let lastValue = 0;
  const subscription = Observable.of(1).subscribe((value) => {
    lastValue = value;
  });

  do_not_optimize(lastValue);
  subscription.unsubscribe();
});

bench('Latency: single value through map', () => {
  let lastValue = 0;
  const result = pipe(
    Observable.of(1),
    map((value: number) => value + 1),
  );

  const subscription = result.subscribe((value) => {
    if (!isObservableError(value)) {
      lastValue = value;
    }
  });

  do_not_optimize(lastValue);
  subscription.unsubscribe();
});

bench('Latency: single value through map + filter', () => {
  let lastValue = 0;
  const result = pipe(
    Observable.of(1),
    map((value: number) => value + 1),
    filter((value: number) => value > 1),
  );

  const subscription = result.subscribe((value) => {
    if (!isObservableError(value)) {
      lastValue = value;
    }
  });

  do_not_optimize(lastValue);
  subscription.unsubscribe();
});

// These bindings are shared across iterations for the warm-path emit benchmark.
// `latestEventBusValue`, `warmPathBus`, and `warmPathSub` stay outside the bench
// so the measurement isolates steady-state emit cost instead of mixing emit
// latency with repeated subscription setup.
let latestEventBusValue = 0;
const warmPathBus = new EventBus<number>();
const warmPathSub = warmPathBus.subscribe((value) => {
  latestEventBusValue = value;
});

bench('Latency: EventBus emit -> 1 subscriber', () => {
  warmPathBus.emit(7);
  do_not_optimize(latestEventBusValue);
});

await run();

warmPathSub.unsubscribe();
