// bench_micro_fixed.ts
//
// Properly written micro-benchmarks following mitata best practices
//

import type { k_state } from "mitata";
import { bench, group, summary, run, do_not_optimize } from "mitata";

// Helper to prevent optimizations
const blackhole = (x: unknown) => do_not_optimize(x);

/*====================================================================
  FIXED MICRO-BENCHMARKS
====================================================================*/
summary(() => {

  /*──────────────────────────────── OBJECT ALLOCATION ────────────────*/
  group("allocation", () => {
    // Test object creation with side effects
    bench("new Object()", () => {
      const obj = { closed: false, observer: null, cleanup: null };
      blackhole(obj.closed); // Prevent DCE
      return obj;
    }).baseline(true);

    bench("Object.create(null)", () => {
      const obj = Object.create(null);
      obj.closed = false;
      obj.observer = null;
      obj.cleanup = null;
      blackhole(obj.closed);
      return obj;
    });

    class Sub {
      closed = false;
      observer: unknown = null;
      cleanup: unknown = null;
    }

    bench("class instance", () => {
      const obj = new Sub();
      blackhole(obj.closed);
      return obj;
    });

    // Test pooling with realistic usage
    const pool: any[] = [];
    let poolHits = 0;
    let poolMisses = 0;

    bench("with pooling", () => {
      let obj = pool.pop();
      if (!obj) {
        poolMisses++;
        obj = { closed: false, observer: null, cleanup: null };
      } else {
        poolHits++;
        obj.closed = false;
        obj.observer = null;
        obj.cleanup = null;
      }

      // Simulate real usage
      obj.closed = true;
      obj.observer = { next: () => { } };
      blackhole(obj.observer);

      // Return to pool
      if (pool.length < 100) {
        obj.observer = null;
        obj.cleanup = null;
        pool.push(obj);
      }

      return obj;
    });
  });

  /*──────────────────────────────── FUNCTION CALLS ───────────────────*/
  group("function-calls", () => {
    // Test with actual work to measure call overhead
    let accumulator = 0;

    const monoNext = (value: number) => { accumulator += value; };
    const polyNext = (value: any) => { accumulator += value; };
    const optionalNext: ((value: number) => void) | undefined = monoNext;

    bench("direct call", function* () {
      yield {
        bench() {
          accumulator = 0;
          for (let i = 0; i < 1000; i++) {
            monoNext(i);
          }
          blackhole(accumulator);
        }
      };
    }).baseline(true);

    bench("polymorphic call", function* () {
      yield {
        bench() {
          accumulator = 0;
          for (let i = 0; i < 1000; i++) {
            polyNext(i);
          }
          blackhole(accumulator);
        }
      };
    });

    bench("optional call", function* () {
      yield {
        bench() {
          accumulator = 0;
          for (let i = 0; i < 1000; i++) {
            optionalNext?.(i);
          }
          blackhole(accumulator);
        }
      };
    });

    bench("guarded call", function* () {
      yield {
        bench() {
          accumulator = 0;
          for (let i = 0; i < 1000; i++) {
            if (optionalNext) optionalNext(i);
          }
          blackhole(accumulator);
        }
      };
    });

    bench("cached guard", function* () {
      yield {
        bench() {
          accumulator = 0;
          const fn = optionalNext;
          if (fn) {
            for (let i = 0; i < 1000; i++) {
              fn(i);
            }
          }
          blackhole(accumulator);
        }
      };
    });
  });

  /*──────────────────────────────── PROPERTY ACCESS ──────────────────*/
  group("property-access", () => {
    // Use computed parameters to prevent optimization
    bench("direct property", function* () {
      const obj = { closed: false, value: 42 };
      let sum = 0;

      yield {
        bench() {
          for (let i = 0; i < 1000; i++) {
            if (!obj.closed) sum += obj.value;
          }
          blackhole(sum);
        }
      };
    }).baseline(true);

    bench("Map.get", function* () {
      const map = new Map<string, unknown>([['closed', false], ['value', 42]]);
      let sum = 0;

      yield {
        bench() {
          for (let i = 0; i < 1000; i++) {
            if (!map.get('closed')) sum += map.get('value') as number;
          }
          blackhole(sum);
        }
      };
    });

    bench("WeakMap.get", function* () {
      const weakMap = new WeakMap();
      const key = {};
      weakMap.set(key, { closed: false, value: 42 });
      let sum = 0;

      yield {
        bench() {
          for (let i = 0; i < 1000; i++) {
            const state = weakMap.get(key);
            if (state && !state.closed) sum += state.value;
          }
          blackhole(sum);
        }
      };
    });

    // Private vs public fields with actual usage
    class WithPrivate {
      #closed = false;
      #value = 42;
      get closed() { return this.#closed; }
      get value() { return this.#value; }
      setClosed(v: boolean) { this.#closed = v; }
    }

    class WithPublic {
      closed = false;
      value = 42;
    }

    bench("private fields", function* () {
      const obj = new WithPrivate();
      let sum = 0;

      yield {
        bench() {
          for (let i = 0; i < 1000; i++) {
            if (!obj.closed) sum += obj.value;
            if (i % 100 === 0) obj.setClosed(false);
          }
          blackhole(sum);
        }
      };
    });

    bench("public fields", function* () {
      const obj = new WithPublic();
      let sum = 0;

      yield {
        bench() {
          for (let i = 0; i < 1000; i++) {
            if (!obj.closed) sum += obj.value;
            if (i % 100 === 0) obj.closed = false;
          }
          blackhole(sum);
        }
      };
    });
  });

  /*──────────────────────────────── ARRAY ITERATION ──────────────────*/
  group("array-iteration", () => {
    // Use computed parameters to prevent hoisting
    bench("for loop", function* (state: k_state) {
      const size = state.get('size');

      yield {
        [0]() {
          return Array.from({ length: size }, (_, i) => i);
        },

        bench(arr: number[]) {
          let sum = 0;
          for (let i = 0; i < arr.length; i++) {
            sum += arr[i] * 2;
          }
          blackhole(sum);
        }
      };
    }).args('size', [100]).baseline(true);

    bench("for-of", function* (state: k_state) {
      const size = state.get('size');

      yield {
        [0]() {
          return Array.from({ length: size }, (_, i) => i);
        },

        bench(arr: number[]) {
          let sum = 0;
          for (const x of arr) {
            sum += x * 2;
          }
          blackhole(sum);
        }
      };
    }).args('size', [100]);

    bench("forEach", function* (state: k_state) {
      const size = state.get('size');

      yield {
        [0]() {
          return Array.from({ length: size }, (_, i) => i);
        },

        bench(arr: number[]) {
          let sum = 0;
          arr.forEach(x => sum += x * 2);
          blackhole(sum);
        }
      };
    }).args('size', [100]);

    bench("unrolled-4", function* (state: k_state) {
      const size = state.get('size');

      yield {
        [0]() {
          return Array.from({ length: size }, (_, i) => i);
        },

        bench(arr: number[]) {
          let sum = 0;
          const len = arr.length;
          let i = 0;

          for (; i < len - 3; i += 4) {
            sum += arr[i] * 2;
            sum += arr[i + 1] * 2;
            sum += arr[i + 2] * 2;
            sum += arr[i + 3] * 2;
          }

          for (; i < len; i++) {
            sum += arr[i] * 2;
          }

          blackhole(sum);
        }
      };
    }).args('size', [100]);

    // Test closed-check frequency with actual work
    bench("check every item", function* (state: k_state) {
      const size = state.get('size');

      yield {
        [0]() {
          return Array.from({ length: size }, (_, i) => i);
        },

        [1]() {
          return { closed: false };
        },

        bench(arr: number[], state: {closed: boolean } ) {
          let sum = 0;
          for (let i = 0; i < arr.length; i++) {
            if (state.closed) break;
            sum += arr[i] * 2;
          }
          blackhole(sum);
        }
      };
    }).args('size', [100]);

    bench("check every 10", function* (state: k_state) {
      const size = state.get('size');

      yield {
        [0]() {
          return Array.from({ length: size }, (_, i) => i);
        },

        [1]() {
          return { closed: false };
        },

        bench(arr: number[], state: { closed: boolean }) {
          let sum = 0;
          for (let i = 0; i < arr.length; i++) {
            sum += arr[i] * 2;
            if (i % 10 === 9 && state.closed) break;
          }
          blackhole(sum);
        }
      };
    }).args('size', [100]);

    bench("check every 100", function* (state: k_state) {
      const size = state.get('size');

      yield {
        [0]() {
          return Array.from({ length: size }, (_, i) => i);
        },

        [1]() {
          return { closed: false };
        },

        bench(arr: number[], state: { closed: boolean }) {
          let sum = 0;
          for (let i = 0; i < arr.length; i++) {
            sum += arr[i] * 2;
            if (i % 100 === 99 && state.closed) break;
          }
          blackhole(sum);
        }
      };
    }).args('size', [100]);
  });

  /*──────────────────────────────── ERROR HANDLING ───────────────────*/
  group("error-handling", () => {
    const fn = (x: number) => x * 2;
    const errFn = (x: number) => {
      if (x === 50) throw new Error("test");
      return x * 2;
    };

    bench("no try-catch", function* () {
      yield {
        bench() {
          let sum = 0;
          for (let i = 0; i < 100; i++) {
            sum += fn(i);
          }
          blackhole(sum);
        }
      };
    }).baseline(true);

    bench("try-catch per item", function* () {
      yield {
        bench() {
          let sum = 0;
          for (let i = 0; i < 100; i++) {
            try {
              sum += fn(i);
            } catch (e) {
              blackhole(e);
            }
          }
          blackhole(sum);
        }
      };
    });

    bench("try-catch around loop", function* () {
      yield {
        bench() {
          let sum = 0;
          try {
            for (let i = 0; i < 100; i++) {
              sum += fn(i);
            }
          } catch (e) {
            blackhole(e);
          }
          blackhole(sum);
        }
      };
    });

    bench("error path - caught", function* () {
      yield {
        bench() {
          let sum = 0;
          try {
            for (let i = 0; i < 100; i++) {
              sum += errFn(i);
            }
          } catch (e) {
            blackhole(e);
          }
          blackhole(sum);
        }
      };
    });

    bench("optional error handler", function* () {
      const errorHandler = (e: unknown) => blackhole(e);

      yield {
        bench() {
          let sum = 0;
          for (let i = 0; i < 100; i++) {
            try {
              sum += fn(i);
            } catch (e) {
              if (errorHandler) errorHandler(e);
            }
          }
          blackhole(sum);
        }
      };
    });
  });

  /*──────────────────────────────── ASYNC PATTERNS ───────────────────*/
  group("async-patterns", () => {
    // Test actual async operations
    bench("queueMicrotask", async function* () {
      let counter = 0;

      yield async () => {
        await new Promise<void>(resolve => {
          queueMicrotask(() => {
            counter++;
            resolve();
          });
        });
        blackhole(counter);
      };
    });

    // Test actual async operations
    bench("queueMicrotask error", async function* () {
      let counter = 0;

      yield async () => {
        try {
          await new Promise<void>((_, reject) => {
            queueMicrotask(() => {
              counter++;
              reject();
            });
          });
        } catch (_e) {}
        blackhole(counter);
      };
    });

    bench("setTimeout(0)", async function* () {
      let counter = 0;

      yield async () => {
        await new Promise<void>(resolve => {
          setTimeout(() => {
            counter++;
            resolve();
          }, 0);
        });
        blackhole(counter);
      };
    });

    bench("Promise.resolve", async function* () {
      let counter = 0;

      yield async () => {
        await Promise.resolve().then(() => counter++);
        blackhole(counter);
      };
    });

    bench("Promise.catch", async function* () {
      let counter = 0;

      yield async () => {
        await (
          new Promise((_, rej) => rej(new Error("Error")))
            .catch(() => counter++)
        );
        blackhole(counter);
      };
    });


    bench("Promise.reject", async function* () {
      let counter = 0;

      yield async () => {
        await Promise.reject().catch(() => counter++);
        blackhole(counter);
      };
    });

    // Test buffer strategies with actual data
    bench("array push/shift", function* () {
      yield {
        bench() {
          const buffer: number[] = [];
          let sum = 0;

          // Push 100 items
          for (let i = 0; i < 100; i++) {
            buffer.push(i);
          }

          // Shift all items
          while (buffer.length > 0) {
            sum += buffer.shift()!;
          }

          blackhole(sum);
        }
      };
    });

    bench("ring buffer", function* () {
      yield {
        bench() {
          const ring = new Array(100);
          let writeIdx = 0, readIdx = 0;
          let sum = 0;

          // Write 100 items
          for (let i = 0; i < 100; i++) {
            ring[writeIdx % 100] = i;
            writeIdx++;
          }

          // Read all items
          while (readIdx < writeIdx) {
            sum += ring[readIdx % 100];
            readIdx++;
          }

          blackhole(sum);
        }
      };
    });
  });

  /*──────────────────────────────── TYPE CHECKS ──────────────────────*/
  group("type-checks", () => {
    // Test with different types to prevent constant folding
    bench("typeof function", function* (state: k_state) {
      const type = state.get('type');

      yield {
        [0]() {
          return type === 'function' ? (() => { }) :
            type === 'object' ? {} :
              type === 'string' ? 'test' : 42;
        },

        bench(value: object | string | number | (() => void)) {
          let count = 0;
          for (let i = 0; i < 1000; i++) {
            if (typeof value === "function") count++;
          }
          blackhole(count);
        }
      };
    }).args('type', ['function', 'object', 'string', 'number']).baseline(true);

    // Test with different types to prevent constant folding
    bench("function optional checks", function* (state: k_state) {
      const type = state.get('type');

      yield {
        [0]() {
          return type === 'function' ? (() => { }) :
            type === 'object' ? {} :
              type === 'string' ? 'test' : 42;
        },

        bench(value: (() => void)) {
          let count = 0;
          for (let i = 0; i < 1000; i++) {
              value?.();
              count++; 
          }
          blackhole(count);
        }
      };
    }).args('type', ['function', 'object', 'string', 'number']).baseline(true);

    bench("instanceof", function* (state: k_state) {
      const type = state.get('type');

      yield {
        [0]() {
          return type === 'array' ? [1, 2, 3] :
            type === 'date' ? new Date() :
              type === 'error' ? new Error() : {};
        },

        bench(value: number[] | Date | Error | object) {
          let count = 0;
          for (let i = 0; i < 1000; i++) {
            if (value instanceof Array) count++;
          }
          blackhole(count);
        }
      };
    }).args('type', ['array', 'date', 'error', 'object']);

    bench("in operator", function* () {
      const objects = [
        { unsubscribe: () => { } },
        { subscribe: () => { } },
        { next: () => { } },
        {}
      ];

      yield {
        bench() {
          let count = 0;
          for (let i = 0; i < 1000; i++) {
            const obj = objects[i % objects.length];
            if ("unsubscribe" in obj) count++;
          }
          blackhole(count);
        }
      };
    });

    bench("hasOwnProperty", function* () {
      const objects = [
        { unsubscribe: () => { } },
        { subscribe: () => { } },
        { next: () => { } },
        {}
      ];

      yield {
        bench() {
          let count = 0;
          for (let i = 0; i < 1000; i++) {
            const obj = objects[i % objects.length];
            if (obj.hasOwnProperty("unsubscribe")) count++;
          }
          blackhole(count);
        }
      };
    });

    bench("optional chaining", function* () {
      const objects = [
        { unsubscribe: () => { } },
        { subscribe: () => { } },
        null,
        undefined
      ];

      yield {
        bench() {
          let count = 0;
          for (let i = 0; i < 1000; i++) {
            const obj = objects[i % objects.length] as any;
            if (obj?.unsubscribe !== undefined) count++;
          }
          blackhole(count);
        }
      };
    });
  });

  /*──────────────────────────────── CLOSURE OVERHEAD ─────────────────*/
  group("closure-overhead", () => {
    // Test closure allocation vs direct state
    bench("closure state", function* () {
      yield {
        bench() {
          let total = 0;

          for (let i = 0; i < 100; i++) {
            const createCounter = (initial: number) => {
              let count = initial;
              return {
                increment() { count++; },
                get() { return count; }
              };
            };

            const counter = createCounter(i);
            counter.increment();
            total += counter.get();
          }

          blackhole(total);
        }
      };
    });

    bench("object state", function* () {
      yield {
        bench() {
          let total = 0;

          for (let i = 0; i < 100; i++) {
            const counter = {
              count: i,
              increment() { this.count++; },
              get() { return this.count; }
            };

            counter.increment();
            total += counter.get();
          }

          blackhole(total);
        }
      };
    });

    bench("class state", function* () {
      class Counter {
        public count!: number;
        constructor(count: number) { this.count = count; }
        increment() { this.count++; }
        get() { return this.count; }
      }

      yield {
        bench() {
          let total = 0;

          for (let i = 0; i < 100; i++) {
            const counter = new Counter(i);
            counter.increment();
            total += counter.get();
          }

          blackhole(total);
        }
      };
    });
  });

});

/*====================================================================
  RUN WITH PROPER CONFIGURATION
====================================================================*/
await run({
  colors: true,
  format: {
    mitata: {
      name: "longest"
    },
    json: {
      debug: false,
      samples: false
    }
  }
});

// Print environment info
console.log("\n---");
console.log("Runtime:", typeof (globalThis as any)?.Deno !== 'undefined' ? 'Deno' :
  typeof (globalThis as any)?.Bun !== 'undefined' ? 'Bun' : 'Node.js');
console.log("Note: Results show actual operation cost, not just measurement overhead");
console.log("---\n");