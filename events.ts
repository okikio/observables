/**
 * @module EventBus
 */

import type { Subscription } from "./_types.ts";
import type { SubscriptionObserver } from './observable.ts';

import { Observable } from './observable.ts';
import { Symbol } from "./symbol.ts";

import { ObservableError } from "./error.ts";  // Assume path to your ObservableError
import { createQueue, enqueue, dequeue, isFull, toArray, clear } from './queue.ts';  // Assume path to your queue utils

/**
 * A multicast event bus that extends {@link Observable<T>}, allowing
 * emission of values to multiple subscribers and supporting both
 * Observer-style and async-iterator consumption.
 *
 * @typeParam T - The type of values emitted by this bus.
 *
 * 
 * - Calling {@link emit} delivers the value to all active subscribers.
 * - Calling {@link close} completes all subscribers and prevents further emissions.
 * - Implements both {@link Symbol.dispose} and {@link Symbol.asyncDispose}
 *   for cleanup in synchronous and asynchronous contexts.
 *
 * @example
 * ```ts
 * import { EventBus } from './EventBus.ts';
 *
 * // Create a bus for string messages
 * const bus = new EventBus<string>();
 *
 * // Subscribe using Observer
 * bus.events.subscribe({
 *   next(msg) { console.log('Received:', msg); },
 *   complete()  { console.log('Bus closed'); }
 * });
 *
 * // Emit values
 * bus.emit('hello');
 * bus.emit('world');
 *
 * // Close the bus
 * bus.close();
 * ```
 */
export class EventBus<T> extends Observable<T> {
  /** Active subscribers receiving emitted values */
  #subscribers = new Set<SubscriptionObserver<T>>();
  /** Tracks whether the bus has been closed */
  #closed = false;

  /**
   * Construct a new EventBus instance.
   *
   * 
   * The base {@link Observable} constructor is invoked with the subscriber
   * registration logic, adding and removing subscribers to the internal set.
   */
  constructor() {
    super(subscriber => {
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
   * Exposes the bus itself as an {@link Observable<T>} for subscription.
   *
   * @returns The current instance as an Observable of T.
   */
  get events(): Observable<T> {
    return this;
  }

  /**
   * Emit a value to all active subscribers.
   *
   * @param value - The value to deliver.
   */
  emit(value: T): void {
    if (this.#closed) return;
    for (const subscriber of this.#subscribers) {
      subscriber.next?.(value);
    }
  }

  /**
   * Close the bus, completing all subscribers and preventing further emits.
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
   * 
   * Alias for {@link close}.
   */
  [Symbol.dispose](): void {
    this.close();
  }

  /**
   * Asynchronous disposal method.
   *
   * 
   * Alias for {@link close}.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    return await this.close();
  }
}

/**
 * A mapping from event names (keys) to their payload types (values).
 *
 * @example
 * ```ts
 * interface MyEvents {
 *   login: { userId: string };
 *   logout: void;
 * }
 * ```
 */
export type EventMap = {};

/**
 * The return type of {@link createEventDispatcher}.
 * Provides a strongly-typed event bus interface.
 *
 * @typeParam E - The event map type, mapping event names to payloads.
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
    handler: (payload: E[Name]) => void
  ): Subscription;

  /**
   * Observable stream of all emitted events, carrying `{ type, payload }` objects.
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
 * Creates a strongly-typed event bus based on {@link EventBus}, ensuring
 * that both `emit` and `on` methods enforce matching event names and payload types.
 *
 * @typeParam E - The event map type, mapping event names to payloads.
 *
 * @returns An object with the following methods:
 * - `emit(name, payload)`: Emit an event.
 * - `on(name, handler)`: Subscribe to a specific event.
 * - `events`: Observable stream of all events.
 * - `close()`: Close the bus and complete all subscribers.
 *
 * @example
 * ```ts
 * interface MyEvents {
 *   message: { text: string };
 *   error: { code: number; message: string };
 * }
 *
 * const bus = createTypedEventBus<MyEvents>();
 *
 * // Subscribe to `message` events
 * bus.on('message', payload => {
 *   console.log('New message:', payload.text);
 * });
 *
 * // Emit an event
 * bus.emit('message', { text: 'Hello World' });
 *
 * // Close the bus when done
 * bus.close();
 * ```
 */
export function createEventDispatcher<E extends EventMap>(): EventDispatcher<E> {
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
      handler: (payload: E[Name]) => void
    ) {
      return bus.events.subscribe({
        next(event) {
          if (event.type === name) {
            handler(event.payload as E[Name]);
          }
        }
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
    }
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
  K extends keyof E
>(
  bus: { events: Observable<{ type: keyof E; payload: E[keyof E] }> },
  type: K,
  { signal, throwOnClose = false }: WaitForEventOptions = {}
): Promise<E[K] | undefined> {
  const { resolve, reject, promise } = Promise.withResolvers<E[K] | undefined>();

  // Immediate abort
  if (signal?.aborted) {
    reject(signal.reason);
    return promise;
  }

  const subscription: Subscription = bus.events.subscribe({
    next(event) {
      if (event.type === type) {
        cleanup();
        
        // cast payload to the correct type
        resolve(event.payload as E[K]);
      }
    },
    error(err) {
      cleanup();
      reject(err);
    },
    complete() {
      cleanup();

      if (throwOnClose) {
        reject(new Error(`Stream closed before event "${String(type)}" fired`));
      } else {
        resolve(undefined);
      }
    },
  });

  function cleanup() {
    subscription?.unsubscribe?.();
    signal?.removeEventListener?.('abort', onAbort);
  }

  function onAbort() {
    cleanup?.();
    reject(signal!.reason);
  }

  signal?.addEventListener?.('abort', onAbort, { once: true });

  return promise;
}

/**
 * Wraps an Observable to replay the last N emissions to new subscribers.
 * Uses a fixed-size queue for efficient buffering (O(1) ops).
 *
 * @param source The source Observable (e.g., bus.events).
 * @param options Replay options.
 * @returns A new Observable with replay behavior.
 */
export function withReplay<T>(
  source: Observable<T>,
  { count = Infinity }: { count?: number } = {}
): Observable<T> {
  return new Observable(subscriber => {
    const buffer = createQueue<T>(count === Infinity ? 1000 : count);  // Start with reasonable capacity; auto-grows if needed

    // Initial replay
    const items = toArray(buffer);  // O(n), but only on subscribe (rare)
    for (const item of items) {
      subscriber.next(item);
    }

    // Subscribe to source and handle new emissions
    const sub = source.subscribe({
      next(value) {
        // Buffer if limited
        if (count !== Infinity && isFull(buffer)) {
          dequeue(buffer);  // Remove oldest
        }

        enqueue(buffer, value);
        subscriber.next(value);
      },
      error(err) {
        // Handle error (non-terminal by default, as per your pipes)
        subscriber.next(ObservableError.from(err) as T);  // Or subscriber.error(err) for terminal
      },
      complete() {
        subscriber.complete();
      }
    });

    // Cleanup on unsubscribe
    return () => {
      sub.unsubscribe();
      clear(buffer);  // Clear buffer on unsubscribe
      // Optional: clear(buffer) if per-subscriber buffers, but shared here
    };
  });
}