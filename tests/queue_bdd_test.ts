/**
 * Tests for circular buffer queue - a high-performance FIFO data structure using O(1) operations
 * instead of O(n) Array.shift(). Think of it as a ring of parking spaces: when you reach the last
 * slot and add another item, it wraps to the first slot (if empty). Array.shift() moves every
 * element forward on each dequeue (expensive), while circular buffer just moves a head pointer.
 * 
 * Visual: Array.shift() [A,B,C,D,E] → shift() → [B,C,D,E] (everyone moved!)
 *         Circular [A,B,C,D,E] ↑head ↑tail → dequeue() → [_,B,C,D,E] ↑head ↑tail (pointer moved)
 * 
 * Tests cover basic operations (enqueue/dequeue/peek), FIFO order, circular wrapping when head/tail
 * reach capacity, status checks (isEmpty/isFull), advanced operations (clear/toArray/forEach), edge
 * cases (capacity 1, rapid cycles, null/undefined), and real-world scenarios (task queues, message
 * buffers, rate limiting).
 */

import { describe, it } from '@std/testing/bdd';
import { expect } from '@std/expect';

import { 
  createQueue,
  enqueue,
  dequeue,
  peek,
  isEmpty,
  isFull,
  getSize,
  remainingSpace,
  clear,
  toArray,
  forEach,
  type Queue
} from '../queue.ts';

describe("Queue Creation", () => {
  describe("createQueue()", () => {
    it("should create an empty queue with default capacity", () => {
      const queue = createQueue<number>();
      
      expect(isEmpty(queue)).toBe(true);
      expect(getSize(queue)).toBe(0);
      expect(queue.capacity).toBe(1000); // Default capacity
      expect(queue.head).toBe(0);
      expect(queue.tail).toBe(0);
    });

    it("should create a queue with custom capacity", () => {
      const queue = createQueue<string>(50);
      
      expect(isEmpty(queue)).toBe(true);
      expect(queue.capacity).toBe(50);
      expect(remainingSpace(queue)).toBe(50);
    });

    it("should create queue with capacity of 1", () => {
      // Edge case: minimal queue
      const queue = createQueue<number>(1);
      
      expect(queue.capacity).toBe(1);
      expect(remainingSpace(queue)).toBe(1);
    });

    it("should support generic types", () => {
      // Verify TypeScript generic support
      const numberQueue = createQueue<number>();
      const stringQueue = createQueue<string>();
      const objectQueue = createQueue<{ id: number; name: string }>();
      
      expect(numberQueue).toBeDefined();
      expect(stringQueue).toBeDefined();
      expect(objectQueue).toBeDefined();
    });
  });
});

describe("Basic Queue Operations", () => {
  describe("enqueue() - Adding items", () => {
    it("should add items to the queue", () => {
      const queue = createQueue<number>(5);
      
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      expect(getSize(queue)).toBe(3);
      expect(isEmpty(queue)).toBe(false);
    });

    it("should maintain FIFO order", () => {
      const queue = createQueue<string>(5);
      
      enqueue(queue, 'first');
      enqueue(queue, 'second');
      enqueue(queue, 'third');
      
      // First in should be first out
      expect(dequeue(queue)).toBe('first');
      expect(dequeue(queue)).toBe('second');
      expect(dequeue(queue)).toBe('third');
    });

    it("should update tail pointer correctly", () => {
      const queue = createQueue<number>(5);
      
      enqueue(queue, 1);
      expect(queue.tail).toBe(1);
      
      enqueue(queue, 2);
      expect(queue.tail).toBe(2);
      
      enqueue(queue, 3);
      expect(queue.tail).toBe(3);
    });

    it("should increment size correctly", () => {
      const queue = createQueue<number>(10);
      
      for (let i = 0; i < 5; i++) {
        enqueue(queue, i);
        expect(getSize(queue)).toBe(i + 1);
      }
    });

    it("should throw when queue is full", () => {
      const queue = createQueue<number>(3);
      
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      // Queue is full, next enqueue should throw
      expect(() => enqueue(queue, 4)).toThrow('Queue overflow');
      expect(() => enqueue(queue, 4)).toThrow('capacity 3 reached');
    });

    it("should handle different data types", () => {
      const stringQueue = createQueue<string>(3);
      const objectQueue = createQueue<{ x: number }>(3);
      const arrayQueue = createQueue<number[]>(3);
      
      enqueue(stringQueue, 'hello');
      enqueue(objectQueue, { x: 42 });
      enqueue(arrayQueue, [1, 2, 3]);
      
      expect(dequeue(stringQueue)).toBe('hello');
      expect(dequeue(objectQueue)).toEqual({ x: 42 });
      expect(dequeue(arrayQueue)).toEqual([1, 2, 3]);
    });
  });

  describe("dequeue() - Removing items", () => {
    it("should remove and return the front item", () => {
      const queue = createQueue<number>(5);
      
      enqueue(queue, 10);
      enqueue(queue, 20);
      
      const first = dequeue(queue);
      expect(first).toBe(10);
      expect(getSize(queue)).toBe(1);
    });

    it("should return undefined when queue is empty", () => {
      const queue = createQueue<number>(5);
      
      const result = dequeue(queue);
      expect(result).toBeUndefined();
    });

    it("should update head pointer correctly", () => {
      const queue = createQueue<number>(5);
      
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      expect(queue.head).toBe(0);
      
      dequeue(queue);
      expect(queue.head).toBe(1);
      
      dequeue(queue);
      expect(queue.head).toBe(2);
    });

    it("should decrement size correctly", () => {
      const queue = createQueue<number>(5);
      
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      expect(getSize(queue)).toBe(3);
      
      dequeue(queue);
      expect(getSize(queue)).toBe(2);
      
      dequeue(queue);
      expect(getSize(queue)).toBe(1);
    });

    it("should clear the dequeued slot for garbage collection", () => {
      const queue = createQueue<{ data: string }>(5);
      
      enqueue(queue, { data: 'test' });
      const item = dequeue(queue);
      
      // The slot should be cleared (set to undefined)
      // This helps the garbage collector reclaim memory
      expect(queue.items[0]).toBeUndefined();
    });

    it("should handle dequeuing all items", () => {
      const queue = createQueue<number>(3);
      
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      expect(dequeue(queue)).toBe(1);
      expect(dequeue(queue)).toBe(2);
      expect(dequeue(queue)).toBe(3);
      expect(dequeue(queue)).toBeUndefined();
      expect(isEmpty(queue)).toBe(true);
    });
  });

  describe("peek() - Looking at front item", () => {
    it("should return the front item without removing it", () => {
      const queue = createQueue<number>(5);
      
      enqueue(queue, 42);
      
      const peeked = peek(queue);
      expect(peeked).toBe(42);
      expect(getSize(queue)).toBe(1); // Size unchanged
    });

    it("should return undefined for empty queue", () => {
      const queue = createQueue<number>(5);
      
      expect(peek(queue)).toBeUndefined();
    });

    it("should allow multiple peeks without side effects", () => {
      const queue = createQueue<string>(5);
      
      enqueue(queue, 'hello');
      
      expect(peek(queue)).toBe('hello');
      expect(peek(queue)).toBe('hello');
      expect(peek(queue)).toBe('hello');
      expect(getSize(queue)).toBe(1); // Still there
    });

    it("should return correct item after dequeues", () => {
      const queue = createQueue<number>(5);
      
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      dequeue(queue); // Remove 1
      expect(peek(queue)).toBe(2);
      
      dequeue(queue); // Remove 2
      expect(peek(queue)).toBe(3);
    });

    it("should be useful for conditional processing", () => {
      interface Task {
        priority: 'high' | 'low';
        action: string;
      }
      
      const queue = createQueue<Task>(10);
      
      enqueue(queue, { priority: 'low', action: 'send-email' });
      enqueue(queue, { priority: 'high', action: 'process-payment' });
      
      // Peek helps decide whether to process now or leave the queue alone.
      // The queue stays FIFO, so a low-priority item at the front does not let
      // us skip ahead to the later high-priority item.
      const next = peek(queue);
      if (next && next.priority === 'high') {
        // Process immediately only when the front item is high priority.
        dequeue(queue);
      }
      
      // The low-priority task is still at the front because peek is non-destructive.
      expect(peek(queue)?.priority).toBe('low');
    });
  });
});

describe("Circular Buffer Wrapping", () => {
  describe("Wrap-around behavior", () => {
    it("should wrap tail pointer around when reaching capacity", () => {
      const queue = createQueue<number>(5);
      
      // Fill queue
      for (let i = 0; i < 5; i++) {
        enqueue(queue, i);
      }
      
      expect(queue.tail).toBe(0); // Wrapped to start
      expect(isFull(queue)).toBe(true);
    });

    it("should wrap head pointer when dequeuing", () => {
      const queue = createQueue<number>(3);
      
      // Fill queue
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      // Dequeue all
      dequeue(queue);
      dequeue(queue);
      dequeue(queue);
      
      // Head wraps around
      expect(queue.head).toBe(0);
    });

    it("should allow reuse of space after wrap-around", () => {
      const queue = createQueue<number>(3);
      
      // Fill queue
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      // Remove first two items
      dequeue(queue);
      dequeue(queue);
      
      // Now we have space, add two more
      // These will wrap around and use slots 0 and 1
      enqueue(queue, 4);
      enqueue(queue, 5);
      
      expect(getSize(queue)).toBe(3);
      expect(toArray(queue)).toEqual([3, 4, 5]);
    });

    it("should handle multiple wrap-arounds correctly", () => {
      const queue = createQueue<number>(3);
      
      // Simulate continuous enqueue/dequeue pattern
      for (let cycle = 0; cycle < 5; cycle++) {
        // Fill queue
        enqueue(queue, cycle * 10 + 1);
        enqueue(queue, cycle * 10 + 2);
        enqueue(queue, cycle * 10 + 3);
        
        // Empty queue
        dequeue(queue);
        dequeue(queue);
        dequeue(queue);
      }
      
      // Queue should still work correctly
      expect(isEmpty(queue)).toBe(true);
      expect(queue.head).toBe(0);
      expect(queue.tail).toBe(0);
    });

    it("should maintain FIFO order across wrap-around", () => {
      const queue = createQueue<string>(4);
      
      // Fill queue
      enqueue(queue, 'A');
      enqueue(queue, 'B');
      enqueue(queue, 'C');
      enqueue(queue, 'D');
      
      // Remove two items to make space
      expect(dequeue(queue)).toBe('A');
      expect(dequeue(queue)).toBe('B');
      
      // Add two more (these wrap around)
      enqueue(queue, 'E');
      enqueue(queue, 'F');
      
      // Verify order is maintained
      expect(toArray(queue)).toEqual(['C', 'D', 'E', 'F']);
      expect(dequeue(queue)).toBe('C');
      expect(dequeue(queue)).toBe('D');
      expect(dequeue(queue)).toBe('E');
      expect(dequeue(queue)).toBe('F');
    });
  });

  describe("Complex wrap-around scenarios", () => {
    it("should handle head and tail meeting after wrap", () => {
      const queue = createQueue<number>(5);
      
      // Add items
      for (let i = 0; i < 5; i++) {
        enqueue(queue, i);
      }
      
      // head=0, tail=0 (wrapped), size=5
      expect(queue.head).toBe(0);
      expect(queue.tail).toBe(0);
      expect(isFull(queue)).toBe(true);
      
      // Dequeue one
      dequeue(queue);
      
      // head=1, tail=0, size=4
      expect(queue.head).toBe(1);
      expect(queue.tail).toBe(0);
      expect(isFull(queue)).toBe(false);
    });

    it("should distinguish full from empty when pointers equal", () => {
      const queue = createQueue<number>(3);
      
      // Initially: head=0, tail=0, size=0 (empty)
      expect(queue.head).toBe(queue.tail);
      expect(isEmpty(queue)).toBe(true);
      expect(isFull(queue)).toBe(false);
      
      // Fill: head=0, tail=0, size=3 (full, wrapped)
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      expect(queue.head).toBe(queue.tail);
      expect(isEmpty(queue)).toBe(false);
      expect(isFull(queue)).toBe(true);
      
      // The size property is what distinguishes empty from full
      expect(queue.size).toBe(3);
    });
  });
});

describe("Queue Status and Utilities", () => {
  describe("isEmpty()", () => {
    it("should return true for new queue", () => {
      const queue = createQueue<number>(5);
      expect(isEmpty(queue)).toBe(true);
    });

    it("should return false after adding items", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      expect(isEmpty(queue)).toBe(false);
    });

    it("should return true after removing all items", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      dequeue(queue);
      expect(isEmpty(queue)).toBe(true);
    });
  });

  describe("isFull()", () => {
    it("should return false for new queue", () => {
      const queue = createQueue<number>(5);
      expect(isFull(queue)).toBe(false);
    });

    it("should return true when at capacity", () => {
      const queue = createQueue<number>(3);
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      expect(isFull(queue)).toBe(true);
    });

    it("should return false after dequeuing from full queue", () => {
      const queue = createQueue<number>(3);
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      dequeue(queue);
      expect(isFull(queue)).toBe(false);
    });

    it("should work with capacity of 1", () => {
      const queue = createQueue<number>(1);
      expect(isFull(queue)).toBe(false);
      
      enqueue(queue, 1);
      expect(isFull(queue)).toBe(true);
    });
  });

  describe("getSize()", () => {
    it("should return 0 for empty queue", () => {
      const queue = createQueue<number>(5);
      expect(getSize(queue)).toBe(0);
    });

    it("should return correct size as items are added", () => {
      const queue = createQueue<number>(5);
      
      expect(getSize(queue)).toBe(0);
      enqueue(queue, 1);
      expect(getSize(queue)).toBe(1);
      enqueue(queue, 2);
      expect(getSize(queue)).toBe(2);
    });

    it("should return correct size as items are removed", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      expect(getSize(queue)).toBe(3);
      dequeue(queue);
      expect(getSize(queue)).toBe(2);
      dequeue(queue);
      expect(getSize(queue)).toBe(1);
    });

    it("should match capacity when full", () => {
      const queue = createQueue<number>(5);
      for (let i = 0; i < 5; i++) {
        enqueue(queue, i);
      }
      expect(getSize(queue)).toBe(queue.capacity);
    });
  });

  describe("remainingSpace()", () => {
    it("should return capacity for empty queue", () => {
      const queue = createQueue<number>(10);
      expect(remainingSpace(queue)).toBe(10);
    });

    it("should decrease as items are added", () => {
      const queue = createQueue<number>(5);
      
      expect(remainingSpace(queue)).toBe(5);
      enqueue(queue, 1);
      expect(remainingSpace(queue)).toBe(4);
      enqueue(queue, 2);
      expect(remainingSpace(queue)).toBe(3);
    });

    it("should return 0 when full", () => {
      const queue = createQueue<number>(3);
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      expect(remainingSpace(queue)).toBe(0);
    });

    it("should increase as items are removed", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      expect(remainingSpace(queue)).toBe(2);
      dequeue(queue);
      expect(remainingSpace(queue)).toBe(3);
    });

    it("should be useful for monitoring queue health", () => {
      const queue = createQueue<number>(100);
      
      // Fill halfway
      for (let i = 0; i < 50; i++) {
        enqueue(queue, i);
      }
      
      // Check if we need to alert about capacity
      if (remainingSpace(queue) < 20) {
        // Would trigger alert in real system
        expect(true).toBe(false); // Shouldn't reach here
      }
      
      expect(remainingSpace(queue)).toBe(50);
    });
  });
});

describe("Advanced Operations", () => {
  describe("clear()", () => {
    it("should empty the queue instantly", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      clear(queue);
      
      expect(isEmpty(queue)).toBe(true);
      expect(getSize(queue)).toBe(0);
    });

    it("should reset head and tail pointers", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      enqueue(queue, 2);
      dequeue(queue);
      
      clear(queue);
      
      expect(queue.head).toBe(0);
      expect(queue.tail).toBe(0);
    });

    it("should maintain capacity", () => {
      const queue = createQueue<number>(50);
      enqueue(queue, 1);
      
      clear(queue);
      
      expect(queue.capacity).toBe(50);
      expect(remainingSpace(queue)).toBe(50);
    });

    it("should be safe on empty queue", () => {
      const queue = createQueue<number>(5);
      
      clear(queue); // Clear empty queue
      
      expect(isEmpty(queue)).toBe(true);
      expect(getSize(queue)).toBe(0);
    });

    it("should allow reuse after clearing", () => {
      const queue = createQueue<string>(3);
      enqueue(queue, 'A');
      enqueue(queue, 'B');
      
      clear(queue);
      
      enqueue(queue, 'C');
      enqueue(queue, 'D');
      
      expect(toArray(queue)).toEqual(['C', 'D']);
    });

    it("should help garbage collection by releasing references", () => {
      const queue = createQueue<{ data: number[] }>(3);
      
      // Add objects with large arrays
      enqueue(queue, { data: new Array(1000).fill(1) });
      enqueue(queue, { data: new Array(1000).fill(2) });
      
      clear(queue);
      
      // All references should be cleared
      expect(queue.size).toBe(0);
      // The items array is reset, allowing GC to reclaim memory
    });
  });

  describe("toArray()", () => {
    it("should return empty array for empty queue", () => {
      const queue = createQueue<number>(5);
      expect(toArray(queue)).toEqual([]);
    });

    it("should return items in FIFO order", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      expect(toArray(queue)).toEqual([1, 2, 3]);
    });

    it("should not modify the queue", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      enqueue(queue, 2);
      
      const arr = toArray(queue);
      
      expect(getSize(queue)).toBe(2);
      expect(arr).toEqual([1, 2]);
    });

    it("should handle wrapped queue correctly", () => {
      const queue = createQueue<number>(4);
      
      // Fill and wrap
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      enqueue(queue, 4);
      
      dequeue(queue);
      dequeue(queue);
      
      enqueue(queue, 5);
      enqueue(queue, 6);
      
      // Internal state: [5, 6, 3, 4] with head=2, tail=2
      // toArray reads in order: starting from head (index 2), we get 3, 4, 5, 6
      expect(toArray(queue)).toEqual([3, 4, 5, 6]);
    });

    it("should create independent array", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      enqueue(queue, 2);
      
      const arr1 = toArray(queue);
      enqueue(queue, 3);
      const arr2 = toArray(queue);
      
      expect(arr1).toEqual([1, 2]);
      expect(arr2).toEqual([1, 2, 3]);
    });

    it("should be useful for debugging", () => {
      const queue = createQueue<string>(10);
      enqueue(queue, 'task1');
      enqueue(queue, 'task2');
      enqueue(queue, 'task3');
      
      // In real code, you might log this
      const snapshot = toArray(queue);
      expect(snapshot.join(' → ')).toBe('task1 → task2 → task3');
    });
  });

  describe("forEach()", () => {
    it("should iterate over all items in FIFO order", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      const collected: number[] = [];
      forEach(queue, (item) => {
        collected.push(item);
      });
      
      expect(collected).toEqual([1, 2, 3]);
    });

    it("should provide index to callback", () => {
      const queue = createQueue<string>(5);
      enqueue(queue, 'A');
      enqueue(queue, 'B');
      enqueue(queue, 'C');
      
      const indices: number[] = [];
      forEach(queue, (_, index) => {
        indices.push(index);
      });
      
      expect(indices).toEqual([0, 1, 2]);
    });

    it("should not modify the queue", () => {
      const queue = createQueue<number>(5);
      enqueue(queue, 1);
      enqueue(queue, 2);
      
      forEach(queue, (item) => {
        // Do something with item
        expect(item).toBeDefined();
      });
      
      expect(getSize(queue)).toBe(2);
    });

    it("should handle wrapped queue correctly", () => {
      const queue = createQueue<number>(3);
      enqueue(queue, 1);
      enqueue(queue, 2);
      enqueue(queue, 3);
      
      dequeue(queue);
      enqueue(queue, 4);
      
      const collected: number[] = [];
      forEach(queue, (item) => {
        collected.push(item);
      });
      
      expect(collected).toEqual([2, 3, 4]);
    });

    it("should do nothing for empty queue", () => {
      const queue = createQueue<number>(5);
      
      let callCount = 0;
      forEach(queue, () => {
        callCount++;
      });
      
      expect(callCount).toBe(0);
    });

    it("should be useful for logging or side effects", () => {
      interface Task {
        id: number;
        name: string;
      }
      
      const queue = createQueue<Task>(10);
      enqueue(queue, { id: 1, name: 'Task 1' });
      enqueue(queue, { id: 2, name: 'Task 2' });
      
      const logs: string[] = [];
      forEach(queue, (task, index) => {
        logs.push(`[${index}] Task ${task.id}: ${task.name}`);
      });
      
      expect(logs).toEqual([
        '[0] Task 1: Task 1',
        '[1] Task 2: Task 2'
      ]);
    });
  });
});

describe("Edge Cases and Stress Tests", () => {
  describe("Edge cases", () => {
    it("should handle capacity of 1", () => {
      const queue = createQueue<number>(1);
      
      enqueue(queue, 42);
      expect(isFull(queue)).toBe(true);
      expect(peek(queue)).toBe(42);
      
      const value = dequeue(queue);
      expect(value).toBe(42);
      expect(isEmpty(queue)).toBe(true);
    });

    it("should handle alternating enqueue/dequeue", () => {
      const queue = createQueue<number>(5);
      
      for (let i = 0; i < 100; i++) {
        enqueue(queue, i);
        expect(dequeue(queue)).toBe(i);
      }
      
      expect(isEmpty(queue)).toBe(true);
    });

    it("should handle filling and emptying multiple times", () => {
      const queue = createQueue<number>(3);
      
      for (let cycle = 0; cycle < 5; cycle++) {
        // Fill
        enqueue(queue, cycle * 3 + 1);
        enqueue(queue, cycle * 3 + 2);
        enqueue(queue, cycle * 3 + 3);
        
        expect(isFull(queue)).toBe(true);
        
        // Empty
        dequeue(queue);
        dequeue(queue);
        dequeue(queue);
        
        expect(isEmpty(queue)).toBe(true);
      }
    });

    it("should handle undefined as valid value", () => {
      const queue = createQueue<number | undefined>(3);
      
      enqueue(queue, undefined);
      enqueue(queue, 42);
      enqueue(queue, undefined);
      
      // Note: dequeue returns undefined for empty queue
      // So we need to check size to distinguish
      expect(dequeue(queue)).toBeUndefined();
      expect(getSize(queue)).toBe(2); // undefined was dequeued
      expect(dequeue(queue)).toBe(42);
      expect(dequeue(queue)).toBeUndefined();
      expect(isEmpty(queue)).toBe(true);
    });

    it("should handle null values", () => {
      const queue = createQueue<number | null>(3);
      
      enqueue(queue, null);
      enqueue(queue, 1);
      enqueue(queue, null);
      
      expect(dequeue(queue)).toBeNull();
      expect(dequeue(queue)).toBe(1);
      expect(dequeue(queue)).toBeNull();
    });
  });

  describe("Performance characteristics", () => {
    it("should handle large number of operations efficiently", () => {
      const queue = createQueue<number>(1000);
      
      // Enqueue 1000 items
      for (let i = 0; i < 1000; i++) {
        enqueue(queue, i);
      }
      
      expect(getSize(queue)).toBe(1000);
      
      // Dequeue 500 items
      for (let i = 0; i < 500; i++) {
        expect(dequeue(queue)).toBe(i);
      }
      
      expect(getSize(queue)).toBe(500);
      
      // Enqueue 500 more (testing wrap-around)
      for (let i = 1000; i < 1500; i++) {
        enqueue(queue, i);
      }
      
      expect(isFull(queue)).toBe(true);
    });

    it("should maintain O(1) operations even with wrapping", () => {
      const queue = createQueue<number>(100);
      
      // Simulate continuous queue usage
      for (let i = 0; i < 10000; i++) {
        enqueue(queue, i);
        
        if (getSize(queue) > 50) {
          dequeue(queue);
        }
      }
      
      // Queue should still be in valid state
      expect(getSize(queue)).toBeGreaterThan(0);
      expect(getSize(queue)).toBeLessThanOrEqual(100);
    });
  });

  describe("Real-world scenarios", () => {
    it("should work as a task queue", () => {
      interface Task {
        id: number;
        action: () => void;
      }
      
      const taskQueue = createQueue<Task>(100);
      const executed: number[] = [];
      
      // Add tasks
      for (let i = 0; i < 5; i++) {
        enqueue(taskQueue, {
          id: i,
          action: () => executed.push(i)
        });
      }
      
      // Process tasks in order
      while (!isEmpty(taskQueue)) {
        const task = dequeue(taskQueue);
        task?.action();
      }
      
      expect(executed).toEqual([0, 1, 2, 3, 4]);
    });

    it("should work as a message buffer with overflow handling", () => {
      const messageBuffer = createQueue<string>(3);
      
      const messages = ['msg1', 'msg2', 'msg3', 'msg4'];
      const processed: string[] = [];
      
      for (const msg of messages) {
        if (isFull(messageBuffer)) {
          // Buffer full, process oldest message first
          const oldest = dequeue(messageBuffer);
          if (oldest) processed.push(oldest);
        }
        enqueue(messageBuffer, msg);
      }
      
      // Process remaining
      while (!isEmpty(messageBuffer)) {
        const msg = dequeue(messageBuffer);
        if (msg) processed.push(msg);
      }
      
      expect(processed).toEqual(['msg1', 'msg2', 'msg3', 'msg4']);
    });

    it("should work for rate limiting", () => {
      interface Request {
        id: number;
        timestamp: number;
      }
      
      const requestQueue = createQueue<Request>(5);
      const RATE_LIMIT = 5; // Max 5 requests
      
      // Simulate incoming requests
      for (let i = 0; i < 10; i++) {
        if (!isFull(requestQueue)) {
          enqueue(requestQueue, { id: i, timestamp: Date.now() });
        } else {
          // Rate limit exceeded, could reject or queue elsewhere
        }
      }
      
      // Only first 5 requests made it through
      expect(getSize(requestQueue)).toBe(5);
    });
  });
});
