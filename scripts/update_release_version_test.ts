import {
  isSemVerVersion,
  updateReleaseVersion,
} from "./update_release_version.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("accepts release and prerelease semver strings", () => {
  assert(isSemVerVersion("1.2.3"), "expected 1.2.3 to be valid semver");
  assert(
    isSemVerVersion("1.2.3-beta.1+build.5"),
    "expected prerelease with metadata to be valid semver",
  );
});

Deno.test("rejects non-semver version strings", () => {
  assert(!isSemVerVersion("1.2"), "expected 1.2 to be rejected");
  assert(
    !isSemVerVersion("release-next"),
    "expected release-next to be rejected",
  );
});

Deno.test("rewrites only the version field", () => {
  const configText = [
    "{",
    '  "name": "@okikio/observables",',
    '  "version": "0.0.0",',
    '  "description": "Observables"',
    "}",
  ].join("\n");

  const nextConfigText = updateReleaseVersion(configText, "1.4.0");

  assert(
    nextConfigText === [
      "{",
      '  "name": "@okikio/observables",',
      '  "version": "1.4.0",',
      '  "description": "Observables"',
      "}",
    ].join("\n"),
    "expected only the version field to change",
  );
});

Deno.test("throws when the new version is invalid", () => {
  let thrownError: unknown;

  try {
    updateReleaseVersion('{"version":"0.0.0"}', "next");
  } catch (error) {
    thrownError = error;
  }

  if (!(thrownError instanceof Error)) {
    throw new Error("expected an Error to be thrown");
  }

  assert(
    thrownError.message ===
      'Expected a SemVer-compatible version, received "next".',
    "expected the invalid version error message",
  );
});

Deno.test("throws when the version field is missing", () => {
  let thrownError: unknown;

  try {
    updateReleaseVersion('{"name":"@okikio/observables"}', "1.0.0");
  } catch (error) {
    thrownError = error;
  }

  if (!(thrownError instanceof Error)) {
    throw new Error("expected an Error to be thrown");
  }

  assert(
    thrownError.message === 'Expected deno.jsonc to contain a "version" field.',
    "expected the missing version field error message",
  );
});
