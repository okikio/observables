/**
 * Predicate operators answer questions about a stream.
 *
 * They are the stream equivalents of `every()`, `some()`, `find()`, and related
 * array helpers, with one useful difference: they can stop the stream as soon
 * as the answer is already known.
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
 * Returns `true` if every value passes the test.
 *
 * Like `Array.prototype.every()`, it stops early on the first failure.
 *
 * @example Check whether all values are even
 * ```ts
 * import { every, from, pipe } from "./helpers/mod.ts";
 *
 * const result = await pipe(
 *   from([2, 4, 6]),
 *   every((value) => value % 2 === 0),
 * ).toPromise();
 * ```
 * @param predicate - Function to test each value
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

      if (!result) {
        state.finished = true;
        controller.enqueue(false);
        controller.terminate();
      }
    },

    flush(state, controller) {
      if (!state.finished) {
        controller.enqueue(true);
      }
    },
  });
}

/**
 * Returns `true` if at least one value passes the test.
 *
 * Like `Array.prototype.some()`, it stops early on the first match.
 *
 * @example Check whether any value is even
 * ```ts
 * import { from, pipe, some } from "./helpers/mod.ts";
 *
 * const result = await pipe(
 *   from([1, 3, 4]),
 *   some((value) => value % 2 === 0),
 * ).toPromise();
 * ```
 * @param predicate - Function to test each value
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

      if (result) {
        state.finished = true;
        controller.enqueue(true);
        controller.terminate();
      }
    },

    flush(state, controller) {
      if (!state.finished) {
        controller.enqueue(false);
      }
    },
  });
}

/**
 * Finds the first value that passes the test.
 *
 * Like `Array.prototype.find()`, it stops as soon as it finds a match.
 *
 * @example Find the first even value
 * ```ts
 * import { find, from, pipe } from "./helpers/mod.ts";
 *
 * const result = await pipe(
 *   from([1, 3, 4, 6]),
 *   find((value) => value % 2 === 0),
 * ).toPromise();
 * ```
 * @param predicate - Function to test each value
 */
export function find<T>(
  predicate: (value: ExcludeError<T>, index: number) => boolean,
): Operator<T | ObservableError, T | ObservableError> {
  return createStatefulOperator<T | ObservableError, T, IndexedState>({
    name: "find",
    createState: () => ({ index: 0 }),
    transform(chunk, state, controller) {
      const result = predicate(chunk as ExcludeError<T>, state.index++);

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
 * Removes duplicate values and keeps the first time each one appears.
 *
 * You can provide a `keySelector` when uniqueness should be based on one field
 * instead of the whole value.
 *
 * @example Keep only the first time each id appears
 * ```ts
 * import { from, pipe, unique } from "./helpers/mod.ts";
 *
 * const users = [
 *   { id: 1, name: "A" },
 *   { id: 2, name: "B" },
 *   { id: 1, name: "C" },
 * ];
 *
 * const uniqueUsers = pipe(
 *   from(users),
 *   unique((user) => user.id),
 * );
 * ```
 * @param keySelector An optional function to extract a key for uniqueness comparison.
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
 * Emits a value only when it is different from the one before it.
 *
 * This is useful when a source repeats the same state over and over, but you
 * only want the moments where something changes.
 *
 * @example Keep only real state changes
 * ```ts
 * import { changed, from, pipe } from "./helpers/mod.ts";
 *
 * const changedStream = pipe(
 *   from([1, 1, 2, 2, 2, 1, 3]),
 *   changed(),
 * );
 * ```
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