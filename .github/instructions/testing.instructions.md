---
description: Test quality standards for this repo
applyTo: "**/*_test.ts,**/*.test.ts"
---

# Testing Rules

## Tools

Use:
- `jsr:@std/testing/bdd` for `describe` and `it`
- `jsr:@std/expect` for assertions
- `npm:fast-check` for property-based tests

Imports should follow this pattern:

```ts
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import * as fc from 'npm:fast-check';
```

Run tests with:

```bash
deno task test
```

## Core principle

Test behavior, not implementation.

Treat each module as a black box. Call the public API and assert on observable results.

Do not assert on private state, internal helpers, or incidental implementation details.

For the parser, prefer testing through:

* `parse()`
* `events()`
* `outlineEvents()`
* `stringify()`
* `tokens()`

## Determinism and independence

* No shared mutable state between tests.
* No ordering dependencies.
* No wall-clock or environment dependence unless explicitly isolated.
* One logical behavior per test.

If a test description needs the word `and`, it is probably two tests.

## Clarity over DRYness

Tests are documentation.

Prefer straightforward setup over clever helper layers that hide intent.

Use the AAA pattern:

* Arrange
* Act
* Assert

Example:

```ts
const input = '== Heading ==';
const tree = parse(input);

expect(tree.children[0].type).toBe('heading');
expect(tree.children[0].depth).toBe(2);
```

Human-written expected values are better than generated expected values that
repeat the implementation logic.

## Property-based tests

Use `fast-check` for invariants.

High-value parser properties include:

* never-throw
* round-trip stability
* event well-formedness
* content preservation where applicable
* idempotence where applicable
* oracle comparison where a trustworthy baseline exists

Example:

```ts
fc.assert(
  fc.property(fc.string(), (s) => {
    const tree = parse(s);
    expect(tree.type).toBe('root');
  }),
);
```

## Edge cases to always cover

* empty input
* single-character input
* single newline
* pure `\r` line endings
* mixed line endings
* null bytes
* astral Unicode characters
* CJK and RTL text
* unclosed markup
* malformed tables
* unusual apostrophe runs
* nested templates and links
* behavior switches
* signatures
* redirects
* nowiki and pre regions
* extremely long lines

For repeated structures such as list items, rows, or arguments, test counts of 0, 1, and 2 to catch off-by-one errors.

## Anti-patterns

* Do not assert giant multi-line strings when a structural assertion is more robust.
* Do not run a code path without asserting anything meaningful about the result.
* Do not over-abstract test helpers.
* Do not rely on timing assertions in normal unit tests.
* Do not test internals when public behavior is available.