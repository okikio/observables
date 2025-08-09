import type { ExcludeError, Operator } from "../_types.ts";
import { createOperator, createStatefulOperator } from "../operators.ts";
import { ObservableError, isObservableError } from "../../error.ts";

/**
 * Delays each item in the stream by a specified number of milliseconds.
 *
 * This operator shifts the entire stream of events forward in time, preserving
 * the relative time between them.
 * 
 * > Note: This does not delay error emissions. If an error occurs, it will
 * > be emitted immediately, regardless of the delay.
 *
 * @example
 * ```ts
 * import { pipe, delay, from } from "./helpers/mod.ts";
 *
 * // No direct Array equivalent, as it's about timing.
 *
 * // Stream behavior
 * const sourceStream = from([1, 2, 3]);
 * const delayedStream = pipe(sourceStream, delay(1000));
 * // Emits 1 (after 1s), then 2 (immediately after), then 3 (immediately after).
 * ```
 *
 * ## Practical Use Case
 *
 * Use `delay` to simulate network latency in tests, or to introduce a small
 * pause in a UI animation sequence to make it feel more natural.
 *
 * ## Key Insight
 *
 * `delay` is about shifting the timeline of events, not about pausing between
 * them. It's a simple way to control when a stream begins to emit its values.
 *
 * @typeParam T - Type of values from the source stream
 * @param ms - The delay duration in milliseconds
 * @returns A stream operator that delays each value
 */
export function delay<T>(ms: number): Operator<T | ObservableError, T | ObservableError> {
  return createStatefulOperator<T | ObservableError, T, {
    pendingTimeouts: Set<ReturnType<typeof setTimeout>>,
    completed: boolean
  }>({
    name: 'delay',
    createState: () => ({
      pendingTimeouts: new Set(),
      completed: false
    }),

    transform(chunk, state, controller) {
      const timeout = setTimeout(() => {
        controller.enqueue(chunk);
        state.pendingTimeouts.delete(timeout);

        // If the stream is completed and no more pending timeouts,
        // close the stream
        if (state.completed && state.pendingTimeouts.size === 0) {
          controller.terminate();
        }
      }, ms);

      state.pendingTimeouts.add(timeout);
    },

    flush(state) {
      state.completed = true;

      // If no pending timeouts, the flush function will complete
      // naturally and close the stream

      // Note: We don't need to call terminate() here because:
      // 1. If there are pending timeouts, we want to wait for them
      // 2. If there are no pending timeouts, the stream will complete
      //    after this flush function returns
    },

    cancel(state) {
      // Clear all pending timeouts if the stream is cancelled
      for (const timeout of state.pendingTimeouts) {
        clearTimeout(timeout);
      }
      state.pendingTimeouts.clear();
    }
  });
}

/**
 * Emits only the latest item after a specified period of inactivity.
 *
 * This is the "search bar" operator. It waits for the user to stop typing
 * before firing off a search query.
 * 
 * > Note: This operator does not delay error emissions. If an error occurs,
 * > it will be emitted immediately, regardless of the debounce period.
 *
 * @example
 * ```ts
 * import { pipe, debounce, from } from "./helpers/mod.ts";
 *
 * // No direct Array equivalent.
 *
 * // Stream behavior
 * const inputStream = from(["a", "ab", "abc"]); // User typing quickly
 * const debouncedStream = pipe(inputStream, debounce(300));
 * // After 300ms of no new input, it will emit "abc".
 * ```
 *
 * ## Practical Use Case
 *
 * Use `debounce` for any event that fires rapidly, but you only care about the
 * final value, such as search inputs, window resize events, or auto-saving
 * form fields.
 *
 * ## Key Insight
 *
 * `debounce` filters out noise from rapid-fire events, ensuring that expensive
 * operations (like API calls) are only triggered when necessary.
 *
 * @typeParam T - Type of values from the source stream
 * @param ms - The debounce duration in milliseconds
 * @returns A stream operator that debounces values
 */
export function debounce<T>(ms: number): Operator<T | ObservableError, T | ObservableError> {
  return createStatefulOperator<T | ObservableError, T, {
    timeout: ReturnType<typeof setTimeout> | null,
    lastValue: ExcludeError<T> | null,
    hasValue: boolean
  }>({
    name: 'debounce',
    createState: () => ({
      timeout: null,
      lastValue: null,
      hasValue: false
    }),

    transform(chunk, state, controller) {
      // Cancel any pending timeout
      if (state.timeout !== null) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }

      // Store the latest value
      state.lastValue = chunk as ExcludeError<T>;
      state.hasValue = true;

      // Set up a new timeout to emit the latest value
      state.timeout = setTimeout(() => {
        if (state.hasValue) {
          controller.enqueue(state.lastValue!);
        }
        state.timeout = null;
        state.lastValue = null;
        state.hasValue = false;
      }, ms);
    },

    flush(state, controller) {
      // Clear any pending timeout
      if (state.timeout !== null) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }

      // Emit the last value if we have one
      if (state.hasValue) {
        controller.enqueue(state.lastValue!);
        state.lastValue = null;
        state.hasValue = false;
      }
    },

    cancel(state) {
      // Clean up on cancellation
      if (state.timeout !== null) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }
      state.lastValue = null;
      state.hasValue = false;
    }
  });
}

/**
 * Limits the stream to emit at most one item per specified time interval.
 *
 * This is the "scroll event" operator. It ensures that even if an event fires
 * hundreds of times per second, you only handle it at a manageable rate.
 *
 * @example
 * ```ts
 * import { pipe, throttle, from } from "./helpers/mod.ts";
 *
 * // No direct Array equivalent.
 *
 * // Stream behavior
 * const scrollStream = from([10, 20, 50, 100, 150]); // Scroll events
 * const throttledStream = pipe(scrollStream, throttle(100));
 * // Emits 10 immediately, then waits 100ms before being able to emit again.
 * // If 150 is the last value, it will be emitted after the throttle window.
 * ```
 *
 * ## Practical Use Case
 *
 * Use `throttle` for high-frequency events where you need to guarantee a
 * regular sampling of the data, such as scroll position tracking, mouse
 * movement, or real-time data visualization.
 *
 * ## Key Insight
 *
 * `throttle` guarantees a steady flow of data, unlike `debounce` which waits
 * for silence. It's about rate-limiting, not just handling the final value.
 *
 * @typeParam T - Type of values from the source stream
 * @param ms - The throttle duration in milliseconds
 * @returns A stream operator that throttles values
 */
export function throttle<T>(ms: number): Operator<T | ObservableError, T | ObservableError> {
  return createStatefulOperator<T | ObservableError, T, {
    lastEmitTime: number,
    nextValue: ExcludeError<T> | null,
    hasNextValue: boolean,
    timeoutId: ReturnType<typeof setTimeout> | null
  }>({
    name: 'throtle',
    createState: () => ({
      lastEmitTime: 0,
      nextValue: null,
      hasNextValue: false,
      timeoutId: null
    }),

    transform(chunk, state, controller) {
      if (isObservableError(chunk)) {
        // If the chunk is an error, we can immediately emit it
        controller.enqueue(chunk);
        return;
      }

      const now = Date.now();
      const timeSinceLastEmit = now - state.lastEmitTime;

      // If we haven't emitted for the throttle duration, emit immediately
      if (timeSinceLastEmit >= ms) {
        state.lastEmitTime = now;
        controller.enqueue(chunk);
        return;
      }

      // Otherwise, store this value to emit later
      state.nextValue = chunk as ExcludeError<T>;
      state.hasNextValue = true;

      // If we don't have a timeout scheduled, schedule one
      if (state.timeoutId === null) {
        const remainingTime = ms - timeSinceLastEmit;

        state.timeoutId = setTimeout(() => {
          if (state.hasNextValue) {
            state.lastEmitTime = Date.now();
            controller.enqueue(state.nextValue!);
            state.nextValue = null;
            state.hasNextValue = false;
          }
          state.timeoutId = null;
        }, remainingTime);
      }
    },

    flush(state, controller) {
      // Clean up any scheduled timeout
      if (state.timeoutId !== null) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }

      // Emit the last value if we have one
      if (state.hasNextValue) {
        controller.enqueue(state.nextValue!);
        state.nextValue = null;
        state.hasNextValue = false;
      }
    },

    cancel(state) {
      // Clean up on cancellation
      if (state.timeoutId !== null) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
      state.nextValue = null;
      state.hasNextValue = false;
    }
  });
}

/**
 * Errors if an item takes too long to be processed.
 *
 * This operator wraps each item in a race against a timer. If the item isn't
 * passed through to the next stage before the timer finishes, it emits an error.
 *
 * @example
 * ```ts
 * import { pipe, timeout, from } from "./helpers/mod.ts";
 *
 * // Stream behavior
 * const sourceStream = from([
 *   new Promise(res => setTimeout(() => res(1), 100)),
 *   new Promise(res => setTimeout(() => res(2), 2000))
 * ]);
 *
 * const timedStream = pipe(sourceStream, timeout(1000));
 * // Emits 1, then emits an error because the second promise took too long.
 * ```
 *
 * ## Practical Use Case
 *
 * Use `timeout` to enforce Service Level Agreements (SLAs) on asynchronous
 * operations, such as API calls. If a request takes too long, you can gracefully
 * handle the timeout instead of letting your application hang.
 *
 * ## Key Insight
 *
 * `timeout` is a crucial tool for building resilient systems that can handle
 * slow or unresponsive dependencies. It turns an indefinite wait into a
 * predictable failure.
 *
 * @typeParam T The type of data in the stream.
 * @param ms The timeout duration in milliseconds.
 * @returns An operator that enforces a timeout on each item.
 */
export function timeout<T>(ms: number): Operator<T | ObservableError, T | ObservableError> {
  return createOperator<T | ObservableError, T | ObservableError>({
    name: 'timeout',
    transform(chunk, controller) {
      // If the chunk is an error, we can immediately emit it
      const timeoutId = setTimeout(() => {
        controller.enqueue(ObservableError.from(
          new Error(`Operation timed out after ${ms}ms`),
          'operator:timeout',
          { timeoutMs: ms, chunk }
        ));
      }, ms);

      Promise.resolve().then(() => clearTimeout(timeoutId));
      controller.enqueue(chunk);
    }
  });
}