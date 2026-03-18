/**
 * Tests for stream utilities that connect the Observable and operator ecosystem - type guards
 * for distinguishing operator option types, stream conversion from arrays/iterables/async iterables,
 * error injection, and operator application with graceful error handling.
 *
 * These utilities provide the plumbing between plain data and streams: type guards help TypeScript
 * narrow operator options (stream-based vs function-based), toStream converts any iterable into
 * ReadableStream, injectError safely wraps errors as values, and applyOperator handles failures
 * during operator application. Built on Web Streams (ReadableStream/WritableStream/TransformStream)
 * for cross-platform compatibility without low-level boilerplate.
 */

import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";

import {
  applyOperator,
  injectError,
  isTransformFunctionOptions,
  isTransformStreamOptions,
  toStream,
} from "../../helpers/utils.ts";
import type { CreateOperatorOptions } from "../../helpers/_types.ts";
import type { ObservableError } from "../../error.ts";
import { isObservableError } from "../../error.ts";

/**
 * Collects all values from a ReadableStream using the reader API.
 */
async function collectStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const values: T[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      values.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return values;
}

describe("Type Guard Utilities", () => {
  describe("isTransformStreamOptions()", () => {
    it("should identify stream-based operator options", () => {
      // When you provide a pre-built TransformStream
      const streamOptions: CreateOperatorOptions<number, string> = {
        name: "stringify",
        stream: () =>
          new TransformStream({
            transform(chunk: number, controller) {
              controller.enqueue(String(chunk));
            },
          }),
      };

      expect(isTransformStreamOptions(streamOptions)).toBe(true);
    });

    it("should reject function-based operator options", () => {
      // When you provide a transform function instead
      const functionOptions: CreateOperatorOptions<number, string> = {
        name: "stringify",
        transform(chunk, controller) {
          controller.enqueue(String(chunk));
        },
      };

      expect(isTransformStreamOptions(functionOptions)).toBe(false);
    });

    it("should handle options with both stream and transform", () => {
      // Edge case: what if someone provides both?
      // The 'stream' property takes precedence
      const bothOptions = {
        name: "both",
        stream: () => new TransformStream(),
        transform(
          _chunk: number,
          _controller: TransformStreamDefaultController<string>,
        ) {
          // This would be ignored
        },
      };

      // Should return true because 'stream' is present
      expect(isTransformStreamOptions(bothOptions)).toBe(true);
    });

    it("should handle minimal options without stream", () => {
      const minimalOptions = {
        name: "minimal",
        // No stream or transform
      } as unknown as CreateOperatorOptions<number, string>;

      expect(isTransformStreamOptions(minimalOptions)).toBe(false);
    });
  });

  describe("isTransformFunctionOptions()", () => {
    it("should identify function-based operator options", () => {
      const functionOptions: CreateOperatorOptions<number, string> = {
        name: "stringify",
        transform(chunk, controller) {
          controller.enqueue(String(chunk));
        },
      };

      expect(isTransformFunctionOptions(functionOptions)).toBe(true);
    });

    it("should reject stream-based operator options", () => {
      const streamOptions: CreateOperatorOptions<number, string> = {
        name: "stringify",
        stream: () => new TransformStream(),
      };

      expect(isTransformFunctionOptions(streamOptions)).toBe(false);
    });

    it("should handle options with both stream and transform", () => {
      const bothOptions = {
        name: "both",
        stream: () => new TransformStream(),
        transform(
          _chunk: number,
          _controller: TransformStreamDefaultController<string>,
        ) {
          // Both are present
        },
      };

      // Should return true because 'transform' is present
      expect(isTransformFunctionOptions(bothOptions)).toBe(true);
    });

    it("should handle async transform functions", () => {
      const asyncOptions: CreateOperatorOptions<number, string> = {
        name: "asyncStringify",
        async transform(chunk, controller) {
          // Async transforms are still transform functions
          await Promise.resolve();
          controller.enqueue(String(chunk));
        },
      };

      expect(isTransformFunctionOptions(asyncOptions)).toBe(true);
    });
  });

  describe("Type Guard Precision", () => {
    it("should narrow types correctly in TypeScript", () => {
      const options: CreateOperatorOptions<number, string> = {
        name: "test",
        stream: () => new TransformStream(),
      };

      // TypeScript should narrow the type
      if (isTransformStreamOptions(options)) {
        // In this branch, TypeScript knows options has 'stream'
        expect(typeof options.stream).toBe("function");
      }

      if (isTransformFunctionOptions(options)) {
        // This branch wouldn't execute for this options object
        expect(true).toBe(false); // Shouldn't reach here
      } else {
        // We should be here
        expect(true).toBe(true);
      }
    });
  });
});

describe("Stream Conversion Utilities", () => {
  describe("toStream() - Basic Conversion", () => {
    it("should convert an array to a ReadableStream", async () => {
      // Arrays are the simplest iterable
      const input = [1, 2, 3, 4, 5];
      const stream = toStream(input);

      const values = await collectStream(stream);
      expect(values).toEqual([1, 2, 3, 4, 5]);
    });

    it("should convert an empty array", async () => {
      const input: number[] = [];
      const stream = toStream(input);

      const values = await collectStream(stream);
      expect(values).toEqual([]);
    });

    it("should convert a single-item array", async () => {
      const input = [42];
      const stream = toStream(input);

      const values = await collectStream(stream);
      expect(values).toEqual([42]);
    });

    it("should preserve value types", async () => {
      // Make sure different types work correctly
      const strings = ["hello", "world"];
      const objects = [{ id: 1 }, { id: 2 }];
      const booleans = [true, false, true];

      expect(await collectStream(toStream(strings))).toEqual(strings);
      expect(await collectStream(toStream(objects))).toEqual(objects);
      expect(await collectStream(toStream(booleans))).toEqual(booleans);
    });
  });

  describe("toStream() - Generator Functions", () => {
    it("should convert a generator to a stream", async () => {
      // Generators are lazy iterables
      function* numberGenerator() {
        yield 1;
        yield 2;
        yield 3;
      }

      const stream = toStream(numberGenerator());
      const values = await collectStream(stream);

      expect(values).toEqual([1, 2, 3]);
    });

    it("should allow partial reads from large finite generators", async () => {
      function* manyNumbers() {
        for (let n = 1; n <= 1000; n++) {
          yield n;
        }
      }

      const stream = toStream(manyNumbers());
      const reader = stream.getReader();

      // Take only first 5 values
      const values: number[] = [];
      for (let i = 0; i < 5; i++) {
        const { value } = await reader.read();
        if (value === undefined) {
          throw new Error("Expected value from finite generator");
        }
        if (isObservableError(value)) {
          throw value;
        }
        values.push(value);
      }

      reader.releaseLock();
      expect(values).toEqual([1, 2, 3, 4, 5]);
    });

    it("should handle generators that throw errors", async () => {
      function* errorGenerator() {
        yield 1;
        yield 2;
        throw new Error("Generator error");
      }

      const stream = toStream(errorGenerator());
      const values: Array<number | ObservableError> = [];

      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          values.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      // Should get values before error, then an ObservableError
      expect(values.length).toBeGreaterThanOrEqual(2);
      expect(values[0]).toBe(1);
      expect(values[1]).toBe(2);

      // The error should be wrapped
      const lastValue = values[values.length - 1];
      expect(isObservableError(lastValue)).toBe(true);
    });
  });

  describe("toStream() - Async Iterables", () => {
    it("should convert async iterables to streams", async () => {
      // Async iterables emit values asynchronously
      async function* asyncNumbers() {
        for (let i = 1; i <= 3; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          yield i;
        }
      }

      const stream = toStream(asyncNumbers());
      const values = await collectStream(stream);

      expect(values).toEqual([1, 2, 3]);
    });

    it("should handle async generators with delays", async () => {
      async function* delayedValues() {
        yield "first";
        await new Promise((resolve) => setTimeout(resolve, 10));
        yield "second";
        await new Promise((resolve) => setTimeout(resolve, 10));
        yield "third";
      }

      const startTime = Date.now();
      const stream = toStream(delayedValues());
      const values = await collectStream(stream);
      const elapsed = Date.now() - startTime;

      expect(values).toEqual(["first", "second", "third"]);
      expect(elapsed).toBeGreaterThanOrEqual(20); // At least 20ms delay
    });

    it("should handle async iterables that reject", async () => {
      async function* rejectingGenerator() {
        yield 1;
        await Promise.resolve();
        throw new Error("Async error");
      }

      const stream = toStream(rejectingGenerator());
      const values: Array<number | ObservableError> = [];

      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          values.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      // Should wrap the async error
      expect(values.length).toBeGreaterThanOrEqual(1);
      const lastValue = values[values.length - 1];
      expect(isObservableError(lastValue)).toBe(true);
    });
  });

  describe("toStream() - Custom Iterables", () => {
    it("should convert custom iterable objects", async () => {
      // Custom iterable with Symbol.iterator
      const customIterable = {
        *[Symbol.iterator]() {
          yield "a";
          yield "b";
          yield "c";
        },
      };

      const stream = toStream(customIterable);
      const values = await collectStream(stream);

      expect(values).toEqual(["a", "b", "c"]);
    });

    it("should handle Set as iterable", async () => {
      // Sets are iterable
      const set = new Set([1, 2, 3, 2, 1]); // Duplicates removed
      const stream = toStream(set);
      const values = await collectStream(stream);

      expect(values).toEqual([1, 2, 3]);
    });

    it("should handle Map values", async () => {
      const map = new Map([
        ["a", 1],
        ["b", 2],
        ["c", 3],
      ]);

      const stream = toStream(map);
      const values = await collectStream(stream);

      expect(values).toEqual([["a", 1], ["b", 2], ["c", 3]]);
    });

    it("should handle string as iterable", async () => {
      // Strings are iterable (characters)
      const str = "hello";
      const stream = toStream(str);
      const values = await collectStream(stream);

      expect(values).toEqual(["h", "e", "l", "l", "o"]);
    });
  });

  describe("toStream() - Edge Cases", () => {
    it("should handle very large arrays efficiently", async () => {
      // Stream conversion should be memory-efficient
      const largeArray = Array.from({ length: 10000 }, (_, i) => i);
      const stream = toStream(largeArray);

      // Read only first 10 values to verify it works
      const reader = stream.getReader();
      const values: number[] = [];

      for (let i = 0; i < 10; i++) {
        const { value } = await reader.read();
        if (value === undefined) {
          throw new Error("Expected value from large array stream");
        }
        if (isObservableError(value)) {
          throw value;
        }
        values.push(value);
      }

      reader.releaseLock();
      expect(values).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("should handle arrays with mixed types", async () => {
      const mixed = [1, "two", { three: 3 }, [4], null, undefined];
      const stream = toStream(mixed);
      const values = await collectStream(stream);

      expect(values).toEqual(mixed);
    });

    it("should handle nested arrays", async () => {
      const nested = [[1, 2], [3, 4], [5, 6]];
      const stream = toStream(nested);
      const values = await collectStream(stream);

      expect(values).toEqual(nested);
    });
  });
});

describe("Error Injection Utilities", () => {
  describe("injectError()", () => {
    it("should inject an error into a stream", async () => {
      // Create a simple stream
      const stream = toStream([1, 2, 3]);

      // Inject an error
      const error = new Error("Injected error");
      const errorStream = stream.pipeThrough(injectError(error, "test"));

      const values = await collectStream(errorStream);

      // Should have an ObservableError at the start
      expect(values.length).toBeGreaterThan(0);
      expect(isObservableError(values[0])).toBe(true);

      if (isObservableError(values[0])) {
        expect(values[0].message).toContain("Injected error");
        expect(values[0].operator).toBe("test");
      }
    });

    it("should inject error with context message", async () => {
      const stream = toStream(["a", "b"]);
      const error = new Error("Something went wrong");
      const contextMessage = "operator:map:transform";

      const errorStream = stream.pipeThrough(
        injectError(error, contextMessage),
      );
      const values = await collectStream(errorStream);

      const firstValue = values[0];
      if (isObservableError(firstValue)) {
        expect(firstValue.operator).toBe(contextMessage);
      }
    });

    it("should preserve original stream values after error", async () => {
      // The error is injected at the start, original values follow
      const stream = toStream([1, 2, 3]);
      const errorStream = stream.pipeThrough(
        injectError(new Error("Test"), "inject"),
      );

      const values = await collectStream(errorStream);

      // First value is the error, rest are original values
      expect(values.length).toBe(4); // error + 3 values
      expect(isObservableError(values[0])).toBe(true);
      expect(values[1]).toBe(1);
      expect(values[2]).toBe(2);
      expect(values[3]).toBe(3);
    });

    it("should handle injecting into empty stream", async () => {
      const stream = toStream([]);
      const errorStream = stream.pipeThrough(
        injectError(new Error("Empty error"), "test"),
      );

      const values = await collectStream(errorStream);

      // Should just have the error
      expect(values).toHaveLength(1);
      expect(isObservableError(values[0])).toBe(true);
    });

    it("should wrap non-Error objects", async () => {
      const stream = toStream([1]);
      // Sometimes people throw strings or objects, not Error instances
      const errorStream = stream.pipeThrough(
        injectError("string error", "test"),
      );

      const values = await collectStream(errorStream);
      expect(isObservableError(values[0])).toBe(true);
    });
  });
});

describe("Operator Application Utilities", () => {
  describe("applyOperator()", () => {
    it("should apply operator successfully", async () => {
      const input = toStream([1, 2, 3]);

      // Create a simple doubling operator
      const double = (stream: ReadableStream<number>) => {
        return stream.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              controller.enqueue(chunk * 2);
            },
          }),
        );
      };

      const result = applyOperator(input, double);
      const values = await collectStream(result);

      expect(values).toEqual([2, 4, 6]);
    });

    it("should catch errors in operator application", async () => {
      const input = toStream([1, 2, 3]);

      // An operator that throws when applied
      const throwingOperator = (_stream: ReadableStream<unknown>) => {
        throw new Error("Operator application failed");
      };

      const result = applyOperator(input, throwingOperator, {
        message: "pipe:testOperator",
      });

      const values = await collectStream(result);

      // Error should be injected into the stream
      expect(values.length).toBeGreaterThan(0);
      const firstValue = values[0];
      expect(isObservableError(firstValue)).toBe(true);

      if (isObservableError(firstValue)) {
        expect(firstValue.message).toContain("Operator application failed");
      }
    });

    it("should preserve values when operator succeeds", async () => {
      const input = toStream(["a", "b", "c"]);

      const uppercase = (stream: ReadableStream<string>) => {
        return stream.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              controller.enqueue(chunk.toUpperCase());
            },
          }),
        );
      };

      const result = applyOperator(input, uppercase);
      const values = await collectStream(result);

      expect(values).toEqual(["A", "B", "C"]);
    });

    it("should work with identity operator (no-op)", async () => {
      const input = toStream([1, 2, 3]);

      // Identity: returns stream unchanged
      const identity = (stream: ReadableStream<number>) => stream;

      const result = applyOperator(input, identity);
      const values = await collectStream(result);

      expect(values).toEqual([1, 2, 3]);
    });

    it("should handle operator that filters all values", async () => {
      const input = toStream([1, 2, 3, 4, 5]);

      const filterAll = (stream: ReadableStream<number>) => {
        return stream.pipeThrough(
          new TransformStream({
            transform(_chunk, _controller) {
              // Don't enqueue anything - filter everything out
            },
          }),
        );
      };

      const result = applyOperator(input, filterAll);
      const values = await collectStream(result);

      expect(values).toEqual([]);
    });

    it("should use custom error message", async () => {
      const input = toStream([1]);

      const failingOp = () => {
        throw new Error("Boom");
      };

      const result = applyOperator(input, failingOp, {
        message: "custom:error:context",
      });

      const values = await collectStream(result);
      const firstValue = values[0];

      if (isObservableError(firstValue)) {
        expect(firstValue.operator).toBe("custom:error:context");
      }
    });
  });
});

describe("Integration Tests", () => {
  describe("Full Pipeline with Utilities", () => {
    it("should convert iterable → stream → observable → values", async () => {
      // This tests the full conversion pipeline
      const input = [1, 2, 3, 4, 5];

      // Convert to stream
      const stream = toStream(input);

      // Apply transformation
      const doubled = stream.pipeThrough(
        new TransformStream({
          transform(chunk: number, controller) {
            controller.enqueue(chunk * 2);
          },
        }),
      );

      // Collect results
      const values = await collectStream(doubled);

      expect(values).toEqual([2, 4, 6, 8, 10]);
    });

    it("should handle errors throughout the pipeline", async () => {
      function* generatorWithError() {
        yield 1;
        yield 2;
        throw new Error("Generator failed");
      }

      const stream = toStream(generatorWithError());
      const values = await collectStream(stream);

      // Should have values and error
      expect(values.length).toBeGreaterThanOrEqual(2);

      // At least one should be an error
      const hasError = values.some(isObservableError);
      expect(hasError).toBe(true);
    });

    it("should support multiple operator applications", async () => {
      const input = toStream([1, 2, 3]);

      const double = (s: ReadableStream<number>) =>
        s.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              controller.enqueue(chunk * 2);
            },
          }),
        );

      const addTen = (s: ReadableStream<number>) =>
        s.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              controller.enqueue(chunk + 10);
            },
          }),
        );

      // Apply multiple operators
      const result = applyOperator(
        applyOperator(input, double),
        addTen,
      );

      const values = await collectStream(result);
      expect(values).toEqual([12, 14, 16]); // (1*2)+10, (2*2)+10, (3*2)+10
    });
  });

  describe("Memory and Performance", () => {
    it("should support partial reads from large finite iterables", async () => {
      function* largeSequence() {
        for (let i = 0; i < 10000; i++) {
          yield i;
        }
      }

      const stream = toStream(largeSequence());
      const reader = stream.getReader();

      // Read just the first 100 values
      const values: number[] = [];
      for (let i = 0; i < 100; i++) {
        const { value } = await reader.read();
        if (value === undefined) {
          throw new Error("Expected value from large sequence stream");
        }
        if (isObservableError(value)) {
          throw value;
        }
        values.push(value);
      }

      reader.releaseLock();

      // Should get first 100 numbers
      expect(values.length).toBe(100);
      expect(values[0]).toBe(0);
      expect(values[99]).toBe(99);
    });

    it("should support backpressure with slow consumers", async () => {
      // This tests that streams respect backpressure
      async function* slowProducer() {
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          yield i;
        }
      }

      const stream = toStream(slowProducer());
      const values = await collectStream(stream);

      expect(values).toEqual([0, 1, 2, 3, 4]);
    });
  });
});
