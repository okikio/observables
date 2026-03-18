import { describe, it } from '@std/testing/bdd';
import { expect } from '@std/expect';

const repo_root = new URL('../', import.meta.url);

function readRepoFile(path: string): string {
	return Deno.readTextFileSync(new URL(path, repo_root));
}

describe('publishing setup', () => {
	it('exposes the npm build task and JSR publish filtering', () => {
		const deno_config = readRepoFile('deno.jsonc');

		expect(deno_config).toContain('"build:npm": "deno run -A scripts/build_npm.ts"');
		expect(deno_config).toContain('"publish": {');
		expect(deno_config).toContain('"npm/"');
		expect(deno_config).toContain('"scripts/"');
	});

	it('stores publishing files in their expected repository locations', () => {
		for (const path of [
			'.github/workflows/ci.yml',
			'.github/workflows/publish.yml',
			'scripts/build_npm.ts',
		]) {
			const stat = Deno.statSync(new URL(path, repo_root));
			expect(stat.isFile).toBe(true);
		}
	});

	it('documents npm install before the JSR bridge fallback', () => {
		const readme = readRepoFile('README.md');

		expect(readme).toContain('npm install @okikio/observables');
		expect(readme).toContain(
			'If you prefer to install through the JSR bridge instead of the npm registry:',
		);
	});
});
