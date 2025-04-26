// @ts-nocheck Temporarily treat the tests as js
import { test, expect, fn } from "@libs/testing";

import { Observable } from "./observable.ts";
import { Symbol } from "./symbol.ts";

// -----------------------------------------------------------------------------
// Basic Push API Tests
// -----------------------------------------------------------------------------

test("Observable.of emits values then completes", () => {
  const results: number[] = [];
  let completed = false;

  const subscription = Observable.of(1, 2, 3).subscribe({
    next: (v) => results.push(v),
    complete: () => { completed = true; },
  });

  // All values emitted synchronously
  expect(results).toEqual([1, 2, 3]);
  // Completion callback invoked
  expect(completed).toBe(true);
  // Subscription closed after complete
  expect(subscription.closed).toBe(true);
});


test("unsubscribe before completion stops emissions and calls teardown", () => {
  const results: number[] = [];
  let cleaned = false;

  // Teardown records cleanup
  const obs = new Observable<number>((observer) => {
    // Emit a value then schedule a second emission
    observer.next(10);
    const id = setTimeout(() => observer.next(20), 1);
    return () => { clearTimeout(id); cleaned = true; };
  });

  const subscription = obs.subscribe((v) => results.push(v));
  // Only first value arrives
  expect(results).toEqual([10]);

  // Unsubscribe stops further emissions and calls teardown
  subscription.unsubscribe();
  expect(cleaned).toBe(true);
  expect(subscription.closed).toBe(true);
});


test("subscribe trims callback overloads correctly", () => {
  const results: number[] = [];
  const completes: boolean[] = [];

  const subscription = Observable.of(4, 5).subscribe(
    (v) => results.push(v),
    undefined,
    () => completes.push(true),
  );

  expect(results).toEqual([4, 5]);
  expect(completes).toEqual([true]);
  expect(subscription.closed).toBe(true);
});

// -----------------------------------------------------------------------------
// Error Handling Tests
// -----------------------------------------------------------------------------

test("error in subscribeFn triggers observer.error and closes subscription", () => {
  const errorObj = new Error("failure");
  let caught: unknown;

  const faulty$ = new Observable<number>(() => {
    throw errorObj;
  });

  const subscription = faulty$.subscribe({
    error: (e) => { caught = e; },
  });

  expect(caught).toBe(errorObj);
  expect(subscription.closed).toBe(true);
});

// -----------------------------------------------------------------------------
// Async Iterable Tests
// -----------------------------------------------------------------------------

test("for-await iteration yields values from Observable.of", async () => {
  const result: number[] = [];
  for await (const v of Observable.of(7, 8, 9)) {
    result.push(v);
  }
  expect(result).toEqual([7, 8, 9]);
});

// -----------------------------------------------------------------------------
// Static `from` Tests
// -----------------------------------------------------------------------------

test("static from wraps Observable-like objects", () => {
  const values = ["x", "y"];
  const foreign = {
    [Symbol.observable]() {
      return Observable.of(...values);
    }
  };

  const obs = Observable.from(foreign);
  const result: string[] = [];
  obs.subscribe({ next: (v) => result.push(v) });

  expect(result).toEqual(values);
});


test("static from iterable emits all items", () => {
  const arr = [1, 2, 3];
  const received: number[] = [];

  Observable.from(arr).subscribe({ next: (v) => received.push(v) });
  expect(received).toEqual(arr);
});


test("static from async iterable emits all items", async () => {
  async function* gen() {
    yield 100;
    yield 200;
  }

  const received: number[] = [];
  const obs = Observable.from(gen());

  for await (const v of obs) {
    received.push(v);
  }

  expect(received).toEqual([100, 200]);
});

// -----------------------------------------------------------------------------
// Teardown on Complete Tests
// -----------------------------------------------------------------------------

test("teardown called on complete", () => {
  let cleaned = false;

  const obs = new Observable<number>((observer) => {
    observer.next(1);
    observer.complete();

    return () => {
      cleaned = true;
    };
  });

  const result: number[] = [];
  obs.subscribe({ next: (v) => result.push(v) });

  expect(result).toEqual([1]);
  expect(cleaned).toBe(true);
});

// -----------------------------------------------------------------------------
// Documentation Example Tests
// -----------------------------------------------------------------------------

test("Basic subscription example calls start, next, complete in order", () => {
  const calls: string[] = [];

  // from docs: Observable.of(1,2,3).subscribe({...})
  const subscription = Observable.of(1, 2, 3).subscribe({
    start() { calls.push("start"); },
    next(v) { calls.push(`next:${v}`); },
    complete() { calls.push("complete"); },
  });

  // should have fired start → next:1 → next:2 → next:3 → complete
  expect(calls).toEqual([
    "start",
    "next:1",
    "next:2",
    "next:3",
    "complete",
  ]);
  // after complete, subscription.closed must be true
  expect(subscription.closed).toBe(true);
});

test("Pull‐with‐strategy example yields all values with backpressure", async () => {
  // from docs: Observable.from([1,2,3,4,5]).pull({ highWaterMark: 2 })
  const nums$ = Observable.from([1, 2, 3, 4, 5]);
  const pulled: number[] = [];

  for await (const n of nums$.pull({ strategy: { highWaterMark: 2 } })) {
    pulled.push(n);
  }

  expect(pulled).toEqual([1, 2, 3, 4, 5]);
});


////////////////////////////////////////////////////////////////////////////////
// 2) Simple async-iteration example
////////////////////////////////////////////////////////////////////////////////

test("Simple async-iteration example works", async () => {
  const result: string[] = [];

  for await (const x of Observable.of("a", "b", "c")) {
    result.push(x);
  }

  expect(result).toEqual(["a", "b", "c"]);
});

////////////////////////////////////////////////////////////////////////////////
// 3) Pull with strategy example
////////////////////////////////////////////////////////////////////////////////

test("Pull with highWaterMark strategy example works", async () => {
  const pulled: number[] = [];
  const nums$ = Observable.from([1, 2, 3, 4, 5]);

  for await (const n of nums$.pull({ strategy: { highWaterMark: 2 } })) {
    pulled.push(n);
  }

  expect(pulled).toEqual([1, 2, 3, 4, 5]);
});

////////////////////////////////////////////////////////////////////////////////
// 4) Symbol.observable interop example
////////////////////////////////////////////////////////////////////////////////

test("Observable[Symbol.observable]() returns self", () => {
  const obs = Observable.of(42);
  const same = obs[Symbol.observable]();
  expect(same).toBe(obs);
});

////////////////////////////////////////////////////////////////////////////////
// 5) Symbol.dispose interop cleanup example
////////////////////////////////////////////////////////////////////////////////

test("Subscription[Symbol.dispose]() calls unsubscribe", () => {
  let cleaned = false;
  const obs = new Observable<number>(o => {
    const id = setInterval(() => o.next(0), 10);
    return () => {
      clearInterval(id);
      cleaned = true;
    };
  });

  const sub = obs.subscribe(() => { });
  // cleanup via Symbol.dispose
  sub[Symbol.dispose]();
  expect(cleaned).toBe(true);
  expect(sub.closed).toBe(true);
});

////////////////////////////////////////////////////////////////////////////////
// 6) Symbol.asyncDispose interop cleanup example
////////////////////////////////////////////////////////////////////////////////

test("Subscription[Symbol.asyncDispose]() calls unsubscribe", async () => {
  let cleaned = false;
  const obs = new Observable<number>(o => {
    const id = setTimeout(() => o.next(0), 10);
    return () => {
      clearTimeout(id);
      cleaned = true;
    };
  });

  const sub = obs.subscribe(() => { });
  // cleanup via Symbol.asyncDispose
  await sub[Symbol.asyncDispose]();
  expect(cleaned).toBe(true);
  expect(sub.closed).toBe(true);
});


// -----------------------------------------------------------------------------
// Documentation Examples - Keyboard Events
// -----------------------------------------------------------------------------

test("listen example creates an Observable for DOM events", () => {
  // Mock DOM element
  const element = {
    addEventListener: fn((name, handler, options) => { }),
    removeEventListener: fn((name, handler, options) => { })
  };

  // Create a listen function as shown in the docs
  function listen(element, eventName) {
    return new Observable(observer => {
      // Create an event handler which sends data to the sink
      let handler = event => observer.next(event);

      // Attach the event handler
      element.addEventListener(eventName, handler, true);

      // Return a cleanup function which will cancel the event stream
      return () => {
        // Detach the event handler from the element
        element.removeEventListener(eventName, handler, true);
      };
    });
  }

  // Spy on the element's methods
  let addEventSpy = element.addEventListener;
  let removeEventSpy = element.removeEventListener;

  // Create the Observable
  const keydown$ = listen(element, "keydown");

  // Verify that addEventListener was not called yet (lazy behavior)
  expect(addEventSpy).not.toHaveBeenCalled();

  // Subscribe to the Observable
  const subscription = keydown$.subscribe({});

  // Verify that addEventListener was called with correct arguments
  expect(addEventSpy).toHaveBeenCalledWith("keydown", expect.any(Function), true);

  // Unsubscribe
  subscription.unsubscribe();

  // Verify that removeEventListener was called with correct arguments
  expect(removeEventSpy).toHaveBeenCalledWith("keydown", expect.any(Function), true);
});

test("commandKeys example filters and maps key events", () => {
  // Mock DOM element with simulated events
  const mockEvents = [];
  const element = {
    addEventListener: fn((name, handler, options) => {
      // Store the handler for later triggering
      mockEvents.push(handler);
    }),
    removeEventListener: fn(() => { })
  };

  // Create helper functions as shown in the docs
  function listen(element, eventName) {
    return new Observable(observer => {
      let handler = event => observer.next(event);
      element.addEventListener(eventName, handler, true);
      return () => {
        element.removeEventListener(eventName, handler, true);
      };
    });
  }

  // Basic filter and map extension for Observable
  Observable.prototype.filter = function (predicate) {
    return new Observable(observer => {
      return this.subscribe({
        next(value) {
          if (predicate(value)) {
            observer.next(value);
          }
        },
        error(err) { observer.error(err); },
        complete() { observer.complete(); }
      });
    });
  };

  Observable.prototype.map = function (mapper) {
    return new Observable(observer => {
      return this.subscribe({
        next(value) { observer.next(mapper(value)); },
        error(err) { observer.error(err); },
        complete() { observer.complete(); }
      });
    });
  };

  function commandKeys(element) {
    let keyCommands = { "38": "up", "40": "down" };

    return listen(element, "keydown")
      .filter(event => event.keyCode in keyCommands)
      .map(event => keyCommands[event.keyCode]);
  }

  // Test the example
  const results = [];
  const subscription = commandKeys(element).subscribe({
    next(val) { results.push(val); }
  });

  // Simulate keydown events
  mockEvents[0]({ keyCode: "38" }); // up arrow
  mockEvents[0]({ keyCode: "37" }); // left arrow (should be filtered out)
  mockEvents[0]({ keyCode: "40" }); // down arrow

  // Verify correct keys were processed
  expect(results).toEqual(["up", "down"]);

  // Cleanup
  subscription.unsubscribe();
});

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
// Resource Cleanup with Symbol.dispose tests
// -----------------------------------------------------------------------------

test("subscription supports Symbol.dispose for resource cleanup", () => {
  let disposed = false;

  const observable = new Observable(() => {
    return () => { disposed = true; };
  });

  const subscription = observable.subscribe({});

  // Check that Symbol.dispose is implemented
  expect(typeof subscription[Symbol.dispose]).toBe("function");

  // Use Symbol.dispose to clean up
  subscription[Symbol.dispose]();

  // Verify teardown was called
  expect(disposed).toBe(true);
  expect(subscription.closed).toBe(true);
});

test("subscription supports Symbol.asyncDispose for async resource cleanup", async () => {
  let disposed = false;

  const observable = new Observable(() => {
    return () => { disposed = true; };
  });

  const subscription = observable.subscribe({});

  // Check that Symbol.asyncDispose is implemented
  expect(typeof subscription[Symbol.asyncDispose]).toBe("function");

  // Use Symbol.asyncDispose to clean up asynchronously
  await subscription[Symbol.asyncDispose]();

  // Verify teardown was called
  expect(disposed).toBe(true);
  expect(subscription.closed).toBe(true);
});

// -----------------------------------------------------------------------------
// DOM Events Example Tests
// -----------------------------------------------------------------------------

test("listen function creates an Observable for DOM events", () => {
  // Mock DOM element with event tracking
  const eventLog = [];
  const mockElement = {
    listeners: {},
    addEventListener(eventName, handler, options) {
      this.listeners[eventName] = this.listeners[eventName] || [];
      this.listeners[eventName].push(handler);
      eventLog.push(`added ${eventName} listener`);
    },
    removeEventListener(eventName, handler, options) {
      if (this.listeners[eventName]) {
        this.listeners[eventName] = this.listeners[eventName].filter(h => h !== handler);
      }
      eventLog.push(`removed ${eventName} listener`);
    },
    // Helper to simulate events
    dispatchEvent(eventName, data) {
      if (this.listeners[eventName]) {
        this.listeners[eventName].forEach(handler => handler(data));
      }
    }
  };

  // Create the listen function as defined in the docs
  function listen(element, eventName) {
    return new Observable(observer => {
      // Create an event handler which sends data to the sink
      let handler = event => observer.next(event);

      // Attach the event handler
      element.addEventListener(eventName, handler, true);

      // Return a cleanup function which will cancel the event stream
      return () => {
        // Detach the event handler from the element
        element.removeEventListener(eventName, handler, true);
      };
    });
  }

  // Test values received through the Observable
  const receivedEvents = [];
  const keydown$ = listen(mockElement, "keydown");

  // Verify lazy behavior - no listeners added yet
  expect(eventLog).toEqual([]);

  // Subscribe to events
  const subscription = keydown$.subscribe({
    next: event => receivedEvents.push(event)
  });

  // Verify listener was added upon subscription
  expect(eventLog).toEqual(["added keydown listener"]);

  // Simulate keydown events
  mockElement.dispatchEvent("keydown", { key: "A", keyCode: 65 });
  mockElement.dispatchEvent("keydown", { key: "B", keyCode: 66 });

  // Verify events were received
  expect(receivedEvents).toEqual([
    { key: "A", keyCode: 65 },
    { key: "B", keyCode: 66 }
  ]);

  // Unsubscribe and verify cleanup
  subscription.unsubscribe();
  expect(eventLog).toEqual(["added keydown listener", "removed keydown listener"]);

  // Verify no more events are received after unsubscribe
  mockElement.dispatchEvent("keydown", { key: "C", keyCode: 67 });
  expect(receivedEvents.length).toBe(2); // Still only 2 events
});

test("commandKeys function filters and maps keyboard events", () => {
  // Mock DOM element with event simulation
  const mockElement = {
    listeners: {},
    addEventListener(eventName, handler, options) {
      this.listeners[eventName] = this.listeners[eventName] || [];
      this.listeners[eventName].push(handler);
    },
    removeEventListener(eventName, handler, options) {
      if (this.listeners[eventName]) {
        this.listeners[eventName] = this.listeners[eventName].filter(h => h !== handler);
      }
    },
    // Helper to simulate events
    dispatchEvent(eventName, data) {
      if (this.listeners[eventName]) {
        this.listeners[eventName].forEach(handler => handler(data));
      }
    }
  };

  // Add filter and map methods to Observable prototype for testing
  Observable.prototype.filter = function (predicate) {
    return new Observable(observer => {
      const subscription = this.subscribe({
        next(value) {
          if (predicate(value)) {
            observer.next(value);
          }
        },
        error(err) { observer.error(err); },
        complete() { observer.complete(); }
      });
      return () => subscription.unsubscribe();
    });
  };

  Observable.prototype.map = function (mapper) {
    return new Observable(observer => {
      const subscription = this.subscribe({
        next(value) { observer.next(mapper(value)); },
        error(err) { observer.error(err); },
        complete() { observer.complete(); }
      });
      return () => subscription.unsubscribe();
    });
  };

  // Implement the listen function
  function listen(element, eventName) {
    return new Observable(observer => {
      let handler = event => observer.next(event);
      element.addEventListener(eventName, handler, true);
      return () => element.removeEventListener(eventName, handler, true);
    });
  }

  // Implement the commandKeys function from the documentation
  function commandKeys(element) {
    let keyCommands = { "38": "up", "40": "down" };

    return listen(element, "keydown")
      .filter(event => event.keyCode in keyCommands)
      .map(event => keyCommands[event.keyCode]);
  }

  // Test the function
  const commands = [];
  const subscription = commandKeys(mockElement).subscribe({
    next(command) { commands.push(command); }
  });

  // Simulate various keydown events
  mockElement.dispatchEvent("keydown", { keyCode: 38 }); // up arrow
  mockElement.dispatchEvent("keydown", { keyCode: 37 }); // left arrow - should be filtered out
  mockElement.dispatchEvent("keydown", { keyCode: 40 }); // down arrow
  mockElement.dispatchEvent("keydown", { keyCode: 13 }); // enter - should be filtered out

  // Verify only the mapped commands were received
  expect(commands).toEqual(["up", "down"]);

  // Unsubscribe
  subscription.unsubscribe();

  // Verify no more events are processed after unsubscribe
  mockElement.dispatchEvent("keydown", { keyCode: 38 });
  expect(commands).toEqual(["up", "down"]); // Still only the original events
});

// -----------------------------------------------------------------------------
// Observable.from Tests with Real World Examples
// -----------------------------------------------------------------------------

test("Observable.from with an iterable object", () => {
  const results = [];
  const iterable = ["mercury", "venus", "earth"];

  Observable.from(iterable).subscribe({
    next(value) {
      results.push(value);
    },
    complete() {
      results.push("done");
    }
  });

  expect(results).toEqual(["mercury", "venus", "earth", "done"]);
});

test("Observable.from with Symbol.observable object", () => {
  const results = [];
  const observable = {
    [Symbol.observable]() {
      return new Observable(observer => {
        // Simulate async behavior
        setTimeout(() => {
          observer.next("hello");
          observer.next("world");
          observer.complete();
        }, 0);

        return () => results.push("cleaned up");
      });
    }
  };

  const subscription = Observable.from(observable).subscribe({
    next(value) {
      results.push(value);
    },
    complete() {
      results.push("done");
    }
  });

  // Initially empty due to setTimeout
  expect(results).toEqual([]);

  // Wait for setTimeout to complete
  return new Promise(resolve => {
    setTimeout(() => {
      expect(results).toEqual(["hello", "world", "done", "cleaned up"]);
      resolve();
    }, 10);
  });
});

test("Observable.from returns the same Observable if passed an Observable", () => {
  const original = new Observable(observer => { });
  const result = Observable.from(original);

  expect(result).toBe(original);
});

test("Observable.from with an async iterable", async () => {
  // Create an async iterable
  async function* asyncGenerator() {
    yield "async";
    yield "is";
    yield "awesome";
  }

  const asyncIterable = asyncGenerator();

  // Convert to Observable
  const observable = Observable.from(asyncIterable);

  // Collect results using for-await and AsyncIterator
  const results = [];
  for await (const value of observable) {
    results.push(value);
  }

  expect(results).toEqual(["async", "is", "awesome"]);
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
  const log = [];

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
        subscribe(observer) {
          for (const value of values) {
            observer.next(value);
          }
          observer.complete();
          return { unsubscribe() { } };
        }
      };
    }
  };

  // Convert using Observable.from
  const results = [];
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
  const log = [];
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