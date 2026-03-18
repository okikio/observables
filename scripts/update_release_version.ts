/**
 * Rewrites the version field in deno.jsonc for semantic-release.
 */

const [version] = Deno.args;

if (typeof version !== "string" || version.length === 0) {
  throw new Error("Expected the next release version as the first argument.");
}

const config_path = new URL("../deno.jsonc", import.meta.url);
const config_text = await Deno.readTextFile(config_path);
const version_pattern = /("version"\s*:\s*")[^"]*(")/;

if (!version_pattern.test(config_text)) {
  throw new Error('Expected deno.jsonc to contain a "version" field.');
}

const next_config_text = config_text.replace(
  version_pattern,
  `$1${version}$2`,
);

await Deno.writeTextFile(config_path, next_config_text);
