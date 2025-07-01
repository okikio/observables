import type { Operator } from "../_types.ts";
import { createStatefulOperator } from "../operators.ts";

/**
 * Delays values emitted by the source stream by a specified timespan.
 * 
 * 
 * The `delay` operator shifts all emissions from the source stream by a
 * specified time duration. Each value is emitted after the specified delay,
 * preserving the relative timing between values.
 * 
 * @typeParam T - Type of values from the source stream
 * @param ms - The delay duration in milliseconds
 * @returns A stream operator that delays each value
 * 
 * @example
 * ```ts
 * import { pipe, delay } from "./helpers/mod.ts";
 * 
 * // Delay each value by 1 second
 * const delayed = pipe(
 *   sourceStream,
 *   delay(1000)
 * );
 * ```
 */
export function delay<T>(ms: number): Operator<T, T> {
  return createStatefulOperator<T, T, {
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
 * Debounces the source stream, emitting only the most recent value after a specified
 * period of silence.
 * 
 * 
 * The `debounce` operator filters out values that are followed by newer values within
 * the specified duration. Only when the stream is silent for the specified duration
 * will the most recent value be emitted.
 * 
 * This is useful for rate-limiting events that may fire rapidly, such as user input,
 * resize events, or search as-you-type functionality.
 * 
 * @typeParam T - Type of values from the source stream
 * @param ms - The debounce duration in milliseconds
 * @returns A stream operator that debounces values
 * 
 * @example
 * ```ts
 * import { pipe, debounce } from "./helpers/mod.ts";
 * 
 * // Only process search input after user stops typing for 300ms
 * const debouncedSearch = pipe(
 *   inputStream,
 *   debounce(300)
 * );
 * ```
 */
export function debounce<T>(ms: number): Operator<T, T> {
  return createStatefulOperator<T, T, {
    timeout: ReturnType<typeof setTimeout> | null,
    lastValue: T | null,
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
      state.lastValue = chunk;
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
 * Throttles the source stream, emitting at most one value per specified duration.
 * 
 * 
 * The `throttle` operator limits the rate at which values from the source stream
 * are emitted. It emits the first value, then ignores subsequent values for the
 * specified duration.
 * 
 * Unlike debounce which waits for a period of inactivity, throttle guarantees
 * that values are emitted at a consistent rate.
 * 
 * @typeParam T - Type of values from the source stream
 * @param ms - The throttle duration in milliseconds
 * @returns A stream operator that throttles values
 * 
 * @example
 * ```ts
 * import { pipe, throttle } from "./helpers/mod.ts";
 * 
 * // Process scroll events at most once every 100ms
 * const throttledScroll = pipe(
 *   scrollStream,
 *   throttle(100)
 * );
 * ```
 */
export function throttle<T>(ms: number): Operator<T, T> {
  return createStatefulOperator<T, T, {
    lastEmitTime: number,
    nextValue: T | null,
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
      const now = Date.now();
      const timeSinceLastEmit = now - state.lastEmitTime;

      // If we haven't emitted for the throttle duration, emit immediately
      if (timeSinceLastEmit >= ms) {
        state.lastEmitTime = now;
        controller.enqueue(chunk);
        return;
      }

      // Otherwise, store this value to emit later
      state.nextValue = chunk;
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