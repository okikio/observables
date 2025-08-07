/**
 * A lightweight, high-performance queue that delivers O(1) operations
 * using a circular buffer approach. Designed for readability and ease of use
 * without sacrificing performance.
 *
 * Perfect for task queues, message buffers, or any scenario where you need
 * fast FIFO (First-In-First-Out) operations without the performance penalty
 * of Array.shift().
 *
 * @example
 * ```
 * import { createQueue, enqueue, dequeue, peek } from './simple-queue';
 *
 * const taskQueue = createQueue<string>(100);  // capacity of 100
 * enqueue(taskQueue, 'process-order-123');     // add task
 * enqueue(taskQueue, 'send-email-456');        // add another
 * 
 * console.log(peek(taskQueue));                // 'process-order-123' (doesn't remove)
 * console.log(dequeue(taskQueue));             // 'process-order-123' (removes and returns)
 * 
 * clear(taskQueue);                            // empty the queue instantly
 * ```
 */

///////////////////////
// Core Data Types   //
///////////////////////

/**
 * Represents a circular buffer-based queue for efficient FIFO operations.
 * 
 * @template T - The type of elements stored in the queue
 */
export interface Queue<T> {
  /** The backing array that holds queue elements */
  items: T[];
  /** Index pointing to the front element (next to dequeue) */
  head: number;
  /** Index pointing to where the next element will be added */
  tail: number;
  /** Current number of elements in the queue */
  size: number;
  /** Maximum capacity of the queue */
  capacity: number;
}

////////////////////////////
// Factory & Core Setup   //
////////////////////////////

/**
 * Creates a new empty queue with the specified capacity.
 * 
 * The queue uses a circular buffer internally, which means operations
 * like enqueue and dequeue run in constant O(1) time regardless of 
 * queue size.
 *
 * @param capacity - Maximum number of elements the queue can hold (default: 1000)
 * @returns A new empty queue ready for use
 * 
 * @example
 * ```
 * const messageQueue = createQueue<string>(50);   // for messages
 * const numberQueue = createQueue<number>();      // uses default capacity
 * ```
 */
export function createQueue<T>(capacity: number = 1000): Queue<T> {
  return {
    items: new Array<T>(capacity),
    head: 0,
    tail: 0,
    size: 0,
    capacity
  };
}

/////////////////////////
// Core Queue Operations //
/////////////////////////

/**
 * Adds an element to the back of the queue (FIFO: last in, first served).
 * Runs in O(1) constant time.
 *
 * @param queue - The target queue
 * @param item - Element to add to the queue
 * @throws Error if the queue is at capacity
 * 
 * @example
 * ```
 * enqueue(userQueue, { id: 123, name: 'Alice' });
 * enqueue(userQueue, { id: 124, name: 'Bob' });
 * ```
 */
export function enqueue<T>(queue: Queue<T>, item: T): void {
  if (isFull(queue)) {
    throw new Error(`Queue overflow: cannot add item, capacity ${queue.capacity} reached`);
  }
  
  queue.items[queue.tail] = item;
  queue.tail = (queue.tail + 1) % queue.capacity;  // wrap around using modulo
  queue.size++;
}

/**
 * Removes and returns the front element from the queue (FIFO: first in, first out).
 * Runs in O(1) constant time.
 *
 * @param queue - The target queue  
 * @returns The front element, or undefined if queue is empty
 * 
 * @example
 * ```
 * const nextTask = dequeue(taskQueue);
 * if (nextTask) {
 *   console.log('Processing:', nextTask);
 * }
 * ```
 */
export function dequeue<T>(queue: Queue<T>): T | undefined {
  if (isEmpty(queue)) {
    return undefined;
  }
  
  const item = queue.items[queue.head];
  queue.items[queue.head] = undefined as unknown as T;  // help garbage collector
  queue.head = (queue.head + 1) % queue.capacity;       // wrap around
  queue.size--;
  
  return item;
}

/**
 * Returns the front element without removing it from the queue.
 * Useful for checking what's next without consuming it.
 * Runs in O(1) constant time.
 *
 * @param queue - The target queue
 * @returns The front element, or undefined if queue is empty
 * 
 * @example
 * ```
 * const nextInLine = peek(queue);
 * if (nextInLine?.priority === 'urgent') {
 *   // handle urgent task immediately
 *   dequeue(queue);
 * }
 * ```
 */
export function peek<T>(queue: Queue<T>): T | undefined {
  return isEmpty(queue) ? undefined : queue.items[queue.head];
}

////////////////////////////////
// Utility & Status Functions //
////////////////////////////////

/**
 * Checks if the queue contains no elements.
 * 
 * @param queue - The target queue
 * @returns true if the queue is empty, false otherwise
 */
export function isEmpty<T>(queue: Queue<T>): boolean {
  return queue.size === 0;
}

/**
 * Checks if the queue has reached its maximum capacity.
 * 
 * @param queue - The target queue
 * @returns true if the queue is full, false otherwise
 */
export function isFull<T>(queue: Queue<T>): boolean {
  return queue.size >= queue.capacity;
}

/**
 * Returns the current number of elements in the queue.
 * 
 * @param queue - The target queue
 * @returns Current queue size (0 to capacity)
 */
export function getSize<T>(queue: Queue<T>): number {
  return queue.size;
}

/**
 * Returns how many more elements can be added before hitting capacity.
 * 
 * @param queue - The target queue  
 * @returns Number of available slots
 * 
 * @example
 * ```
 * if (remainingSpace(queue) < 10) {
 *   console.warn('Queue nearly full, consider processing items');
 * }
 * ```
 */
export function remainingSpace<T>(queue: Queue<T>): number {
  return queue.capacity - queue.size;
}

/////////////////////////////
// Advanced Utility Functions //
/////////////////////////////

/**
 * Empties the queue instantly using the `.length = 0` optimization[87][90].
 * This immediately releases all object references for garbage collection,
 * making it much faster than dequeuing items one by one.
 * 
 * Runs in O(1) constant time regardless of queue size.
 *
 * @param queue - The target queue
 * 
 * @example
 * ```
 * // Instead of: while (!isEmpty(queue)) dequeue(queue);  // O(n)
 * clear(queue);  // O(1) - much faster!
 * ```
 */
export function clear<T>(queue: Queue<T>): void {
  // Fast array truncation - instantly releases references for GC[87][90]
  queue.items.length = 0;
  queue.items.length = queue.capacity;  // restore original capacity
  
  // Reset pointers
  queue.head = 0;
  queue.tail = 0;
  queue.size = 0;
}

/**
 * Creates a new array containing all queue elements in order (front to back).
 * Useful for debugging, logging, or when you need array methods.
 * 
 * Note: This is O(n) operation - use sparingly in performance-critical code.
 *
 * @param queue - The source queue
 * @returns New array with queue elements in FIFO order
 * 
 * @example
 * ```
 * const queueSnapshot = toArray(queue);
 * console.log('Current queue:', queueSnapshot.join(' -> '));
 * 
 * // Process without modifying original queue
 * const urgentItems = queueSnapshot.filter(item => item.priority === 'urgent');
 * ```
 */
export function toArray<T>(queue: Queue<T>): T[] {
  if (isEmpty(queue)) {
    return [];
  }
  
  const result: T[] = [];
  for (let i = 0; i < queue.size; i++) {
    const index = (queue.head + i) % queue.capacity;
    result.push(queue.items[index]);
  }
  return result;
}

/**
 * Applies a function to each element in the queue without modifying it.
 * Elements are visited in FIFO order (front to back).
 * 
 * @param queue - The target queue
 * @param callback - Function to call for each element
 * 
 * @example
 * ```
 * // Log all pending tasks
 * forEach(taskQueue, (task, index) => {
 *   console.log(`Task ${index + 1}: ${task.description}`);
 * });
 * ```
 */
export function forEach<T>(queue: Queue<T>, callback: (item: T, index: number) => void): void {
  for (let i = 0; i < queue.size; i++) {
    const index = (queue.head + i) % queue.capacity;
    callback(queue.items[index], i);
  }
}
