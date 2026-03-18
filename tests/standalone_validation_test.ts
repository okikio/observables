/**
 * Cross-runtime intent tests for the Observable library.
 * Tests core macro and micro behaviors with the shared `@libs/testing` harness.
 *
 * Run with: deno test --allow-read --trace-leaks standalone_validation_test.ts
 */

// deno-lint-ignore-file no-import-prefix
import { expect, test } from "jsr:@libs/testing@^5";

function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  void msg;
  expect(actual).toBe(expected);
}

function assertArrayEquals<T>(actual: T[], expected: T[], msg?: string): void {
  void msg;
  expect(actual).toEqual(expected);
}

function assertTrue(value: boolean, msg?: string): void {
  void msg;
  expect(value).toBe(true);
}

// Import library modules
import { Observable } from "../observable.ts";
import {
  clear,
  createQueue,
  dequeue,
  enqueue,
  getSize,
  isEmpty,
  isFull,
  peek,
} from "../queue.ts";
import { isObservableError, ObservableError } from "../error.ts";

// ============================================================================
// MACRO INTENT TESTS: Library-wide behavioral guarantees
// ============================================================================

test("MACRO: Deterministic teardown - cleanup runs exactly once", () => {
  let teardownCount = 0;

  const obs = new Observable<number>((observer) => {
    observer.next(1);
    observer.complete();
    return () => {
      teardownCount++;
    };
  });

  const sub = obs.subscribe(() => {});
  assertEquals(teardownCount, 1, "Teardown should run once on completion");

  sub.unsubscribe();
  assertEquals(
    teardownCount,
    1,
    "Teardown should not run again on unsubscribe after completion",
  );
});

test("MACRO: Cold semantics - each subscriber gets independent execution", () => {
  let executionCount = 0;

  const obs = new Observable<number>((observer) => {
    executionCount++;
    observer.next(executionCount);
    observer.complete();
  });

  const values1: number[] = [];
  const values2: number[] = [];

  obs.subscribe((v) => values1.push(v));
  obs.subscribe((v) => values2.push(v));

  assertEquals(executionCount, 2, "Should execute twice for two subscribers");
  assertArrayEquals(values1, [1], "First subscriber gets first execution");
  assertArrayEquals(
    values2,
    [2],
    "Second subscriber gets independent execution",
  );
});

test("MACRO: Memory safety - unsubscribe prevents further emissions", () => {
  const values: number[] = [];
  let emitCount = 0;

  const obs = new Observable<number>((observer) => {
    const id = setInterval(() => {
      emitCount++;
      observer.next(emitCount);
    }, 10);
    return () => clearInterval(id);
  });

  const sub = obs.subscribe((v) => values.push(v));

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      sub.unsubscribe();
      const capturedCount = values.length;

      setTimeout(() => {
        assertEquals(
          values.length,
          capturedCount,
          "No new values after unsubscribe",
        );
        resolve();
      }, 50);
    }, 35);
  });
});

test("MACRO: Error handling - errors caught by error callback", async () => {
  let errorCaught = false;

  const obs = new Observable<number>((observer) => {
    observer.error(new Error("Test error"));
  });

  // Subscribe WITH error handler - should catch the error
  obs.subscribe({
    next: () => {},
    error: () => {
      errorCaught = true;
    },
  });

  // Wait for microtask
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertTrue(errorCaught, "Error should be caught by error callback");
});

test("MACRO: Type safety - generics preserved through operations", () => {
  const obs = Observable.of(1, 2, 3);

  // This would fail at compile time if generics weren't preserved
  const values: number[] = [];
  obs.subscribe((v) => {
    // TypeScript should know v is number
    values.push(v * 2);
  });

  assertTrue(
    values.every((v) => typeof v === "number"),
    "Values maintain number type",
  );
});

// ============================================================================
// MICRO INTENT TESTS: Component-specific behaviors
// ============================================================================

test("MICRO: Observable.of - emits values then completes", () => {
  const values: number[] = [];
  let completed = false;

  Observable.of(1, 2, 3).subscribe({
    next: (v) => values.push(v),
    complete: () => completed = true,
  });

  assertArrayEquals(values, [1, 2, 3], "Should emit all values");
  assertTrue(completed, "Should complete after values");
});

test("MICRO: Observable error propagation to error callback", () => {
  const errors: Error[] = [];

  const obs = new Observable<number>((observer) => {
    observer.error(new Error("Test error"));
  });

  obs.subscribe({
    next: () => {},
    error: (e) => errors.push(e as Error),
  });

  assertEquals(errors.length, 1, "Error should propagate to callback");
  assertEquals(errors[0].message, "Test error", "Error message preserved");
});

test("MICRO: Queue O(1) operations - circular buffer", () => {
  const queue = createQueue<number>(5);

  // Fill queue
  enqueue(queue, 1);
  enqueue(queue, 2);
  enqueue(queue, 3);
  enqueue(queue, 4);
  enqueue(queue, 5);

  assertTrue(isFull(queue), "Queue should be full");

  // Dequeue two
  assertEquals(dequeue(queue), 1, "FIFO: first in, first out");
  assertEquals(dequeue(queue), 2, "FIFO: second out");

  // Enqueue two more (circular wrap)
  enqueue(queue, 6);
  enqueue(queue, 7);

  assertTrue(isFull(queue), "Queue full again after circular wrap");

  // Verify FIFO order maintained
  assertEquals(dequeue(queue), 3, "Circular wrap preserves FIFO");
  assertEquals(dequeue(queue), 4);
  assertEquals(dequeue(queue), 5);
  assertEquals(dequeue(queue), 6);
  assertEquals(dequeue(queue), 7);

  assertTrue(isEmpty(queue), "Queue empty after all dequeued");
});

test("MICRO: Queue peek - non-destructive read", () => {
  const queue = createQueue<string>(3);

  enqueue(queue, "first");
  enqueue(queue, "second");

  assertEquals(peek(queue), "first", "Peek returns front item");
  assertEquals(peek(queue), "first", "Peek doesn't remove item");

  dequeue(queue);
  assertEquals(peek(queue), "second", "Peek shows new front after dequeue");
});

test("MICRO: Queue clear - instant emptying", () => {
  const queue = createQueue<number>(10);

  for (let i = 0; i < 10; i++) {
    enqueue(queue, i);
  }

  assertTrue(isFull(queue), "Queue full before clear");

  clear(queue);

  assertTrue(isEmpty(queue), "Queue empty after clear");
  assertEquals(queue.head, 0, "Head reset");
  assertEquals(queue.tail, 0, "Tail reset");
  assertEquals(queue.size, 0, "Size reset");
});

test("MICRO: ObservableError wrapping preserves context", () => {
  const originalError = new Error("Original");
  const wrappedError = ObservableError.from(
    originalError,
    "testOperator",
    { value: 42 },
  );

  assertTrue(isObservableError(wrappedError), "Should be ObservableError");
  assertEquals(
    wrappedError.operator,
    "testOperator",
    "Operator context preserved",
  );
  // Value is stored as-is, might be any type
  assertTrue(wrappedError.value !== undefined, "Value context preserved");
  assertTrue(
    wrappedError.errors.includes(originalError),
    "Original error wrapped",
  );
});

test("MICRO: Observable sync error in observer is caught", () => {
  let errorCaught = false;

  const obs = new Observable<number>((observer) => {
    setTimeout(() => observer.next(1), 0);
    return () => {
      // Teardown
    };
  });

  // Subscribe with error handler to catch the sync error
  obs.subscribe({
    next: () => {
      throw new Error("Sync error in observer");
    },
    error: () => {
      errorCaught = true;
    },
  });

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      assertTrue(errorCaught, "Error in observer should be caught");
      resolve();
    }, 20);
  });
});

test("MICRO: Observable unsubscribe is idempotent", () => {
  let teardownCount = 0;

  const obs = new Observable<number>((observer) => {
    observer.next(1);
    return () => {
      teardownCount++;
    };
  });

  const sub = obs.subscribe(() => {});

  sub.unsubscribe();
  sub.unsubscribe();
  sub.unsubscribe();

  assertEquals(
    teardownCount,
    1,
    "Teardown runs exactly once despite multiple unsubscribes",
  );
});

// ============================================================================
// INTEGRATION TESTS: Cross-component behavior
// ============================================================================

test("INTEGRATION: Observable + Queue - buffering pattern", () => {
  const queue = createQueue<number>(10);
  const emitted: number[] = [];

  const obs = new Observable<number>((observer) => {
    // Producer: add to queue
    for (let i = 1; i <= 5; i++) {
      enqueue(queue, i);
    }

    // Consumer: drain queue
    while (!isEmpty(queue)) {
      const value = dequeue(queue);
      if (value !== undefined) {
        observer.next(value);
      }
    }

    observer.complete();
  });

  obs.subscribe((v) => emitted.push(v));

  assertArrayEquals(
    emitted,
    [1, 2, 3, 4, 5],
    "Queue buffering works with Observable",
  );
});

test("INTEGRATION: Error handling consistency across components", () => {
  const errors: ObservableError[] = [];

  const obs = new Observable<number>((observer) => {
    observer.next(1);
    // Simulate operator error
    const opError = ObservableError.from(
      new Error("Operator failed"),
      "map",
      1,
    );
    observer.error(opError);
  });

  obs.subscribe({
    next: () => {},
    error: (e) => {
      if (isObservableError(e)) {
        errors.push(e);
      }
    },
  });

  assertEquals(errors.length, 1, "Error propagated");
  assertEquals(errors[0].operator, "map", "Operator context maintained");
  assertTrue(isObservableError(errors[0]), "Error type preserved");
});

// ============================================================================
// PERFORMANCE & MEMORY TESTS
// ============================================================================

test("PERFORMANCE: Queue preserves FIFO order through wrap-around cycles", () => {
  const queue = createQueue<number>(10000);

  // Fill queue completely so the tail reaches the end of the buffer.
  for (let i = 0; i < 10000; i++) {
    enqueue(queue, i);
  }
  assertTrue(isFull(queue), "Queue should be full after initial fill");

  // Remove half the items so the head advances into the middle.
  for (let i = 0; i < 5000; i++) {
    assertEquals(
      dequeue(queue),
      i,
      "Dequeues should stay FIFO before wrap-around",
    );
  }
  assertEquals(getSize(queue), 5000, "Half the queue should remain");

  // Refill so the tail wraps back to the front of the circular buffer.
  for (let i = 10000; i < 15000; i++) {
    enqueue(queue, i);
  }
  assertTrue(
    isFull(queue),
    "Queue should be full again after wrap-around refill",
  );

  const remaining = [];
  while (!isEmpty(queue)) {
    remaining.push(dequeue(queue)!);
  }

  assertArrayEquals(
    remaining,
    [
      ...Array.from({ length: 5000 }, (_, index) => index + 5000),
      ...Array.from({ length: 5000 }, (_, index) => index + 10000),
    ],
    "Wrap-around should preserve FIFO order across the full drain",
  );
});

test("MEMORY: Observable cleanup prevents leaks", () => {
  const subscriptions: Array<{ unsubscribe(): void; closed: boolean }> = [];

  // Create many subscriptions
  for (let i = 0; i < 1000; i++) {
    const obs = new Observable<number>((observer) => {
      const interval = setInterval(() => observer.next(i), 1000);
      return () => clearInterval(interval);
    });

    const sub = obs.subscribe(() => {});
    subscriptions.push(sub);
  }

  // Unsubscribe all
  subscriptions.forEach((sub) => sub.unsubscribe());

  // All subscriptions should be closed
  assertTrue(
    subscriptions.every((sub) => sub.closed),
    "All subscriptions properly closed",
  );
});
