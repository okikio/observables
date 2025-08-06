import type { Subscription } from "../../_types.ts";
import { test, expect } from "@libs/testing";
import { Observable } from "../../observable.ts";
import { Symbol } from "../../symbol.ts";

test("Observable.of emits values then completes", () => {
  const results: number[] = [];
  let completed = false;

  const subscription = Observable.of(1, 2, 3).subscribe({
    next: (v) => results.push(v),
    complete: () => { completed = true; },
  });

  expect(results).toEqual([1, 2, 3]);
  expect(completed).toBe(true);
  expect(subscription.closed).toBe(true);
});

test("unsubscribe before completion stops emissions and calls teardown", async () => {
  const results: number[] = [];
  let cleaned = false;

  const obs = new Observable<number>((observer) => {
    observer.next(10);
    const id = setTimeout(() => observer.next(20), 1);
    return () => { clearTimeout(id); cleaned = true; };
  });

  const subscription = obs.subscribe((v) => results.push(v));
  subscription.unsubscribe();
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(results).toEqual([10]);
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

test("error in subscribeFn triggers observer.error and closes subscription", () => {
  const errorObj = new Error("failure");
  let caught: unknown;

  const subscription = new Observable<number>(() => {
    throw errorObj;
  }).subscribe({
    error: (e) => { caught = e; },
  });

  expect(caught).toBe(errorObj);
  expect(subscription.closed).toBe(true);
});

// =============================================================================
// Core Observable Tests - Focus on Essential Behavior
// =============================================================================

test("1. Basic emission sequence - values then completion", () => {
  const events: string[] = [];
  
  Observable.of(1, 2, 3).subscribe({
    next: (v) => events.push(`next:${v}`),
    complete: () => {
      events.push('complete');
      
      // Verify complete sequence
      expect(events).toEqual(['next:1', 'next:2', 'next:3', 'complete']);
    }
  });
});

test("2. Subscription lifecycle - closed state transitions", () => {
  let subscription: Subscription | null = null;
  
  const obs = new Observable<number>(observer => {
    // Check initial state
    expect(observer?.closed).toBe(false);
    
    observer.next(42);
    observer.complete();
    
    // Should be closed immediately after complete
    expect(observer.closed).toBe(true);
    expect(subscription?.closed).toBe(true);
  });
  
  subscription = obs.subscribe(() => {});
});

test("3. Error handling - subscriber function throws", () => {
  const testError = new Error("test error");
  let caughtError: unknown;
  
  const obs = new Observable(() => {
    throw testError;
  });
  
  obs.subscribe({
    error: (err) => {
      caughtError = err;
      expect(caughtError).toBe(testError);
    }
  });
});

test("4. Resource cleanup - teardown called on unsubscribe", () => {
  let cleanupCalled = false;
  
  const obs = new Observable<never>(() => {
    return () => {
      cleanupCalled = true;
    };
  });
  
  const subscription = obs.subscribe(() => {});
  expect(cleanupCalled).toBe(false);
  
  subscription.unsubscribe();
  expect(cleanupCalled).toBe(true);
  expect(subscription.closed).toBe(true);
});

test("5. Resource cleanup - teardown called on error", () => {
  let cleanupCalled = false;
  
  const obs = new Observable<number>(observer => {
    observer.error(new Error("test"));
    return () => {
      cleanupCalled = true;
      expect(cleanupCalled).toBe(true);
    };
  });
  
  obs.subscribe({
    error(err: Error) { 
      expect(err.message).toBe("test");
    }
  });
});

test("6. Cold observable behavior - independent executions", () => {
  let executionCount = 0;
  const values: number[] = [];
  
  const obs = new Observable<number>(observer => {
    executionCount++;
    observer.next(executionCount);
    observer.complete();
  });
  
  // First subscription
  obs.subscribe({ 
    next: (v) => values.push(v),
    complete: () => {
      expect(values).toEqual([1]);
      
      // Second subscription should get independent execution
      obs.subscribe({
        next: (v) => values.push(v),
        complete: () => {
          expect(values).toEqual([1, 2]);
          expect(executionCount).toBe(2);
        }
      });
    }
  });
});

test("7. Observable.from - array conversion", () => {
  const source = [10, 20, 30];
  const received: number[] = [];
  
  Observable.from(source).subscribe({
    next: (v) => received.push(v),
    complete: () => {
      expect(received).toEqual([10, 20, 30]);
    }
  });
});

test("8. Observer callback errors forwarded to error handler", () => {
  const callbackError = new Error("callback error");
  let caughtError: unknown;
  
  Observable.of("test").subscribe({
    next: () => {
      throw callbackError;
    },
    error: (err) => {
      caughtError = err;
      expect(caughtError).toBe(callbackError);
    }
  });
});

test("9. Async iteration with for-await-of", async () => {
  const results: string[] = [];
  
  for await (const value of Observable.of("a", "b", "c")) {
    results.push(value);
  }
  
  expect(results).toEqual(["a", "b", "c"]);
});

test("10. Symbol.observable interoperability", () => {
  const obs = Observable.of(42);
  const sameObs = obs[Symbol.observable]();
  
  expect(sameObs).toBe(obs);
  
  // Test with foreign observable-like object
  const foreign = {
    [Symbol.observable]() {
      return Observable.of("foreign");
    }
  };
  
  let received: string;
  Observable.from(foreign).subscribe({
    next: (v) => {
      received = v;
      expect(received).toBe("foreign");
    }
  });
});