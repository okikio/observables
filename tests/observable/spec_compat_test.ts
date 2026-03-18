// deno-lint-ignore-file no-import-prefix
import { expect, test } from "jsr:@libs/testing@^5";

import { Observable } from "../../observable.ts";

/**
 * Test-only view of the proposal-facing `SubscriptionObserver` surface.
 *
 * This keeps the assertions focused on public observer behavior that upstream
 * suites care about, without coupling the tests to the concrete local class.
 */
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

test("SubscriptionObserver methods are no-ops after explicit unsubscribe", () => {
  let observer!: TC39SubscriptionObserver;
  let nextCalls = 0;
  let errorCalls = 0;
  let completeCalls = 0;

  const subscription = new Observable<number>((subscriptionObserver) => {
    observer = subscriptionObserver as unknown as TC39SubscriptionObserver;
  }).subscribe({
    next() {
      nextCalls++;
    },
    error() {
      errorCalls++;
    },
    complete() {
      completeCalls++;
    },
  });

  subscription.unsubscribe();

  expect(() => observer.next(1)).not.toThrow();
  expect(() => observer.error(new Error("ignored"))).not.toThrow();
  expect(() => observer.complete()).not.toThrow();

  expect(observer.closed).toBe(true);
  expect(nextCalls).toBe(0);
  expect(errorCalls).toBe(0);
  expect(completeCalls).toBe(0);
});

test("SubscriptionObserver methods are no-ops after completion", () => {
  let observer!: TC39SubscriptionObserver;
  let nextCalls = 0;
  let errorCalls = 0;
  let completeCalls = 0;

  new Observable<number>((subscriptionObserver) => {
    observer = subscriptionObserver as unknown as TC39SubscriptionObserver;
  }).subscribe({
    next() {
      nextCalls++;
    },
    error() {
      errorCalls++;
    },
    complete() {
      completeCalls++;
    },
  });

  observer.complete();
  observer.next(1);
  observer.error(new Error("ignored"));
  observer.complete();

  expect(observer.closed).toBe(true);
  expect(nextCalls).toBe(0);
  expect(errorCalls).toBe(0);
  expect(completeCalls).toBe(1);
});
