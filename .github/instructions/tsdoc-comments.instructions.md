---
description: TSDoc and code comment writing style for this repo
applyTo: "**/*.ts,**/*.tsx"
---

# TSDoc and Comments

## What comments are for

Comments and TSDoc should explain:

- intent
- constraints
- assumptions
- edge cases
- reasoning behind tricky choices
- the concrete rule that must stay true, when that matters

Do not use comments to restate obvious code.

## TSDoc defaults

For public APIs, start with:

- what this thing is
- why it exists
- what problem it solves for the caller
- what the caller gets from using it

Then explain the high-level approach if the implementation model matters.

Prefer compact, flowing prose unless the API is conceptually deep.

Use plain English by default. When a technical term is worth keeping, define it
in grounded language the first time it matters.

Do not stop at a shorter or softer paraphrase if the reader still cannot picture
what the concept means in this codebase.

Good:

- `This scanner is lexical, which means it only recognizes raw delimiter shapes like [[, {{, or ==. It does not decide the final meaning of those characters yet.`
- `This invariant says adjacent token ranges meet exactly at the boundary, so rebuilding the source does not lose or duplicate characters.`

Weak:

- `This scanner is lexical.`
- `This preserves source fidelity.`
- `This maintains an invariant.`

## Section and header discipline in TSDoc

Do not add section headers inside a doc block unless they improve navigation.

A section label must be specific and useful on its own.

Prefer:

- `Type guards, builders, and structural unions`
- `Walking the tree to collect text`
- `Recovery behavior for malformed input`

Avoid:

- `Overview`
- `Details`
- `Usage`
- `How it works`
- `How to work with the tree`

If the prose naturally continues the same idea, use a transition sentence
instead of a header.

## Grounding complex and abstract ideas

When code is non-obvious, explain it in plain English and anchor the explanation
in something concrete.

This especially applies to:

- offset math
- regular expressions
- binary or bitwise logic
- state machines
- performance-sensitive code
- tricky boolean conditions

When useful, include:

- the problem being handled
- the key invariant and what it protects against
- the step-by-step logic
- a short example with real input or output
- an ASCII diagram if it makes the logic easier to follow
- the practical meaning of any jargon that remains

A good explanation answers both of these:

- `What does this term mean?`
- `What does it mean here, in this code?`

## Examples

Use examples for:

- public APIs
- surprising behavior
- edge cases
- config-sensitive behavior

Prefer examples that show a real caller scenario, not a toy snippet with no
context.

## Diagrams and accuracy

Use diagrams only when they make the code easier to understand.

Every diagram and example must match the real behavior of the implementation. Do
not let a simplified explanation teach the wrong contract.

If a name, boundary, or token kind is uncertain, verify it before documenting
it.

## Anti-patterns

- Do not write essay-length doc blocks for simple APIs.
- Do not invent generic section labels.
- Do not restate parameter names without adding meaning.
- Do not explain obvious syntax while skipping the real reasoning.
- Do not use comments to compensate for poor naming when renaming would be
  clearer.
- Do not replace domain jargon with different jargon and call it plain English.
- Do not write comments that sound more certain than the implementation really
  is.
