import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";

import {
  isSemVerVersion,
  updateReleaseVersion,
} from "./update_release_version.ts";

describe("isSemVerVersion()", () => {
  it("accepts release and prerelease semver strings", () => {
    expect(isSemVerVersion("1.2.3")).toBe(true);
    expect(isSemVerVersion("1.2.3-beta.1+build.5")).toBe(true);
  });

  it("rejects non-semver version strings", () => {
    expect(isSemVerVersion("1.2")).toBe(false);
    expect(isSemVerVersion("release-next")).toBe(false);
  });

  it("rejects leading zero numeric identifiers", () => {
    expect(isSemVerVersion("01.2.3")).toBe(false);
    expect(isSemVerVersion("1.2.3-01")).toBe(false);
  });
});

describe("updateReleaseVersion()", () => {
  it("rewrites only the version field", () => {
    const configText = [
      "{",
      '  "name": "@okikio/observables",',
      '  "version": "0.0.0",',
      '  "description": "Observables"',
      "}",
    ].join("\n");

    const nextConfigText = updateReleaseVersion(configText, "1.4.0");

    expect(nextConfigText).toBe([
      "{",
      '  "name": "@okikio/observables",',
      '  "version": "1.4.0",',
      '  "description": "Observables"',
      "}",
    ].join("\n"));
  });

  it("throws when the new version is invalid", () => {
    expect(() => updateReleaseVersion('{"version":"0.0.0"}', "next")).toThrow(
      'Expected a SemVer-compatible version, received "next".',
    );
  });

  it("throws when the version field is missing", () => {
    expect(() =>
      updateReleaseVersion('{"name":"@okikio/observables"}', "1.0.0")
    ).toThrow('Expected deno.jsonc to contain a "version" field.');
  });
});
