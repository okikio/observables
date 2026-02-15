/**
 * Comprehensive BDD tests for operator creation utilities.
 * 
 * This test suite validates the behavior of `createOperator` and `createStatefulOperator`,
 * the foundational functions for building custom Observable operators. These functions
 * wrap the Web Streams API to provide ergonomic operator creation with built-in error
 * handling and state management.
 * 
 * ## What We're Testing
 * 
 * Operators are the building blocks of Observable pipelines. They transform, filter, or
 * combine streams of values. This suite ensures that:
 * 
 * 1. **Basic Transformation**: Operators can transform values (like Array.map)
 * 2. **State Management**: Stateful operators maintain state across values
 * 3. **Error Handling**: All four error modes work correctly (pass-through, ignore, throw, manual)
 * 4. **Composition**: Operators can be chained together
 * 5. **Edge Cases**: Empty streams, synchronous errors, async transforms all work
 * 
 * ## Error Handling Philosophy
 * 
 * Operators support four error handling modes:
 * 
 * - **pass-through** (default): Errors become `ObservableError` values in the stream
 *   - Like bubble-wrapping errors so they're safe to handle downstream
 *   - Preserves all buffered values even when errors occur
 *   - Best for: Debugging, error recovery, logging
 * 
 * - **ignore**: Errors are silently dropped, stream continues
 *   - Like a filter that removes errors from the stream
 *   - Best for: Filtering noisy/unreliable data sources
 * 
 * - **throw**: Stream stops immediately on first error
 *   - Like Promise.reject() - fast failure
 *   - Best for: Validation, fail-fast scenarios
 * 
 * - **manual**: You handle errors yourself in the transform function
 *   - Full control, but you're responsible for all error cases
 *   - Best for: Custom error handling, specialized operators
 * 
 * ## Web Streams Foundation
 * 
 * Under the hood, operators use the Web Streams TransformStream API. This gives us:
 * - **Backpressure**: Slow consumers don't overwhelm fast producers
 * - **Memory efficiency**: Process data chunk-by-chunk, not all at once
 * - **Standard API**: Works across all modern browsers and runtimes
 * 
 * Think of it like a factory assembly line: each operator is a station that
 * processes items, and the conveyor belt (stream) handles the flow control
 * automatically.
 */

import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import { expect } from "@std/expect";

import { Observable } from "../../observable.ts";
import { createOperator, createStatefulOperator } from "../../helpers/operators.ts";
import { pipe } from "../../helpers/pipe.ts";
import { ignoreErrors } from "../../helpers/operations/errors.ts";
import { ObservableError, isObservableError } from "../../error.ts";

/**
 * Helper to collect all values from an observable into an array.
 * 
 * This uses the async iteration protocol (for await...of) to consume
 * the observable. It's like doing Array.from() but for async streams.
 * 
 * @param obs - The observable to collect values from
 * @returns Array of all emitted values
 */
async function collectValues<T>(obs: Observable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of obs) {
    values.push(value);
  }
  return values;
}

/**
 * Helper to collect values with a timeout.
 * 
 * Prevents tests from hanging if an observable doesn't complete.
 * Like Promise.race() but for observables.
 * 
 * @param obs - The observable to collect from
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @returns Array of collected values or timeout error
 */
async function collectWithTimeout<T>(
  obs: Observable<T>, 
  timeoutMs: number = 5000
): Promise<T[]> {
  return Promise.race([
    collectValues(obs),
    new Promise<T[]>((_, reject) => 
      setTimeout(() => reject(new Error(`Test timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

describe("createOperator()", () => {
  describe("Basic Transformation", () => {
    it("should create an operator that transforms values", async () => {
      // Think of this like Array.map(x => x * 2)
      // but for streams that arrive over time
      const double = createOperator<number, number>({
        name: 'double',
        transform(chunk, controller) {
          controller.enqueue(chunk * 2);
        }
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(source, ignoreErrors(), double);

      const values = await collectValues(result);
      expect(values).toEqual([2, 4, 6]);
    });

    it("should create an operator that filters values", async () => {
      // Only let even numbers through
      const evens = createOperator<number, number>({
        name: 'evens',
        transform(chunk, controller) {
          if (chunk % 2 === 0) {
            controller.enqueue(chunk);
          }
          // If we don't enqueue, the value is filtered out
        }
      });

      const source = Observable.of(1, 2, 3, 4, 5, 6);
      const result = pipe(source, ignoreErrors(), evens);

      const values = await collectValues(result);
      expect(values).toEqual([2, 4, 6]);
    });

    it("should create an operator that expands values (1 to many)", async () => {
      // Each input value becomes multiple output values
      // Like flatMap but synchronous
      const duplicate = createOperator<number, number>({
        name: 'duplicate',
        transform(chunk, controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
        }
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(source, ignoreErrors(), duplicate);

      const values = await collectValues(result);
      expect(values).toEqual([1, 1, 2, 2, 3, 3]);
    });

    it("should handle empty streams", async () => {
      const double = createOperator<number, number>({
        name: 'double',
        transform(chunk, controller) {
          controller.enqueue(chunk * 2);
        }
      });

      // Observable.of() with no args creates an empty stream
      const source = Observable.of<number>();
      const result = pipe(source, ignoreErrors(), double);

      const values = await collectValues(result);
      expect(values).toEqual([]);
    });

    it("should handle single value streams", async () => {
      const double = createOperator<number, number>({
        name: 'double',
        transform(chunk, controller) {
          controller.enqueue(chunk * 2);
        }
      });

      const source = Observable.of(42);
      const result = pipe(source, ignoreErrors(), double);

      const values = await collectValues(result);
      expect(values).toEqual([84]);
    });
  });

  describe("Using Existing TransformStream", () => {
    it("should accept a pre-built TransformStream", async () => {
      // Sometimes you want to use an existing TransformStream
      // This is useful for integrating with other stream-based APIs
      const stringify = createOperator<number, string>({
        name: 'stringify',
        stream: () => new TransformStream({
          transform(chunk: number, controller) {
            controller.enqueue(String(chunk));
          }
        })
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(source, ignoreErrors(), stringify);

      const values = await collectValues(result);
      expect(values).toEqual(['1', '2', '3']);
    });

    it("should support TransformStream with custom queuing strategy", async () => {
      // You can provide a custom queuing strategy for backpressure control
      // This is like setting a buffer size for the assembly line
      const bufferOne = createOperator<number, number>({
        name: 'bufferOne',
        stream: () => new TransformStream(
          {
            transform(chunk, controller) {
              controller.enqueue(chunk);
            }
          },
          // Queuing strategy limits how many items can be buffered
          { highWaterMark: 1 }
        )
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(source, ignoreErrors(), bufferOne);

      const values = await collectValues(result);
      expect(values).toEqual([1, 2, 3]);
    });
  });

  describe("Error Handling Modes", () => {
    describe("pass-through mode (default)", () => {
      it("should wrap errors as ObservableError values", async () => {
        // Errors become special values in the stream
        // Like putting errors in bubble wrap so they're safe to handle
        const errorOnTwo = createOperator<number, number | ObservableError>({
          name: 'errorOnTwo',
          errorMode: 'pass-through', // This is the default
          transform(chunk, controller) {
            if (chunk === 2) {
              throw new Error('Cannot process 2');
            }
            controller.enqueue(chunk);
          }
        });

        const source = Observable.of(1, 2, 3);
        const result = pipe(source, ignoreErrors(), errorOnTwo);

        const values = await collectValues(result);
        
        // We should get 1, an error, and 3
        expect(values).toHaveLength(3);
        expect(values[0]).toBe(1);
        expect(isObservableError(values[1])).toBe(true);
        expect(values[2]).toBe(3);
        
        // The error should have context
        if (isObservableError(values[1])) {
          expect(values[1].operator).toBe('errorOnTwo');
          expect(values[1].message).toContain('Cannot process 2');
        }
      });

      it("should preserve all values even when errors occur", async () => {
        // This is key: buffered values aren't lost when errors happen
        const errorOnEvens = createOperator<number, number | ObservableError>({
          name: 'errorOnEvens',
          errorMode: 'pass-through',
          transform(chunk, controller) {
            if (chunk % 2 === 0) {
              throw new Error('No evens allowed');
            }
            controller.enqueue(chunk);
          }
        });

        const source = Observable.of(1, 2, 3, 4, 5);
        const result = pipe(source, ignoreErrors(), errorOnEvens);

        const values = await collectValues(result);
        
        // Should have all 5 items: 1, error, 3, error, 5
        expect(values).toHaveLength(5);
        
        const errorCount = values.filter(isObservableError).length;
        const valueCount = values.filter(v => !isObservableError(v)).length;
        
        expect(errorCount).toBe(2); // errors for 2 and 4
        expect(valueCount).toBe(3); // values 1, 3, 5
      });
    });

    describe("ignore mode", () => {
      it("should silently drop errors and continue processing", async () => {
        // Errors are filtered out, like they never happened
        const errorOnTwo = createOperator<number, number>({
          name: 'errorOnTwo',
          errorMode: 'ignore',
          transform(chunk, controller) {
            if (chunk === 2) {
              throw new Error('Cannot process 2');
            }
            controller.enqueue(chunk);
          }
        });

        const source = Observable.of(1, 2, 3);
        const result = pipe(source, errorOnTwo);

        const values = await collectValues(result);
        
        // The error is completely removed from the stream
        expect(values).toEqual([1, 3]);
      });

      it("should handle multiple consecutive errors", async () => {
        const errorOnEvens = createOperator<number, number>({
          name: 'errorOnEvens',
          errorMode: 'ignore',
          transform(chunk, controller) {
            if (chunk % 2 === 0) {
              throw new Error('No evens');
            }
            controller.enqueue(chunk);
          }
        });

        const source = Observable.of(1, 2, 3, 4, 5, 6, 7);
        const result = pipe(source, errorOnEvens);

        const values = await collectValues(result);
        expect(values).toEqual([1, 3, 5, 7]);
      });

      it("should handle all values being errors", async () => {
        const alwaysError = createOperator<number, number>({
          name: 'alwaysError',
          errorMode: 'ignore',
          transform(_chunk, _controller) {
            throw new Error('Always fails');
          }
        });

        const source = Observable.of(1, 2, 3);
        const result = pipe(source, alwaysError);

        const values = await collectValues(result);
        // All errors ignored, so empty result
        expect(values).toEqual([]);
      });
    });

    describe("throw mode", () => {
      it("should stop the stream on first error", async () => {
        // Fail-fast: first error terminates everything
        const errorOnTwo = createOperator<number, number>({
          name: 'errorOnTwo',
          errorMode: 'throw',
          transform(chunk, controller) {
            if (chunk === 2) {
              throw new Error('Cannot process 2');
            }
            controller.enqueue(chunk);
          }
        });

        const source = Observable.of(1, 2, 3);
        const result = pipe(source, ignoreErrors(), errorOnTwo);

        // The stream should error out
        await expect(collectValues(result)).rejects.toThrow('Cannot process 2');
      });

      it("should propagate synchronous errors immediately", async () => {
        const throwImmediately = createOperator<number, number>({
          name: 'throwImmediately',
          errorMode: 'throw',
          transform(_chunk, _controller) {
            throw new Error('Immediate failure');
          }
        });

        const source = Observable.of(1);
        const result = pipe(source, ignoreErrors(), throwImmediately);

        await expect(collectValues(result)).rejects.toThrow('Immediate failure');
      });
    });

    describe("manual mode", () => {
      it("should let you handle errors yourself", async () => {
        // Full control - you decide what to do with errors
        const manualErrorHandler = createOperator<number, number | string>({
          name: 'manualErrorHandler',
          errorMode: 'manual',
          transform(chunk, controller) {
            try {
              if (chunk === 2) {
                throw new Error('Two is problematic');
              }
              controller.enqueue(chunk);
            } catch (err) {
              // Custom error handling: convert to string
              controller.enqueue(`ERROR: ${(err as Error).message}`);
            }
          }
        });

        const source = Observable.of(1, 2, 3);
        const result = pipe(source, ignoreErrors(), manualErrorHandler);

        const values = await collectValues(result);
        expect(values).toEqual([1, 'ERROR: Two is problematic', 3]);
      });

      it("should not wrap errors automatically", async () => {
        // In manual mode, uncaught errors still propagate
        const noErrorHandling = createOperator<number, number>({
          name: 'noErrorHandling',
          errorMode: 'manual',
          transform(chunk, _controller) {
            if (chunk === 2) {
              throw new Error('Unhandled error');
            }
          }
        });

        const source = Observable.of(1, 2, 3);
        const result = pipe(source, ignoreErrors(), noErrorHandling);

        // Unhandled error in manual mode still propagates
        await expect(collectValues(result)).rejects.toThrow();
      });
    });
  });

  describe("Async Transformations", () => {
    it("should handle async transforms", async () => {
      // Sometimes your transform needs to do async work
      const asyncDouble = createOperator<number, number>({
        name: 'asyncDouble',
        async transform(chunk, controller) {
          // Simulate async operation (e.g., API call)
          await new Promise(resolve => setTimeout(resolve, 1));
          controller.enqueue(chunk * 2);
        }
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(source, ignoreErrors(), asyncDouble);

      const values = await collectWithTimeout(result);
      expect(values).toEqual([2, 4, 6]);
    });

    it("should handle async errors in pass-through mode", async () => {
      const asyncError = createOperator<number, number | ObservableError>({
        name: 'asyncError',
        errorMode: 'pass-through',
        async transform(chunk, controller) {
          await new Promise(resolve => setTimeout(resolve, 1));
          if (chunk === 2) {
            throw new Error('Async error');
          }
          controller.enqueue(chunk);
        }
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(source, ignoreErrors(), asyncError);

      const values = await collectWithTimeout(result);
      expect(values).toHaveLength(3);
      expect(isObservableError(values[1])).toBe(true);
    });
  });

  describe("Operator Composition", () => {
    it("should compose multiple operators in a pipeline", async () => {
      // Like chaining Array methods: arr.map().map()
      const addOne = createOperator<number, number>({
        name: 'addOne',
        transform(chunk, controller) {
          controller.enqueue(chunk + 1);
        }
      });

      const double = createOperator<number, number>({
        name: 'double',
        transform(chunk, controller) {
          controller.enqueue(chunk * 2);
        }
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(
        source,
        ignoreErrors(),
        addOne,  // 2, 3, 4
        double   // 4, 6, 8
      );

      const values = await collectValues(result);
      expect(values).toEqual([4, 6, 8]);
    });

    it("should handle errors in operator chains", async () => {
      const addOne = createOperator<number, number>({
        name: 'addOne',
        transform(chunk, controller) {
          controller.enqueue(chunk + 1);
        }
      });

      const errorOnThree = createOperator<number, number | ObservableError>({
        name: 'errorOnThree',
        errorMode: 'pass-through',
        transform(chunk, controller) {
          if (chunk === 3) {
            throw new Error('Three not allowed');
          }
          controller.enqueue(chunk);
        }
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(
        source,
        ignoreErrors(),
        addOne,         // 2, 3, 4
        errorOnThree    // 2, error, 4
      );

      const values = await collectValues(result);
      expect(values).toHaveLength(3);
      expect(values[0]).toBe(2);
      expect(isObservableError(values[1])).toBe(true);
      expect(values[2]).toBe(4);
    });
  });
});

describe("createStatefulOperator()", () => {
  describe("State Management", () => {
    it("should maintain state across transformations", async () => {
      // Stateful operators remember things between values
      // Like Array.reduce() but for streams
      const runningSum = createStatefulOperator<number, number, { sum: number }>({
        name: 'runningSum',
        createState: () => ({ sum: 0 }),
        transform(chunk, state, controller) {
          state.sum += chunk;
          controller.enqueue(state.sum);
        }
      });

      const source = Observable.of(1, 2, 3, 4);
      const result = pipe(source, ignoreErrors(), runningSum);

      const values = await collectValues(result);
      // Each value is the running total: 1, 1+2=3, 3+3=6, 6+4=10
      expect(values).toEqual([1, 3, 6, 10]);
    });

    it("should maintain separate state per stream", async () => {
      // Each subscription gets its own state
      // This is important for cold observables
      const counter = createStatefulOperator<string, string, { count: number }>({
        name: 'counter',
        createState: () => ({ count: 0 }),
        transform(chunk, state, controller) {
          state.count++;
          controller.enqueue(`${state.count}:${chunk}`);
        }
      });

      const source = Observable.of('a', 'b', 'c');
      const stream1 = pipe(source, ignoreErrors(), counter);
      const stream2 = pipe(source, ignoreErrors(), counter);

      // Each stream should have independent state
      const values1 = await collectValues(stream1);
      const values2 = await collectValues(stream2);

      expect(values1).toEqual(['1:a', '2:b', '3:c']);
      expect(values2).toEqual(['1:a', '2:b', '3:c']);
    });

    it("should support complex state objects", async () => {
      // State can be any object - arrays, maps, sets, etc.
      interface BufferState {
        buffer: number[];
        maxSize: number;
      }

      const bufferTwo = createStatefulOperator<number, number[], BufferState>({
        name: 'bufferTwo',
        createState: () => ({ buffer: [], maxSize: 2 }),
        transform(chunk, state, controller) {
          state.buffer.push(chunk);
          
          if (state.buffer.length === state.maxSize) {
            // Emit the buffered values as an array
            controller.enqueue([...state.buffer]);
            state.buffer = [];
          }
        },
        // Flush remaining buffer when stream completes
        flush(state, controller) {
          if (state.buffer.length > 0) {
            controller.enqueue([...state.buffer]);
          }
        }
      });

      const source = Observable.of(1, 2, 3, 4, 5);
      const result = pipe(source, ignoreErrors(), bufferTwo);

      const values = await collectValues(result);
      // Values are emitted in pairs, with the last odd one out
      expect(values).toEqual([[1, 2], [3, 4], [5]]);
    });

    it("should call createState only once per stream", async () => {
      let createStateCallCount = 0;

      const trackCalls = createStatefulOperator<number, number, { id: number }>({
        name: 'trackCalls',
        createState: () => {
          createStateCallCount++;
          return { id: createStateCallCount };
        },
        transform(chunk, state, controller) {
          controller.enqueue(chunk * state.id);
        }
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(source, ignoreErrors(), trackCalls);

      await collectValues(result);
      
      // State should be created exactly once
      expect(createStateCallCount).toBe(1);
    });
  });

  describe("Flush Callback", () => {
    it("should call flush when stream completes", async () => {
      let flushed = false;

      const withFlush = createStatefulOperator<number, number | string, { items: number[] }>({
        name: 'withFlush',
        createState: () => ({ items: [] }),
        transform(chunk, state, controller) {
          state.items.push(chunk);
          controller.enqueue(chunk);
        },
        flush(state, controller) {
          flushed = true;
          controller.enqueue(`Summary: ${state.items.length} items`);
        }
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(source, ignoreErrors(), withFlush);

      const values = await collectValues(result);
      
      expect(flushed).toBe(true);
      expect(values).toEqual([1, 2, 3, 'Summary: 3 items']);
    });

    it("should use flush to emit remaining buffered items", async () => {
      // Common pattern: buffer items and flush remaining on completion
      const bufferThree = createStatefulOperator<number, number[], { buffer: number[] }>({
        name: 'bufferThree',
        createState: () => ({ buffer: [] }),
        transform(chunk, state, controller) {
          state.buffer.push(chunk);
          if (state.buffer.length === 3) {
            controller.enqueue([...state.buffer]);
            state.buffer = [];
          }
        },
        flush(state, controller) {
          if (state.buffer.length > 0) {
            controller.enqueue([...state.buffer]);
          }
        }
      });

      const source = Observable.of(1, 2, 3, 4, 5, 6, 7);
      const result = pipe(source, ignoreErrors(), bufferThree);

      const values = await collectValues(result);
      // Three complete buffers plus one partial
      expect(values).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    });
  });

  describe("Error Handling in Stateful Operators", () => {
    it("should handle errors in transform with pass-through mode", async () => {
      const errorOnEven = createStatefulOperator<
        number, 
        number | ObservableError, 
        { count: number }
      >({
        name: 'errorOnEven',
        createState: () => ({ count: 0 }),
        errorMode: 'pass-through',
        transform(chunk, state, controller) {
          state.count++;
          if (chunk % 2 === 0) {
            throw new Error('Even numbers not allowed');
          }
          controller.enqueue(chunk);
        }
      });

      const source = Observable.of(1, 2, 3, 4, 5);
      const result = pipe(source, ignoreErrors(), errorOnEven);

      const values = await collectValues(result);
      
      // Should have errors for 2 and 4
      const errors = values.filter(isObservableError);
      const nums = values.filter(v => typeof v === 'number');
      
      expect(errors).toHaveLength(2);
      expect(nums).toEqual([1, 3, 5]);
    });

    it("should maintain state even when errors occur", async () => {
      // Critical: state should persist through errors
      const countWithErrors = createStatefulOperator<
        number,
        number | ObservableError,
        { total: number }
      >({
        name: 'countWithErrors',
        createState: () => ({ total: 0 }),
        errorMode: 'pass-through',
        transform(chunk, state, controller) {
          state.total++;
          if (chunk === 2) {
            throw new Error('Two causes error');
          }
          controller.enqueue(chunk * state.total);
        }
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(source, ignoreErrors(), countWithErrors);

      const values = await collectValues(result);
      
      // 1 * 1 = 1, error (but total=2 now), 3 * 3 = 9
      expect(values[0]).toBe(1);
      expect(isObservableError(values[1])).toBe(true);
      expect(values[2]).toBe(9); // Proves state continued incrementing
    });

    it("should handle errors in ignore mode", async () => {
      const silentErrors = createStatefulOperator<number, number, { passed: number }>({
        name: 'silentErrors',
        createState: () => ({ passed: 0 }),
        errorMode: 'ignore',
        transform(chunk, state, controller) {
          if (chunk === 2) {
            throw new Error('Silent error');
          }
          state.passed++;
          controller.enqueue(chunk);
        }
      });

      const source = Observable.of(1, 2, 3);
      const result = pipe(source, silentErrors);

      const values = await collectValues(result);
      expect(values).toEqual([1, 3]);
    });
  });

  describe("Real-World Patterns", () => {
    it("should implement a moving average", async () => {
      // Moving average: keep last N values and output their average
      // Common in data analysis and signal processing
      const movingAvg = createStatefulOperator<number, number, { window: number[] }>({
        name: 'movingAvg',
        createState: () => ({ window: [] }),
        transform(chunk, state, controller) {
          state.window.push(chunk);
          
          // Keep only last 3 values
          if (state.window.length > 3) {
            state.window.shift();
          }
          
          // Calculate and emit average
          const sum = state.window.reduce((a, b) => a + b, 0);
          const avg = sum / state.window.length;
          controller.enqueue(avg);
        }
      });

      const source = Observable.of(1, 2, 3, 4, 5);
      const result = pipe(source, ignoreErrors(), movingAvg);

      const values = await collectValues(result);
      
      // Window: [1], [1,2], [1,2,3], [2,3,4], [3,4,5]
      // Avgs:    1,   1.5,    2,       3,       4
      expect(values).toEqual([1, 1.5, 2, 3, 4]);
    });

    it("should implement a deduplication operator", async () => {
      // Only emit values that are different from the previous one
      // Like Array filter but comparing to previous element
      const dedupe = createStatefulOperator<number, number, { last?: number }>({
        name: 'dedupe',
        createState: () => ({}),
        transform(chunk, state, controller) {
          if (state.last !== chunk) {
            controller.enqueue(chunk);
            state.last = chunk;
          }
        }
      });

      const source = Observable.of(1, 1, 2, 2, 2, 3, 1, 1);
      const result = pipe(source, ignoreErrors(), dedupe);

      const values = await collectValues(result);
      expect(values).toEqual([1, 2, 3, 1]);
    });

    it("should implement a rate limiter", async () => {
      // Only let through N items total
      // Like Array.slice(0, N) but for streams
      const takeN = (n: number) => createStatefulOperator<number, number, { count: number }>({
        name: 'takeN',
        createState: () => ({ count: 0 }),
        transform(chunk, state, controller) {
          if (state.count < n) {
            controller.enqueue(chunk);
            state.count++;
          }
        }
      });

      const source = Observable.of(1, 2, 3, 4, 5);
      const result = pipe(source, ignoreErrors(), takeN(3));

      const values = await collectValues(result);
      expect(values).toEqual([1, 2, 3]);
    });

    it("should implement a grouping operator", async () => {
      // Group consecutive items into batches
      // Useful for batch API calls
      interface BatchState {
        batch: number[];
        size: number;
      }

      const batch = (size: number) => createStatefulOperator<number, number[], BatchState>({
        name: 'batch',
        createState: () => ({ batch: [], size }),
        transform(chunk, state, controller) {
          state.batch.push(chunk);
          
          if (state.batch.length >= state.size) {
            controller.enqueue([...state.batch]);
            state.batch = [];
          }
        },
        flush(state, controller) {
          if (state.batch.length > 0) {
            controller.enqueue([...state.batch]);
          }
        }
      });

      const source = Observable.of(1, 2, 3, 4, 5, 6, 7);
      const result = pipe(source, ignoreErrors(), batch(3));

      const values = await collectValues(result);
      expect(values).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty streams", async () => {
      const counter = createStatefulOperator<number, number, { count: number }>({
        name: 'counter',
        createState: () => ({ count: 0 }),
        transform(chunk, state, controller) {
          state.count++;
          controller.enqueue(state.count);
        }
      });

      const source = Observable.of<number>();
      const result = pipe(source, ignoreErrors(), counter);

      const values = await collectValues(result);
      expect(values).toEqual([]);
    });

    it("should handle single value streams", async () => {
      const wrapper = createStatefulOperator<number, { value: number }, Record<string, never>>({
        name: 'wrapper',
        createState: () => ({}),
        transform(chunk, _state, controller) {
          controller.enqueue({ value: chunk });
        }
      });

      const source = Observable.of(42);
      const result = pipe(source, ignoreErrors(), wrapper);

      const values = await collectValues(result);
      expect(values).toEqual([{ value: 42 }]);
    });

    it("should handle rapid state changes", async () => {
      // State can change multiple times per value
      const fibonacci = createStatefulOperator<number, number, { prev: number; curr: number }>({
        name: 'fibonacci',
        createState: () => ({ prev: 0, curr: 1 }),
        transform(_chunk, state, controller) {
          controller.enqueue(state.curr);
          const next = state.prev + state.curr;
          state.prev = state.curr;
          state.curr = next;
        }
      });

      // Generate 5 fibonacci numbers
      const source = Observable.of(0, 0, 0, 0, 0);
      const result = pipe(source, ignoreErrors(), fibonacci);

      const values = await collectValues(result);
      expect(values).toEqual([1, 1, 2, 3, 5]);
    });
  });
});
