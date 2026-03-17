/**
 * Event system benchmarks.
 *
 * Measures the hot path for EventBus multicast delivery and typed dispatcher
 * routing. Shared subscribers stay outside the bench callbacks on purpose so
 * the emit cases measure warm-path steady-state delivery rather than mixing in
 * subscription setup on every iteration.
 */

import { bench, do_not_optimize, run } from 'npm:mitata';

import { EventBus, createEventDispatcher } from '../events.ts';

let singleSubscriberValue = 0;
const singleSubscriberBus = new EventBus<number>();
const singleSubscriberSub = singleSubscriberBus.subscribe((value) => {
  singleSubscriberValue = value;
});

let tenSubscriberValue = 0;
const tenSubscriberBus = new EventBus<number>();
const tenSubscriberSubs = Array.from({ length: 10 }, (_, index) =>
  tenSubscriberBus.subscribe((value) => {
    tenSubscriberValue = value + index;
  })
);

let hundredSubscriberValue = 0;
const hundredSubscriberBus = new EventBus<number>();
const hundredSubscriberSubs = Array.from({ length: 100 }, (_, index) =>
  hundredSubscriberBus.subscribe((value) => {
    hundredSubscriberValue = value + index;
  })
);

const dispatcher = createEventDispatcher<{
  message: { id: number; text: string };
  status: { ok: boolean };
}>();

let dispatcherValue = 0;
const dispatcherSub = dispatcher.on('message', (payload) => {
  dispatcherValue = payload.id;
});

bench('Events: EventBus emit -> 1 subscriber', () => {
  singleSubscriberBus.emit(1);
  do_not_optimize(singleSubscriberValue);
});

bench('Events: EventBus emit -> 10 subscribers', () => {
  tenSubscriberBus.emit(10);
  do_not_optimize(tenSubscriberValue);
});

bench('Events: EventBus emit -> 100 subscribers', () => {
  hundredSubscriberBus.emit(100);
  do_not_optimize(hundredSubscriberValue);
});

bench('Events: typed dispatcher emit -> handler', () => {
  dispatcher.emit('message', { id: 42, text: 'ok' });
  do_not_optimize(dispatcherValue);
});

bench('Events: setup-inclusive bus + 1000 subscribe/unsubscribe cycles', () => {
  const bus = new EventBus<number>();
  const subscriptions = Array.from({ length: 1000 }, () => bus.subscribe(() => {}));

  for (const subscription of subscriptions) {
    subscription.unsubscribe();
  }

  do_not_optimize(subscriptions);
  do_not_optimize(bus);
}).gc('inner');

await run();

singleSubscriberSub.unsubscribe();
for (const subscription of tenSubscriberSubs) subscription.unsubscribe();
for (const subscription of hundredSubscriberSubs) subscription.unsubscribe();
dispatcherSub.unsubscribe();
dispatcher.close();
