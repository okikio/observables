/**
 * Timing operators change when values move downstream.
 *
 * They are for situations where the value is already fine, but the schedule is
 * wrong: typing is too noisy, scroll events are too fast, or a request took too
 * long to be useful.
 *
 * ```text
 * source value -> wait, delay, throttle, or expire -> next stage
 * ```
 *
 * The easiest way to compare the most common timing operators is by their
 * timeline behavior:
 *
 * ```text
 * source:     a-b-c------d-
 * delay(3):   ---abc-----d-
 * debounce:   --------c---d
 * throttle:   a---c------d-
 * ```
 *
 * @module
 */
import type { ExcludeError, Operator } from "../_types.ts";
import { createOperator, createStatefulOperator } from "../operators.ts";
import { isObservableError, ObservableError } from "../../error.ts";

/**
 * Waits once, then releases the buffered values and continues in the original
 * spacing.
 *
 * Use it when the whole stream should start later, such as aligning an
 * animation sequence or simulating startup latency.
 */
export function delay<T>(
  ms: number,
): Operator<T | ObservableError, T | ObservableError> {
  return createStatefulOperator<T | ObservableError, T, {
    timeoutId: ReturnType<typeof setTimeout> | null;
    pendingFlush: PromiseWithResolvers<void> | null;
    hasStarted: boolean;
    buffer: T[];
    delayOver: boolean;
  }>({
    name: "delay",
    errorMode: "pass-through", // Should be explicit
    createState: () => ({
      timeoutId: null,
      buffer: [],
      hasStarted: false,
      delayOver: false,
      pendingFlush: null,
    }),

    transform(chunk, state, controller) {
      // If delay period is over, emit immediately
      if (state.delayOver) controller.enqueue(chunk);
      // Buffer the item and start delay timer if not already started
      else state.buffer.push(chunk as T);

      // Start the delay timer on the first item
      if (!state.hasStarted) {
        state.pendingFlush = Promise.withResolvers<void>();
        state.timeoutId = setTimeout(() => {
          // Mark delay as complete
          state.delayOver = true;

          // Release all buffered items
          for (const value of state.buffer) {
            controller.enqueue(value);
          }

          state.buffer.length = 0; // Fast array clear

          // Clean up timeout reference
          clearTimeout(state.timeoutId!);
          state.timeoutId = null;

          // If flush was waiting, complete it now
          if (state.pendingFlush) {
            state.pendingFlush.resolve();
            state.pendingFlush = null;
          }
        }, ms);

        state.hasStarted = true;
      }
    },

    async flush(state, controller) {
      // If delay hasn't completed yet, we need to wait
      if (state.pendingFlush) await state.pendingFlush.promise;

      // Cancel timeout if stream ends during delay
      if (state.timeoutId !== null) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }

      // Emit any remaining buffered items
      for (const item of state.buffer) {
        controller.enqueue(item);
      }

      state.buffer.length = 0;
    },

    cancel(state) {
      // Critical: clean up timeout to prevent memory leaks
      if (state.timeoutId !== null) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }

      state.buffer.length = 0;
    },
  });
}

/**
 * Delays each value independently by the same amount.
 *
 * Unlike `delay()`, which waits once for the whole stream, `delayEach()` acts
 * as if each value carries its own timer.
 */
export function delayEach<T>(
  ms: number,
): Operator<T | ObservableError, T | ObservableError> {
  return createStatefulOperator<T | ObservableError, T, {
    pendingTimeouts: Set<ReturnType<typeof setTimeout>>;
    isComplete: boolean;
  }>({
    name: "delayEach",
    errorMode: "pass-through",
    createState: () => ({
      pendingTimeouts: new Set(),
      isComplete: false,
    }),

    transform(chunk, state, controller) {
      // Schedule delayed emission for this specific item
      const timeout = setTimeout(
        (_chunk: typeof chunk) => {
          controller.enqueue(_chunk);
          state.pendingTimeouts.delete(timeout);
          clearTimeout(timeout);

          // If stream ended and this was the last pending timeout, close stream
          if (state.isComplete && state.pendingTimeouts.size === 0) {
            controller.terminate();
          }
        },
        ms,
        chunk,
      );

      state.pendingTimeouts.add(timeout);
    },

    flush(state, controller) {
      state.isComplete = true;

      // If no pending timeouts, stream can complete immediately
      if (state.pendingTimeouts.size === 0) {
        controller.terminate();
      }
      // Otherwise, wait for pending timeouts to finish (handled in transform)
    },

    cancel(state) {
      // Critical: clean up all pending timeouts to prevent memory leaks
      for (const timeout of state.pendingTimeouts) {
        clearTimeout(timeout);
      }

      state.pendingTimeouts.clear();
    },
  });
}

/**
 * Waits for a quiet period, then emits only the latest value.
 *
 * Search inputs are the familiar example: every keystroke matters to the UI,
 * but only the final paused value should trigger the fetch.
 */
export function debounce<T>(
  ms: number,
): Operator<T | ObservableError, T | ObservableError> {
  return createStatefulOperator<T | ObservableError, T, {
    timeout: ReturnType<typeof setTimeout> | null;
    lastValue: ExcludeError<T> | null;
    hasValue: boolean;
  }>({
    name: "debounce",
    errorMode: "pass-through",
    createState: () => ({
      timeout: null,
      lastValue: null,
      hasValue: false,
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
    },
  });
}

/**
 * Emits at most one value per time window, while keeping the latest queued
 * value for the next allowed slot.
 *
 * Scroll, resize, and pointer-move handlers are the familiar examples.
 */
export function throttle<T>(
  ms: number,
): Operator<T | ObservableError, T | ObservableError> {
  return createStatefulOperator<T | ObservableError, T, {
    lastEmitTime: number;
    nextValue: ExcludeError<T> | null;
    hasNextValue: boolean;
    timeoutId: ReturnType<typeof setTimeout> | null;
  }>({
    name: "throttle",
    errorMode: "pass-through",
    createState: () => ({
      lastEmitTime: 0,
      nextValue: null,
      hasNextValue: false,
      timeoutId: null,
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
    },
  });
}

/**
 * Fails a promise-like chunk when it takes longer than the allowed time.
 *
 * This is useful for streams of async work where hanging forever is worse than
 * handling a timeout explicitly.
 */
export function timeout<T>(
  ms: number,
): Operator<T | PromiseLike<T> | ObservableError, T | ObservableError> {
  return createOperator<
    T | PromiseLike<T> | ObservableError,
    T | ObservableError
  >({
    name: "timeout",
    errorMode: "pass-through",
    async transform(chunk, controller) {
      // If the chunk is an error, we can immediately emit it
      if (isObservableError(chunk)) {
        controller.enqueue(chunk);
        return;
      }

      if (
        chunk !== null &&
        (typeof chunk === "object" || typeof chunk === "function") &&
        "then" in chunk &&
        typeof chunk.then === "function"
      ) {
        const timeoutResult = Symbol("timeout");
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const result = await Promise.race([
          chunk,
          new Promise<typeof timeoutResult>((resolve) => {
            timeoutId = setTimeout(() => resolve(timeoutResult), ms);
          }),
        ]);

        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }

        if (result === timeoutResult) {
          controller.enqueue(ObservableError.from(
            new Error(`Operation timed out after ${ms}ms`),
            "operator:timeout",
            { timeoutMs: ms, chunk },
          ));
          return;
        }

        controller.enqueue(result as T);
        return;
      }

      controller.enqueue(chunk as T);
    },
  });
}
