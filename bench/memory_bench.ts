/**
 * Memory allocation and GC pressure benchmarks.
 * 
 * Measures memory usage patterns, allocation rates, and GC behavior
 * under various Observable usage scenarios. Critical for understanding
 * real-world performance characteristics beyond simple execution time.
 */

import { bench, run, do_not_optimize } from 'npm:mitata';
import { Observable } from '../observable.ts';
import { pipe } from '../helpers/pipe.ts';
import { map, filter, take, scan } from '../helpers/operations/core.ts';
import { createQueue, enqueue, dequeue } from '../queue.ts';

// Memory tracking helper
function getMemoryUsage(): number {
  if (typeof Deno !== 'undefined' && Deno.memoryUsage) {
    return Deno.memoryUsage().heapUsed;
  }
  return 0;
}

// Stress test data generator
function* largeDataGenerator(sizeBytes: number) {
  const chunkSize = 1024; // 1KB chunks
  const numChunks = Math.floor(sizeBytes / chunkSize);
  
  for (let i = 0; i < numChunks; i++) {
    yield new Uint8Array(chunkSize);
  }
}

bench('Memory: Observable creation overhead (1000x)', () => {
  const observables: Observable<number>[] = [];
  
  for (let i = 0; i < 1000; i++) {
    observables.push(Observable.of(i));
  }
  
  do_not_optimize(observables);
}).gc('inner');

bench('Memory: Subscription tracking (1000 subs)', () => {
  const obs = Observable.of(1, 2, 3);
  const subscriptions = [];
  
  for (let i = 0; i < 1000; i++) {
    subscriptions.push(obs.subscribe(() => {}));
  }
  
  // Cleanup
  for (const sub of subscriptions) {
    sub.unsubscribe();
  }
  
  do_not_optimize(subscriptions);
}).gc('inner');

bench('Memory: Queue buffer reuse (10000 cycles)', () => {
  const queue = createQueue<number>(1000);
  
  // Fill queue
  for (let i = 0; i < 1000; i++) {
    enqueue(queue, i);
  }
  
  // Cycle through: should reuse buffer slots
  for (let i = 0; i < 10000; i++) {
    dequeue(queue);
    enqueue(queue, i);
  }
  
  do_not_optimize(queue);
}).gc('inner');

bench('Memory: Large data streaming (1MB)', async () => {
  const oneMB = 1024 * 1024;
  const obs = Observable.from(largeDataGenerator(oneMB));
  
  let totalBytes = 0;
  for await (const chunk of obs) {
    totalBytes += chunk.length;
  }
  
  do_not_optimize(totalBytes);
}).gc('inner');

bench('Memory: Large data streaming (10MB)', async () => {
  const tenMB = 10 * 1024 * 1024;
  const obs = Observable.from(largeDataGenerator(tenMB));
  
  let totalBytes = 0;
  for await (const chunk of obs) {
    totalBytes += chunk.length;
  }
  
  do_not_optimize(totalBytes);
}).gc('inner');

bench('Memory: Large data streaming (100MB)', async () => {
  const hundredMB = 100 * 1024 * 1024;
  const obs = Observable.from(largeDataGenerator(hundredMB));
  
  let totalBytes = 0;
  for await (const chunk of obs) {
    totalBytes += chunk.length;
  }
  
  do_not_optimize(totalBytes);
}).gc('inner');

bench('Memory: Operator chain with large data (10MB)', async () => {
  const tenMB = 10 * 1024 * 1024;
  
  const result = pipe(
    Observable.from(largeDataGenerator(tenMB)),
    map((chunk: Uint8Array) => chunk.length),
    scan((acc: number, len: number) => acc + len, 0),
    take(1000)
  );
  
  const values: number[] = [];
  for await (const val of result) {
    values.push(val);
  }
  
  do_not_optimize(values);
}).gc('inner');

bench('Memory: Rapid subscribe/unsubscribe cycles (10000x)', () => {
  const obs = Observable.of(1, 2, 3, 4, 5);
  
  for (let i = 0; i < 10000; i++) {
    const sub = obs.subscribe(() => {});
    sub.unsubscribe();
  }
  
  do_not_optimize(obs);
}).gc('inner');

bench('Memory: Concurrent subscriptions with cleanup (1000x)', () => {
  const obs = new Observable<number>((observer) => {
    const id = setInterval(() => {
      observer.next(Math.random());
    }, 100);
    
    return () => clearInterval(id);
  });
  
  const subs = [];
  for (let i = 0; i < 1000; i++) {
    subs.push(obs.subscribe(() => {}));
  }
  
  // Cleanup all
  for (const sub of subs) {
    sub.unsubscribe();
  }
  
  do_not_optimize(subs);
}).gc('inner');

bench('Memory: Queue allocation patterns (100K items)', () => {
  const queue = createQueue<number>(100000);
  
  for (let i = 0; i < 100000; i++) {
    enqueue(queue, i);
  }
  
  do_not_optimize(queue);
}).gc('inner');

bench('Memory: Observable value buffering (10000 items)', async () => {
  const values: number[] = [];
  
  const obs = new Observable<number>((observer) => {
    for (let i = 0; i < 10000; i++) {
      observer.next(i);
    }
    observer.complete();
  });
  
  for await (const val of obs) {
    values.push(val);
  }
  
  do_not_optimize(values);
}).gc('inner');

// Stress test: Push system to limits
bench('STRESS: 1GB data streaming', async () => {
  const oneGB = 1024 * 1024 * 1024;
  const obs = Observable.from(largeDataGenerator(oneGB));
  
  let totalBytes = 0;
  let chunkCount = 0;
  
  for await (const chunk of obs) {
    totalBytes += chunk.length;
    chunkCount++;
  }
  
  do_not_optimize({ totalBytes, chunkCount });
}).gc('inner');

bench('STRESS: 1M subscriptions lifecycle', () => {
  const obs = Observable.of(42);
  let completedCount = 0;
  
  // Note: This is intentionally stressful
  // Real code shouldn't do this pattern
  for (let i = 0; i < 1000000; i++) {
    const sub = obs.subscribe({
      next: () => {},
      complete: () => { completedCount++; }
    });
    sub.unsubscribe();
  }
  
  do_not_optimize(completedCount);
}).gc('inner');

await run();
