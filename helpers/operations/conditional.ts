/**
 * Predicate operators answer questions about a stream.
 *
 * Use them when the important result is a decision rather than a transformed
 * value: does every item match, does any item match, where is the first match,
 * or when should processing stop because the answer is already known?
 *
 * These operators are the stream versions of `every()`, `some()`, `find()`,
 * and related array helpers, with the added benefit that they can stop early
 * instead of waiting for the whole source to finish.
 *
 * @module
 */
import type { ExcludeError, Operator } from "../_types.ts";

import { isObservableError, ObservableError } from "../../error.ts";
import { createStatefulOperator } from "../operators.ts";

/**
 * Shared state for predicate operators that count source positions.
 */
interface IndexedPredicateState {
  /** Zero-based index passed to the predicate for the current source value. */
  index: number;
  /** Prevents duplicate output after an early terminal decision. */
  finished: boolean;
}

/**
 * Shared state for operators that need to track only the current source index.
 */
interface IndexedState {
  /** Zero-based index of the current non-error source value. */
  index: number;
}

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
export function every<T>(
  predicate: (value: ExcludeError<T>, index: number) => boolean,
): Operator<T | ObservableError, boolean | ObservableError> {
  return createStatefulOperator<
    T | ObservableError,
    boolean,
    IndexedPredicateState
  >({
    name: "every",
    createState: () => ({ index: 0, finished: false }),
    transform(chunk, state, controller) {
      if (state.finished) return;
      const result = predicate(chunk as ExcludeError<T>, state.index++);

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
    },
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
export function some<T>(
  predicate: (value: ExcludeError<T>, index: number) => boolean,
): Operator<T | ObservableError, boolean | ObservableError> {
  return createStatefulOperator<
    T | ObservableError,
    boolean,
    IndexedPredicateState
  >({
    name: "some",
    createState: () => ({ index: 0, finished: false }),
    transform(chunk, state, controller) {
      if (state.finished) return;
      const result = predicate(chunk as ExcludeError<T>, state.index++);

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
    },
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
export function find<T>(
  predicate: (value: ExcludeError<T>, index: number) => boolean,
): Operator<T | ObservableError, T | ObservableError> {
  return createStatefulOperator<T | ObservableError, T, IndexedState>({
    name: "find",
    createState: () => ({ index: 0 }),
    transform(chunk, state, controller) {
      const result = predicate(chunk as ExcludeError<T>, state.index++);

      // If the predicate passes, emit the value and complete
      if (result) {
        controller.enqueue(chunk);
        controller.terminate();
      }
    },
  });
}

/**
 * Finds the index of the first item in the stream that passes a test.
 *
 * This mirrors `Array.prototype.findIndex()`: it emits the zero-based index of
 * the first matching value, or `-1` if the stream completes without a match.
 *
 * @typeParam T - Type of values from the source stream
 * @param predicate - Function to test each value
 * @returns An operator that emits the first matching index or `-1`
 */
export function findIndex<T>(
  predicate: (value: ExcludeError<T>, index: number) => boolean,
): Operator<T | ObservableError, number | ObservableError> {
  return createStatefulOperator<
    T | ObservableError,
    number,
    IndexedPredicateState
  >({
    name: "findIndex",
    createState: () => ({ index: 0, finished: false }),
    transform(chunk, state, controller) {
      if (state.finished) {
        return;
      }

      const currentIndex = state.index;
      const result = predicate(chunk as ExcludeError<T>, currentIndex);
      state.index++;

      if (result) {
        state.finished = true;
        controller.enqueue(currentIndex);
        controller.terminate();
      }
    },
    flush(state, controller) {
      if (!state.finished) {
        controller.enqueue(-1);
      }
    },
  });
}

/**
 * Emits the value at a specific zero-based source index.
 *
 * Unlike arrays, streams cannot jump to a position directly, so this operator
 * reads and counts values until it reaches the requested slot. If the stream
 * completes first, it emits nothing.
 *
 * @typeParam T - Type of values from the source stream
 * @param targetIndex - Zero-based index to emit
 * @returns An operator that emits at most one value from the requested index
 */
export function elementAt<T>(
  targetIndex: number,
): Operator<T | ObservableError, T | ObservableError> {
  if (!Number.isInteger(targetIndex) || targetIndex < 0) {
    throw new RangeError("elementAt: targetIndex must be a non-negative integer");
  }

  return createStatefulOperator<T | ObservableError, T, IndexedState>({
    name: "elementAt",
    createState: () => ({ index: 0 }),
    transform(chunk, state, controller) {
      if (state.index === targetIndex) {
        controller.enqueue(chunk);
        controller.terminate();
        return;
      }

      state.index++;
    },
  });
}

/**
 * Emits the first value in the stream, optionally constrained by a predicate.
 *
 * Without a predicate this is the Observable equivalent of reading index `0`.
 * With a predicate it behaves like `find()`, but the name is useful when the
 * caller wants to emphasize "take the first match" rather than "search".
 *
 * @typeParam T - Type of values from the source stream
 * @param predicate - Optional test that the first emitted value must satisfy
 * @returns An operator that emits at most one matching value
 */
export function first<T>(): Operator<T | ObservableError, T | ObservableError>;
/**
 * Emits the first value that satisfies the provided predicate.
 */
export function first<T>(
  predicate: (value: ExcludeError<T>, index: number) => boolean,
): Operator<T | ObservableError, T | ObservableError>;
export function first<T>(
  predicate?: (value: ExcludeError<T>, index: number) => boolean,
): Operator<T | ObservableError, T | ObservableError> {
  if (!predicate) {
    return elementAt<T>(0);
  }

  return find(predicate);
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
  keySelector?: (value: ExcludeError<T>) => K,
): Operator<T | ObservableError, ExcludeError<T> | ObservableError> {
  return createStatefulOperator<
    T | ObservableError,
    ExcludeError<T> | ObservableError,
    {
      seen: Set<K>;
    }
  >({
    name: "unique",
    createState: () => ({ seen: new Set() }),
    transform(chunk, state, controller) {
      const key = keySelector
        ? keySelector(chunk as ExcludeError<T>)
        : (chunk as unknown as K);

      if (!state.seen.has(key)) {
        state.seen.add(key);
        controller.enqueue(chunk as ExcludeError<T>);
      }
    },
  });
}

/**
 * Configuration for `changed()`.
 *
 * `by` lets you compare on a derived key instead of the full value.
 * For example, you may want to emit only when `user.id` changes.
 */
export interface ChangedOptions<T, K = ExcludeError<T>> {
  /**
   * Pick the value that should be compared.
   *
   * By default, the full value is compared.
   */
  by?: (value: ExcludeError<T>, index: number) => K;

  /**
   * Decide whether two comparison keys should be treated as the same.
   *
   * By default, `Object.is()` is used.
   */
  equals?: (previous: K, current: K) => boolean;

  /**
   * Whether the first non-error value should be emitted.
   *
   * This defaults to `true`, which is usually what people expect from a
   * "changed" operator.
   */
  emitFirst?: boolean;
}

function defaultBy<T>(value: T): T {
  return value;
}

function defaultEquals<T>(previous: T, current: T): boolean {
  return Object.is(previous, current);
}

/**
 * Emits an item only if it is different from the previous one.
 *
 * This is useful for streams where values can be emitted repeatedly, but you
 * only care about the changes.
 * 
 * Example 1:
 *   source: 1, 1, 2, 2, 3
 *   output: 1, 2, 3
 *
 * Example 2:
 *   source: { id: 1, name: "A" }, { id: 1, name: "B" }, { id: 2, name: "C" }
 *   changed({ by: value => value.id })
 *   output: first item, then the item with id 2
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
export function changed<T, K = ExcludeError<T>>(
  options: ChangedOptions<T, K> = {},
): Operator<T | ObservableError, T | ObservableError> {
  const by = (options.by ??
    defaultBy) as (value: ExcludeError<T>, index: number) => K;

  const equals = (options.equals ??
    defaultEquals) as (previous: K, current: K) => boolean;

  const emitFirst = options.emitFirst ?? true;

  return createStatefulOperator<
    T | ObservableError,
    T | ObservableError,
    {
      hasPrevious: boolean;
      previousKey: K | undefined;
      index: number;
    }
  >({
    name: "changed",

    createState: () => ({
      hasPrevious: false,
      previousKey: undefined,
      index: 0,
    }),

    transform(chunk, state, controller) {
      if (isObservableError(chunk)) {
        controller.enqueue(chunk);
        return;
      }

      const value = chunk as ExcludeError<T>;

      let currentKey: K;

      try {
        currentKey = by(value, state.index++);
      } catch (err) {
        controller.enqueue(
          ObservableError.from(
            err,
            "operator:stateful:changed:by",
            value,
          ) as ObservableError,
        );
        return;
      }

      if (!state.hasPrevious) {
        state.hasPrevious = true;
        state.previousKey = currentKey;

        if (emitFirst) {
          controller.enqueue(value as T);
        }

        return;
      }

      let isSame: boolean;

      try {
        isSame = equals(state.previousKey as K, currentKey);
      } catch (err) {
        controller.enqueue(
          ObservableError.from(
            err,
            "operator:stateful:changed:equals",
            value,
          ) as ObservableError,
        );

        return;
      }

      state.previousKey = currentKey;

      if (!isSame) {
        controller.enqueue(value as T);
      }
    },

    cancel(state) {
      state.hasPrevious = false;
      state.previousKey = undefined;
      state.index = 0;
    },
  });
}