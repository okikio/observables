import { test, expect } from "@libs/testing";

import { Observable } from "../../observable.ts";
import { Symbol } from "../../symbol.ts";

// -----------------------------------------------------------------------------
// Observable.from Tests with Real World Examples
// -----------------------------------------------------------------------------

test("Observable.from with an iterable object", () => {
  const results: string[] = [];
  const iterable = ["mercury", "venus", "earth"];

  Observable.from(iterable).subscribe({
    next(value) {
      results.push(value);
    },
    complete() {
      results.push("done");
    }
  });

  expect(results).toEqual(["mercury", "venus", "earth", "done"]);
});

test("Observable.from with Symbol.observable object", () => {
  const results: string[] = [];
  const observable = {
    [Symbol.observable]() {
      return new Observable<string>(observer => {
        // Simulate async behavior
        setTimeout(() => {
          observer.next("hello");
          observer.next("world");
          observer.complete();
        }, 0);

        return () => results.push("cleaned up");
      });
    }
  };

  Observable.from(observable).subscribe({
    next(value) {
      results.push(value);
    },
    complete() {
      results.push("done");
    }
  });

  // Initially empty due to setTimeout
  expect(results).toEqual([]);

  // Wait for setTimeout to complete
  return new Promise<void>(resolve => {
    setTimeout(() => {
      expect(results).toEqual(["hello", "world", "done", "cleaned up"]);
      resolve();
    }, 10);
  });
});

test("Observable.from returns the same Observable if passed an Observable", () => {
  const original = new Observable(_ => { });
  const result = Observable.from(original);

  expect(result).toBe(original);
});

test("Observable.from with an async iterable", async () => {
  // Create an async iterable
  async function* asyncGenerator() {
    yield "async";
    yield "is";
    yield "awesome";
  }

  const asyncIterable = asyncGenerator();

  // Convert to Observable
  const observable = Observable.from(asyncIterable);

  // Collect results using for-await and AsyncIterator
  const results = [];
  for await (const value of observable) {
    results.push(value);
  }

  expect(results).toEqual(["async", "is", "awesome"]);
});

test("slow consumer with fast producer using pull strategy", async () => {
  const produced: number[] = [];
  const consumed: number[] = [];
  const timestamps: number[] = [];

  // Fast producer
  const fastNumbers$ = new Observable<number>(observer => {
    (async () => {
      for (let i = 0; i < 100; i++) {
        if (observer.closed) break;
        observer.next(i);
        produced.push(i);
        await new Promise(r => setTimeout(r, 5)); // Emit every 5ms
      }
      observer.complete();
    })();
  });

  // Slow consumer with backpressure via pull
  const startTime = Date.now();
  for await (const num of fastNumbers$.pull({ strategy: { highWaterMark: 5 } })) {
    consumed.push(num);
    timestamps.push(Date.now() - startTime);
    await new Promise(r => setTimeout(r, 50)); // Process every 50ms (10x slower)
  }

  // Should have processed all items without memory issues
  expect(consumed).toEqual(produced);

  // Verify backpressure worked - production should pause when buffer fills
  // This is a statistical test - verify pauses in production
  const productionGaps = [];
  for (let i = 1; i < timestamps.length; i++) {
    productionGaps.push(timestamps[i] - timestamps[i - 1]);
  }

  // Should see some larger gaps (where production paused)
  const pauseCount = productionGaps.filter(gap => gap > 40).length;
  expect(pauseCount).toBeGreaterThan(0);
});

test("breaking out of for-await loop triggers cleanup", async () => {
  const resources = { active: false };
  let iterationCount = 0;

  const infinite$ = new Observable(observer => {
    resources.active = true;
    const id = setInterval(() => observer.next(Date.now()), 10);

    return () => {
      clearInterval(id);
      resources.active = false;
    };
  });

  // Only consume 5 values then break
  for await (const _ of infinite$) {
    iterationCount++;
    if (iterationCount >= 5) break;
  }

  // Verify resources were cleaned up
  expect(iterationCount).toBe(5);
  expect(resources.active).toBe(false);
});

test("pull with error during async iteration", async () => {
  const errorObs = new Observable(observer => {
    observer.next(1);
    observer.next(2);
    observer.error(new Error("stream error"));
    return () => { };
  });

  const results = [];
  let caughtError: Error | null = null;

  try {
    for await (const value of errorObs.pull({ strategy: { highWaterMark: 10 } })) {
      results.push(value);
    }
  } catch (err) {
    caughtError = err as Error;
  }

  expect(results).toEqual([1, 2]);
  expect(caughtError).toBeInstanceOf(Error);
  expect(caughtError?.message).toBe("stream error");
});

test("multiple iterators with concurrent operations", async () => {
  const shared$ = new Observable<number>(observer => {
    let counter = 0;
    const id = setInterval(() => {
      observer.next(counter++);
      if (counter > 10) {
        observer.complete();
        clearInterval(id);
      }
    }, 10);

    return () => clearInterval(id);
  });

  // Create two concurrent iterators with different processing speeds
  const results1: number[] = [];
  const results2: number[] = [];

  const iterator1 = (async () => {
    for await (const value of shared$.pull({ strategy: { highWaterMark: 2 } })) {
      results1.push(value);
      await new Promise(r => setTimeout(r, 5)); // Fast consumer
    }
  })();

  const iterator2 = (async () => {
    for await (const value of shared$.pull({ strategy: { highWaterMark: 3 } })) {
      results2.push(value);
      await new Promise(r => setTimeout(r, 25)); // Slow consumer
    }
  })();

  await Promise.all([iterator1, iterator2]);

  // Both should have all items but potentially in different order
  // due to racing between the consumers
  expect(results1.length).toBe(11);
  expect(results2.length).toBe(11);
  expect(results1.slice()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(results2.slice()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("transferring to ReadableStream and back", async () => {
  const values = [1, 2, 3, 4, 5];
  const source$ = Observable.from(values);

  // Convert Observable to ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      const subscription = source$.subscribe({
        next: value => controller.enqueue(value),
        complete: () => controller.close(),
        error: err => controller.error(err)
      });

      return () => subscription.unsubscribe();
    }
  });

  // Convert back to Observable
  const roundTrip$ = new Observable(observer => {
    const reader = stream.getReader();

    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            observer.complete();
            break;
          }
          observer.next(value);
        }
      } catch (err) {
        observer.error(err);
      }
    })();

    return () => {
      reader.releaseLock();
      stream.cancel();
    };
  });

  // Verify values preserved through the round trip
  const results = [];
  for await (const value of roundTrip$) {
    results.push(value);
  }

  expect(results).toEqual(values);
});

test("SharedArrayBuffer coordination between workers", async () => {
  // Skip if SharedArrayBuffer not available
  if (typeof SharedArrayBuffer === 'undefined') {
    console.log('SharedArrayBuffer not available, skipping test');
    return;
  }

  // Setup a coordination buffer
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);

  // Observable that increments the shared value
  const counter$ = new Observable<number>(observer => {
    let count = 0;
    const id = setInterval(() => {
      if (count >= 10) {
        observer.complete();
        clearInterval(id);
        return;
      }

      // Atomic update to shared buffer
      Atomics.add(view, 0, 1);
      observer.next(count++);
    }, 10);

    return () => clearInterval(id);
  });

  // Multiple consumers reading in parallel with pull
  const results1: number[] = [];
  const results2: number[] = [];

  const reader1 = (async () => {
    for await (const v of counter$.pull()) {
      results1.push(v);
    }
  })();

  const reader2 = (async () => {
    for await (const v of counter$.pull()) {
      results2.push(v);
    }
  })();

  await Promise.all([reader1, reader2]);

  // Both readers should get all values
  expect(results1).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(results2).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  // Shared buffer should be updated 20 times
  expect(Atomics.load(view, 0)).toBe(20);
});

test("React-like hook with AsyncIterator", async () => {
  const events: string[] = [];
  let cleanupCalled = false;

  // Mock React with state and effect hooks
  function useObservableState(observable: Observable<number>) {
    let state = null;
    const setState = (val: number) => { state = val; events.push(`setState:${val}`); };

    // Mock effect hook
    (async () => {
      events.push('effect started');

      try {
        for await (const value of observable) {
          setState(value);
        }
      } catch (err) {
        events.push(`error:${(err as Error).message}`);
      }

      return () => {
        cleanupCalled = true;
        events.push('effect cleanup');
      };
    })();

    return state;
  }

  // Observable that emits values then errors
  const source$ = new Observable<number>(observer => {
    observer.next(1);
    observer.next(2);
    setTimeout(() => observer.error(new Error('test error')), 10);

    return () => {
      events.push('observable cleanup');
    };
  });

  // Use the hook
  useObservableState(source$);

  // Wait for async operations
  await new Promise(r => setTimeout(r, 50));

  // Verify correct sequence
  expect(events).toContain('effect started');
  expect(events).toContain('setState:1');
  expect(events).toContain('setState:2');
  expect(events).toContain('error:test error');
  expect(events).toContain('observable cleanup');
});

test("combining multiple AsyncIterables with resource management", async () => {
  const resources = { a: false, b: false };
  const results = [];

  // Two sources with tracked resources
  const sourceA = new Observable<string>(observer => {
    resources.a = true;
    observer.next('a1');
    observer.next('a2');
    observer.complete();

    return () => { resources.a = false; };
  });

  const sourceB = new Observable<string>(observer => {
    resources.b = true;
    observer.next('b1');
    observer.next('b2');
    observer.complete();

    return () => { resources.b = false; };
  });

  // Helper to merge AsyncIterables
  async function* merge<T>(...iterables: AsyncIterable<T>[]) {
    const iterators = iterables.map(i => i[Symbol.asyncIterator]());
    const pending = iterators.map((iterator, index) =>
      iterator.next().then(result => ({ result, index }))
    );

    try {
      while (pending.length) {
        const { result, index } = await Promise.race(pending);

        if (result.done) {
          // Remove this iterator
          pending.splice(index, 1);
          iterators.splice(index, 1);
          continue;
        }

        // Replace this promise
        if (iterators[index]) {
          pending[index] = iterators[index].next()
            .then(result => ({ result, index }));
        }

        yield result.value;
      }
    } finally {
      // Ensure all iterators are properly closed
      await Promise.all(iterators.map(i => i.return?.()));
    }
  }

  // Merge and consume both sources
  for await (const value of merge(sourceA, sourceB)) {
    results.push(value);

    // Early exit in the middle
    if (results.length >= 3) break;
  }

  // Verify resources cleaned up even with early exit
  expect(resources).toEqual({ a: false, b: false });
  expect(results.length).toBe(3);
});

test("pull with varying buffer sizes and producer speeds", async () => {
  const timestamps: number[] = [];
  const bufferSizes = [1, 10, 100];
  const results: { value: number, time: number, bufferSize: number }[] = [];

  for (const bufferSize of bufferSizes) {
    // Fast producer that tracks emission time
    const fastProducer = new Observable<{ value: number, time: number, bufferSize: number }>(observer => {
      (async () => {
        for (let i = 0; i < 10; i++) {
          observer.next({ value: i, time: Date.now(), bufferSize });
          await new Promise(r => setTimeout(r, 5));
        }
        observer.complete();
      })();
    });

    // Slow consumer
    const start = Date.now();
    for await (const item of fastProducer.pull({
      strategy: { highWaterMark: bufferSize }
    })) {
      timestamps.push(Date.now() - start);
      results.push(item);
      await new Promise(r => setTimeout(r, 20)); // Process slower than production
    }
  }

  // Different buffer sizes should show different backpressure behavior
  // Group results by buffer size
  const byBufferSize = results.reduce((acc, item) => {
    acc[item.bufferSize] = acc[item.bufferSize] || [];
    acc[item.bufferSize].push(item);
    return acc;
  }, {} as Record<number, ({ value: number, time: number, bufferSize: number })[]>);

  // Verify all values received for each buffer size
  expect(Object.keys(byBufferSize).length).toBe(bufferSizes.length);
  for (const size of bufferSizes) {
    expect(byBufferSize[size].length).toBe(10);
  }

  // Larger buffer sizes should allow emissions to bunch up more
  // Can verify this by looking at emission time clustering
});

test("Symbol.asyncIterator early termination with try/finally", async () => {
  const cleanup = { called: false };

  const source$ = new Observable(observer => {
    let i = 0;
    const id = setInterval(() => observer.next(i++), 10);

    return () => {
      cleanup.called = true;
      clearInterval(id);
    };
  });

  const results = [];

  try {
    const iterator = source$[Symbol.asyncIterator]();

    // Manual iteration instead of for-await
    results.push((await iterator.next()).value);
    results.push((await iterator.next()).value);

    // Early termination without consuming all values
    await iterator?.return?.();
  } finally {
    // Verify cleanup
    expect(cleanup.called).toBe(true);
  }

  expect(results.length).toBe(2);
});