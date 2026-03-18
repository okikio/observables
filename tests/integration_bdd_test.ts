// deno-lint-ignore-file no-import-prefix
/**
 * Integration tests validating operator composition in real-world patterns. Unlike unit tests
 * focused on individual operators, these ensure complete pipelines handle order dependencies,
 * error propagation, state isolation, performance, and memory management correctly.
 *
 * Patterns tested: search-as-you-type (debounce + filter + switchMap for request cancellation),
 * ETL pipelines (map + filter + batch), error recovery (catchErrors + fallback), rate limiting
 * (throttle + batch + concurrency), aggregation (scan + moving averages), fan-out/fan-in
 * (mergeMap for parallelism, concatMap for ordering).
 */

import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";

import { Observable } from "../observable.ts";
import { pipe } from "../helpers/pipe.ts";
import { filter, map, scan, take, tap } from "../helpers/operations/core.ts";
import { debounce, throttle } from "../helpers/operations/timing.ts";
import {
  concatMap,
  mergeMap,
  switchMap,
} from "../helpers/operations/combination.ts";
import { catchErrors, ignoreErrors } from "../helpers/operations/errors.ts";
import { batch } from "../helpers/operations/batch.ts";
import { find, unique } from "../helpers/operations/conditional.ts";
import { isObservableError, ObservableError } from "../error.ts";

/**
 * Collects values from an Observable.
 */
async function collect<T>(obs: Observable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of obs) {
    values.push(value);
  }
  return values;
}

/**
 * Creates a delay using setTimeout.
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Integration Tests - Real World Patterns", () => {
  describe("Search-as-you-type Pattern", () => {
    it("should debounce rapid inputs and process only final value", async () => {
      // Simulate rapid typing: "h" -> "he" -> "hel" -> "hello"
      const inputs = ["h", "he", "hel", "hello"];

      // Create observable that emits quickly
      const source = new Observable<string>((observer) => {
        inputs.forEach((input, i) => {
          setTimeout(() => observer.next(input), i * 10); // 10ms between inputs
        });
        setTimeout(() => observer.complete(), 100);
      });

      const result = pipe(
        source,
        ignoreErrors(),
        debounce(50), // Wait 50ms after last input
        map((query) => `Search: ${query}`),
      );

      const values = await collect(result);

      // Should only process the final value after debounce settles
      expect(values).toHaveLength(1);
      expect(values[0]).toBe("Search: hello");
    });

    it("should filter short queries and transform results", async () => {
      const queries = ["a", "ab", "abc", "abcd"];

      const source = Observable.of(...queries);

      const result = pipe(
        source,
        ignoreErrors(),
        filter((query) => query.length >= 3), // Only 3+ chars
        map((query) => query.toUpperCase()),
        map((query) => `Result for: ${query}`),
      );

      const values = await collect(result);

      expect(values).toEqual([
        "Result for: ABC",
        "Result for: ABCD",
      ]);
    });
  });

  describe("Data Processing Pipeline (ETL)", () => {
    interface RawData {
      id: number;
      value: string;
      valid: boolean;
    }

    interface CleanData {
      id: number;
      normalized: string;
    }

    it("should extract, transform, and load data through pipeline", async () => {
      const rawData: RawData[] = [
        { id: 1, value: "  hello  ", valid: true },
        { id: 2, value: "WORLD", valid: true },
        { id: 3, value: "invalid", valid: false },
        { id: 4, value: "  Test  ", valid: true },
      ];

      const source = Observable.of(...rawData);

      const result = pipe(
        source,
        ignoreErrors(),
        // Extract: filter valid records
        filter((item) => item.valid),
        // Transform: normalize data
        map((item) => ({
          id: item.id,
          normalized: item.value.trim().toLowerCase(),
        })),
        // Load: collect in batches
        batch(2),
        ignoreErrors(),
      );

      const batches = await collect(result);

      expect(batches).toHaveLength(2);
      expect(batches[0]).toHaveLength(2);
      expect(batches[1]).toHaveLength(1);
      expect(batches[0][0].normalized).toBe("hello");
      expect(batches[0][1].normalized).toBe("world");
      expect(batches[1][0].normalized).toBe("test");
    });

    it("should compute running statistics during processing", async () => {
      const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const source = Observable.of(...numbers);

      const result = pipe(
        source,
        ignoreErrors(),
        // Running sum
        scan((acc, val) => acc + val, 0),
        // Take every 5th value
        filter((_, index) => index % 5 === 4),
      );

      const values = await collect(result);

      // scan emits the seed first, so the 5th and 10th emitted running totals
      // are 10 and 45 rather than 15 and 55.
      expect(values).toEqual([10, 45]);
    });
  });

  describe("Error Recovery Patterns", () => {
    it("should catch errors and provide fallback values", async () => {
      const source = Observable.of(1, 2, 3);

      const result = pipe(
        source,
        map((x) => {
          if (x === 3) {
            throw new Error("Network error");
          }
          return x * 2;
        }),
        catchErrors([] as number[]), // Fallback to empty array
      );

      const values = await collect(result);

      // map uses pass-through error handling, so catchErrors replaces the
      // ObservableError value with the fallback while keeping earlier values.
      expect(values).toContain(2);
      expect(values).toContain(4);
      expect(values).toContainEqual([]);
    });

    it("should isolate errors and continue processing", async () => {
      const operations = [
        () => 10,
        () => {
          throw new Error("Failed");
        },
        () => 20,
        () => 30,
      ];

      const source = Observable.of(...operations);

      const result = pipe(
        source,
        map((fn) => {
          try {
            return fn();
          } catch (err) {
            return ObservableError.from(err, "map");
          }
        }),
        tap((val) => {
          // Log errors but don't stop
          if (isObservableError(val)) {
            console.log("Error logged:", val.message);
          }
        }),
        ignoreErrors(), // Remove errors from stream
      );

      const values = await collect(result);

      expect(values).toEqual([10, 20, 30]);
    });

    it("should separate errors from successes", async () => {
      const mixed = [
        { type: "success", value: 1 },
        { type: "error", value: "Error 1" },
        { type: "success", value: 2 },
        { type: "error", value: "Error 2" },
      ];

      const source = Observable.of(...mixed);

      const successes = pipe(
        source,
        ignoreErrors(),
        filter((item) => item.type === "success"),
        map((item) => item.value),
      );

      const errors = pipe(
        source,
        ignoreErrors(),
        filter((item) => item.type === "error"),
        map((item) => item.value),
      );

      expect(await collect(successes)).toEqual([1, 2]);
      expect(await collect(errors)).toEqual(["Error 1", "Error 2"]);
    });
  });

  describe("Concurrency and Parallelism Patterns", () => {
    it("should limit concurrent operations with mergeMap", async () => {
      const ids = [1, 2, 3, 4, 5];
      const source = Observable.of(...ids);

      let activeCount = 0;
      let maxConcurrent = 0;

      const result = pipe(
        source,
        ignoreErrors(),
        mergeMap((id) =>
          Observable.from((async () => {
            activeCount++;
            maxConcurrent = Math.max(maxConcurrent, activeCount);

            await wait(10); // Simulate async work

            activeCount--;
            return `Result ${id}`;
          })()), 2), // Max 2 concurrent
        ignoreErrors(),
      );

      const values = await collect(result);

      expect(values).toHaveLength(5);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it("should maintain order with concatMap", async () => {
      const items = [3, 1, 2]; // Different delays
      const source = Observable.of(...items);

      const result = pipe(
        source,
        ignoreErrors(),
        concatMap((n) =>
          Observable.from((async () => {
            await wait(n * 10); // Longer delay for larger numbers
            return `Item ${n}`;
          })())
        ),
        ignoreErrors(),
      );

      const values = await collect(result);

      // concatMap preserves input order, not processing time order
      // Input order was [3, 1, 2], so output is also [3, 1, 2]
      expect(values).toEqual(["Item 3", "Item 1", "Item 2"]);
    });

    it("should cancel previous requests with switchMap", async () => {
      const requests = ["req1", "req2", "req3"];
      const source = new Observable<string>((observer) => {
        requests.forEach((req, i) => {
          setTimeout(() => observer.next(req), i * 10);
        });
        setTimeout(() => observer.complete(), 50);

        return () => {
          // Source uses fire-and-forget timers in this test.
          // There is no shared resource to release here because the timers
          // only emit a few values and then complete naturally.
        };
      });

      let processedCount = 0;

      const result = pipe(
        source,
        ignoreErrors(),
        switchMap((req) =>
          new Observable<string>((observer) => {
            processedCount++;
            const id = setTimeout(() => {
              observer.next(`Result: ${req}`);
              observer.complete();
            }, 30);

            return () => clearTimeout(id);
          })
        ),
        ignoreErrors(),
      );

      const values = await collect(result);

      // Only the last request should complete
      // Earlier ones are canceled when new ones arrive
      expect(values).toEqual(["Result: req3"]);
      expect(processedCount).toBe(3);
    });
  });

  describe("Aggregation and Statistics", () => {
    it("should compute running average", async () => {
      const numbers = [10, 20, 30, 40, 50];
      const source = Observable.of(...numbers);

      interface AvgState {
        sum: number;
        count: number;
      }

      const result = pipe(
        source,
        ignoreErrors(),
        scan((state: AvgState, value) => ({
          sum: state.sum + value,
          count: state.count + 1,
        }), { sum: 0, count: 0 }),
        filter((state) => state.count > 0),
        map((state) => state.sum / state.count),
      );

      const averages = await collect(result);

      // Running averages: 10, 15, 20, 25, 30
      expect(averages).toEqual([10, 15, 20, 25, 30]);
    });

    it("should implement moving window aggregation", async () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8];
      const source = Observable.of(...values);
      const windowSize = 3;

      const result = pipe(
        source,
        ignoreErrors(),
        scan((window: number[], value) => {
          const newWindow = [...window, value];
          if (newWindow.length > windowSize) {
            newWindow.shift();
          }
          return newWindow;
        }, []),
        filter((window) => window.length === windowSize),
        map((window) => window.reduce((a, b) => a + b, 0) / window.length),
      );

      const movingAvg = await collect(result);

      // Windows: [1,2,3]=2, [2,3,4]=3, [3,4,5]=4, etc.
      expect(movingAvg[0]).toBe(2);
      expect(movingAvg[1]).toBe(3);
      expect(movingAvg[2]).toBe(4);
    });

    it("should collect unique values", async () => {
      const values = [1, 2, 2, 3, 1, 4, 3, 5];
      const source = Observable.of(...values);

      const result = pipe(
        source,
        ignoreErrors(),
        unique(),
      );

      const uniqueValues = await collect(result);

      expect(uniqueValues).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("Rate Limiting and Throttling", () => {
    it("should throttle rapid events", async () => {
      const events = Array.from({ length: 10 }, (_, i) => i);
      const source = new Observable<number>((observer) => {
        events.forEach((event, i) => {
          setTimeout(() => observer.next(event), i * 5); // Every 5ms
        });
        setTimeout(() => observer.complete(), 100);
      });

      const result = pipe(
        source,
        ignoreErrors(),
        throttle(20), // One event per 20ms max
      );

      const values = await collect(result);

      // Should significantly reduce event count
      expect(values.length).toBeLessThan(events.length);
    });

    it("should combine throttle and batch for efficient processing", async () => {
      const events = Array.from({ length: 20 }, (_, i) => i);
      const source = new Observable<number>((observer) => {
        events.forEach((event, i) => {
          setTimeout(() => observer.next(event), i * 2);
        });
        setTimeout(() => observer.complete(), 100);
      });

      const result = pipe(
        source,
        ignoreErrors(),
        throttle(10),
        batch(3),
        ignoreErrors(),
        map((batch) => ({
          count: batch.length,
          sum: batch.reduce((a, b) => a + b, 0),
        })),
        ignoreErrors(),
      );

      const batches = await collect(result);

      expect(batches.length).toBeGreaterThan(0);
      batches.forEach((batch) => {
        expect(batch.count).toBeGreaterThan(0);
        expect(batch.count).toBeLessThanOrEqual(3);
      });
    });
  });

  describe("Complex Multi-Stage Pipelines", () => {
    it("should chain multiple transformations correctly", async () => {
      const source = Observable.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

      const result = pipe(
        source,
        ignoreErrors(),
        map((x) => x * 2), // Double: 2,4,6,8,10,12,14,16,18,20
        filter((x) => x % 3 === 0), // Divisible by 3: 6,12,18
        map((x) => x / 3), // Divide by 3: 2,4,6
        scan((sum, x) => sum + x, 0), // Running sum with seed: 0,2,6,12
        take(2), // Take first 2 emissions: 0,2
      );

      const values = await collect(result);

      expect(values).toEqual([0, 2]);
    });

    it("should handle errors at different stages gracefully", async () => {
      const source = Observable.of(1, 2, 3, 4, 5);

      const result = pipe(
        source,
        map((x) => {
          if (x === 3) throw new Error("Three is bad");
          return x;
        }),
        catchErrors(-1), // Replace errors with -1
        filter((x) => x > 0), // Remove error markers
        map((x) => x * 10),
      );

      const values = await collect(result);

      expect(values).toEqual([10, 20, 40, 50]); // Skip the error value
    });

    it("should support early termination with find", async () => {
      let processed = 0;

      const source = pipe(
        Observable.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
        ignoreErrors(),
        tap(() => processed++),
        find((x) => x > 5),
      );

      const result = await collect(source);

      // Should stop after finding first value > 5
      expect(result).toEqual([6]);
      expect(processed).toBeLessThanOrEqual(6);
    });
  });

  describe("Memory and Resource Management", () => {
    it("should handle large streams efficiently", async () => {
      const source = new Observable<number>((observer) => {
        for (let i = 0; i < 1000; i++) {
          observer.next(i);
        }
        observer.complete();
      });

      const result = pipe(
        source,
        ignoreErrors(),
        filter((x) => x % 100 === 0),
        take(5),
      );

      const values = await collect(result);

      expect(values).toEqual([0, 100, 200, 300, 400]);
    });

    it("should properly cleanup with early unsubscribe", async () => {
      let cleanedUp = false;

      const source = new Observable<number>((observer) => {
        const interval = setInterval(() => {
          observer.next(Math.random());
        }, 10);

        return () => {
          clearInterval(interval);
          cleanedUp = true;
        };
      });

      const result = pipe(
        source,
        ignoreErrors(),
        take(5),
      );

      await collect(result);

      // Give cleanup time to run
      await wait(50);

      expect(cleanedUp).toBe(true);
    });
  });
});
