/**
 * Operator groups are split by job so the exported surface is easier to scan.
 *
 * - `core`: array-like transforms
 * - `timing`: scheduling and deadlines
 * - `combination`: follow-up and multi-source coordination
 * - `batch`, `conditional`, `errors`: grouping, decisions, and recovery
 *
 * @module
 */
export * from "./batch.ts";
export * from "./combination.ts";
export * from "./conditional.ts";
export * from "./core.ts";
export * from "./errors.ts";
export * from "./timing.ts";
