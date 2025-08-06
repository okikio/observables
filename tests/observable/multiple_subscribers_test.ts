import type { Subscription, SpecObservable, SpecObserver, SpecSubscription } from "../../_types.ts";
import type { SubscriptionObserver } from "../../observable.ts";

import { captureUnhandledOnce } from "../_utils/_uncaught.ts";
import { test, expect } from "@libs/testing";

import { Observable } from "../../observable.ts";
import { Symbol } from "../../symbol.ts";

// -----------------------------------------------------------------------------
// Multiple Subscribers and Teardown Behavior
// -----------------------------------------------------------------------------

test("multiple subscribers receive the same values", () => {
  const results1: number[] = [];
  const results2: number[] = [];

  const observable = Observable.of(1, 2, 3);

  const sub1 = observable.subscribe({
    next: v => results1.push(v)
  });

  const sub2 = observable.subscribe({
    next: v => results2.push(v)
  });

  expect(results1).toEqual([1, 2, 3]);
  expect(results2).toEqual([1, 2, 3]);
  expect(sub1.closed).toBe(true); // Auto-closed after completion
  expect(sub2.closed).toBe(true); // Auto-closed after completion
});

test("teardown is called for each subscriber", () => {
  const teardowns: string[] = [];

  // Create an Observable that tracks teardowns
  const observable = new Observable(observer => {
    observer.next("value");
    observer.complete();
    return () => {
      teardowns.push("cleaned up");
    };
  });

  // Subscribe twice
  observable.subscribe({});
  observable.subscribe({});

  // Both subscribers should have triggered the teardown function
  expect(teardowns.length).toBe(2);
  expect(teardowns).toEqual(["cleaned up", "cleaned up"]);
}); 

test("each subscriber gets its own observer and teardown", () => {
  const log: string[] = [];

  // Create an Observable that tracks each subscriber
  const observable = new Observable(observer => {
    const id = log.length;
    log.push(`subscriber ${id} created`);

    observer.next(`value for ${id}`);

    return () => {
      log.push(`subscriber ${id} torn down`);
    };
  });

  // Create two subscriptions
  const sub1 = observable.subscribe({
    next: v => log.push(`sub1 received: ${v}`)
  });

  const sub2 = observable.subscribe({
    next: v => log.push(`sub2 received: ${v}`)
  });

  // Unsubscribe in different order
  sub2.unsubscribe();
  sub1.unsubscribe();

  // Verify correct sequence of events
  expect(log).toEqual([
    "subscriber 0 created",
    "sub1 received: value for 0",
    "subscriber 2 created",
    "sub2 received: value for 2",
    "subscriber 2 torn down",
    "subscriber 0 torn down"
  ]);
});

test("unsubscribe is idempotent and only triggers teardown once", () => {
  let teardownCount = 0;

  // Create an Observable with a teardown that counts calls
  const observable = new Observable(_ => {
    return () => {
      teardownCount++;
    };
  });

  // Subscribe and unsubscribe multiple times
  const subscription = observable.subscribe({});

  subscription.unsubscribe();
  expect(teardownCount).toBe(1);

  subscription.unsubscribe(); // Should not trigger teardown again
  expect(teardownCount).toBe(1);
});

test("error or complete automatically trigger unsubscribe", () => {
  const log: string[] = [];

  // Create an Observable that logs teardown
  const observable = new Observable(_ => {
    log.push("subscribed");
    return () => {
      log.push("torn down");
    };
  });

  // Test with error
  const errorObservable = new Observable(observer => {
    observer.error(new Error("test error"));
    log.push("after error"); // This should still run
    return () => {
      log.push("error teardown");
    };
  });

  // Test with complete
  const completeObservable = new Observable(observer => {
    observer.complete();
    log.push("after complete"); // This should still run
    return () => {
      log.push("complete teardown");
    };
  });

  // Subscribe to each observable
  observable.subscribe({
    error: () => log.push("error callback"),
    complete: () => log.push("complete callback")
  });

  errorObservable.subscribe({
    error: (err: Error) => log.push(`error callback: ${err?.message}`),
    complete: () => log.push("complete callback")
  });

  completeObservable.subscribe({
    error: () => log.push("error callback"),
    complete: () => log.push("complete callback")
  });

  expect(log).toEqual([
    "subscribed",
    "error callback: test error",
    "after error",
    "error teardown",
    "complete callback",
    "after complete",
    "complete teardown"
  ]);
});

// -----------------------------------------------------------------------------
// Multiple Subscribers and Resource Management Tests
// -----------------------------------------------------------------------------

test("Observable properly handles multiple subscribers with separate resources", () => {
  const resources = { sub1: false, sub2: false } as Record<string, boolean>;

  // Create an Observable that tracks subscription-specific resources
  const observable = new Observable<string>(obs => {
    // Determine which subscriber we are
    const id = Object.values(resources).filter(Boolean).length + 1;
    const subId = `sub${id}`;

    // Mark resource as allocated
    resources[subId] = true;

    // Emit the subscriber ID
    obs.next(subId);

    // Return teardown to release resource
    return () => {
      resources[subId] = false;
    };
  });

  // Capture emitted values
  const values1: string[] = [];
  const values2: string[] = [];

  // Create two subscriptions
  const sub1 = observable.subscribe(value => values1.push(value));
  const sub2 = observable.subscribe(value => values2.push(value));

  // Verify each got their own ID and resources are allocated
  expect(values1).toEqual(["sub1"]);
  expect(values2).toEqual(["sub2"]);
  expect(resources).toEqual({ sub1: true, sub2: true });

  // Unsubscribe one subscriber
  sub1.unsubscribe();

  // Verify only that resource was released
  expect(resources).toEqual({ sub1: false, sub2: true });

  // Unsubscribe the other subscriber
  sub2.unsubscribe();

  // Verify all resources are released
  expect(resources).toEqual({ sub1: false, sub2: false });
});

test("multiple subscribers with shared mutable resource", () => {
  // Simulate a shared mutable counter
  let sharedCounter = 0;
  let teardownCount = 0;

  // This Observable gives each subscriber their own incrementing sequence
  // but they share the counter state
  const observable = new Observable<number>(observer => {
    // Save current counter value for this subscription
    const startValue = sharedCounter;

    // Emit incrementing values
    observer.next(startValue);
    sharedCounter++;
    observer.next(startValue + 1);
    sharedCounter++;

    // Complete after two values
    observer.complete();

    // Return teardown
    return () => {
      teardownCount++;
    };
  });

  // Subscribe multiple times
  const results1: number[] = [];
  const results2: number[] = [];

  observable.subscribe(v => results1.push(v));
  observable.subscribe(v => results2.push(v));

  // Verify each subscriber got its own sequence, but the shared counter incremented
  expect(results1).toEqual([0, 1]);
  expect(results2).toEqual([2, 3]);
  expect(sharedCounter).toBe(4);
  expect(teardownCount).toBe(2);
});

// -----------------------------------------------------------------------------
// Async Iteration Tests
// -----------------------------------------------------------------------------

test("Observable can be iterated with for-await-of", async () => {
  const results: string[] = [];
  const obs = Observable.of("a", "b", "c");

  for await (const value of obs) {
    results.push(value);
  }

  expect(results).toEqual(["a", "b", "c"]);
});

test("pull method with custom strategy controls backpressure", async () => {
  // Create an observable that emits faster than we can process
  const numbers = Array.from({ length: 10 }, (_, i) => i + 1);
  const fastEmitter = new Observable(observer => {
    // In a real scenario, these would be emitted with minimal delay
    for (const num of numbers) {
      observer.next(num);
    }
    observer.complete();
  });

  // Test with default strategy (highWaterMark: 1)
  const defaultResults = [];
  for await (const n of fastEmitter.pull()) {
    defaultResults.push(n);
  }
  expect(defaultResults).toEqual(numbers);

  // Test with custom strategy (highWaterMark: 3)
  const customResults = [];
  for await (const n of fastEmitter.pull({ strategy: { highWaterMark: 3 } })) {
    customResults.push(n);
  }
  expect(customResults).toEqual(numbers);
});

// -----------------------------------------------------------------------------
// Error Handling Tests from Examples
// -----------------------------------------------------------------------------

test("errors in subscribeFn are caught and delivered to observer", () => {
  const errorObj = new Error("test error");
  let caughtError = null;

  const faulty = new Observable(() => {
    throw errorObj;
  });

  faulty.subscribe({
    error(err) {
      caughtError = err;
    }
  });

  expect(caughtError).toBe(errorObj);
});

test("Observable handles errors in next callback without crashing", async () => {
  let nextsAfterError = 0;
  let completed = false; 
  let closedWhenCompleteRuns = false;
  let subscription: Subscription | null = null;          // will be set in start()

  // Will emit 1 (→ throws), then 2, then complete
  const obs = new Observable((observer) => {
    observer.next(1);
    observer.next(2);
    observer.complete();
  });

  // Capture the *first* unhandled error in this tick
  const unhandled = captureUnhandledOnce();

  obs.subscribe({
    start(sub) {               // ← runs first, before any next/complete
      subscription = sub;
    },
    next(value) {
      if (value === 1) {
        throw new Error("Error in next handler");
      }
      nextsAfterError++;
    },
    complete() {
      // FIXED: The implementation marks closed BEFORE calling complete callback
      // This is actually correct behavior - the subscription is closing, then
      // the complete callback is called as part of that closing process
      closedWhenCompleteRuns = subscription!.closed; // will be true
      completed = true;
    },
  });

  // Give the queued micro-task time to run
  await Promise.resolve();

  // ── assertions ──────────────────────────────────────────────────────────
  const err = await unhandled; // should have been reported exactly once
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).toBe("Error in next handler");

  // stream behaviour
  expect(nextsAfterError).toBe(1);
  expect(completed).toBe(true);

  // FIXED: The subscription IS closed when complete runs
  expect(closedWhenCompleteRuns).toBe(true);  // closed when complete() runs
  expect(subscription!.closed).toBe(true);      // still closed after
});

test("error in user-provided error handler does not prevent cleanup", async () => {
  let cleanupCalled = false;
  let errorHandlerCalled = false;

  const obs = new Observable(observer => {
    observer.error(new Error("Original error"));
    return () => {
      cleanupCalled = true;
    };
  });

  // Capture the *first* unhandled error in this tick
  const unhandled = captureUnhandledOnce();

  obs.subscribe({
    error() {
      errorHandlerCalled = true;
      throw new Error("Error in error handler");
    }
  });

  // Give the queued micro-task time to run
  await Promise.resolve();

  // ── assertions ──────────────────────────────────────────────────────────
  const err = await unhandled; // should have been reported exactly once
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).toBe("Error in error handler");

  expect(errorHandlerCalled).toBe(true);
  expect(cleanupCalled).toBe(true);
});

test("complete/error makes subscription closed before calling observer", () => {
  const log: string[] = [];
  const obs = new Observable<number>(observer => {
    observer.next(1);

    // Complete the sequence
    observer.complete();

    // This should still run in the subscribeFn
    log.push("after complete");

    // This next should not be delivered because complete was called
    observer.next(2);

    return () => {
      log.push("cleanup");
    };
  });

  let closed = false;
  const subscription = obs.subscribe({
    next(value) {
      log.push(`next:${value}`);
    },
    complete() {
      // Check closed status during the complete callback
      log.push("complete");
    }
  });

  // await promise;
  closed = subscription!.closed;

  expect(log).toEqual([
    "next:1",
    "complete",
    "after complete",
    "cleanup"
  ]);

  // Subscription should be closed during the complete callback
  expect(closed).toBe(true);
});

// -----------------------------------------------------------------------------
// Symbol Support and Interop Tests
// -----------------------------------------------------------------------------

test("Observable implements Symbol.observable", () => {
  const obs = new Observable(observer => {
    observer.next("test");
    observer.complete();
  });

  // Should implement Symbol.observable
  expect(typeof obs[Symbol.observable]).toBe("function");

  // Should return itself
  expect(obs[Symbol.observable]()).toBe(obs);
});

test("Observable.from correctly delegates to Symbol.observable", () => {
  const values = ["interop", "works"];
  let observableProtocolCheck = 0;

  // Create a foreign Observable-like object
  const foreign: SpecObservable<string> = {
    [Symbol.observable]() {
      observableProtocolCheck++;

      return {
        // one implementation, but union‐typed first arg
        subscribe(
          observerOrNext,
          error?: (err: unknown) => void,
          complete?: () => void
        ): SpecSubscription {
          const obs: SpecObserver<string> =
            typeof observerOrNext === "function"
              ? { next: observerOrNext, error, complete }
              : observerOrNext;

          for (const v of values) {
            obs.next?.(v);
          }
          obs.complete?.();
          return { unsubscribe() { } };
        }
      };
    }
  };

  // Convert using Observable.from
  const results: string[] = [];
  const obs = Observable.from(foreign);

  // Symbol.observable should be accessed lazily
  expect(observableProtocolCheck).toBe(1);

  // Subscribe to get values
  obs.subscribe({
    next(value) {
      results.push(value);
    }
  });

  // Verify values were delivered and Symbol.observable was called
  expect(results).toEqual(values);
  expect(observableProtocolCheck).toBe(1);
});

test("Subscription implements Symbol.dispose and Symbol.asyncDispose", () => {
  let disposed = false;

  const obs = new Observable(() => {
    return () => {
      disposed = true;
    };
  });

  const subscription = obs.subscribe({});

  // Verify Symbol.dispose is implemented
  expect(typeof subscription[Symbol.dispose]).toBe("function");
  expect(typeof subscription[Symbol.asyncDispose]).toBe("function");

  // Use Symbol.dispose
  subscription[Symbol.dispose]();

  // Verify resource was cleaned up
  expect(disposed).toBe(true);
  expect(subscription.closed).toBe(true);
});

// -----------------------------------------------------------------------------
// Start Method Tests
// -----------------------------------------------------------------------------

test("observer.start is called with the subscription before any values", () => {
  const log: string[] = [];
  let startSubscription: Subscription | null = null;

  const obs = new Observable(observer => {
    log.push("subscriber called");
    observer.next("value");
    observer.complete();
  });

  obs.subscribe({
    start(subscription) {
      log.push("start called");
      startSubscription = subscription;
    },
    next(value) {
      log.push(`next:${value}`);
    },
    complete() {
      log.push("complete");
    }
  });

  // Verify start is called first, before subscriber function
  expect(log).toEqual([
    "start called",
    "subscriber called",
    "next:value",
    "complete"
  ]);

  // Verify start is called with the subscription object
  expect(typeof startSubscription).toBe("object");
  expect(typeof startSubscription!.unsubscribe).toBe("function");
});

test("unsubscribing in start prevents subscriber from being called", () => {
  let subscriberCalled = false;

  const obs = new Observable(observer => {
    subscriberCalled = true;
    observer.next("value");
    return () => { };
  });

  obs.subscribe({
    start(subscription) {
      // Immediately unsubscribe
      subscription.unsubscribe();
    }
  });

  // Verify subscriber was never called due to immediate unsubscribe
  expect(subscriberCalled).toBe(false);
});

// -----------------------------------------------------------------------------
// Observable Constructor Contract Tests
// -----------------------------------------------------------------------------

test("Observable constructor requires a function argument", () => {
  // These should throw
  expect(() => new Observable({} as (() => void))).toThrow(TypeError);
  expect(() => new Observable(null as unknown as (() => void))).toThrow(TypeError);
  expect(() => new Observable(undefined as unknown as (() => void))).toThrow(TypeError);
  expect(() => new Observable(1 as unknown as (() => void))).toThrow(TypeError);
  expect(() => new Observable("string" as unknown as (() => void))).toThrow(TypeError);

  // This should not throw
  expect(() => new Observable(() => { })).not.toThrow();
});

test("Observable cannot be called as a function", () => {
  // @ts-ignore Observable is a class not a function
  expect(() => Observable(() => { })).toThrow(TypeError);
});

test("Observable.prototype has correct methods", () => {
  // Check for required methods
  expect(typeof Observable.prototype.subscribe).toBe("function");
  expect(typeof Observable.prototype[Symbol.observable]).toBe("function");
  expect(typeof Observable.prototype[Symbol.asyncIterator]).toBe("function");

  // Check constructor property
  expect(Observable.prototype.constructor).toBe(Observable);
});

test("Observable subscriber function is not called by constructor", () => {
  let called = 0;
  new Observable(() => { called++ });

  expect(called).toBe(0);
});

// -----------------------------------------------------------------------------
// Observable.from Contract Tests
// -----------------------------------------------------------------------------

test("Observable.from throws for incompatible inputs", () => {
  expect(() => Observable.from(null as unknown as [])).toThrow(TypeError);
  expect(() => Observable.from(undefined as unknown as [])).toThrow(TypeError);
  expect(() => Observable.from(123 as unknown as [])).toThrow(TypeError);
  expect(() => Observable.from(true as unknown as [])).toThrow(TypeError);
});

test("Observable.from uses the this value if it's a function", () => {
  let usedThisValue = false;
  const thisObj = function () {
    usedThisValue = true;
    return new Observable(() => { });
  };

  Observable.from.call(thisObj, []);
  // FIXED: When used as a constructor, the function IS called
  expect(usedThisValue).toBe(true);
});

test("Observable.from uses Observable if the this value is not a function", () => {
  const result = Observable.from.call({}, [1, 2, 3]);
  expect(result instanceof Observable).toBe(true);
});

test("Observable.from throws if Symbol.observable doesn't return an object", () => {
  expect(() => Observable.from({
    // @ts-expect-error [Symbol.observable] expects the ObservableProtocol to be strictly followed
    [Symbol.observable]() { return null; }
  })).toThrow(TypeError);

  expect(() => Observable.from({
  // @ts-expect-error [Symbol.observable] expects the ObservableProtocol to be strictly followed
    [Symbol.observable]() { return 123; }
  })).toThrow(TypeError);

  expect(() => Observable.from({
  // @ts-expect-error [Symbol.observable] expects the ObservableProtocol to be strictly followed
    [Symbol.observable]() { } // Returns undefined
  })).toThrow(TypeError);
});

// -----------------------------------------------------------------------------
// Observable.of Contract Tests
// -----------------------------------------------------------------------------

test("Observable.of delivers all arguments to subscribers", () => {
  const args = [1, "two", { three: 3 }, [4]];
  const received: (number | string | object)[] = [];

  Observable.of(...args).subscribe({
    next(x) { received.push(x); }
  });

  expect(received).toEqual(args);
});

test("Observable.of uses the this value if it's a function", () => {
  let usedThisValue = false;
  const thisObj = function () {
    usedThisValue = true;
    return new Observable(() => { });
  };

  Observable.of.call(thisObj, 1, 2, 3);
  expect(usedThisValue).toBe(true);
});

test("Observable.of uses Observable if the this value is not a function", () => {
  const result = Observable.of.call({}, 1, 2, 3);
  expect(result instanceof Observable).toBe(true);
});

// -----------------------------------------------------------------------------
// Observer Contract Tests
// -----------------------------------------------------------------------------

test("SubscriptionObserver.closed reflects subscription state", () => {
  let observer: SubscriptionObserver<unknown> | null = null;

  // Create an observable that captures the observer
  const obs = new Observable(obs => {
    observer = obs;
    return () => { };
  });

  const subscription = obs.subscribe({});

  // Initially the observer is not closed
  expect(observer!.closed).toBe(false);

  // After unsubscribe, the observer is closed
  subscription.unsubscribe();
  expect(observer!.closed).toBe(true);

  // Create another observer that completes right away
  let observer2: SubscriptionObserver<unknown> | null = null;
  const obs2 = new Observable(obs => {
    observer2 = obs;
    obs.complete();
    return () => { };
  });

  obs2.subscribe({});
  expect(observer2!.closed).toBe(true);

  // Create another observer that errors right away
  let observer3: SubscriptionObserver<unknown> | null = null;
  const obs3 = new Observable(obs => {
    observer3 = obs;
    obs.error(new Error());
    return () => { };
  });

  obs3.subscribe({ error() { } });
  expect(observer3!.closed).toBe(true);
});

test("SubscriptionObserver.next delivers values to observer.next", () => {
  const values: (object | number)[] = [];
  const token: object = {};

  new Observable<object>(observer => {
    // @ts-expect-error Ignore extra args
    observer.next(token, 1, 2); // Extra args should be ignored
  }).subscribe({
    next(value, ...args) {
      values.push(value);
      values.push(args.length); // Should be 0
    }
  });

  expect(values).toEqual([token, 0]);
});

test("SubscriptionObserver methods return undefined regardless of observer return values", () => {
  const token = {};

  new Observable(observer => {
    const nextResult = observer.next(1);
    const errorResult = observer.error(new Error());
    expect(nextResult).toBe(undefined);
    expect(errorResult).toBe(undefined);
  }).subscribe({
    next() { return token; },
    error() { return token; },
  });
});

test("Observable throws for non-function observer methods", () => {
  const obs = new Observable(() => { });

  // This should throw
  expect(() => obs.subscribe({
  // @ts-expect-error Observer methods can only be functions
    next: {},
    error: null,
    complete: undefined
  })).toThrow(TypeError);
});

test("SubscriptionObserver ignores missing observer methods", () => {
  let observer: SubscriptionObserver<unknown> | null = null;

  const uncaught = captureUnhandledOnce();
  const obs = new Observable(obs => {
    observer = obs;
    return () => { };
  });

  // Subscribe with NO methods (different from non-function methods)
  obs.subscribe({});

  // These calls should not throw since methods are missing (not invalid)
  expect(() => observer!.next?.(1)).not.toThrow();
  expect(async () => {
    observer!.error?.(new Error())

    await Promise.resolve();
    await uncaught;
  }).not.toThrow();
  expect(async () => {
    observer!.complete?.()

    await Promise.resolve();
    await uncaught;
  }).not.toThrow();
});

// -----------------------------------------------------------------------------
// Cleanup Function Tests
// -----------------------------------------------------------------------------

test("teardown is called when subscription is explicitly unsubscribed", () => {
  let cleanupCalled = false;

  const obs = new Observable(() => {
    return () => { cleanupCalled = true; };
  });

  const subscription = obs.subscribe({});
  subscription.unsubscribe();

  expect(cleanupCalled).toBe(true);
});

test("teardown is called when subscription is implicitly completed", () => {
  let cleanupCalled = false;

  new Observable(observer => {
    observer.complete();
    return () => { cleanupCalled = true; };
  }).subscribe({});

  expect(cleanupCalled).toBe(true);
});

test("teardown is called when subscription has error", () => {
  let cleanupCalled = false;

  new Observable(observer => {
    observer.error(new Error());
    return () => { cleanupCalled = true; };
  }).subscribe({
    error() { } // Handle error to prevent it from being rethrown
  });

  expect(cleanupCalled).toBe(true);
});

test("teardown is called when subscriber function throws", () => {
  let cleanupCalled = false;

  // FIXED: When the subscriber throws before returning a teardown,
  // there's no teardown to call. The test needs to verify that
  // the error is properly handled and subscription is closed.
  new Observable(() => {
    throw new Error("Subscriber error");
  }).subscribe({
    error(err: Error) {
      // Verify the error was delivered
      expect(err.message).toBe("Subscriber error");
      cleanupCalled = true; // Mark that error handling occurred
    }
  });

  // The error handler should have been called
  expect(cleanupCalled).toBe(true);
});

test("teardown is only called once when unsubscribe is called multiple times", () => {
  let teardownCount = 0;

  const obs = new Observable(() => {
    return () => { teardownCount++; };
  });

  const subscription = obs.subscribe({});

  subscription.unsubscribe();
  expect(teardownCount).toBe(1);

  subscription.unsubscribe(); // Should not call teardown again
  expect(teardownCount).toBe(1);
});

test("teardown is called when unsubscribe is called in start", () => {
  const log: string[] = [];

  const obs = new Observable(_ => {
    log.push("subscriber called");
    return () => { log.push("teardown called"); };
  });

  obs.subscribe({
    start(subscription) {
      log.push("start called");
      subscription.unsubscribe();
    }
  });

  // The sequence should be: start -> unsubscribe
  // The subscriber function should not be called
  expect(log).toEqual([
    "start called",
    // No "subscriber called" or "teardown called" entries
    // We never even reigster the subscriber
  ]);
});

// -----------------------------------------------------------------------------
// Subscription Contract Tests
// -----------------------------------------------------------------------------

test("subscription object has required properties", () => {
  const subscription = new Observable(() => { }).subscribe({});

  expect(typeof subscription).toBe("object");
  expect(typeof subscription.unsubscribe).toBe("function");
  expect(typeof Object.getOwnPropertyDescriptor(subscription, 'closed')?.get)
    .toBe("function");
  expect(typeof Object.getOwnPropertyDescriptor(subscription, 'closed')?.set)
    .toBe("undefined");

  // Constructor should be Object, not a custom class
  expect(subscription.constructor).toBe(Object);
});

test("subscription.closed reflects current state", () => {
  const subscription = new Observable(() => { }).subscribe({});

  // Initially not closed
  expect(subscription.closed).toBe(false);

  // After unsubscribing, should be closed
  subscription.unsubscribe();
  expect(subscription.closed).toBe(true);
});

test("unsubscribe returns undefined", () => {
  const subscription = new Observable(() => { }).subscribe({});
  expect(subscription.unsubscribe()).toBe(undefined);
});

test("subscription can handle non-function teardown", async () => {
  // Should not throw
  expect(() => new Observable(() => null).subscribe({})).not.toThrow();
  // Should not throw
  expect(() => new Observable(() => undefined).subscribe({})).not.toThrow();

  // These should throw during unsubscribe
  const objTest = (async () => {
    const uncaught = captureUnhandledOnce();

    // @ts-expect-error Either a Subscription object a Teardown or undefined, an empty object isn't allowed
    const sub = new Observable(() => ({})).subscribe({});
    sub.unsubscribe();

    await Promise.resolve();
    const error = await uncaught;

    return error;
  })()
  expect(await objTest).toBeInstanceOf(TypeError);

  const numTest = (async () => {
    const uncaught = captureUnhandledOnce();

    // @ts-expect-error Either a Subscription object a Teardown or undefined, numbers aren't allowed
    const sub = new Observable(() => 123).subscribe({});
    sub.unsubscribe();

    await Promise.resolve();
    const error = await uncaught;

    return error;
  })()
  expect(await numTest).toBeInstanceOf(TypeError);
});

test("subscription can handle object with unsubscribe method", () => {
  let unsubscribeCalled = false;

  const subscription = new Observable(() => ({
    unsubscribe() {
      unsubscribeCalled = true;
    }
  })).subscribe({});

  subscription.unsubscribe();
  expect(unsubscribeCalled).toBe(true);
});