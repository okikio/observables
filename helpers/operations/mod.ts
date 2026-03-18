/**
 * Category-level entrypoint for the built-in Observable operations.
 *
 * This module gathers every operator category that powers the higher-level
 * `./operators` entrypoint. It is useful when you want a focused import path
 * for documentation and discovery, but still want access to the full built-in
 * operator set from one module.
 *
 * The re-exports are grouped by job:
 * - `./core` covers the array-like transformations and terminal operators
 * - `./timing` covers time-based coordination such as debounce and timeout
 * - `./combination` covers flattening and concurrency helpers such as
 *   `mergeMap`, `concatMap`, and `switchMap`
 * - `./batch`, `./conditional`, and `./errors` cover collection, predicate, and
 *   recovery-focused utilities
 *
 * @module
 */
export * from "./batch.ts";
export * from "./combination.ts";
export * from "./conditional.ts";
export * from "./core.ts";
export * from "./errors.ts";
export * from "./timing.ts";
