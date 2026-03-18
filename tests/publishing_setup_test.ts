// deno-lint-ignore-file no-import-prefix
import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";

const repo_root = new URL("../", import.meta.url);

function readRepoFile(path: string): string {
  return Deno.readTextFileSync(new URL(path, repo_root));
}

describe("publishing setup", () => {
  it("exposes the npm build task and JSR publish filtering", () => {
    const deno_config = readRepoFile("deno.jsonc");

    expect(deno_config).toContain(
      '"build:npm": "deno run -A scripts/build_npm.ts"',
    );
    expect(deno_config).toContain('"publish": {');
    expect(deno_config).toContain('"npm/"');
    expect(deno_config).toContain('"scripts/"');
    expect(deno_config).toContain('"exclude": [');
  });

  it("stores publishing files in their expected repository locations", () => {
    for (
      const path of [
        ".github/workflows/ci.yml",
        ".github/workflows/publish.yml",
        "scripts/build_npm.ts",
      ]
    ) {
      const stat = Deno.statSync(new URL(path, repo_root));
      expect(stat.isFile).toBe(true);
    }
  });

  it("lets publish-only retries target npm or JSR independently", () => {
    const publish_workflow = readRepoFile(".github/workflows/publish.yml");

    expect(publish_workflow).toContain("default: both");
    expect(publish_workflow).toContain("- both");
    expect(publish_workflow).toContain("- jsr");
    expect(publish_workflow).toContain("- npm");
    expect(publish_workflow).toContain(
      "DISPATCH_TARGET: ${{ inputs.target }}",
    );
    expect(publish_workflow).toContain(
      "publish_jsr: ${{ steps.resolve.outputs.publish_jsr }}",
    );
    expect(publish_workflow).toContain(
      "publish_npm: ${{ steps.resolve.outputs.publish_npm }}",
    );
    expect(publish_workflow).toContain(
      "always() && needs.resolve-release.outputs.publish_jsr == 'true'",
    );
    expect(publish_workflow).toContain(
      "always() && needs.resolve-release.outputs.publish_npm == 'true'",
    );
  });

  it("pins publishing-script JSR imports to explicit versions", () => {
    const build_script = readRepoFile("scripts/build_npm.ts");

    expect(build_script).toContain("jsr:@deno/dnt@^0.42.3");
    expect(build_script).toContain("jsr:@std/jsonc@^1.0.2");
  });

  it("documents npm install before the JSR bridge fallback", () => {
    const readme = readRepoFile("README.md");

    expect(readme).toContain("npm install @okikio/observables");
    expect(readme).toContain(
      "If you prefer to install through the JSR bridge instead of the npm registry:",
    );
  });
});
