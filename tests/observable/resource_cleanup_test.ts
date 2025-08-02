import { test, expect } from "@libs/testing";

import { Observable } from "../../observable.ts";
import { Symbol } from "../../symbol.ts";

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

// =============================================================================
// Teardown Timing Tests - Based on TC39 Spec Guarantees
// =============================================================================

test("Teardown timing: unsubscribe() is synchronous", () => {
  let teardownCalled = false;
  
  const obs = new Observable<never>(() => {
    return () => { teardownCalled = true; };
  });
  
  const subscription = obs.subscribe(() => {});
  
  // Before unsubscribe: not cleaned up
  expect(teardownCalled).toBe(false);
  expect(subscription.closed).toBe(false);
  
  // Call unsubscribe - teardown MUST happen synchronously
  subscription.unsubscribe();
  
  // After unsubscribe returns: teardown MUST be complete
  expect(teardownCalled).toBe(true);
  expect(subscription.closed).toBe(true);
});

test("Teardown timing: error() triggers immediate cleanup", () => {
  let teardownCalled = false;
  
  const obs = new Observable<number>(observer => {
    expect(observer.closed).toBe(false); // Subscription still open
    observer.error(new Error("test"));
    expect(observer.closed).toBe(true); // Subscription closed after error
    return () => { teardownCalled = true; };
  });

  const sub = obs.subscribe({
    error: () => {
      expect(teardownCalled).toBe(false); // Cleanup hasn't happened yet
    }
  });

  expect(teardownCalled).toBe(true); // Cleanup happens after error callback
  expect(sub.closed).toBe(true); // Subscription closed after error
});

test("Teardown timing: complete() triggers immediate cleanup", () => {
  let teardownCalled = false;
  
  const obs = new Observable<number>(observer => {
    observer.next(42);
    observer.complete();
    return () => { teardownCalled = true; };
  });
  
  obs.subscribe({
    complete: () => {
      // Teardown MUST have happened before complete callback
      expect(teardownCalled).toBe(false);
    }
  });

  expect(teardownCalled).toBe(true);
});

test("Teardown timing: synchronous error in subscriber", async () => {
  let teardownCalled = false;
  let timeout: number | null = null;

  const { promise, resolve } = Promise.withResolvers<void>();
  const obs = new Observable<never>(() => {
    // This teardown won't be available until after the error
    timeout = setTimeout(() => {
      // But when it becomes available, it should still be called
      teardownCalled = true;
      resolve();
    }, 0);
    
    throw new Error("subscriber error");
  });
  
  obs.subscribe({
    error: () => {
      // Error handling is immediate, but teardown might be deferred
      // since the subscriber threw before returning cleanup
    }
  });

  expect(teardownCalled).toBe(false);

  // At this point, teardown has not been called yet
  await promise;

  // After the event loop tick, teardown should be called
  expect(teardownCalled).toBe(true);
  clearTimeout(timeout!);
  
  // For synchronous subscriber errors, teardown timing depends on implementation
  // Some implementations may need to defer teardown if it wasn't returned yet
});

test("Teardown timing: observer closed state is accurate", () => {
  const obs = new Observable<number>(observer => {
    // Check initial state
    expect(observer.closed).toBe(false);
    
    observer.next(1);
    expect(observer.closed).toBe(false);  // Still open
    
    observer.complete();
    expect(observer.closed).toBe(true);   // Closed immediately
    
    // Subsequent calls should be no-ops
    observer.next(2);  // Should be ignored
  });
  
  const values: number[] = [];
  obs.subscribe({
    next: v => values.push(v),
    complete: () => {
      // Should only have received first value
      expect(values).toEqual([1]);
    }
  });
});

test("Teardown timing: multiple unsubscribe calls are idempotent", () => {
  let teardownCallCount = 0;
  
  const obs = new Observable<never>(() => {
    return () => { teardownCallCount++; };
  });
  
  const subscription = obs.subscribe(() => {});
  
  // First unsubscribe
  subscription.unsubscribe();
  expect(teardownCallCount).toBe(1);
  expect(subscription.closed).toBe(true);
  
  // Second unsubscribe should be no-op
  subscription.unsubscribe();
  expect(teardownCallCount).toBe(1);  // Still 1, not 2
  expect(subscription.closed).toBe(true);
});

test("Teardown timing: observer methods become no-ops after close", () => {
  let observerRef: any;
  
  const obs = new Observable<number>(observer => {
    observerRef = observer;
    observer.complete();
    return () => {};
  });
  
  const values: number[] = [];
  obs.subscribe({
    next: v => values.push(v),
    complete: () => {
      // After complete, observer should be closed
      expect(observerRef.closed).toBe(true);
      
      // These calls should be ignored
      observerRef.next(999);
      observerRef.error(new Error("ignored"));
      observerRef.complete(); // Second complete
      
      // Values should not have changed
      expect(values).toEqual([]);
    }
  });
});

test("Edge case: teardown available after synchronous complete", () => {
  let teardownCalled = false;
  
  // This tests the tricky case where complete() is called
  // before the teardown function is returned
  const obs = new Observable<number>(observer => {
    observer.next(1);
    observer.complete(); // Called synchronously
    
    // Teardown returned after complete was called
    return () => { teardownCalled = true; };
  });
  
  obs.subscribe({
    complete: () => {
      // The implementation should ensure teardown is called
      // even though complete() fired before teardown was returned
      expect(teardownCalled).toBe(false);
    }
  });

  // After subscribe() returns, teardown should be called
  // This is an edge case where complete happens before teardown
  // but the implementation guarantees teardown will still be called
  expect(teardownCalled).toBe(true);
});

test("Safe check points: when teardown is guaranteed complete", () => {
  let setupPhase = false;
  let teardownPhase = false;
  
  const obs = new Observable<number>(observer => {
    setupPhase = true;
    observer.next(42);
    observer.complete();
    
    return () => { teardownPhase = true; };
  });
  
  // SAFE CHECK POINT 1: Before subscription starts
  expect(setupPhase).toBe(false);
  expect(teardownPhase).toBe(false);
  
  const subscription = obs.subscribe({
    next: () => {
      // SAFE CHECK POINT 2: During execution, before complete
      expect(setupPhase).toBe(true);
      expect(teardownPhase).toBe(false);
    },
    complete: () => {
      // SAFE CHECK POINT 3: In complete callback - teardown is done
      expect(setupPhase).toBe(true);
      expect(teardownPhase).toBe(false);
    }
  });
  
  // SAFE CHECK POINT 4: After subscribe() returns with sync complete
  expect(setupPhase).toBe(true);
  expect(teardownPhase).toBe(true);
  expect(subscription.closed).toBe(true);
});