// deno-lint-ignore-file no-import-prefix
import { expect, test } from "jsr:@libs/testing@^5";

import { Observable } from "../../observable.ts";

type TC39SubscriptionObserver = {
  next: (...args: unknown[]) => unknown;
  complete: (...args: unknown[]) => unknown;
  error: (...args: unknown[]) => unknown;
  closed: boolean;
};

test("SubscriptionObserver.next forwards only the first argument", () => {
  let observer!: TC39SubscriptionObserver;
  let received: unknown[] = [];

  new Observable<number>((subscriptionObserver) => {
    observer = subscriptionObserver as unknown as TC39SubscriptionObserver;
  }).subscribe({
    next(...args: unknown[]) {
      received = args;
    },
  });

  const result = observer.next(1, 2, 3);

  expect(received).toEqual([1]);
  expect(result).toBe(undefined);
});

test("SubscriptionObserver.complete ignores extra arguments and only runs once", () => {
  let observer!: TC39SubscriptionObserver;
  const calls: unknown[][] = [];

  new Observable<number>((subscriptionObserver) => {
    observer = subscriptionObserver as unknown as TC39SubscriptionObserver;
  }).subscribe({
    complete(...args: unknown[]) {
      calls.push(args);
    },
  });

  observer.complete("first");
  observer.complete("second");

  expect(calls).toEqual([[]]);
  expect(observer.closed).toBe(true);
});

test("SubscriptionObserver.error closes before invoking the error handler", () => {
  let observer!: TC39SubscriptionObserver;
  let closedDuringError = false;
  let argsLength = -1;

  new Observable<number>((subscriptionObserver) => {
    observer = subscriptionObserver as unknown as TC39SubscriptionObserver;
  }).subscribe({
    error(...args: unknown[]) {
      closedDuringError = observer.closed;
      argsLength = args.length;
    },
  });

  observer.error(new Error("boom"), "ignored");

  expect(closedDuringError).toBe(true);
  expect(argsLength).toBe(1);
  expect(observer.closed).toBe(true);
});

test("Reusing the same observer object does not tear down an existing subscription", () => {
  let teardownCount = 0;

  const source = new Observable<number>(() => {
    return () => {
      teardownCount++;
    };
  });

  const observer = {
    next() {},
  };

  const subscription = source.subscribe(observer);
  Observable.of().subscribe(observer);

  expect(teardownCount).toBe(0);

  subscription.unsubscribe();

  expect(teardownCount).toBe(1);
});
