/**
 * Re-exported operator groups for the `./operations` entrypoint.
 *
 * @module
 *
 * This module gives callers one place to import the built-in Observable
 * operations without knowing which submodule each operator lives in. It
 * forwards the batch, combination, conditional, core, error, and timing
 * operator groups that make up the public `./operations` surface.
 */
export * from "./batch.ts";
export * from "./combination.ts";
export * from "./conditional.ts";
export * from "./core.ts";
export * from "./errors.ts";
export * from "./timing.ts";
