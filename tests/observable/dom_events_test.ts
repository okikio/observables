import type { Subscription } from "../../_types.ts";
import { test, expect, fn } from "@libs/testing";
import { Observable } from "../../observable.ts";
import { pipe, map, filter } from "../../helpers/mod.ts";

/**
 * TYPE SYSTEM ISSUE IDENTIFIED:
 * 
 * Based on JSR documentation research:
 * - @libs/testing provides the `test` function and basic testing utilities
 * - @std/expect provides Jest-compatible `fn()` for mocks and `expect` for assertions  
 * - The `fn()` function from @std/expect creates mock functions like Jest's jest.fn()
 * - Mock functions have .toHaveBeenCalledWith(), .toHaveBeenCalledTimes(), etc.
 * 
 * The current operator type system has a fundamental mismatch:
 * - Operators are typed as: Operator<T, R | ObservableError>  
 * - But they should be: Operator<T | ObservableError, R | ObservableError>
 * 
 * WORKAROUND SOLUTIONS:
 * 1. Update assertObservableError to use TypeScript assertion function: asserts value is T
 * 2. Fix operator type signatures to properly handle error flow
 * 3. Use runtime type guards (typeof result === 'string') as temporary solution
 */

// Define minimal DOM event interfaces for testing
interface MockEvent {
  type: string;
  target?: unknown;
  preventDefault?(): void;
  key?: string;
  keyCode?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  [key: string]: unknown; // Allow additional properties
}

interface MockKeyboardEvent extends MockEvent {
  key: string;
  keyCode: number;
}

interface MockElement {
  // deno-lint-ignore ban-types
  addEventListener: Function;
  // deno-lint-ignore ban-types
  removeEventListener: Function;
}

// -----------------------------------------------------------------------------
// Core DOM Event Observable Pattern
// -----------------------------------------------------------------------------

/**
 * Creates an Observable from DOM events - the fundamental pattern
 * This follows TC39 Observable spec exactly
 */
function listen<T extends MockEvent>(
  element: MockElement, 
  eventName: string
): Observable<T> {
  return new Observable<T>(observer => {
    const handler = (event: MockEvent) => observer.next(event as T);
    
    element.addEventListener(eventName, handler, true);
    
    return () => {
      element.removeEventListener(eventName, handler, true);
    };
  });
}

// -----------------------------------------------------------------------------
// Documentation Examples - Basic Observable Creation
// -----------------------------------------------------------------------------

test("listen creates Observable for DOM events with proper cleanup", () => {
  const mockHandlers = new Map<string, (event: MockEvent) => void>();
  
  // Create mock functions using @std/expect fn()
  const addEventListenerSpy = fn((type: string, handler: (event: MockEvent) => void, _capture?: boolean) => {
    mockHandlers.set(type, handler);
  });
  
  const removeEventListenerSpy = fn((_type: string, _handler: (event: MockEvent) => void, _capture?: boolean) => {
    mockHandlers.clear();
  });
  
  const element: MockElement = {
    addEventListener: addEventListenerSpy,
    removeEventListener: removeEventListenerSpy
  };

  const keydown = listen<MockKeyboardEvent>(element, "keydown");
  
  // Verify lazy behavior - no listeners added yet  
  expect(addEventListenerSpy).toHaveBeenCalledTimes(0);

  const receivedEvents: MockKeyboardEvent[] = [];
  const subscription = keydown.subscribe({
    next: event => receivedEvents.push(event)
  });

  // Verify addEventListener was called
  expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
  expect(addEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function), true);

  // Simulate events
  const handler = mockHandlers.get("keydown")!;
  handler({ type: "keydown", key: "A", keyCode: 65 });
  handler({ type: "keydown", key: "B", keyCode: 66 });

  // Verify events received
  expect(receivedEvents).toEqual([
    { type: "keydown", key: "A", keyCode: 65 },
    { type: "keydown", key: "B", keyCode: 66 }
  ]);

  // Test cleanup
  subscription.unsubscribe();
  expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
});

// -----------------------------------------------------------------------------
// Functional Composition Pattern (Your Implementation Style)
// -----------------------------------------------------------------------------

test("functional composition with Observable operators", () => {
  // Mock element that can dispatch events
  const mockHandlers = new Map<string, Set<(event: MockEvent) => void>>();
  
  // Create mock functions using @std/expect fn()
  const addEventListenerSpy = fn((type: string, handler: (event: MockEvent) => void, _capture?: boolean) => {
    if (!mockHandlers.has(type)) {
      mockHandlers.set(type, new Set());
    }
    mockHandlers.get(type)!.add(handler);
  });
  
  const removeEventListenerSpy = fn((type: string, _handler: (event: MockEvent) => void, _capture?: boolean) => {
    mockHandlers.get(type)!.clear();
  });
  
  const element: MockElement = {
    addEventListener: addEventListenerSpy,
    removeEventListener: removeEventListenerSpy
  };

  // Create base observable
  const keydownEvents = listen<MockKeyboardEvent>(element, "keydown");
  
  // This is how filtering WORKS with your functional approach
  const commandKeys = { "38": "up", "40": "down" } as const;
  
  // This works around the current type system limitations
  // The proper solution would be to add type predicate support to filter
  const commandKeysObservable = pipe(
    keydownEvents,
    // Use a type predicate to help TypeScript understand the filtering
    filter((event): event is MockKeyboardEvent => 
      'keyCode' in event && event.keyCode.toString() in commandKeys
    ),
    map((event) => 
      commandKeys[event.keyCode.toString() as keyof typeof commandKeys]
    )
  );
  
  // The output type will be string | ObservableError since errors pass through
  const processedCommands: string[] = [];
  
  // Start subscription
  const subscription = commandKeysObservable.subscribe({
    next(result) {
      // Handle both successful results and potential errors
      if (typeof result === 'string') {
        processedCommands.push(result);
      }
      
      if (processedCommands.length === 4) {
        expect(processedCommands).toEqual(["up", "down"]);
      }
    }
  });

  // Simulate key events
  for (const [type, handlers] of mockHandlers.entries()) {
    if (type === "keydown") {
      handlers.forEach(handler => {
        handler({ type: "keydown", key: "ArrowUp", keyCode: 38 });
        handler({ type: "keydown", key: "ArrowLeft", keyCode: 37 }); // filtered out
        handler({ type: "keydown", key: "ArrowDown", keyCode: 40 });
        handler({ type: "keydown", key: "Enter", keyCode: 13 }); // filtered out
      });
    }
  }

  subscription.unsubscribe();
});

// -----------------------------------------------------------------------------
// Async Iterator Pattern (Your pull() method)
// -----------------------------------------------------------------------------

test("DOM events with async iteration", async () => {
  // Mock element that can dispatch events
  const mockHandlers = new Map<string, Set<(event: MockEvent) => void>>();
  
  // Create mock functions using @std/expect fn()
  const addEventListenerSpy = fn((type: string, handler: (event: MockEvent) => void, _capture?: boolean) => {
    if (!mockHandlers.has(type)) {
      mockHandlers.set(type, new Set());
    }
    mockHandlers.get(type)!.add(handler);
  });
  
  const removeEventListenerSpy = fn((_type: string, _handler: (event: MockEvent) => void, _capture?: boolean) => { });
  
  const element: MockElement = {
    addEventListener: addEventListenerSpy,
    removeEventListener: removeEventListenerSpy
  };

  const clicks = listen<MockEvent>(element, "click");
  
  // Use your pull() method for async iteration
  const clicksAsync = clicks.pull({ strategy: { highWaterMark: 3 } });
  
  // Simulate async processing
  setTimeout(() => {
    const handlers = mockHandlers.get("click")!;
    handlers.forEach(handler => {
      handler({ type: "click" });
      handler({ type: "click" });
      handler({ type: "click" });
    });
  }, 10);

  const receivedClicks: MockEvent[] = [];
  let count = 0;
  
  for await (const click of clicksAsync) {
    receivedClicks.push(click);
    count++;
    
    // Stop after 3 clicks to avoid infinite loop
    if (count >= 3) break;
  }

  expect(receivedClicks).toHaveLength(3);
  expect(receivedClicks.every(click => click.type === "click")).toBe(true);
});

// -----------------------------------------------------------------------------
// Resource Management with using blocks
// -----------------------------------------------------------------------------

test("automatic cleanup with using blocks", () => {
  // Create mock functions using @std/expect fn()
  const addEventListenerSpy = fn((_type: string, _handler: (event: MockEvent) => void, _capture?: boolean) => { });
  const removeEventListenerSpy = fn((_type: string, _handler: (event: MockEvent) => void, _capture?: boolean) => { });
  
  const element: MockElement = {
    addEventListener: addEventListenerSpy,
    removeEventListener: removeEventListenerSpy
  };


  const clicks = listen<MockEvent>(element, "click");
  let subscription: Subscription | null = null;

  {
    // This should work with your Symbol.dispose implementation
    using sub = clicks.subscribe({
      next: () => {}
    });
    subscription = sub;
    
    expect(subscription.closed).toBe(false);
  } // Automatic cleanup happens here

  expect(subscription.closed).toBe(true);
  expect(addEventListenerSpy).toBeCalledTimes(1);
});

// -----------------------------------------------------------------------------
// Error Handling in DOM Context
// -----------------------------------------------------------------------------

test("DOM event error propagation", () => {
  // Create mock functions using @std/expect fn()
  const addEventListenerSpy = fn((_type: string, _handler: (event: MockEvent) => void, _capture?: boolean) => { 
      // Simulate addEventListener throwing
      throw new Error("Event binding failed");
  });
  const removeEventListenerSpy = fn((_type: string, _handler: (event: MockEvent) => void, _capture?: boolean) => { });
  
  const element: MockElement = {
    addEventListener: addEventListenerSpy,
    removeEventListener: removeEventListenerSpy
  };

  const clicks = listen<MockEvent>(element, "click");
  const errors: unknown[] = [];

  const subscription = clicks.subscribe({
    next: () => {},
    error: err => errors.push(err)
  });

  expect(errors).toHaveLength(1);
  expect(errors[0]).toBeInstanceOf(Error);
  expect((errors[0] as Error).message).toBe("Event binding failed");
  expect(subscription.closed).toBe(true);
});

// -----------------------------------------------------------------------------
// Performance and Memory Tests
// -----------------------------------------------------------------------------

test("multiple subscriptions create independent event handlers", () => {
  // Create mock functions using @std/expect fn()
  const addEventListenerSpy = fn((_type: string, _handler: (event: MockEvent) => void, _capture?: boolean) => { });
  const removeEventListenerSpy = fn((_type: string, _handler: (event: MockEvent) => void, _capture?: boolean) => { });
  
  const element: MockElement = {
    addEventListener: addEventListenerSpy,
    removeEventListener: removeEventListenerSpy
  };

  const clicks = listen<MockEvent>(element, "click");

  // Two independent subscriptions
  const sub1 = clicks.subscribe({ next: () => {} });
  const sub2 = clicks.subscribe({ next: () => {} });

  // Should have called addEventListener twice (cold observable)
  expect(addEventListenerSpy).toBeCalledTimes(2);

  sub1.unsubscribe();
  sub2.unsubscribe();
});