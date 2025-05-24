// bench_observable_enhanced.ts
//
// Comprehensive Observable benchmarks testing primitive-like performance
// Run with: node --expose-gc bench_observable_enhanced.ts (or deno/bun)
//

import { bench, group, summary, run } from "npm:mitata";
import {
  Observable,
  of,
  from,
  type SubscriptionObserver,
  type Subscription,
} from "../mod.ts";

// Import operators for composition benchmarks
import {
  pipe,
  map,
  filter,
  scan,
  take,
  mergeMap,
  switchMap,
  debounce,
  toArray
} from "../helpers/mod.ts";

/* ─────────────────────────────────────────────
   CONFIG - Tuned for primitive-like performance testing
─────────────────────────────────────────────*/
const HOT_ITERS = 1_000_000;
const COLD_ITERS = 100_000;
const PULL_ITEMS = 10_000;
const ARRAY_SIZES = [10, 100, 1000, 10_000];
const OPERATOR_ITEMS = 1_000;
const ASYNC_ITEMS = 100;

// Helper to check if we have gc exposed
const hasGC = typeof (globalThis as any).gc === 'function';

/*====================================================================
  BENCHMARKS - Testing Observable as a primitive
====================================================================*/
summary(() => {

  /*──────────────────────────────── BASELINE COMPARISONS ─────────────*/
  group("vs-primitives", () => {
    // Compare with native array operations
    bench("Array.forEach", () => {
      const arr = [1, 2, 3, 4, 5];
      arr.forEach(() => { });
    }).baseline(true);

    bench("Observable.subscribe", () => {
      of(1, 2, 3, 4, 5).subscribe({});
    });

    // Compare with Promise
    bench("Promise.then", () => {
      Promise.resolve(42).then(() => { });
    });

    bench("Observable.from(Promise)", () => {
      from(Promise.resolve(42)).subscribe({});
    });

    // Compare with generators
    function* gen() { yield* [1, 2, 3, 4, 5]; }
    bench("Generator iteration", () => {
      for (const _ of gen()) { }
    });

    bench("Observable.from(gen)", () => {
      from(gen()).subscribe({});
    });
  });

  /*────────────────────────────── MEMORY ALLOCATION ──────────────────*/
  group("memory", () => {
    // Test subscription object allocation
    bench("Subscription allocation", () => {
      const subs: Subscription[] = [];
      for (let i = 0; i < 1000; i++) {
        subs.push(of(i).subscribe({}));
      }
      subs.forEach(s => s.unsubscribe());
    }).gc("once");

    // Test observer wrapper allocation
    let obs!: SubscriptionObserver<number>;
    new Observable<number>(o => { obs = o; }).subscribe({});

    bench("SubscriptionObserver reuse", () => {
      for (let i = 0; i < 10_000; i++) {
        obs.next(i);
      }
    });

    // Test WeakMap performance (internal state storage)
    bench("WeakMap operations", () => {
      const map = new WeakMap();
      const objs = Array.from({ length: 1000 }, () => ({}));

      objs.forEach(obj => map.set(obj, { closed: false }));
      objs.forEach(obj => map.get(obj));
      objs.forEach(obj => map.delete(obj));
    });
  });

  /*────────────────────────────── HOT PATH OPTIMIZATIONS ─────────────*/
  group("hot-path", () => {
    // Test different observer configurations
    const configs = [
      { name: "empty", observer: {} },
      { name: "next-only", observer: { next() { } } },
      { name: "full", observer: { next() { }, error() { }, complete() { } } },
      { name: "with-start", observer: { start() { }, next() { }, error() { }, complete() { } } }
    ];

    configs.forEach(({ name, observer }) => {
      let subObs!: SubscriptionObserver<number>;
      new Observable<number>(o => { subObs = o; }).subscribe(observer);

      bench(`next() - ${name}`, () => {
        for (let i = 0; i < HOT_ITERS; i++) {
          subObs.next(i);
        }
      });
    });

    // Test error path performance
    let errorObs!: SubscriptionObserver<number>;
    new Observable<number>(o => { errorObs = o; }).subscribe({
      error() { } // with handler
    });

    bench("error() with handler", () => {
      errorObs.error(new Error("test"));
    });

    // Test completion performance
    bench("complete() timing", () => {
      const obs = new Observable<number>(observer => {
        for (let i = 0; i < 100; i++) {
          observer.next(i);
        }
        observer.complete();
      });
      obs.subscribe({});
    });
  });

  /*────────────────────────────── CREATION PATTERNS ──────────────────*/
  group("creation", () => {
    // Test various array sizes with from()
    ARRAY_SIZES.forEach(size => {
      const arr = Array.from({ length: size }, (_, i) => i);

      bench(`from(array[${size}])`, () => {
        from(arr).subscribe({});
      });

      // Compare with native iteration
      bench(`array[${size}].forEach`, () => {
        arr.forEach(() => { });
      }).baseline(true);
    });

    // Test of() with different argument counts
    bench("of() - 0 args", () => of().subscribe({}));
    bench("of() - 1 arg", () => of(1).subscribe({}));
    bench("of() - 10 args", () => of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10).subscribe({}));
    bench("of() - spread", () => of(...Array(100).fill(1)).subscribe({}));

    // Test from() with different iterables
    bench("from(Set)", () => {
      from(new Set([1, 2, 3, 4, 5])).subscribe({});
    });

    bench("from(Map)", () => {
      from(new Map([[1, 'a'], [2, 'b'], [3, 'c']])).subscribe({});
    });

    // Async iterables
    async function* asyncGen() {
      for (let i = 0; i < ASYNC_ITEMS; i++) yield i;
    }

    bench("from(AsyncIterable)", async () => {
      await new Promise<void>(resolve => {
        from(asyncGen()).subscribe({
          complete: resolve
        });
      });
    });
  });

  /*────────────────────────────── OPERATORS & COMPOSITION ────────────*/
  group("operators", () => {
    const source = from(Array.from({ length: OPERATOR_ITEMS }, (_, i) => i));

    // Single operators
    bench("map", () => {
      pipe(source, map(x => x * 2)).subscribe({});
    });

    bench("filter", () => {
      pipe(source, filter(x => x % 2 === 0)).subscribe({});
    });

    bench("scan", () => {
      pipe(source, scan((acc, x) => acc + x, 0)).subscribe({});
    });

    bench("take", () => {
      pipe(source, take(100)).subscribe({});
    });

    // Operator chains
    bench("chain-2", () => {
      pipe(source,
        map(x => x * 2),
        filter(x => x % 3 === 0)
      ).subscribe({});
    });

    bench("chain-5", () => {
      pipe(source,
        filter(x => x % 2 === 0),
        map(x => x * 2),
        scan((acc, x) => acc + x, 0),
        map(x => x.toString()),
        take(50)
      ).subscribe({});
    });

    // Higher-order operators
    bench("mergeMap", () => {
      pipe(
        from([1, 2, 3, 4, 5]),
        mergeMap(x => of(x, x * 2, x * 3))
      ).subscribe({});
    });

    bench("switchMap", () => {
      pipe(
        from([1, 2, 3, 4, 5]),
        switchMap(x => of(x * 10))
      ).subscribe({});
    });
  });

  /*────────────────────────────── ASYNC ITERATION (pull) ─────────────*/
  group("async-iteration", () => {
    // Compare different buffer sizes
    const bufferSizes = [1, 16, 64, 256, 1024];

    bufferSizes.forEach(hwm => {
      const producer = new Observable<number>(obs => {
        for (let i = 0; i < PULL_ITEMS; i++) obs.next(i);
        obs.complete();
      });

      bench(`pull(hwm=${hwm})`, async () => {
        let count = 0;
        for await (const _ of producer.pull({ strategy: { highWaterMark: hwm } })) {
          count++;
        }
      });
    });

    // Compare with native async iteration
    async function* nativeAsyncGen() {
      for (let i = 0; i < PULL_ITEMS; i++) yield i;
    }

    bench("native async iteration", async () => {
      let count = 0;
      for await (const _ of nativeAsyncGen()) {
        count++;
      }
    }).baseline(true);

    // Test pull with operators
    bench("pull + operators", async () => {
      const source = from(Array.from({ length: 1000 }, (_, i) => i));
      const transformed = pipe(source,
        filter(x => x % 2 === 0),
        map(x => x * 2)
      );

      for await (const _ of transformed) { }
    });
  });

  /*────────────────────────────── ERROR HANDLING ─────────────────────*/
  group("error-handling", () => {
    // Error in subscriber
    bench("error in next()", () => {
      let caught = false;
      of(1).subscribe({
        next() { throw new Error("test"); },
        error() { caught = true; }
      });
    });

    // Error propagation through operators
    bench("error through operators", () => {
      let caught = false;
      pipe(
        of(1, 2, 3),
        map(x => {
          if (x === 2) throw new Error("test");
          return x;
        })
      ).subscribe({
        error() { caught = true; }
      });
    });

    // Multiple error scenarios
    bench("multiple errors", () => {
      const errors: unknown[] = [];
      from([1, 2, 3, 4, 5]).subscribe({
        next(x) {
          if (x % 2 === 0) throw new Error(`Error ${x}`);
        },
        error(e) {
          errors.push(e);
        }
      });
    });
  });

  /*────────────────────────────── RESOURCE MANAGEMENT ────────────────*/
  group("resources", () => {
    // Test teardown performance
    bench("teardown execution", () => {
      let teardowns = 0;
      const obs = new Observable(() => {
        return () => { teardowns++; };
      });

      for (let i = 0; i < 1000; i++) {
        const sub = obs.subscribe({});
        sub.unsubscribe();
      }
    });

    // Test Symbol.dispose
    if (typeof Symbol.dispose !== 'undefined') {
      bench("using disposal", () => {
        const obs = of(1, 2, 3);
        {
          using sub = obs.subscribe({});
          // auto-disposed at block end
        }
      });
    }

    // Test multiple subscriptions
    bench("multi-subscription", () => {
      const source = of(1, 2, 3, 4, 5);
      const subs: Subscription[] = [];

      for (let i = 0; i < 100; i++) {
        subs.push(source.subscribe({}));
      }

      subs.forEach(s => s.unsubscribe());
    });
  });

  /*────────────────────────────── INTEROP ────────────────────────────*/
  group("interop", () => {
    // Test Symbol.observable compliance
    const foreignObservable = {
      [Symbol.observable]() {
        return {
          subscribe(observer: any) {
            for (let i = 0; i < 100; i++) {
              observer.next?.(i);
            }
            observer.complete?.();
            return { unsubscribe() { } };
          }
        };
      }
    };

    bench("from(foreign observable)", () => {
      from(foreignObservable).subscribe({});
    });

    // Test conversion to native types
    bench("toArray operator", async () => {
      await new Promise<void>(resolve => {
        pipe(
          from(Array(100).fill(0).map((_, i) => i)),
          toArray()
        ).subscribe({
          complete: resolve
        });
      });
    });

    // Test ReadableStream interop
    bench("ReadableStream round-trip", async () => {
      const source = from([1, 2, 3, 4, 5]);
      for await (const _ of source.pull()) { }
    });
  });

  /*────────────────────────────── REAL-WORLD PATTERNS ────────────────*/
  group("real-world", () => {
    // Simulated event stream
    bench("event stream pattern", () => {
      let emit!: (value: number) => void;
      const events = new Observable<number>(observer => {
        emit = (value) => observer.next(value);
      });

      const sub = pipe(events,
        filter(x => x % 2 === 0),
        map(x => ({ type: 'even', value: x })),
        take(100)
      ).subscribe({});

      // Simulate events
      for (let i = 0; i < 200; i++) {
        emit(i);
      }

      sub.unsubscribe();
    });

    // Request/response pattern
    bench("request/response", async () => {
      const makeRequest = (id: number) =>
        new Observable<string>(observer => {
          observer.next(`Response ${id}`);
          observer.complete();
        });

      await new Promise<void>(resolve => {
        pipe(
          from([1, 2, 3, 4, 5]),
          mergeMap(id => makeRequest(id), 2)
        ).subscribe({
          complete: resolve
        });
      });
    });

    // State management pattern
    bench("state reducer", () => {
      type Action = { type: 'INCREMENT' } | { type: 'DECREMENT' };
      const actions = from<Action>([
        { type: 'INCREMENT' },
        { type: 'INCREMENT' },
        { type: 'DECREMENT' },
        { type: 'INCREMENT' }
      ]);

      pipe(actions,
        scan((state, action) => {
          switch (action.type) {
            case 'INCREMENT': return state + 1;
            case 'DECREMENT': return state - 1;
            default: return state;
          }
        }, 0)
      ).subscribe({});
    });
  });

  /*────────────────────────────── STRESS TESTS ───────────────────────*/
  group("stress", () => {
    // Rapid subscription/unsubscription
    bench("rapid sub/unsub", () => {
      const source = new Observable<number>(observer => {
        let i = 0;
        const id = setInterval(() => observer.next(i++), 0);
        return () => clearInterval(id);
      });

      for (let i = 0; i < 1000; i++) {
        const sub = source.subscribe({});
        sub.unsubscribe();
      }
    }).gc("once");

    // Deep operator chains
    bench("deep chain (10 ops)", () => {
      let obs: Observable<any> = of(1);
      for (let i = 0; i < 10; i++) {
        obs = pipe(obs, map(x => x));
      }
      obs.subscribe({});
    });

    // High-frequency emissions
    bench("high-freq emissions", () => {
      let observer!: SubscriptionObserver<number>;
      const sub = new Observable<number>(obs => {
        observer = obs;
      }).subscribe({
        next() { } // Force hot path
      });

      for (let i = 0; i < 100_000; i++) {
        observer.next(i);
      }

      sub.unsubscribe();
    }).gc("inner");

    // Memory pressure test
    if (hasGC) {
      bench("memory pressure", () => {
        const subs: Subscription[] = [];

        // Create many subscriptions with data
        for (let i = 0; i < 10_000; i++) {
          const data = Array(100).fill(i);
          subs.push(from(data).subscribe({}));
        }

        // Force cleanup
        subs.forEach(s => s.unsubscribe());
        (globalThis as any).gc();
      }).gc("inner");
    }
  });

});

/*====================================================================
  RUN CONFIGURATION
====================================================================*/
await run({
  colors: true,
  format: {
    mitata: {
      name: "longest" // Better alignment for reading
    },
    json: {
      debug: true,     // Include debug info
      samples: false   // Don't include raw samples (too large)
    },
  },
  // Uncomment to run specific groups:
  // filter: /vs-primitives|hot-path|memory/
});

// Print runtime info
console.log("\n---");
console.log("Runtime:", typeof Deno !== 'undefined' ? 'Deno' :
  typeof Bun !== 'undefined' ? 'Bun' : 'Node.js');
console.log("GC exposed:", hasGC);
console.log("Symbol.dispose:", typeof Symbol.dispose !== 'undefined' ? 'available' : 'not available');
console.log("---\n");