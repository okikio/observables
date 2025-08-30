/**
 * Comprehensive test suite for EventBus and Event Dispatcher
 * 
 * This test suite follows event emitter testing best practices:
 * - Uses expect-based assertions for cleaner syntax
 * - Tests synchronous and asynchronous scenarios  
 * - Verifies cleanup and resource management
 * - Tests error conditions and edge cases
 * - Follows AAA pattern (Arrange, Act, Assert)
 * - Tests timing and event ordering
 * 
 * @module
 */

import type { Subscription } from "../../_types.ts";
import type { EventMap } from "../../events.ts";

import { createEventDispatcher, waitForEvent, withReplay } from "../../events.ts";
import { expect, test, runtime } from "@libs/testing";
import { spy } from "@std/testing/mock";

// Import the modules under test
import { Observable } from "../../observable.ts";
import { EventBus } from "../../events.ts";

/**
 * Helper function to create a spy that captures event data
 */
function createEventSpy<T = unknown>() {
	const calls: T[] = [];
	const handler = (data: T) => calls.push(data);
	const spyHandler = spy(handler);
	return { handler: spyHandler, spy: spyHandler, calls };
}

test("EventBus - Basic event emission and subscription", () => {
	// Arrange
	const bus = new EventBus<string>();
	const { handler, spy: handlerSpy, calls } = createEventSpy<string>();

	// Act - Subscribe and emit
	const subscription = bus.subscribe({ next: handler });
	bus.emit("hello");
	bus.emit("world");

	// Assert
	expect(handlerSpy.calls.length).toBe(2);
	expect(handlerSpy.calls[0].args[0]).toBe("hello");
	expect(handlerSpy.calls[1].args[0]).toBe("world");  // Fixed: was calls[39]
	expect(calls).toEqual(["hello", "world"]);

	// Cleanup
	subscription.unsubscribe();
});

test("EventBus - Multiple subscribers receive same events", () => {
	// Arrange
	const bus = new EventBus<number>();
	const subscriber1 = createEventSpy<number>();
	const subscriber2 = createEventSpy<number>();

	// Act
	const sub1 = bus.subscribe({ next: subscriber1.handler });
	const sub2 = bus.subscribe({ next: subscriber2.handler });

	bus.emit(42);
	bus.emit(99);

	// Assert
	expect(subscriber1.spy.calls.length).toBe(2);
	expect(subscriber2.spy.calls.length).toBe(2);
	expect(subscriber1.calls).toEqual([42, 99]);
	expect(subscriber2.calls).toEqual([42, 99]);

	// Cleanup
	sub1.unsubscribe();
	sub2.unsubscribe();
});

test("EventBus - Events emitted after close are ignored", () => {
	// Arrange
	const bus = new EventBus<string>();
	const { handler, spy: handlerSpy } = createEventSpy<string>();

	// Act
	const subscription = bus.subscribe({ next: handler });
	bus.close();
	bus.emit("should-be-ignored");

	// Assert
	expect(handlerSpy.calls.length).toBe(0);

	// Cleanup
	subscription.unsubscribe();
});

test("EventBus - Subscribers get completion notification when bus closes", () => {
	// Arrange
	const bus = new EventBus<string>();
	const completeSpy = spy();

	// Act
	bus.subscribe({ complete: completeSpy });
	bus.close();

	// Assert
	expect(completeSpy.calls.length).toBe(1);
});

test("EventBus - Late subscribers to closed bus get immediate completion", () => {
	// Arrange
	const bus = new EventBus<string>();
	bus.close();

	// Act
	const completeSpy = spy();
	bus.subscribe({ complete: completeSpy });

	// Assert - Should complete immediately
	expect(completeSpy.calls.length).toBe(1);
});

test("EventBus - Resource cleanup with using blocks", () => {
	// Arrange & Act
	let bus: EventBus<string>;
	let subscription: Subscription;

	{
		using testBus = new EventBus<string>();
		bus = testBus;

		const { handler } = createEventSpy<string>();
		subscription = bus.subscribe({ next: handler });

		bus.emit("test");
	} // Bus should be automatically disposed here

	// Assert - Bus should be closed after using block
	expect(subscription.closed).toBe(true);
});

test("EventBus - Async disposal", async () => {
	// Arrange
	await using bus = new EventBus<string>();
	const { handler } = createEventSpy<string>();

	// Act
	const subscription = bus.subscribe({ next: handler });
	bus.emit("test");

	// Assert - Bus is still active
	expect(subscription.closed).toBe(false);

	// After async disposal, subscription should be closed
});

test("EventBus - Error handling in observers", () => {
	// Arrange
	const bus = new EventBus<string>();
	const errorHandler = spy();
	const nextHandler = spy(() => {
		throw new Error("Handler error");
	});

	// Act
	bus.subscribe({
		next: nextHandler,
		error: errorHandler
	});

	bus.emit("trigger-error");

	// Assert - Error handler should be called
	expect(nextHandler.calls.length).toBe(1);
	expect(errorHandler.calls.length).toBe(1);
});

test("EventBus - Memory cleanup verification", () => {
	// Arrange
	const bus = new EventBus<string>();
	const handlers = Array.from({ length: 100 }, () => createEventSpy<string>());

	// Act - Create many subscriptions
	const subscriptions = handlers.map(h => bus.subscribe({ next: h.handler }));

	// Emit some events
	bus.emit("test1");
	bus.emit("test2");

	// Verify all received events
	handlers.forEach(h => {
		expect(h.spy.calls.length).toBe(2);
	});

	// Cleanup all subscriptions
	subscriptions.forEach(sub => sub.unsubscribe());

	// Emit after cleanup - no handlers should be called
	const callCountsBefore = handlers.map(h => h.spy.calls.length);
	bus.emit("after-cleanup");
	const callCountsAfter = handlers.map(h => h.spy.calls.length);

	// Assert - No new calls after unsubscribe
	expect(callCountsBefore).toEqual(callCountsAfter);
});

test("Event Dispatcher - Type-safe event emission and handling", () => {
	interface TestEvents extends EventMap {
		userLogin: { userId: string; timestamp: number };
		userLogout: { userId: string };
		dataUpdate: { id: number; data: string };
		error: { code: number; message: string };
		simpleEvent: void;
	}

	// Arrange
	const dispatcher = createEventDispatcher<TestEvents>();
	const loginSpy = spy();
	const logoutSpy = spy();

	// Act
	const loginSub = dispatcher.on("userLogin", loginSpy);
	const logoutSub = dispatcher.on("userLogout", logoutSpy);

	dispatcher.emit("userLogin", { userId: "123", timestamp: Date.now() });
	dispatcher.emit("userLogout", { userId: "123" });

	// Assert
	expect(loginSpy.calls.length).toBe(1);
	expect(logoutSpy.calls.length).toBe(1);

	// Verify correct data was passed
	const loginCall = loginSpy.calls[0];
	expect(loginCall.args[0].userId).toBeDefined();  // Fixed: was loginCall.args.userId
	expect(loginCall.args[0].timestamp).toBeDefined();  // Fixed: was loginCall.args.timestamp
	expect(loginCall.args[0].userId).toBe("123");  // Fixed: was loginCall.args.userId

	// Cleanup
	loginSub.unsubscribe();
	logoutSub.unsubscribe();
	dispatcher.close();
});

test("Event Dispatcher - Event filtering - only matching events trigger handlers", () => {
	interface TestEvents extends EventMap {
		userLogin: { userId: string; timestamp: number };
		userLogout: { userId: string };
		dataUpdate: { id: number; data: string };
		error: { code: number; message: string };
		simpleEvent: void;
	}

	// Arrange
	const dispatcher = createEventDispatcher<TestEvents>();
	const loginSpy = spy();
	const logoutSpy = spy();

	// Act
	dispatcher.on("userLogin", loginSpy);
	dispatcher.on("userLogout", logoutSpy);

	// Emit different events
	dispatcher.emit("userLogin", { userId: "123", timestamp: Date.now() });
	dispatcher.emit("dataUpdate", { id: 1, data: "test" });
	dispatcher.emit("userLogout", { userId: "123" });

	// Assert - Each handler only called for its event type
	expect(loginSpy.calls.length).toBe(1);
	expect(logoutSpy.calls.length).toBe(1);

	dispatcher.close();
});

test("Event Dispatcher - Void event types", () => {
	interface TestEvents extends EventMap {
		userLogin: { userId: string; timestamp: number };
		userLogout: { userId: string };
		dataUpdate: { id: number; data: string };
		error: { code: number; message: string };
		simpleEvent: void;
	}

	// Arrange
	const dispatcher = createEventDispatcher<TestEvents>();
	const eventSpy = spy();

	// Act
	dispatcher.on("simpleEvent", eventSpy);
	dispatcher.emit("simpleEvent", undefined);

	// Assert
	expect(eventSpy.calls.length).toBe(1);
	expect(eventSpy.calls[0].args[0]).toBeUndefined();

	dispatcher.close();
});

test("Event Dispatcher - Multiple handlers for same event", () => {
	interface TestEvents extends EventMap {
		userLogin: { userId: string; timestamp: number };
		userLogout: { userId: string };
		dataUpdate: { id: number; data: string };
		error: { code: number; message: string };
		simpleEvent: void;
	}

	// Arrange
	const dispatcher = createEventDispatcher<TestEvents>();
	const handler1 = spy();
	const handler2 = spy();
	const handler3 = spy();

	// Act
	dispatcher.on("dataUpdate", handler1);
	dispatcher.on("dataUpdate", handler2);
	dispatcher.on("dataUpdate", handler3);

	dispatcher.emit("dataUpdate", { id: 42, data: "test-data" });

	// Assert - All handlers called
	expect(handler1.calls.length).toBe(1);
	expect(handler2.calls.length).toBe(1);
	expect(handler3.calls.length).toBe(1);

	// Verify same data passed to all
	const expectedPayload = { id: 42, data: "test-data" };
	expect(handler1.calls[0].args[0]).toEqual(expectedPayload);
	expect(handler2.calls[0].args[0]).toEqual(expectedPayload);  // Fixed: was handler2.calls.args
	expect(handler3.calls[0].args[0]).toEqual(expectedPayload);  // Fixed: was handler3.calls.args

	dispatcher.close();
});

test("Event Dispatcher - Resource disposal", () => {
	interface TestEvents extends EventMap {
		userLogin: { userId: string; timestamp: number };
		userLogout: { userId: string };
		dataUpdate: { id: number; data: string };
		error: { code: number; message: string };
		simpleEvent: void;
	}

	// Arrange & Act
	let dispatcher: ReturnType<typeof createEventDispatcher<TestEvents>>;

	{
		using testDispatcher = createEventDispatcher<TestEvents>();
		dispatcher = testDispatcher;

		const handler = spy();
		dispatcher.on("simpleEvent", handler);
		dispatcher.emit("simpleEvent", undefined);

		expect(handler.calls.length).toBe(1);
	} // Should dispose here

	// Assert - Emitting after disposal should not work
	const handler2 = spy();
	dispatcher.on("simpleEvent", handler2);
	dispatcher.emit("simpleEvent", undefined);

	// Handler should not be called because dispatcher is closed
	expect(handler2.calls.length).toBe(0);
});

test("waitForEvent utility - Resolves with payload when event fires", async () => {
	interface AsyncTestEvents extends EventMap {
		data: { value: number };
		error: { message: string };
		complete: void;
	}

	// Arrange
	const dispatcher = createEventDispatcher<AsyncTestEvents>();

	// Act - Start waiting for event
	const eventPromise = waitForEvent(dispatcher, "data");

	// Emit the event after a delay
	setTimeout(() => {
		dispatcher.emit("data", { value: 42 });
	}, 10);

	const result = await eventPromise;

	// Assert
	expect(result).toBeDefined();
	expect(result!.value).toBe(42);

	dispatcher.close();
});

test("waitForEvent utility - Resolves with undefined when stream completes before event", async () => {
	interface AsyncTestEvents extends EventMap {
		data: { value: number };
		error: { message: string };
		complete: void;
	}

	// Arrange
	const dispatcher = createEventDispatcher<AsyncTestEvents>();

	// Act
	const eventPromise = waitForEvent(dispatcher, "data");

	// Close dispatcher before event fires
	setTimeout(() => {
		dispatcher.close();
	}, 10);

	const result = await eventPromise;

	// Assert
	expect(result).toBeUndefined();
});

test("waitForEvent utility - Rejects when throwOnClose is true and stream completes", async () => {
	interface AsyncTestEvents extends EventMap {
		data: { value: number };
		error: { message: string };
		complete: void;
	}

	// Arrange
	const dispatcher = createEventDispatcher<AsyncTestEvents>();

	// Act
	const eventPromise = waitForEvent(dispatcher, "data", { throwOnClose: true });

	// Close dispatcher
	setTimeout(() => {
		dispatcher.close();
	}, 10);

	// Assert
	await expect(eventPromise).rejects.toThrow('Stream closed before event "data" fired');
});

test("waitForEvent utility - Supports AbortSignal for cancellation", async () => {
	interface AsyncTestEvents extends EventMap {
		data: { value: number };
		error: { message: string };
		complete: void;
	}

	// Arrange
	const dispatcher = createEventDispatcher<AsyncTestEvents>();
	const controller = new AbortController();

	// Act
	const eventPromise = waitForEvent(dispatcher, "data", {
		signal: controller.signal
	});

	// Abort after delay
	setTimeout(() => {
		controller.abort(new Error("Test cancellation"));
	}, 10);

	// Assert
	await expect(eventPromise).rejects.toThrow("Test cancellation");

	dispatcher.close();
});

test("waitForEvent utility - Immediate abort", async () => {
	interface AsyncTestEvents extends EventMap {
		data: { value: number };
		error: { message: string };
		complete: void;
	}

	// Arrange
	const dispatcher = createEventDispatcher<AsyncTestEvents>();
	const controller = new AbortController();
	controller.abort(new Error("Already aborted"));

	// Act & Assert
	await expect(
		waitForEvent(dispatcher, "data", { signal: controller.signal })
	).rejects.toThrow("Already aborted");

	dispatcher.close();
});

test("withReplay utility - Replays last N emissions to new subscribers", () => {
	// Arrange
	const bus = new EventBus<number>();
	const replaySource = withReplay(bus.events, { count: 3, mode: "eager" });

	// Act - Emit some events before subscribing
	bus.emit(1);
	bus.emit(2);
	bus.emit(3);
	bus.emit(4); // This should push out the first emission

	// Subscribe after emissions
	const { handler, spy: replaySpy } = createEventSpy<number>();
	const subscription = replaySource.subscribe({ next: handler });

	// Emit more events after subscription
	bus.emit(5);

	// Assert - Should get replayed events plus new ones
	expect(replaySpy.calls.length).toBe(4); // 3 replayed + 1 new
	expect(replaySpy.calls.map(call => call.args[0])).toEqual([2, 3, 4, 5]);

	// Cleanup
	subscription.unsubscribe();
	bus.close();
});

test("withReplay utility - Infinite replay buffer", () => {
	// Arrange
	const bus = new EventBus<string>();
	const replaySource = withReplay(bus.events, { mode: "eager" }); // Need eager mode to capture pre-subscription events

	// Act - Emit many events
	const testEvents = Array.from({ length: 1000 }, (_, i) => `event-${i}`);
	testEvents.forEach(event => bus.emit(event));

	// Subscribe after all emissions
	const { handler, calls } = createEventSpy<string>();
	const subscription = replaySource.subscribe({ next: handler });

	// Assert - Should replay all events
	expect(calls.length).toBe(1000);
	expect(calls[0]).toBe("event-0");
	expect(calls[999]).toBe("event-999");  // Fixed: was expect(calls).toBe("event-999")

	// Cleanup
	subscription.unsubscribe();
	bus.close();
});

test("withReplay utility - Multiple subscribers each get replay", () => {
	// Arrange
	const bus = new EventBus<string>();
	const replaySource = withReplay(bus.events, { count: 2, mode: "eager" }); // Need eager mode

	// Act - Emit events
	bus.emit("first");
	bus.emit("second");

	// Subscribe multiple times
	const subscriber1 = createEventSpy<string>();
	const subscriber2 = createEventSpy<string>();

	const sub1 = replaySource.subscribe({ next: subscriber1.handler });
	const sub2 = replaySource.subscribe({ next: subscriber2.handler });

	// Assert - Both should get replay
	expect(subscriber1.calls).toEqual(["first", "second"]);
	expect(subscriber2.calls).toEqual(["first", "second"]);

	// Cleanup
	sub1.unsubscribe();
	sub2.unsubscribe();
	bus.close();
});

test("withReplay utility - Buffer cleanup on unsubscribe", () => {
	// Arrange
	const bus = new EventBus<number>();
	const replaySource = withReplay(bus.events, { count: 10 });

	// Act
	bus.emit(1);
	bus.emit(2);

	const { handler } = createEventSpy<number>();
	const subscription = replaySource.subscribe({ next: handler });

	// Cleanup
	subscription.unsubscribe();
	bus.close();

	// Assert - No errors should occur, memory should be cleaned
	// This is more of a smoke test for cleanup logic
});

test("Error handling - EventBus handles observer errors gracefully", () => {
	// Arrange
	const bus = new EventBus<string>();
	const errorSpy = spy();
	const faultyHandler = spy(() => {
		throw new Error("Observer error");
	});

	// Act
	bus.subscribe({
		next: faultyHandler,
		error: errorSpy
	});

	bus.emit("trigger-error");

	// Assert
	expect(faultyHandler.calls.length).toBe(1);
	expect(errorSpy.calls.length).toBe(1);

	bus.close();
});

test("Error handling - Dispatcher handles large payloads", () => {
	interface LargePayloadEvents extends EventMap {
		bigData: { data: number[] };
	}

	// Arrange
	const dispatcher = createEventDispatcher<LargePayloadEvents>();
	const handler = spy();

	// Act
	dispatcher.on("bigData", handler);

	const largeArray = Array.from({ length: 10000 }, (_, i) => i);
	dispatcher.emit("bigData", { data: largeArray });

	// Assert
	expect(handler.calls.length).toBe(1);
	expect(handler.calls[0].args[0].data.length).toBe(10000);  // Fixed: was handler.calls[0].args.data.length

	dispatcher.close();
});

test("Error handling - Concurrent event emissions", async () => {
	// Arrange
	const bus = new EventBus<number>();
	const { handler, calls } = createEventSpy<number>();

	// Act
	bus.subscribe({ next: handler });

	// Emit events concurrently
	const promises = Array.from({ length: 100 }, (_, i) =>
		Promise.resolve().then(() => bus.emit(i))
	);

	await Promise.all(promises);

	// Assert - All events should be captured
	expect(calls.length).toBe(100);

	// Events should contain all numbers 0-99 (order may vary due to concurrency)
	const sortedCalls = [...calls].sort((a, b) => a - b);
	expect(sortedCalls).toEqual(Array.from({ length: 100 }, (_, i) => i));

	bus.close();
});

test("Error handling - Event ordering preservation", () => {
	// Arrange
	const bus = new EventBus<number>();
	const { handler, calls } = createEventSpy<number>();

	// Act
	bus.subscribe({ next: handler });

	// Emit events synchronously in order
	for (let i = 0; i < 1000; i++) {
		bus.emit(i);
	}

	// Assert - Order should be preserved for synchronous emissions
	expect(calls).toEqual(Array.from({ length: 1000 }, (_, i) => i));

	bus.close();
});

test("Performance - High-frequency event emission", () => {
	// Arrange
	const bus = new EventBus<number>();
	const { handler, calls } = createEventSpy<number>();

	// Act
	const startTime = performance.now();
	bus.subscribe({ next: handler });

	// Emit 10,000 events rapidly
	for (let i = 0; i < 10000; i++) {
		bus.emit(i);
	}

	const endTime = performance.now();

	// Assert
	expect(calls.length).toBe(10000);

	// Should complete reasonably quickly (less than 100ms)
	const duration = endTime - startTime;
	console.log(`High-frequency emission took ${duration}ms`);
	// Note: We don't assert on timing as it's environment-dependent

	bus.close();
});

test("Performance - Subscription/unsubscription performance", () => {
	// Arrange
	const bus = new EventBus<string>();

	// Act - Create and destroy many subscriptions quickly
	const startTime = performance.now();

	const subscriptions = Array.from({ length: 1000 }, () => {
		const { handler } = createEventSpy<string>();
		return bus.subscribe({ next: handler });
	});

	subscriptions.forEach(sub => sub.unsubscribe());

	const endTime = performance.now();

	// Assert
	const duration = endTime - startTime;
	console.log(`1000 subscribe/unsubscribe cycles took ${duration}ms`);

	bus.close();
});

test("Performance - Memory usage with replay buffer", () => {
	// Arrange
	const bus = new EventBus<string>();
	const replaySource = withReplay(bus.events, { count: 1000, mode: "eager" }); // Need eager mode

	// Act - Fill the buffer
	for (let i = 0; i < 2000; i++) {
		bus.emit(`event-${i}`);
	}

	// Subscribe and check we only get last 1000 events
	const { handler, calls } = createEventSpy<string>();
	replaySource.subscribe({ next: handler });

	// Assert - Should only replay last 1000 events
	expect(calls.length).toBe(1000);
	expect(calls[0]).toBe("event-1000"); // First in buffer should be event-1000
	expect(calls[999]).toBe("event-1999"); // Fixed: was expect(calls).toBe("event-1999")

	bus.close();
});

/**
 * Integration tests with Observable features
 */
test("Observable integration - EventBus as Observable source", async () => {
	// Arrange
	const bus = new EventBus<number>();

	// Act - Use EventBus with async iteration
	const collectedValues: number[] = [];
	const iterationPromise = (async () => {
		for await (const value of bus.events) {
			collectedValues.push(value);
			if (value >= 3) break; // Stop after collecting a few values
		}
	})();

	// Emit some values
	bus.emit(1);
	bus.emit(2);
	bus.emit(3);

	await iterationPromise;

	// Assert
	expect(collectedValues).toEqual([1, 2, 3]);

	bus.close();
});

test("Observable integration - Converting other observables to EventBus", () => {
	// Arrange
	const sourceObservable = Observable.of(1, 2, 3, 4, 5);
	const bus = new EventBus<number>();

	// Subscribe to bus
	const { handler, calls } = createEventSpy<number>();
	bus.subscribe({ next: handler });

	// Act - Pipe source observable to bus
	sourceObservable.subscribe({
		next: value => bus.emit(value),
		complete: () => bus.close()
	});

	// Assert
	expect(calls).toEqual([1, 2, 3, 4, 5]);
});

/**
 * Example usage tests (documentation tests)
 */
test("Documentation - Basic EventBus example from docs", () => {
	// Example from the module documentation
	const bus = new EventBus<string>();

	const eventLog: string[] = [];
	const completionLog: string[] = [];

	bus.events.subscribe({
		next(msg) { eventLog.push(`Received: ${msg}`); },
		complete() { completionLog.push('Bus closed'); }
	});

	// Emit values
	bus.emit('hello');
	bus.emit('world');

	// Close the bus
	bus.close();

	// Verify
	expect(eventLog).toEqual(['Received: hello', 'Received: world']);
	expect(completionLog).toEqual(['Bus closed']);
});

test("Documentation - Typed event dispatcher example from docs", () => {
	// Example from the module documentation
	interface MyEvents {
		message: { text: string };
		error: { code: number; message: string };
	}

	const bus = createEventDispatcher<MyEvents>();

	const messageLog: string[] = [];

	// Subscribe to `message` events
	bus.on('message', payload => {
		messageLog.push(`New message: ${payload.text}`);
	});

	// Emit an event
	bus.emit('message', { text: 'Hello World' });

	// Verify
	expect(messageLog).toEqual(['New message: Hello World']);

	// Close the bus when done
	bus.close();
});

test("Documentation - waitForEvent example from docs", async () => {
	interface MyEvents {
		data: { value: number };
		done: void;
	}

	const bus = createEventDispatcher<MyEvents>();

	// Start waiting for event
	const eventPromise = waitForEvent(bus, 'data').then(payload => {
		return payload ? `Data arrived: ${payload.value}` : 'No data';
	});

	// Emit the event
	setTimeout(() => {
		bus.emit('data', { value: 42 });
	}, 1);

	const result = await eventPromise;
	expect(result).toBe('Data arrived: 42');

	bus.close();
});

// Runtime-specific tests
if (runtime === "deno") {
	test("Deno-specific - Network permissions test", async () => {
		// This test only runs on Deno and requires network permissions
		await using server = Deno.serve(
			{ port: 8080, onListen: () => null },
			() => new Response(null, { status: 200 })
		);

		const response = await fetch(`http://${server.addr.hostname}:${server.addr.port}`);
		expect(response.status).toBe(200);

		// Dispose of the response body if it exists
		await response?.body?.cancel();
	}, { permissions: { net: "inherit" } });
}

if (runtime === "node") {
	test("Node.js-specific - Process environment test", () => {
		// This test only runs on Node.js
		const global = globalThis as any;  // Fixed: type assertion for Node.js globals
		expect(typeof global?.process).toBe("object");
		expect(global?.process?.versions?.node).toBeDefined();
	});
}

if (runtime === "bun") {
	test("Bun-specific - Bun global test", () => {
		const _globalThis = globalThis as { Bun?: { version: string } };

		// This test only runs on Bun
		expect(typeof _globalThis?.Bun).toBe("object");
		expect(_globalThis?.Bun?.version).toBeDefined();
	});
}