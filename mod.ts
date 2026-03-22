/**
 * Main package entrypoint for creating, transforming, and consuming values
 * that arrive over time.
 *
 * The export surface is easiest to read by job:
 *
 * ```text
 * source        -> Observable / Observable.of / Observable.from
 * transform     -> pipe(...operators)
 * consume       -> subscribe / forEach / for await / pull
 * share events  -> EventBus / createEventDispatcher
 * recover       -> catchErrors / mapErrors / throwErrors
 * ```
 *
 * Read that from top to bottom: create a source, pass it through operators,
 * choose how to consume it, and decide what should happen when a value fails.
 *
 * @module
 */
export * from "./observable.ts";
export * from "./error.ts";
export * from "./events.ts";
export * from "./helpers/mod.ts";

export type * from "./_types.ts";
