// deno-lint-ignore-file no-import-prefix
/**
 * Builds the npm package from the Deno source using `@deno/dnt`.
 *
 * Run with:
 *   deno task build:npm
 *
 * Output is written to ./npm/ and is gitignored so publish artifacts never
 * leak back into source control.
 */
import { build, emptyDir } from "jsr:@deno/dnt@^0.42.3";
import { parse } from "jsr:@std/jsonc@^1.0.2";

const denoConfigPath = new URL("../deno.jsonc", import.meta.url);
const denoConfigText = await Deno.readTextFile(denoConfigPath);
const denoConfig = parse(denoConfigText) as Record<string, unknown>;

function readConfigString(key: string): string {
  const value = denoConfig[key];

  if (typeof value !== "string") {
    throw new Error(`Unable to find "${key}" in deno.jsonc.`);
  }

  return value;
}

await emptyDir("./npm");

await build({
  entryPoints: [
    "./mod.ts",
    { name: "./error", path: "./error.ts" },
    { name: "./types", path: "./_types.ts" },
    { name: "./events", path: "./events.ts" },
    { name: "./queue", path: "./queue.ts" },
    { name: "./observable", path: "./observable.ts" },
    { name: "./operators", path: "./helpers/mod.ts" },
    { name: "./operations", path: "./helpers/operations/mod.ts" },
    { name: "./operations/batch", path: "./helpers/operations/batch.ts" },
    {
      name: "./operations/combination",
      path: "./helpers/operations/combination.ts",
    },
    {
      name: "./operations/conditional",
      path: "./helpers/operations/conditional.ts",
    },
    { name: "./operations/errors", path: "./helpers/operations/errors.ts" },
    { name: "./operations/timing", path: "./helpers/operations/timing.ts" },
    { name: "./operations/core", path: "./helpers/operations/core.ts" },
  ],
  outDir: "./npm",
  shims: { deno: false },

  // Keep dnt's Node-oriented type-check pass enabled so the transformed npm
  // package is validated against the closest Node surface this dnt release can
  // express, not just Deno's default type environment.
  typeCheck: 'both',
  compilerOptions: {
    // dnt 0.42.3 cannot express an ES2024 target yet, so Promise.withResolvers
    // still has to come from an ESNext lib even though Node 24 supports it at
    // runtime. Keep the future-facing libs narrow to the features this package
    // actually uses.
    target: 'Latest',
    lib: ['ES2023', 'DOM', 'DOM.Iterable', 'ESNext', 'ESNext.Promise', 'ESNext.Disposable'],
  },

  // The Deno test suite imports jsr:@std/testing and other Deno-specific test
  // utilities. Running those files through Node would pull Deno-only types into
  // the npm build graph for reasons unrelated to the published library surface.
  test: false,
  rootTestDir: './tests',

  package: {
    name: readConfigString("name"),
    version: readConfigString("version"),
    description: readConfigString("description"),
    license: readConfigString("license"),
    author: "okikio",
    keywords: [
      "observable",
      "observables",
      "reactive",
      "streams",
      "tc39",
      "web-streams",
      "deno",
      "node",
      "bun",
    ],
    repository: {
      type: "git",
      url: "git+https://github.com/okikio/observables.git",
    },
    bugs: {
      url: "https://github.com/okikio/observables/issues",
    },
    homepage: "https://github.com/okikio/observables#readme",

    // dnt generates main, module, types, and exports from the declared entry
    // points, so the remaining fields here only describe npm metadata.
    sideEffects: false,
    publishConfig: {
      access: "public",
      provenance: true,
    },
    engines: {
      node: ">=24",
    },
  },

  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
