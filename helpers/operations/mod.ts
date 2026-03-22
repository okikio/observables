/**
 * Built-in operators fall into a few broad jobs, and these re-exports keep
 * those groups together.
 *
 * - `./core` handles array-like transforms such as `map`, `filter`, and `scan`
 * - `./timing` handles spacing and deadlines such as `debounce` and `timeout`
 * - `./combination` handles follow-up streams such as `mergeMap` and `switchMap`
 * - `./batch`, `./conditional`, and `./errors` handle collection, decisions,
 *   and recovery
 *
 * Import from these grouped paths when the job matters more than the exact file
 * name.
 *
 * @module
 */
export * from "./batch.ts";
export * from "./combination.ts";
export * from "./conditional.ts";
export * from "./core.ts";
export * from "./errors.ts";
export * from "./timing.ts";
