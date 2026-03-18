/**
 * Queue operations benchmarks focusing on O(1) performance claims.
 * 
 * Tests circular buffer operations at various scales to verify constant-time
 * performance and compare against naive Array.shift() implementations.
 */

import { bench, run, do_not_optimize } from 'npm:mitata';
import {
  createQueue,
  enqueue,
  dequeue,
  peek,
  isEmpty,
  clear,
  toArray,
} from '../queue.ts';

// Baseline: Array.shift() for comparison
class ArrayQueue<T> {
  private items: T[] = [];
  
  enqueue(item: T): void {
    this.items.push(item);
  }
  
  dequeue(): T | undefined {
    return this.items.shift();
  }
  
  peek(): T | undefined {
    return this.items[0];
  }
  
  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

bench('Queue: create empty queue', () => {
  do_not_optimize(createQueue<number>(1000));
});

bench('Queue: enqueue 100 items', () => {
  const queue = createQueue<number>(100);
  for (let i = 0; i < 100; i++) {
    enqueue(queue, i);
  }
  do_not_optimize(queue);
});

bench('Queue: enqueue 1000 items', () => {
  const queue = createQueue<number>(1000);
  for (let i = 0; i < 1000; i++) {
    enqueue(queue, i);
  }
  do_not_optimize(queue);
}).gc('inner');

bench('Queue: enqueue 10000 items', () => {
  const queue = createQueue<number>(10000);
  for (let i = 0; i < 10000; i++) {
    enqueue(queue, i);
  }
  do_not_optimize(queue);
}).gc('inner');

bench('Queue: dequeue 100 items', () => {
  const queue = createQueue<number>(100);
  for (let i = 0; i < 100; i++) {
    enqueue(queue, i);
  }
  
  const results: number[] = [];
  for (let i = 0; i < 100; i++) {
    const val = dequeue(queue);
    if (val !== undefined) results.push(val);
  }
  do_not_optimize(results);
});

bench('Queue: dequeue 1000 items', () => {
  const queue = createQueue<number>(1000);
  for (let i = 0; i < 1000; i++) {
    enqueue(queue, i);
  }
  
  const results: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const val = dequeue(queue);
    if (val !== undefined) results.push(val);
  }
  do_not_optimize(results);
}).gc('inner');

bench('Queue: enqueue+dequeue mixed 1000 ops', () => {
  const queue = createQueue<number>(500);
  
  for (let i = 0; i < 1000; i++) {
    if (i % 2 === 0) {
      enqueue(queue, i);
    } else if (!isEmpty(queue)) {
      dequeue(queue);
    }
  }
  do_not_optimize(queue);
}).gc('inner');

bench('Queue: circular wrap 1000 cycles', () => {
  const queue = createQueue<number>(100);
  
  // Fill queue
  for (let i = 0; i < 100; i++) {
    enqueue(queue, i);
  }
  
  // Cycle: dequeue one, enqueue one (causes wrapping)
  for (let i = 0; i < 1000; i++) {
    dequeue(queue);
    enqueue(queue, i + 100);
  }
  
  do_not_optimize(queue);
}).gc('inner');

bench('Queue: peek 1000 times', () => {
  const queue = createQueue<number>(100);
  for (let i = 0; i < 100; i++) {
    enqueue(queue, i);
  }
  
  let sum = 0;
  for (let i = 0; i < 1000; i++) {
    const val = peek(queue);
    if (val !== undefined) sum += val;
  }
  do_not_optimize(sum);
});

bench('Queue: toArray with 1000 items', () => {
  const queue = createQueue<number>(1000);
  for (let i = 0; i < 1000; i++) {
    enqueue(queue, i);
  }
  
  do_not_optimize(toArray(queue));
}).gc('inner');

bench('Queue: clear 1000 items', () => {
  const queue = createQueue<number>(1000);
  for (let i = 0; i < 1000; i++) {
    enqueue(queue, i);
  }
  
  clear(queue);
  do_not_optimize(queue);
});

// Comparison benchmarks: circular buffer vs Array.shift()
bench('[Baseline] Array.shift: enqueue 1000 items', () => {
  const queue = new ArrayQueue<number>();
  for (let i = 0; i < 1000; i++) {
    queue.enqueue(i);
  }
  do_not_optimize(queue);
}).gc('inner');

bench('[Baseline] Array.shift: dequeue 1000 items', () => {
  const queue = new ArrayQueue<number>();
  for (let i = 0; i < 1000; i++) {
    queue.enqueue(i);
  }
  
  const results: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const val = queue.dequeue();
    if (val !== undefined) results.push(val);
  }
  do_not_optimize(results);
}).gc('inner');

bench('[Baseline] Array.shift: mixed 1000 ops', () => {
  const queue = new ArrayQueue<number>();
  
  for (let i = 0; i < 1000; i++) {
    if (i % 2 === 0) {
      queue.enqueue(i);
    } else if (!queue.isEmpty()) {
      queue.dequeue();
    }
  }
  do_not_optimize(queue);
}).gc('inner');

await run();
