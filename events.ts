/**
 * Event helpers cover the shared side of the library.
 *
 * `Observable` is cold by default, so each subscriber gets its own execution.
 * `EventBus` and `createEventDispatcher()` solve the opposite problem, where a
 * single emitted event should fan out to every current listener.
 *
 * The closest familiar comparison is DOM events:
 *
 * ```text
 * EventTarget        -> addEventListener() + dispatchEvent()
 * EventBus<T>        -> subscribe()/on()   + emit()
 * ```
 *
 * Use these helpers for app-wide notifications, socket fan-out, UI event
 * bridges, and workflow status updates.
 *
 * @module
 */

import type { Observer, Subscription } from "./_types.ts";
import type { SubscriptionObserver } from "./observable.ts";

import { Observable } from "./observable.ts";
import { Symbol } from "./symbol.ts";

import {
  clear,
  createQueue,
  dequeue,
  enqueue,
  forEach,
  isFull,
} from "./queue.ts"; // Assume path to your queue utils

/**
 * `EventBus<T>` broadcasts one emitted value to every active subscriber.
 *
 * Treat it like a lightweight `EventTarget` for arbitrary payloads. `emit()` is
 * the broadcast step. `subscribe()` is the listening step. Late subscribers see
 * only future values unless you layer replay on top.
 *
 * @example Broadcasting to several listeners
 * ```ts
 * const bus = new EventBus<string>();
 *
 * bus.subscribe((message) => console.log('A:', message));
 * bus.subscribe((message) => console.log('B:', message));
 *
 * bus.emit('hello');
 * // A: hello
 * // B: hello
 * ```
 */
export class EventBus<T> extends Observable<T> {
  /** Active subscribers receiving emitted values */
  #subscribers = new Set<SubscriptionObserver<T>>();
  /** Tracks whether the bus has been closed */
  #closed = false;

  /**
   * Starts with no subscribers and no retained history.
   */
  constructor() {
    super((subscriber) => {
      if (this.#closed) {
        subscriber.complete?.();
        return;
      }

      this.#subscribers.add(subscriber);
      return () => {
        this.#subscribers.delete(subscriber);
      };
    });
  }

  /**
   * Read-only Observable view for code that should listen but not emit.
   */
  get events(): Observable<T> {
    return this;
  }

  /**
   * Sends one value to every active subscriber.
   */
  emit(value: T): void {
    if (this.#closed) return;
    for (const subscriber of this.#subscribers) {
      subscriber.next?.(value);
    }
  }

  /**
   * Completes every subscriber and ignores future `emit()` calls.
   */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;

    for (const subscriber of this.#subscribers) {
      subscriber.complete?.();
    }

    this.#subscribers.clear();
  }

  /**
   * Synchronous disposal method (for `using` syntax).
   *
   * Alias for {@link close}.
   */
  [Symbol.dispose](): void {
    this.close();
  }

  /**
   * Asynchronous disposal method.
   *
   * Alias for {@link close}.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    return await this.close();
  }
}

/**
 * Record of event names to payload shapes.
 */
export type EventMap = object;

/**
 * Named-event interface returned by `createEventDispatcher()`.
 *
 * `emit()` and `on()` are the typed equivalents of `dispatchEvent()` and
 * `addEventListener()`. The `events` property exposes the same traffic as one
 * Observable of `{ type, payload }` objects for pipeline-style composition.
 */
export interface EventDispatcher<E extends EventMap> {
  /**
   * Emit an event with the given name and payload.
   * @param name - The event name.
   * @param payload - The payload matching the event name.
   */
  emit<Name extends keyof E>(name: Name, payload: E[Name]): void;

  /**
   * Subscribe to a specific event by name.
   * Only events with a matching `type` will invoke the handler.
   * @param name - The event name to listen for.
   * @param handler - The callback invoked with the event payload.
   * @returns A subscription object with `unsubscribe()`.
   */
  on<Name extends keyof E>(
    name: Name,
    handler: (payload: E[Name]) => void,
  ): Subscription;

  /**
   * All named events as one Observable of `{ type, payload }` objects.
   */
  events: EventBus<{ type: keyof E; payload: E[keyof E] }>;

  /**
   * Synchronous disposal method (for `using` syntax).
   * Closes the bus and completes all subscribers.
   */
  [Symbol.dispose](): void;

  /**
   * Asynchronous disposal method.
   * Closes the bus and completes all subscribers.
   */
  [Symbol.asyncDispose](): Promise<void>;

  /**
   * Close the bus, completing all subscribers and preventing further emits.
   */
  close(): void;
}

/**
 * Creates a typed dispatcher for named events.
 *
 * Reach for it when the event names are part of the contract and you want the
 * compiler to keep names and payloads aligned.
 *
 * @example Typing app-level notifications
 * ```ts
 * interface AppEvents {
 *   user_login: { user_id: string };
 *   notification: { text: string; level: 'info' | 'error' };
 * }
 *
 * const events = createEventDispatcher<AppEvents>();
 *
 * events.on('notification', (payload) => {
 *   console.log(payload.level, payload.text);
 * });
 *
 * events.emit('notification', { text: 'Saved', level: 'info' });
 * ```
 */
export function createEventDispatcher<E extends EventMap>(): EventDispatcher<
  E
> {
  // Internal bus carries a union of all event types and payloads
  const bus = new EventBus<{ type: keyof E; payload: E[keyof E] }>();

  return {
    /**
     * Emit an event with the given name and payload.
     * @param name - The event name.
     * @param payload - The payload matching the event name.
     */
    emit<Name extends keyof E>(name: Name, payload: E[Name]): void {
      bus.emit({ type: name, payload });
    },

    /**
     * Subscribe to a specific event by name.
     * Only events with a matching `type` will invoke the handler.
     * @param name - The event name to listen for.
     * @param handler - The callback invoked with the event payload.
     * @returns A subscription object with `unsubscribe()`.
     */
    on<Name extends keyof E>(
      name: Name,
      handler: (payload: E[Name]) => void,
    ) {
      return bus.events.subscribe({
        next(event) {
          if (event.type === name) {
            handler(event.payload as E[Name]);
          }
        },
      });
    },

    /**
     * Observable stream of all emitted events, carrying `{ type, payload }` objects.
     */
    events: bus.events as EventBus<{ type: keyof E; payload: E[keyof E] }>,

    /**
     * Synchronous disposal method (for `using` syntax).
     * Closes the bus and completes all subscribers.
     */
    [Symbol.dispose](): void {
      bus[Symbol.dispose]();
    },

    /**
     * Asynchronous disposal method.
     * Closes the bus and completes all subscribers.
     */
    [Symbol.asyncDispose](): Promise<void> {
      return bus[Symbol.asyncDispose]();
    },

    /**
     * Close the bus, completing all subscribers and preventing further emits.
     */
    close(): void {
      bus.close();
    },
  };
}

/**
 * Options for `waitForEvent`.
 */
export interface WaitForEventOptions {
  /**
   * An AbortSignal to cancel waiting for the event.
   */
  signal?: AbortSignal;
  /**
   * If true, rejects if the underlying stream completes before the event fires.
   * @defaultValue false
   */
  throwOnClose?: boolean;
}

/**
 * Waits for the next occurrence of a specific event on a typed event bus.
 * Resolves with the event payload when the named event fires.
 * Can be aborted or optionally reject if the bus closes first.
 *
 * @typeParam E    - The event map type.
 * @typeParam K    - The specific event key to listen for.
 *
 * @param bus      - An object with an `events` Observable emitting `{ type, payload }`.
 * @param type     - The event name to wait for.
 * @param options  - Optional signal to abort, and throwOnClose behavior.
 * @returns A promise resolving to the payload of the event, or rejecting on error/abort/close.
 *
 * @example
 * ```ts
 * interface MyEvents {
 *   data: { value: number };
 *   done: void;
 * }
 *
 * const bus = createTypedEventBus<MyEvents>();
 *
 * // somewhere else...
 * waitForEvent(bus, 'data').then(payload => {
 *   console.log('Data arrived:', payload.value);
 * });
 *
 * // later
 * bus.emit('data', { value: 42 });
 * ```
 */
export function waitForEvent<
  E extends EventMap,
  K extends keyof E,
>(
  bus: { events: Observable<{ type: keyof E; payload: E[keyof E] }> },
  type: K,
  { signal, throwOnClose = false }: WaitForEventOptions = {},
): Promise<E[K] | undefined> {
  const { resolve, reject, promise } = Promise.withResolvers<
    E[K] | undefined
  >();
  let settled = false;

  // Immediate abort
  if (signal?.aborted) {
    reject(signal.reason);
    return promise;
  }

  const subscriptionRef: { current?: Subscription } = {};

  function cleanup() {
    subscriptionRef.current?.unsubscribe?.();
    signal?.removeEventListener?.("abort", onAbort);
  }

  function onAbort() {
    if (settled) return;
    settled = true;
    cleanup();
    reject(signal!.reason);
  }

  signal?.addEventListener?.("abort", onAbort, { once: true });

  subscriptionRef.current = bus.events.subscribe({
    next(event) {
      if (settled) return;
      if (event.type === type) {
        settled = true;
        cleanup();

        // cast payload to the correct type
        resolve(event.payload as E[K]);
      }
    },
    error(err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    },
    complete() {
      if (settled) return;
      settled = true;
      cleanup();

      if (throwOnClose) {
        reject(new Error(`Stream closed before event "${String(type)}" fired`));
      } else {
        resolve(undefined);
      }
    },
  });

  // We need both hooks for full race coverage:
  // 1. the listener above catches aborts that happen before or during
  //    subscription setup, so the promise rejects immediately
  // 2. this re-check catches the narrow case where that abort happened before
  //    `subscriptionRef.current` was assigned, so we can still unsubscribe the
  //    newly created subscription instead of leaving it attached. For example,
  //    the signal can abort synchronously from inside `addEventListener()`
  //    before control returns to the subscription assignment above.
  if (signal?.aborted) {
    onAbort();
  }

  return promise;
}

/**
 * Controls when the replay buffer connects to the source Observable.
 *
 * - `'eager'`: Connects immediately and buffers values even with zero subscribers.
 *              Like a security camera that's always recording.
 * - `'lazy'`:  Connects only when the first subscriber arrives, disconnects when
 *              the last one leaves. Like a motion-activated camera.
 *
 * Choose 'eager' for system-critical events you never want to miss.
 * Choose 'lazy' for expensive operations that shouldn't run without consumers.
 */
export type ReplayMode = "eager" | "lazy";

/**
 * Configuration options for replay behavior.
 */
export interface ReplayOptions {
  /**
   * Maximum number of values to buffer.
   * When the buffer is full, the oldest value is discarded (FIFO).
   *
   * @default Infinity (unlimited buffer, use with caution)
   */
  count?: number;

  /**
   * Determines when to connect to the source Observable.
   *
   * @default 'lazy' (resource-efficient, connects on-demand)
   */
  mode?: ReplayMode;
}

/**
 * Adds replay capability to an Observable, multicasting values to multiple subscribers
 * while maintaining a buffer of recent emissions.
 *
 * Without replay, each new subscriber triggers a fresh execution of the source Observable:
 * ```ts
 * const apiCall = new Observable(subscriber => {
 *   console.log('Making expensive API call...');
 *   fetch('/api/data').then(response => subscriber.next(response));
 * });
 *
 * apiCall.subscribe(data1 => {}); // Triggers API call #1
 * apiCall.subscribe(data2 => {}); // Triggers API call #2 (duplicate!)
 * ```
 *
 * With replay, the source executes once and shares results:
 * ```ts
 * const sharedApi = withReplay(apiCall, { count: 1, mode: 'lazy' });
 *
 * sharedApi.subscribe(data1 => {}); // Triggers API call
 * sharedApi.subscribe(data2 => {}); // Gets cached result, no new call!
 * ```
 *
 * ## Memory Considerations
 *
 * - Buffer size directly impacts memory usage: `count * sizeof(T)`
 * - 'eager' mode holds references even with no subscribers (potential memory leak)
 * - 'lazy' mode clears buffer when all subscribers disconnect (automatic cleanup)
 * - Consider using finite counts for long-running streams to prevent unbounded growth
 *
 * > **Note**: Infinite buffers are by default capped at 1000 items to prevent memory issues.
 * > The primary reason for this cap is because some runtimes such as Deno and Node.js
 * > litereally crash when you try to allocate Ininity-sized arrays.
 *
 * ## Performance Characteristics
 *
 * - Enqueue/Dequeue: O(1) constant time
 * - New subscriber replay: O(n) where n = buffer size
 * - Memory overhead: One queue + subscriber set + source subscription
 *
 * ## Edge Cases & Gotchas
 *
 * 1. **Late subscribers in eager mode**: May receive very old values if the source
 *    emitted long ago and no cleanup occurred.
 *
 * 2. **Infinite buffers**: Without a count limit, buffers grow indefinitely.
 *    Always set a reasonable count for production use.
 *
 * 3. **Error handling**: Errors are multicast to all subscribers but don't clear
 *    the buffer. New subscribers still get the replay before the error.
 *
 * 4. **Completion**: The source completion is multicast, but the replay buffer
 *    remains accessible to new subscribers (they get replay + completion).
 *
 * @param source The source Observable to add replay behavior to
 * @param options Configuration for replay behavior
 * @returns A new Observable with replay capability
 *
 * @example
 * ```ts
 * // Lazy mode - only buffers when subscribers are present
 * const shared = withReplay(expensive, {
 *   count: 5,
 *   mode: 'lazy'  // Only run expensive when needed
 * });
 *
 * // Eager mode - always buffering, like a flight recorder
 * const eventLog = withReplay(systemEvents, {
 *   count: 100,
 *   mode: 'eager'  // Capture events even if no one's listening
 * });
 * ```
 */
export function withReplay<T>(
  source: Observable<T>,
  { count = Infinity, mode = "lazy" }: ReplayOptions = {},
): Observable<T> {
  // Validate inputs
  if (count <= 0) {
    throw new Error(`Replay count must be positive, got {count}`);
  }

  // Shared state across all subscribers
  // Using 1000 as a reasonable default for "infinite" to avoid memory issues
  const buffer = createQueue<T>(count === Infinity ? 1000 : count);
  const subscribers = new Set<SubscriptionObserver<T>>();

  const observer: Observer<T> = {
    next(value) {
      // Manage buffer capacity
      if (count !== Infinity && isFull(buffer)) {
        dequeue(buffer); // Remove oldest
      }
      enqueue(buffer, value);

      // Emit to all active subscribers
      for (const sub of subscribers) {
        sub.next(value);
      }
    },
    error(err) {
      for (const sub of subscribers) {
        sub.error(err);
      }
    },
    complete() {
      for (const sub of subscribers) {
        sub.complete();
      }
    },
  };

  const isEager = mode === "eager";
  let shared: Subscription | null = isEager ? source.subscribe(observer) : null;

  /**
   * Creates the replay Observable that new subscribers will receive.
   */
  return new Observable((subscriber) => {
    // Step 1: Replay buffered values to the new subscriber
    forEach(buffer, (item) => subscriber.next(item));

    // Step 2: Add to active subscribers for future emissions
    subscribers.add(subscriber);

    // Step 3: Connect to source if needed (lazy mode, first subscriber)
    if (!isEager && !shared && subscribers.size > 0) {
      shared = source.subscribe(observer);
    }

    // Step 4: Return cleanup function
    return () => {
      subscribers.delete(subscriber);

      // In lazy mode, disconnect and clear when last subscriber leaves
      if (!isEager && subscribers.size === 0 && shared) {
        shared.unsubscribe();
        shared = null;
        clear(buffer); // Clear shared buffer when fully disconnected
      }
      // In eager mode, we keep the connection alive regardless
    };
  });
}
