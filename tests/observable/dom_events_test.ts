// @ts-nocheck WIP
import { test, expect, fn } from "@libs/testing";

import { Observable } from "../../observable.ts";

// -----------------------------------------------------------------------------
// Documentation Examples - Keyboard Events
// -----------------------------------------------------------------------------

test("listen example creates an Observable for DOM events", () => {
  // Mock DOM element
  const element = {
    addEventListener: fn(() => { }),
    removeEventListener: fn(() => { })
  };

  // Create a listen function as shown in the docs
  function listen(element, eventName) {
    return new Observable(observer => {
      // Create an event handler which sends data to the sink
      const handler = event => observer.next(event);

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
  const addEventSpy = element.addEventListener;
  const removeEventSpy = element.removeEventListener;

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
    addEventListener: fn(() => {
      // Store the handler for later triggering
      mockEvents.push(handler);
    }),
    removeEventListener: fn(() => { })
  };

  // Create helper functions as shown in the docs
  function listen(element, eventName) {
    return new Observable(observer => {
      const handler = event => observer.next(event);
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
    const keyCommands = { "38": "up", "40": "down" };

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
// DOM Events Example Tests
// -----------------------------------------------------------------------------

test("listen function creates an Observable for DOM events", () => {
  // Mock DOM element with event tracking
  const eventLog = [];
  const mockElement = {
    listeners: {},
    addEventListener(eventName, handler) {
      this.listeners[eventName] = this.listeners[eventName] || [];
      this.listeners[eventName].push(handler);
      eventLog.push(`added ${eventName} listener`);
    },
    removeEventListener(eventName, handler) {
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
      const handler = event => observer.next(event);

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
    listeners: {} as Record<string, ((...args: unknown) => unknown)[]>,
    addEventListener(this: { listeners: Record<string, ((...args: unknown) => unknown)[]> }, eventName: string, handler: ((...args: unknown) => unknown)) {
      this.listeners[eventName] = this.listeners[eventName] || [];
      this.listeners[eventName].push(handler);
    },
    removeEventListener(this: { listeners: Record<string, ((...args: unknown) => unknown)[]> }, eventName: string, handler: ((...args: unknown) => unknown)) {
      if (this.listeners[eventName]) {
        this.listeners[eventName] = this.listeners[eventName].filter(h => h !== handler);
      }
    },
    // Helper to simulate events
    dispatchEvent(this: { listeners: Record<string, ((...args: unknown) => unknown)[]> }, eventName: string, data: unknown) {
      if (this.listeners[eventName]) {
        this.listeners[eventName].forEach(handler => handler(data));
      }
    }
  };

  // Add filter and map methods to Observable prototype for testing
  Observable.prototype.filter = function (predicate: ((...args: unknown) => unknown)) {
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

  Observable.prototype.map = function (mapper: ((...args: unknown) => unknown)) {
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
  function listen(element: typeof mockElement, eventName: string) {
    return new Observable(observer => {
      const handler = event => observer.next(event);
      element.addEventListener(eventName, handler, true);
      return () => element.removeEventListener(eventName, handler, true);
    });
  }

  // Implement the commandKeys function from the documentation
  function commandKeys(element: typeof mockElement) {
    const keyCommands = { "38": "up", "40": "down" };

    return listen(element, "keydown")
      .filter(event => event.keyCode in keyCommands)
      .map(event => keyCommands[event.keyCode]);
  }

  // Test the function
  const commands: string[] = [];
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