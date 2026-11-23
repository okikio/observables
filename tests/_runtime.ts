/**
 * The runtime that is running the tests: `deno`, `bun`, `node` or `unknown`.
 *
 * `@libs/testing` 6 dropped its cross-runtime `test()` helper and this `runtime` export. Tests now use `node:test`,
 * which Deno, Bun and Node.js all provide, and gate runtime-specific cases on this value.
 *
 * @module
 */

const host = globalThis as {
  Deno?: unknown;
  Bun?: unknown;
  process?: { versions?: { node?: string } };
};

/** Current runtime name. */
export const runtime: "deno" | "bun" | "node" | "unknown" = host.Deno
  ? "deno"
  : host.Bun
  ? "bun"
  : host.process?.versions?.node
  ? "node"
  : "unknown";
