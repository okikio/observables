/**
 * Bridges semantic-release's calculated version back into deno.jsonc.
 *
 * semantic-release can calculate the next SemVer number and changelog entry for
 * this repository, but it does not natively know how to update a Deno JSONC
 * config file. This script keeps the release workflow small by validating the
 * next version and rewriting only the `version` field, leaving the rest of
 * deno.jsonc untouched.
 */
const semverPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const versionFieldPattern = /("version"\s*:\s*")[^"]*(")/;

/**
 * Returns true when the provided string follows SemVer's `x.y.z` structure,
 * optionally with pre-release or build metadata.
 */
export function isSemVerVersion(version: string): boolean {
  return semverPattern.test(version);
}

/**
 * Rewrites the `version` field in deno.jsonc text while preserving the rest of
 * the file's content and formatting.
 */
export function updateReleaseVersion(
  configText: string,
  version: string,
): string {
  if (!isSemVerVersion(version)) {
    throw new Error(
      `Expected a SemVer-compatible version, received "${version}".`,
    );
  }

  if (!versionFieldPattern.test(configText)) {
    throw new Error('Expected deno.jsonc to contain a "version" field.');
  }

  return configText.replace(versionFieldPattern, `$1${version}$2`);
}

if (import.meta.main) {
  const [version] = Deno.args;

  if (typeof version !== "string" || version.length === 0) {
    throw new Error("Expected the next release version as the first argument.");
  }

  const configPath = new URL("../deno.jsonc", import.meta.url);
  const configText = await Deno.readTextFile(configPath);
  const nextConfigText = updateReleaseVersion(configText, version);

  await Deno.writeTextFile(configPath, nextConfigText);
}
