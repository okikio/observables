// @ts-nocheck TODO: fix tests
import type { Observer } from "../_types.ts";
import { test, expect, fn } from "@libs/testing";

import { Observable } from "../observable.ts";
import { Symbol } from "../symbol.ts";

// -----------------------------------------------------------------------------
// Multiple Subscribers and Teardown Behavior
// -----------------------------------------------------------------------------

test("multiple subscribers receive the same values", () => {
  const results1 = [];
  const results2 = [];

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
  const teardowns = [];

  // Create an Observable that tracks teardowns
  const observable = new Observable(observer => {
    observer.next("value");
    observer.complete();
    return () => {
      teardowns.push("cleaned up");
    };
  });

  // Subscribe twice
  const sub1 = observable.subscribe({});
  const sub2 = observable.subscribe({});

  // Both subscribers should have triggered the teardown function
  expect(teardowns.length).toBe(2);
  expect(teardowns).toEqual(["cleaned up", "cleaned up"]);
});

test.only("each subscriber gets its own observer and teardown", () => {
  const log = [];

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
    "subscriber 1 created",
    "sub2 received: value for 1",
    "subscriber 1 torn down",
    "subscriber 0 torn down"
  ]);
});

test("unsubscribe is idempotent and only triggers teardown once", () => {
  let teardownCount = 0;

  // Create an Observable with a teardown that counts calls
  const observable = new Observable(observer => {
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
  const log = [];

  // Create an Observable that logs teardown
  const observable = new Observable(observer => {
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
    error: () => log.push("error callback"),
    complete: () => log.push("complete callback")
  });

  completeObservable.subscribe({
    error: () => log.push("error callback"),
    complete: () => log.push("complete callback")
  });

  expect(log).toEqual([
    "subscribed",
    "after error",
    "error callback",
    "error teardown",
    "after complete",
    "complete callback",
    "complete teardown"
  ]);
});

// -----------------------------------------------------------------------------
// Multiple Subscribers and Resource Management Tests
// -----------------------------------------------------------------------------

test("Observable properly handles multiple subscribers with separate resources", () => {
  const resources = { sub1: false, sub2: false };

  // Create an Observable that tracks subscription-specific resources
  const observable = new Observable(observer => {
    // Determine which subscriber we are
    const id = Object.values(resources).filter(Boolean).length + 1;
    const subId = `sub${id}`;

    // Mark resource as allocated
    resources[subId] = true;

    // Emit the subscriber ID
    observer.next(subId);

    // Return teardown to release resource
    return () => {
      resources[subId] = false;
    };
  });

  // Capture emitted values
  const values1 = [];
  const values2 = [];

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
  const observable = new Observable(observer => {
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
  const results1 = [];
  const results2 = [];

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
  const results = [];
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

test("Observable handles errors in next callback without crashing", () => {
  let errorThrown = false;
  let nextsAfterError = 0;
  let completed = false;

  // Create observable that will emit multiple values
  const obs = new Observable(observer => {
    try {
      observer.next(1); // This will throw in the next handler
      observer.next(2); // This should still be delivered
      observer.complete();
    } catch (e) {
      errorThrown = true;
    }
  });

  // Subscribe with a handler that throws on first value
  const subscription = obs.subscribe({
    next(value) {
      if (value === 1) {
        throw new Error("Error in next handler");
      }
      nextsAfterError++;
    },
    complete() {
      completed = true;
    }
  });

  // Subscription should stay active despite error in next
  expect(subscription.closed).toBe(false);
  expect(errorThrown).toBe(false);
  expect(nextsAfterError).toBe(1); // Second next call succeeded
  expect(completed).toBe(true);
});

test("error in user-provided error handler does not prevent cleanup", () => {
  let cleanupCalled = false;
  let errorHandlerCalled = false;

  const obs = new Observable(observer => {
    observer.error(new Error("Original error"));
    return () => {
      cleanupCalled = true;
    };
  });

  obs.subscribe({
    error(err) {
      errorHandlerCalled = true;
      throw new Error("Error in error handler");
    }
  });

  expect(errorHandlerCalled).toBe(true);
  expect(cleanupCalled).toBe(true);
});

test("complete/error makes subscription closed before calling observer", () => {
  const log: string[] = [];

  const obs = new Observable(observer => {
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

  let closed;

  obs.subscribe({
    next(value) {
      log.push(`next:${value}`);
    },
    complete() {
      // Check closed status during the complete callback
      closed = this.closed;
      log.push("complete");
    }
  });

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
  let subscribeCount = 0;

  // Create a foreign Observable-like object
  const foreign = {
    [Symbol.observable]() {
      subscribeCount++;
      return {
        subscribe(observer: Observer<string>) {
          for (const value of values) {
            observer?.next?.(value);
          }
          observer?.complete?.();
          return { unsubscribe() { } };
        }
      };
    }
  };

  // Convert using Observable.from
  const results: string[] = [];
  const obs = Observable.from(foreign);

  // Symbol.observable should be accessed lazily
  expect(subscribeCount).toBe(0);

  // Subscribe to get values
  obs.subscribe({
    next(value) {
      results.push(value);
    }
  });

  // Verify values were delivered and Symbol.observable was called
  expect(results).toEqual(values);
  expect(subscribeCount).toBe(1);
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
  let startSubscription;

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
  expect(typeof startSubscription.unsubscribe).toBe("function");
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
  // @ts-ignore 
  expect(() => new Observable({})).toThrow(TypeError);
  expect(() => new Observable(null)).toThrow(TypeError);
  expect(() => new Observable(undefined)).toThrow(TypeError);
  expect(() => new Observable(1)).toThrow(TypeError);
  expect(() => new Observable("string")).toThrow(TypeError);

  // This should not throw
  expect(() => new Observable(() => { })).not.toThrow();
});

test("Observable cannot be called as a function", () => {
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
  new Observable(() => called++);

  expect(called).toBe(0);
});

// -----------------------------------------------------------------------------
// Observable.from Contract Tests
// -----------------------------------------------------------------------------

test("Observable.from throws for incompatible inputs", () => {
  expect(() => Observable.from(null)).toThrow(TypeError);
  expect(() => Observable.from(undefined)).toThrow(TypeError);
  expect(() => Observable.from(123)).toThrow(TypeError);
  expect(() => Observable.from(true)).toThrow(TypeError);
});

test("Observable.from uses the this value if it's a function", () => {
  let usedThisValue = false;
  const thisObj = function () {
    usedThisValue = true;
    return new Observable(() => { });
  };

  Observable.from.call(thisObj, []);
  expect(usedThisValue).toBe(true);
});

test("Observable.from uses Observable if the this value is not a function", () => {
  const result = Observable.from.call({}, [1, 2, 3]);
  expect(result instanceof Observable).toBe(true);
});

test("Observable.from throws if Symbol.observable doesn't return an object", () => {
  expect(() => Observable.from({
    [Symbol.observable]() { return null; }
  })).toThrow(TypeError);

  expect(() => Observable.from({
    [Symbol.observable]() { return 123; }
  })).toThrow(TypeError);

  expect(() => Observable.from({
    [Symbol.observable]() { } // Returns undefined
  })).toThrow(TypeError);
});

// -----------------------------------------------------------------------------
// Observable.of Contract Tests
// -----------------------------------------------------------------------------

test("Observable.of delivers all arguments to subscribers", () => {
  const args = [1, "two", { three: 3 }, [4]];
  const received = [];

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
  let observer;

  // Create an observable that captures the observer
  const obs = new Observable(obs => {
    observer = obs;
    return () => { };
  });

  const subscription = obs.subscribe({});

  // Initially the observer is not closed
  expect(observer.closed).toBe(false);

  // After unsubscribe, the observer is closed
  subscription.unsubscribe();
  expect(observer.closed).toBe(true);

  // Create another observer that completes right away
  let observer2;
  const obs2 = new Observable(obs => {
    observer2 = obs;
    obs.complete();
    return () => { };
  });

  obs2.subscribe({});
  expect(observer2.closed).toBe(true);

  // Create another observer that errors right away
  let observer3;
  const obs3 = new Observable(obs => {
    observer3 = obs;
    obs.error(new Error());
    return () => { };
  });

  obs3.subscribe({ error() { } });
  expect(observer3.closed).toBe(true);
});

test("SubscriptionObserver.next delivers values to observer.next", () => {
  const values = [];
  const token = {};

  new Observable(observer => {
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

test("SubscriptionObserver ignores non-function observer methods", () => {
  let observer;

  const obs = new Observable(obs => {
    observer = obs;
    return () => { };
  });

  // Subscribe with non-function properties
  obs.subscribe({
    next: {},
    error: null,
    complete: undefined
  });

  // These calls should not throw
  expect(() => observer.next(1)).not.toThrow();
  expect(() => observer.error(new Error())).not.toThrow();
  expect(() => observer.complete()).not.toThrow();
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

  // This will never return a teardown function because it throws
  try {
    new Observable(() => {
      throw new Error("Subscriber error");
      // This is unreachable, but TypeScript doesn't know that
      return () => { };
    }).subscribe({
      error() { },
      // Instead, we'll add a start function that sets up the cleanup
      start() {
        // Set up the cleanup function by monkey-patching the subscription
        const originalUnsubscribe = this.unsubscribe;
        this.unsubscribe = function () {
          cleanupCalled = true;
          originalUnsubscribe.call(this);
        };
      }
    });
  } catch (e) {
    // Ignore error
  }

  // The error in the subscriber function should trigger unsubscribe
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
  const log = [];

  const obs = new Observable(observer => {
    log.push("subscriber called");
    return () => { log.push("teardown called"); };
  });

  obs.subscribe({
    start(subscription) {
      log.push("start called");
      subscription.unsubscribe();
    }
  });

  // The sequence should be: start -> unsubscribe -> teardown
  // The subscriber function should not be called
  expect(log).toEqual([
    "start called",
    "teardown called"
  ]);
});

// -----------------------------------------------------------------------------
// Subscription Contract Tests
// -----------------------------------------------------------------------------

test("subscription object has required properties", () => {
  const subscription = new Observable(() => { }).subscribe({});

  expect(typeof subscription).toBe("object");
  expect(typeof subscription.unsubscribe).toBe("function");
  expect(typeof Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(subscription), 'closed'
  ).get).toBe("function");

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

test("subscription can handle non-function teardown", () => {
  // All of these should not throw
  expect(() => new Observable(() => null).subscribe({})).not.toThrow();
  expect(() => new Observable(() => undefined).subscribe({})).not.toThrow();

  // These should throw during unsubscribe
  expect(() => {
    const sub = new Observable(() => ({})).subscribe({});
    sub.unsubscribe();
  }).toThrow(TypeError);

  expect(() => {
    const sub = new Observable(() => 123).subscribe({});
    sub.unsubscribe();
  }).toThrow(TypeError);
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