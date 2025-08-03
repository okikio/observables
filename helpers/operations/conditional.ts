import type { ExcludeError, Operator } from "../_types.ts";
import { createStatefulOperator } from "../operators.ts";
import { ObservableError } from "../../error.ts";

/**
 * Checks if every item in the stream passes a test.
 *
 * Like `Array.prototype.every()`, it stops and returns `false` on the first
 * failure. If the stream completes without any failures, it returns `true`.
 *
 * @example
 * ```ts
 * import { pipe, every, from } from "./helpers/mod.ts";
 *
 * // Array behavior
 * const allEven = [2, 4, 6].every(n => n % 2 === 0); // true
 * const someOdd = [2, 4, 5].every(n => n % 2 === 0); // false
 *
 * // Stream behavior
 * const allEvenStream = from([2, 4, 6]);
 * const result1 = await pipe(allEvenStream, every(n => n % 2 === 0)).toPromise(); // true
 *
 * const someOddStream = from([2, 4, 5]);
 * const result2 = await pipe(someOddStream, every(n => n % 2 === 0)).toPromise(); // false
 * ```
 *
 * ## Practical Use Case
 *
 * Use `every` to verify that all items in a stream meet a certain condition,
 * such as ensuring all uploaded files are of the correct type or that all
 * API responses were successful.
 *
 * ## Key Insight
 *
 * `every` provides a definitive boolean answer for the entire stream, making
 * it a final, summary operation.
 *
 * @typeParam T - Type of values from the source stream
 * @param predicate - Function to test each value
 * @returns A stream operator that tests all values
 */
export function every<T>(predicate: (value: T, index: number) => boolean) {
  return createStatefulOperator<T, boolean, { index: number, finished: boolean }>({
    name: 'every',
    createState: () => ({ index: 0, finished: false }),
    transform(chunk, state, controller) {
      if (state.finished) return;

      const result = predicate(chunk, state.index++);

      // If the predicate fails, emit false and complete
      if (!result) {
        state.finished = true;
        controller.enqueue(false);
        controller.terminate();
      }
    },

    // If the stream completes and we haven't emitted yet, emit true
    flush(state, controller) {
      if (!state.finished) {
        controller.enqueue(true);
      }
    }
  });
}

/**
 * Checks if at least one item in the stream passes a test.
 *
 * Like `Array.prototype.some()`, it stops and returns `true` on the first
 * success. If the stream completes without any successes, it returns `false`.
 *
 * @example
 * ```ts
 * import { pipe, some, from } from "./helpers/mod.ts";
 *
 * // Array behavior
 * const hasEven = [1, 3, 4].some(n => n % 2 === 0); // true
 * const noEven = [1, 3, 5].some(n => n % 2 === 0); // false
 *
 * // Stream behavior
 * const hasEvenStream = from([1, 3, 4]);
 * const result1 = await pipe(hasEvenStream, some(n => n % 2 === 0)).toPromise(); // true
 *
 * const noEvenStream = from([1, 3, 5]);
 * const result2 = await pipe(noEvenStream, some(n => n % 2 === 0)).toPromise(); // false
 * ```
 *
 * ## Practical Use Case
 *
 * Use `some` to quickly determine if a condition is met by any item in a
 * stream, such as checking for the existence of a specific user permission or
 * detecting if any item in a batch has an error.
 *
 * ## Key Insight
 *
 * `some` is an efficient way to get a "yes" or "no" answer from a stream
 * without processing all the items.
 *
 * @typeParam T - Type of values from the source stream
 * @param predicate - Function to test each value
 * @returns A stream operator that tests for any matching value
 */
export function some<T>(predicate: (value: T, index: number) => boolean): Operator<T, boolean | ObservableError> {
  return createStatefulOperator<T, boolean, { index: number, finished: boolean }>({
    name: 'some',
    createState: () => ({ index: 0, finished: false }),
    transform(chunk, state, controller) {
      if (state.finished) return;

      const result = predicate(chunk, state.index++);

      // If the predicate passes, emit true and complete
      if (result) {
        state.finished = true;
        controller.enqueue(true);
        controller.terminate();
      }
    },

    // If the stream completes and we haven't emitted yet, emit false
    flush(state, controller) {
      if (!state.finished) {
        controller.enqueue(false);
      }
    }
  });
}

/**
 * Finds the first item in the stream that passes a test.
 *
 * Like `Array.prototype.find()`, it stops and emits the first matching item,
 * then immediately completes the stream.
 *
 * @example
 * ```ts
 * import { pipe, find, from } from "./helpers/mod.ts";
 *
 * // Array behavior
 * const firstEven = [1, 3, 4, 6].find(n => n % 2 === 0); // 4
 *
 * // Stream behavior
 * const numberStream = from([1, 3, 4, 6]);
 * const result = await pipe(numberStream, find(n => n % 2 === 0)).toPromise(); // 4
 * ```
 *
 * ## Practical Use Case
 *
 * Use `find` to locate a specific record or event in a stream without needing
 * to process the entire dataset, such as finding the first available time slot
 * or the first user to log in.
 *
 * ## Key Insight
 *
 * `find` is an efficient shortcut to get the first item you care about from a
 * potentially long stream.
 *
 * @typeParam T - Type of values from the source stream
 * @param predicate - Function to test each value
 * @returns A stream operator that finds the first matching value
 */
export function find<T>(predicate: (value: T, index: number) => boolean): Operator<T, T | ObservableError> {
  return createStatefulOperator<T, T, { index: number }>({
    name: 'find',
    createState: () => ({ index: 0 }),
    transform(chunk, state, controller) {
      const result = predicate(chunk, state.index++);

      // If the predicate passes, emit the value and complete
      if (result) {
        controller.enqueue(chunk);
        controller.terminate();
      }
    }
  });
}

/**
 * Removes duplicate values from the stream, keeping only the first occurrence.
 *
 * Like creating a `new Set()` from an array, but for async streams. You can
 * provide a `keySelector` to determine uniqueness based on an object property.
 *
 * @example
 * ```ts
 * import { pipe, unique, from } from "./helpers/mod.ts";
 *
 * // Array behavior
 * const uniqueNumbers = [...new Set([1, 2, 2, 3, 1])]; // [1, 2, 3]
 *
 * // Stream behavior
 * const numberStream = from([1, 2, 2, 3, 1]);
 * const uniqueStream = pipe(numberStream, unique()); // Emits 1, 2, 3
 *
 * // With a key selector
 * const users = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 1, name: 'C' }];
 * const userStream = from(users);
 * const uniqueUserStream = pipe(userStream, unique(user => user.id)); // Emits { id: 1, name: 'A' }, { id: 2, name: 'B' }
 * ```
 *
 * ## Practical Use Case
 *
 * Use `unique` to de-duplicate a stream of events or data, such as processing
 * a list of user IDs where some may appear multiple times, or handling event
 * streams that might emit the same event more than once.
 *
 * ## Key Insight
 *
 * `unique` simplifies de-duplication in asynchronous pipelines, ensuring that
 * downstream operations only run once for each unique item.
 *
 * @typeParam T The type of items in the stream.
 * @typeParam K The type of the key used for uniqueness checks.
 * @param keySelector An optional function to extract a key for uniqueness comparison.
 * @returns An operator that filters out duplicate values.
 */
export function unique<T, K = T>(
  keySelector?: (value: ExcludeError<T>) => K
): Operator<T, ExcludeError<T> | ObservableError> {
  return createStatefulOperator<T, ExcludeError<T> | ObservableError, {
    seen: Set<K>
  }>({
    name: 'unique',
    createState: () => ({ seen: new Set() }),
    transform(chunk, state, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
        return;
      }

      const key = keySelector
        ? keySelector(chunk as ExcludeError<T>)
        : (chunk as unknown as K);

      if (!state.seen.has(key)) {
        state.seen.add(key);
        controller.enqueue(chunk as ExcludeError<T>);
      }
    }
  });
}


/**
 * Emits an item only if it is different from the previous one.
 *
 * This is useful for streams where values can be emitted repeatedly, but you
 * only care about the changes.
 *
 * @example
 * ```ts
 * import { pipe, changed, from } from "./helpers/mod.ts";
 *
 * // No direct Array equivalent, as it depends on sequence.
 *
 * // Stream behavior
 * const valueStream = from([1, 1, 2, 2, 2, 1, 3]);
 * const changedStream = pipe(valueStream, changed()); // Emits 1, 2, 1, 3
 *
 * // With a key selector
 * const userStream = from([
 *   { id: 1, status: 'active' },
 *   { id: 1, status: 'active' },
 *   { id: 1, status: 'inactive' }
 * ]);
 * const statusChangeStream = pipe(userStream, changed(user => user.status));
 * // Emits { id: 1, status: 'active' }, { id: 1, status: 'inactive' }
 * ```
 *
 * ## Practical Use Case
 *
 * Use `changed` to monitor a stream of state updates and only react when the
 * state actually changes. This is common in UI programming for tracking user
 * input or state management.
 *
 * ## Key Insight
 *
 * `changed` filters out noise from repetitive values, allowing you to focus
 * on the moments when something actually changes.
 *
 * @typeParam T The type of items in the stream.
 * @typeParam K The type of the key used for comparison.
 * @param keySelector An optional function to extract a key for comparison.
 * @param compare An optional function to compare two keys for equality.
 * @returns An operator that filters out consecutive duplicate values.
 */