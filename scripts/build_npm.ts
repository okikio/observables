// deno-lint-ignore-file no-import-prefix no-unversioned-import
/**
 * Builds the npm package from the Deno source using `@deno/dnt`.
 *
 * Run with:
 *   deno task build:npm
 *
 * Output is written to ./npm/ and is gitignored so publish artifacts never
 * leak back into source control.
 */
import { build, emptyDir } from 'jsr:@deno/dnt';
import { parse } from 'jsr:@std/jsonc';

const deno_config_path = new URL('../deno.jsonc', import.meta.url);
const deno_config_text = await Deno.readTextFile(deno_config_path);
const deno_config = parse(deno_config_text) as Record<string, unknown>;

function readConfigString(key: string): string {
	const value = deno_config[key];

	if (typeof value !== 'string') {
		throw new Error(`Unable to find "${key}" in deno.jsonc.`);
	}

	return value;
}

await emptyDir('./npm');

await build({
	entryPoints: [
		'./mod.ts',
		{ name: './error', path: './error.ts' },
		{ name: './types', path: './_types.ts' },
		{ name: './events', path: './events.ts' },
		{ name: './queue', path: './queue.ts' },
		{ name: './observable', path: './observable.ts' },
		{ name: './operators', path: './helpers/mod.ts' },
		{ name: './operations', path: './helpers/operations/mod.ts' },
		{ name: './operations/batch', path: './helpers/operations/batch.ts' },
		{ name: './operations/combination', path: './helpers/operations/combination.ts' },
		{ name: './operations/conditional', path: './helpers/operations/conditional.ts' },
		{ name: './operations/errors', path: './helpers/operations/errors.ts' },
		{ name: './operations/timing', path: './helpers/operations/timing.ts' },
		{ name: './operations/core', path: './helpers/operations/core.ts' },
	],
	outDir: './npm',
	shims: { deno: false },
	typeCheck: 'both',

	// The Deno test suite imports jsr:@std/testing and other Deno-specific test
	// utilities. Running those files through Node would pull Deno-only types into
	// the npm build graph and fail type-checking for reasons unrelated to the
	// published library surface.
	test: false,

	package: {
		name: readConfigString('name'),
		version: readConfigString('version'),
		description: readConfigString('description'),
		license: readConfigString('license'),
		keywords: [
			'observable',
			'observables',
			'reactive',
			'streams',
			'tc39',
			'web-streams',
			'deno',
			'node',
			'bun',
		],
		repository: {
			type: 'git',
			url: 'git+https://github.com/okikio/observables.git',
		},
		bugs: {
			url: 'https://github.com/okikio/observables/issues',
		},
		homepage: 'https://jsr.io/@okikio/observables',

		// dnt generates main/module/types/exports from the entry points above.
		sideEffects: false,
		engines: {
			node: '>=20',
		},
	},

	postBuild() {
		Deno.copyFileSync('LICENSE', 'npm/LICENSE');
		Deno.copyFileSync('README.md', 'npm/README.md');
	},
});
