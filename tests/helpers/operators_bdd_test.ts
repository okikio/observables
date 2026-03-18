/**
 * Tests for `createOperator` and `createStatefulOperator` - the core functions for building
 * custom Observable operators that wrap Web Streams with ergonomic error handling.
 * 
 * Operators transform, filter, or combine streams like Array.map but for async data. This suite
 * validates basic transformations, state management across values, all four error modes 
 * (pass-through, ignore, throw, manual), operator composition, and edge cases like empty streams
 * and async transforms.
 * 
 * Error modes control failure behavior: pass-through wraps errors as ObservableError values
 * (preserves buffered data, good for debugging), ignore silently drops errors (filtering noisy
 * sources), throw stops immediately (fail-fast validation), and manual gives full control
 * (custom error handling).
 * 
 * Built on Web Streams TransformStream for automatic backpressure (slow consumers don't overwhelm
 * fast producers), chunk-by-chunk processing (memory efficient), and cross-platform compatibility.
 */

import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";

import { Observable, pull } from "../../observable.ts";
import { createOperator, createStatefulOperator } from "../../helpers/operators.ts";
import { pipe } from "../../helpers/pipe.ts";
import { ignoreErrors } from "../../helpers/operations/errors.ts";
import { ObservableError, isObservableError } from "../../error.ts";

/**
 * Collects all observable values into an array using async iteration (for await...of).
 */
async function collectValues<T>(obs: Observable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of obs) {
    values.push(value);
  }
  return values;
}

/**
 * Collects values without throwing when the stream emits ObservableError values.
 */
async function collectValuesAllowErrors<T>(obs: Observable<T>): Promise<Array<T | ObservableError>> {
  const values: Array<T | ObservableError> = [];
  for await (const value of pull(obs, { throwError: false })) {
    values.push(value);
  }
  return values;
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

      const values = await collectValuesAllowErrors(result);
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

      const values = await collectValuesAllowErrors(result);
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

      const values = await collectValuesAllowErrors(result);
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

      const values = await collectValuesAllowErrors(result);
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

      const values = await collectValuesAllowErrors(result);
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

      const values = await collectValuesAllowErrors(result);
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

        const values = await collectValuesAllowErrors(result);
        
        // We should get 1, an error, and 3
        expect(values).toHaveLength(3);
        expect(values[0]).toBe(1);
        expect(isObservableError(values[1])).toBe(true);
        expect(values[2]).toBe(3);
        
        // The error should have context
        if (isObservableError(values[1])) {
          expect(values[1].operator).toBe('operator:errorOnTwo');
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

        const values = await collectValuesAllowErrors(result);
        
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
        const result = pipe(source, ignoreErrors(), errorOnTwo);

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
        const result = pipe(source, ignoreErrors(), errorOnEvens);

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
        const result = pipe(source, ignoreErrors(), alwaysError);

        const values = await collectValues(result);
        // All errors ignored, so empty result
        expect(values).toEqual([]);
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

      const values = await collectValuesAllowErrors(result);
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

      const values = await collectValuesAllowErrors(result);
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
        ignoreErrors(),
        double   // 4, 6, 8
      );

      const values = await collectValuesAllowErrors(result);
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
        ignoreErrors(),
        errorOnThree    // 2, error, 4
      );

      const values = await collectValuesAllowErrors(result);
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

      const values = await collectValuesAllowErrors(result);
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

      const values = await collectValuesAllowErrors(result);
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

      const values = await collectValuesAllowErrors(result);
      
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

      const values = await collectValuesAllowErrors(result);
      
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

      const values = await collectValuesAllowErrors(result);
      
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
      const result = pipe(source, ignoreErrors(), silentErrors);

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
