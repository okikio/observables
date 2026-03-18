/**
 * Tests for Observable-based event patterns: EventBus (simple multicast), EventDispatcher
 * (type-safe routing), withReplay (buffer for late subscribers), and waitForEvent (Promise-based
 * waiting). These replace EventEmitter patterns with automatic cleanup, full TypeScript inference,
 * and operator composability.
 * 
 * EventBus multicasts to all subscribers (loudspeaker analogy), EventDispatcher routes typed
 * messages to specific handlers, withReplay buffers recent values (DVR: lazy mode records only
 * when subscribers present, eager always records), waitForEvent returns Promise that resolves
 * on event (supports AbortSignal cancellation).
 */

import { describe, it } from '@std/testing/bdd';
import { expect } from '@std/expect';

import { 
  EventBus,
  createEventDispatcher,
  waitForEvent,
  withReplay,
  type EventMap,
} from '../events.ts';
import { Observable } from '../observable.ts';

describe("EventBus", () => {
  describe("Basic Operations", () => {
    it("should create an empty event bus", () => {
      const bus = new EventBus<string>();
      expect(bus).toBeDefined();
      expect(bus.events).toBeDefined();
    });

    it("should emit values to subscribers", () => {
      const bus = new EventBus<string>();
      const received: string[] = [];

      bus.events.subscribe({
        next: (value: string) => received.push(value)
      });

      bus.emit('hello');
      bus.emit('world');

      expect(received).toEqual(['hello', 'world']);
    });

    it("should emit to multiple subscribers", () => {
      const bus = new EventBus<number>();
      const received1: number[] = [];
      const received2: number[] = [];

      bus.events.subscribe({ next: (v: number) => received1.push(v) });
      bus.events.subscribe({ next: (v: number) => received2.push(v) });

      bus.emit(1);
      bus.emit(2);

      expect(received1).toEqual([1, 2]);
      expect(received2).toEqual([1, 2]);
    });

    it("should not emit to unsubscribed listeners", () => {
      const bus = new EventBus<string>();
      const received: string[] = [];

      const subscription = bus.events.subscribe({
        next: (value: string) => received.push(value)
      });

      bus.emit('before');
      subscription.unsubscribe();
      bus.emit('after');

      expect(received).toEqual(['before']);
    });

    it("should handle different data types", () => {
      const stringBus = new EventBus<string>();
      const objectBus = new EventBus<{ id: number; name: string }>();
      const arrayBus = new EventBus<number[]>();

      let stringValue: string | undefined;
      let objectValue: { id: number; name: string } | undefined;
      let arrayValue: number[] | undefined;

      stringBus.events.subscribe({ next: (v: string) => stringValue = v });
      objectBus.events.subscribe({ next: (v: { id: number; name: string }) => objectValue = v });
      arrayBus.events.subscribe({ next: (v: number[]) => arrayValue = v });

      stringBus.emit('test');
      objectBus.emit({ id: 1, name: 'Alice' });
      arrayBus.emit([1, 2, 3]);

      expect(stringValue).toBe('test');
      expect(objectValue).toEqual({ id: 1, name: 'Alice' });
      expect(arrayValue).toEqual([1, 2, 3]);
    });
  });

  describe("Closing the Bus", () => {
    it("should complete all subscribers when closed", () => {
      const bus = new EventBus<number>();
      let completed = false;

      bus.events.subscribe({
        next: () => {},
        complete: () => { completed = true; }
      });

      bus.close();
      expect(completed).toBe(true);
    });

    it("should not emit after closing", () => {
      const bus = new EventBus<string>();
      const received: string[] = [];

      bus.events.subscribe({ next: (v: string) => received.push(v) });

      bus.emit('before');
      bus.close();
      bus.emit('after');

      expect(received).toEqual(['before']);
    });

    it("should immediately complete new subscribers after closing", () => {
      const bus = new EventBus<number>();
      bus.close();

      let completed = false;
      bus.events.subscribe({
        next: () => {},
        complete: () => { completed = true; }
      });

      expect(completed).toBe(true);
    });

    it("should be idempotent (safe to call multiple times)", () => {
      const bus = new EventBus<number>();
      let completedCount = 0;

      bus.events.subscribe({
        complete: () => { completedCount++; }
      });

      bus.close();
      bus.close();
      bus.close();

      expect(completedCount).toBe(1); // Only completed once
    });
  });

  describe("Resource Management", () => {
    it("should support using syntax for automatic cleanup", () => {
      let completed = false;

      {
        using bus = new EventBus<number>();
        bus.events.subscribe({
          complete: () => { completed = true; }
        });

        bus.emit(1);
      } // Automatically calls dispose

      expect(completed).toBe(true);
    });

    it("should support async using syntax", async () => {
      let completed = false;

      const bus = new EventBus<number>();
      bus.events.subscribe({
        complete: () => { completed = true; }
      });

      bus.emit(1);
      await bus[Symbol.asyncDispose]();

      expect(completed).toBe(true);
    });

    it("should close subscriptions when the bus closes", () => {
      const bus = new EventBus<number>();
      
      const sub1 = bus.events.subscribe({ next: () => {} });
      const sub2 = bus.events.subscribe({ next: () => {} });
      const sub3 = bus.events.subscribe({ next: () => {} });

      bus.close();

      expect(sub1.closed).toBe(true);
      expect(sub2.closed).toBe(true);
      expect(sub3.closed).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle rapid emit/subscribe cycles", () => {
      const bus = new EventBus<number>();
      const received: number[] = [];

      for (let i = 0; i < 100; i++) {
        bus.events.subscribe({ next: (v: number) => received.push(v) });
        bus.emit(i);
      }

      // Each subscriber only gets emissions after it subscribes
      // So we get a triangular pattern
      expect(received.length).toBeGreaterThan(0);
    });

    it("should handle undefined and null values", () => {
      const bus = new EventBus<number | null | undefined>();
      const received: Array<number | null | undefined> = [];

      bus.events.subscribe({ next: (v: number | null | undefined) => received.push(v) });

      bus.emit(undefined);
      bus.emit(null);
      bus.emit(0);

      expect(received).toEqual([undefined, null, 0]);
    });

    it("should handle errors in subscriber callbacks gracefully", () => {
      const bus = new EventBus<number>();
      const received: number[] = [];

      // First subscriber throws
      bus.events.subscribe({
        next: () => { throw new Error('Subscriber error'); },
        error: () => {} // Catch the error
      });

      // Second subscriber should still work
      bus.events.subscribe({
        next: (v: number) => received.push(v)
      });

      bus.emit(1);

      // Second subscriber should still receive the value
      expect(received).toEqual([1]);
    });
  });

  describe("Multicast Behavior", () => {
    it("should multicast to all active subscribers", () => {
      const bus = new EventBus<string>();
      const logs: string[] = [];

      // Three subscribers
      bus.events.subscribe({ next: () => logs.push('sub1') });
      bus.events.subscribe({ next: () => logs.push('sub2') });
      bus.events.subscribe({ next: () => logs.push('sub3') });

      bus.emit('event');

      // All three should receive
      expect(logs.length).toBe(3);
      expect(logs).toContain('sub1');
      expect(logs).toContain('sub2');
      expect(logs).toContain('sub3');
    });

    it("should only emit to subscribers present at emit time", () => {
      const bus = new EventBus<number>();
      const early: number[] = [];
      const late: number[] = [];

      bus.events.subscribe({ next: (v: number) => early.push(v) });
      bus.emit(1);

      bus.events.subscribe({ next: (v: number) => late.push(v) });
      bus.emit(2);

      expect(early).toEqual([1, 2]);
      expect(late).toEqual([2]); // Missed the first emit
    });
  });
});

describe("EventDispatcher (Type-Safe Event Bus)", () => {
  // Define event types for testing
  interface TestEvents extends EventMap {
    message: { text: string; priority: number };
    status: { code: number; message: string };
    simple: string;
    noPayload: void;
  }

  describe("Basic Operations", () => {
    it("should create a typed event dispatcher", () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      expect(dispatcher).toBeDefined();
      expect(dispatcher.emit).toBeDefined();
      expect(dispatcher.on).toBeDefined();
      expect(dispatcher.events).toBeDefined();
    });

    it("should emit and receive typed events", () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      let received: { text: string; priority: number } | undefined;

      dispatcher.on('message', (payload: { text: string; priority: number }) => {
        received = payload;
      });

      dispatcher.emit('message', { text: 'Hello', priority: 1 });

      expect(received).toEqual({ text: 'Hello', priority: 1 });
    });

    it("should only trigger matching event handlers", () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      const messageLogs: string[] = [];
      const statusLogs: string[] = [];

      dispatcher.on('message', () => messageLogs.push('message'));
      dispatcher.on('status', () => statusLogs.push('status'));

      dispatcher.emit('message', { text: 'test', priority: 1 });
      dispatcher.emit('message', { text: 'test2', priority: 2 });
      dispatcher.emit('status', { code: 200, message: 'OK' });

      expect(messageLogs.length).toBe(2);
      expect(statusLogs.length).toBe(1);
    });

    it("should support multiple listeners for same event", () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      const listener1: string[] = [];
      const listener2: string[] = [];

      dispatcher.on('simple', (text: string) => listener1.push(text));
      dispatcher.on('simple', (text: string) => listener2.push(text));

      dispatcher.emit('simple', 'test');

      expect(listener1).toEqual(['test']);
      expect(listener2).toEqual(['test']);
    });

    it("should handle void payload events", () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      let called = false;

      dispatcher.on('noPayload', () => {
        called = true;
      });

      dispatcher.emit('noPayload', undefined);

      expect(called).toBe(true);
    });
  });

  describe("Subscription Management", () => {
    it("should return subscription with unsubscribe", () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      const received: string[] = [];

      const subscription = dispatcher.on('simple', (text: string) => {
        received.push(text);
      });

      dispatcher.emit('simple', 'before');
      subscription.unsubscribe();
      dispatcher.emit('simple', 'after');

      expect(received).toEqual(['before']);
    });

    it("should allow selective unsubscription", () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      const first: string[] = [];
      const second: string[] = [];

      const sub1 = dispatcher.on('simple', (text: string) => first.push(text));
      const sub2 = dispatcher.on('simple', (text: string) => second.push(text));

      dispatcher.emit('simple', '1');
      sub1.unsubscribe();
      dispatcher.emit('simple', '2');

      expect(first).toEqual(['1']);
      expect(second).toEqual(['1', '2']);
    });
  });

  describe("Closing the Dispatcher", () => {
    it("should close subscriptions returned by on()", () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      const subscription = dispatcher.on('message', () => {});

      dispatcher.close();

      expect(subscription.closed).toBe(true);
    });

    it("should support using syntax", () => {
      {
        using dispatcher = createEventDispatcher<TestEvents>();
        dispatcher.emit('simple', 'test');
      } // Automatically disposed
    });

    it("should support async using syntax", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      dispatcher.emit('simple', 'test');
      await dispatcher[Symbol.asyncDispose]();
    });
  });

  describe("Type Safety", () => {
    it("should enforce correct payload types at compile time", () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      // These should work (TypeScript compile-time check)
      dispatcher.emit('message', { text: 'test', priority: 1 });
      dispatcher.emit('status', { code: 200, message: 'OK' });
      dispatcher.emit('simple', 'string');
      dispatcher.emit('noPayload', undefined);

      // These would fail at compile time:
      // dispatcher.emit('message', 'wrong'); // Error: wrong type
      // dispatcher.emit('message', { text: 'ok' }); // Error: missing priority
      // dispatcher.emit('simple', 123); // Error: number instead of string
    });

    it("should provide correct types to handlers", () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      dispatcher.on('message', (payload: { text: string; priority: number }) => {
        // TypeScript knows payload is { text: string; priority: number }
        expect(typeof payload.text).toBe('string');
        expect(typeof payload.priority).toBe('number');
      });

      dispatcher.on('status', (payload: { code: number; message: string }) => {
        // TypeScript knows payload is { code: number; message: string }
        expect(typeof payload.code).toBe('number');
        expect(typeof payload.message).toBe('string');
      });

      dispatcher.emit('message', { text: 'test', priority: 1 });
      dispatcher.emit('status', { code: 200, message: 'OK' });
    });
  });

  describe("Real-World Scenarios", () => {
    it("should work for application state updates", () => {
      interface AppEvents extends EventMap {
        userLogin: { userId: string; timestamp: number };
        userLogout: { userId: string };
        dataUpdated: { collection: string; count: number };
      }

      const events = createEventDispatcher<AppEvents>();
      const loginLog: string[] = [];
      const updateLog: string[] = [];

      events.on('userLogin', ({ userId }: { userId: string; timestamp: number }) => {
        loginLog.push(userId);
      });

      events.on('dataUpdated', ({ collection, count }: { collection: string; count: number }) => {
        updateLog.push(`${collection}: ${count}`);
      });

      events.emit('userLogin', { userId: 'user123', timestamp: Date.now() });
      events.emit('dataUpdated', { collection: 'users', count: 5 });
      events.emit('userLogin', { userId: 'user456', timestamp: Date.now() });

      expect(loginLog).toEqual(['user123', 'user456']);
      expect(updateLog).toEqual(['users: 5']);
    });

    it("should work for error/status notifications", () => {
      interface SystemEvents extends EventMap {
        error: { code: string; message: string; severity: 'low' | 'high' };
        warning: { message: string };
        info: { message: string };
      }

      const events = createEventDispatcher<SystemEvents>();
      const errors: string[] = [];
      const warnings: string[] = [];

      events.on('error', ({ code, severity }: { code: string; message: string; severity: 'low' | 'high' }) => {
        if (severity === 'high') {
          errors.push(code);
        }
      });

      events.on('warning', ({ message }: { message: string }) => {
        warnings.push(message);
      });

      events.emit('error', { code: 'ERR_001', message: 'Test', severity: 'high' });
      events.emit('warning', { message: 'Watch out' });
      events.emit('error', { code: 'ERR_002', message: 'Test', severity: 'low' });

      expect(errors).toEqual(['ERR_001']); // Only high severity
      expect(warnings).toEqual(['Watch out']);
    });
  });
});

describe("waitForEvent()", () => {
  interface TestEvents extends EventMap {
    ready: { status: string };
    data: { value: number };
    error: { message: string };
    done: void;
  }

  describe("Basic Waiting", () => {
    it("should resolve when the event fires", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      const promise = waitForEvent(dispatcher, 'ready');

      // Emit after a short delay
      setTimeout(() => {
        dispatcher.emit('ready', { status: 'ok' });
      }, 10);

      const result = await promise;
      expect(result).toEqual({ status: 'ok' });
    });

    it("should resolve with correct payload type", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      const promise = waitForEvent(dispatcher, 'data');

      setTimeout(() => {
        dispatcher.emit('data', { value: 42 });
      }, 10);

      const result = await promise;
      expect(result?.value).toBe(42);
    });

    it("should only resolve for the matching event type", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      const promise = waitForEvent(dispatcher, 'ready');

      setTimeout(() => {
        dispatcher.emit('data', { value: 1 });
        dispatcher.emit('ready', { status: 'ok' });
      }, 10);

      const result = await promise;
      expect(result).toEqual({ status: 'ok' });
    });

    it("should handle void payloads", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      const promise = waitForEvent(dispatcher, 'done');

      setTimeout(() => {
        dispatcher.emit('done', undefined);
      }, 10);

      const result = await promise;
      expect(result).toBeUndefined();
    });
  });

  describe("Abort Signal Support", () => {
    it("should reject when aborted", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      const controller = new AbortController();

      const promise = waitForEvent(dispatcher, 'ready', { 
        signal: controller.signal 
      });

      setTimeout(() => controller.abort(), 10);

      await expect(promise).rejects.toThrow();
    });

    it("should reject immediately if already aborted", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      const controller = new AbortController();
      controller.abort();

      const promise = waitForEvent(dispatcher, 'ready', { 
        signal: controller.signal 
      });

      await expect(promise).rejects.toThrow();
    });

    it("should cleanup subscription when aborted", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      const controller = new AbortController();

      const promise = waitForEvent(dispatcher, 'ready', { 
        signal: controller.signal 
      });

      controller.abort();

      try {
        await promise;
      } catch {
        // Expected to reject
      }

      // Emitting after abort should not affect anything
      dispatcher.emit('ready', { status: 'ok' });
    });
  });

  describe("Stream Completion Handling", () => {
    it("should resolve undefined when stream completes (default)", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      const promise = waitForEvent(dispatcher, 'ready');

      setTimeout(() => dispatcher.close(), 10);

      const result = await promise;
      expect(result).toBeUndefined();
    });

    it("should reject when stream completes with throwOnClose", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      const promise = waitForEvent(dispatcher, 'ready', { 
        throwOnClose: true 
      });

      setTimeout(() => dispatcher.close(), 10);

      await expect(promise).rejects.toThrow('Stream closed');
      await expect(promise).rejects.toThrow('ready');
    });
  });

  describe("Error Handling", () => {
    it("should reject when the stream errors", async () => {
      const testError = new Error('Stream error');
      const bus = {
        events: new Observable<{ type: keyof TestEvents; payload: TestEvents[keyof TestEvents] }>((observer) => {
          observer.error(testError);
        }),
      };

      await expect(waitForEvent(bus, 'ready')).rejects.toThrow('Stream error');
    });
  });

  describe("Race Conditions", () => {
    it("should handle event emitted before wait", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      // Emit first
      dispatcher.emit('ready', { status: 'already done' });

      // Then wait - should not resolve with old event
      const promise = waitForEvent(dispatcher, 'ready');

      setTimeout(() => {
        dispatcher.emit('ready', { status: 'new event' });
      }, 10);

      const result = await promise;
      expect(result?.status).toBe('new event');
    });

    it("should handle multiple events of same type", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      const promise = waitForEvent(dispatcher, 'data');

      setTimeout(() => {
        dispatcher.emit('data', { value: 1 });
        dispatcher.emit('data', { value: 2 });
        dispatcher.emit('data', { value: 3 });
      }, 10);

      const result = await promise;
      expect(result?.value).toBe(1); // First one
    });
  });

  describe("Cleanup", () => {
    it("should cleanup subscription after resolving", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();

      const promise = waitForEvent(dispatcher, 'ready');

      setTimeout(() => {
        dispatcher.emit('ready', { status: 'ok' });
      }, 10);

      await promise;

      // After resolving, subscription should be cleaned up
      // Subsequent emits should not cause issues
      dispatcher.emit('ready', { status: 'after' });
    });

    it("should remove abort listener after completion", async () => {
      const dispatcher = createEventDispatcher<TestEvents>();
      const controller = new AbortController();

      const promise = waitForEvent(dispatcher, 'ready', { 
        signal: controller.signal 
      });

      setTimeout(() => {
        dispatcher.emit('ready', { status: 'ok' });
      }, 10);

      await promise;

      // Aborting after completion should be safe
      controller.abort();
    });
  });
});

// Note: withReplay tests are extensive and would benefit from a separate test file
// These are basic smoke tests to ensure the API works

describe("withReplay() - Basic Smoke Tests", () => {
  describe("Basic Replay", () => {
    it("should replay last value to new subscribers", async () => {
      const source = new Observable<number>((observer: { next: (value: number) => void; complete: () => void }) => {
        observer.next(1);
        observer.next(2);
        observer.next(3);
        observer.complete();
      });

      const replayed = withReplay(source, { count: 2, mode: 'eager' });

      // Let source complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // New subscriber should get last 2 values
      const received: number[] = [];
      replayed.subscribe({
        next: (v: number) => received.push(v)
      });

      expect(received).toEqual([2, 3]);
    });

    it("should multicast to multiple subscribers", () => {
      const source = new Observable<number>((observer: { next: (value: number) => void }) => {
        observer.next(1);
        observer.next(2);
      });

      const replayed = withReplay(source, { count: 10, mode: 'eager' });

      const received1: number[] = [];
      const received2: number[] = [];

      replayed.subscribe({ next: (v: number) => received1.push(v) });
      replayed.subscribe({ next: (v: number) => received2.push(v) });

      expect(received1.length).toBeGreaterThan(0);
      expect(received2.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should throw on invalid count", () => {
      const source = Observable.of(1, 2, 3);

      expect(() => withReplay(source, { count: 0 })).toThrow('positive');
      expect(() => withReplay(source, { count: -1 })).toThrow('positive');
    });
  });
});
