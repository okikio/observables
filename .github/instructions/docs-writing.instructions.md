---
description: Markdown and long-form documentation writing style for this repo
applyTo: "**/*.md"
---

# Documentation Writing

## Core priority

Lead with user benefit before internal mechanics.

When introducing a concept, prefer this narrative order:

1. What it is
2. What problem it solves
3. What the reader gets from it
4. How it works at a high level
5. Examples, assumptions, edge cases, limitations, and deeper detail

Use this as a default shape, not a rigid template.

## Writing style

- Use plain English.
- Define technical terms the first time they matter.
- Ground abstract ideas in something concrete before or while naming them.
- Do not stop at a simpler rewording when the reader still cannot picture the idea.
- Tie explanations to a real behavior, cost, failure mode, example, or downstream benefit.
- Keep a steady narrative flow.
- Prefer transition sentences over unnecessary headers.
- Use active voice.
- Use present tense where practical.
- Use the subject's real name instead of vague passive phrasing.
- Expand acronyms on first use.
- Avoid em dashes.

When a term is unfamiliar or domain-specific, explain it in a way a new reader can picture.

Good:
- `Lexical means we are still looking at the raw text shapes, like [[ or ==, before later stages decide what those characters mean in context.`
- `Idempotent means you can run the same cleanup step again and nothing changes after the first successful pass.`

Weak:
- `Lexical means about raw text shapes before meaning is known.`
- `Idempotent means the operation is idempotent.`

The goal is not just to swap jargon for simpler jargon. The goal is to help the reader build a working mental model.

## Grounding abstract concepts

Abstract explanations need an anchor.

Before using a specialized term, or immediately after introducing it, connect it to at least one of these:
- a concrete input or output
- a real user or caller problem
- a visible behavior in the system
- a cost such as allocation, latency, or complexity
- a failure mode or edge case
- a downstream benefit for maintainers or consumers

Examples:
- Instead of `Tokens preserve source fidelity`, explain that consumers can reconstruct the exact original text because each token points at offsets in the source instead of storing a rewritten value.
- Instead of `This uses structural validation`, explain that the check looks at the shape of the value at runtime, such as whether it has a known `type` string and numeric offsets, without caring which class created it.

If the reader would reasonably ask `So what does that mean here?`, answer that question in the prose.

## Header rules

Add a header only when it improves navigation more than a transition sentence would.

A useful header must do all of these:
- mark a real subject shift
- be specific about what follows
- add information on its own
- still make sense in a document outline

Prefer headers that name:
- the concept being defined
- the decision being justified
- the API or behavior being introduced
- the failure mode or edge case being explained
- the outcome being unlocked

Good:
- `Why the parser never throws`
- `Type guards, builders, and structural unions`
- `Event well-formedness and stack discipline`
- `How range-first text events avoid extra allocation`

Weak:
- `Overview`
- `Usage`
- `Details`
- `How it works`
- `How to use this`

If the next paragraph continues the same idea, do not add a header.

## Grounding abstract ideas

Do not stop at a shorter definition if the reader still cannot picture what is happening.

Bad:
- `Lexical means about raw text shapes before meaning is known.`
- `This function preserves an invariant.`
- `The parser reads delimiters.`

Better:
- `This stage only notices text patterns such as `[[`, `{{`, or `==`. It does not decide what they mean yet. For example, it can see `[[Category:Foo]]`, but a later stage decides whether that becomes a normal link or a category assignment. That early text-only stage is called lexical parsing.`
- `This function keeps one rule true from start to finish: every token starts where the previous token ended, so the token stream covers the whole input with no gaps.`
- `The parser reads marker characters such as `[[`, `]]`, `{{`, and `|`. These markers open, close, or split parts of wiki syntax. Many parser docs call those markers delimiters.`

When explaining a hard idea, try this order:
1. Say what happens in concrete terms.
2. Say why that matters here.
3. Introduce the technical name only if it helps the reader later.

If the reader would likely ask `what does that look like here?`, answer that question immediately.

## Examples and visual aids

Use examples when they materially improve understanding.

Use ASCII diagrams when they clarify:
- structure
- flow
- hierarchy
- state transitions
- algorithm steps

Do not add diagrams just to decorate the prose.

Always explain what the reader is looking at before or after the diagram.
Diagrams must match real behavior in the code or spec. Do not simplify them into something that teaches the wrong thing.

Diagrams must match the real behavior, naming, and invariants of the code. If a diagram would force you to guess, verify the code first or omit the diagram.

## Specs and design notes

For specs, proposals, and design notes, prefer RFC-style structure:

- Problem
- Goals
- Non-goals
- Constraints
- Proposal
- Alternatives
- Risks
- Rollout
- Open questions

Keep decisions concrete. Make trade-offs explicit. State assumptions plainly.

## Anti-patterns

- Do not bury the lede under prerequisites or implementation detail.
- Do not list features before explaining the problem they solve.
- Do not create many tiny headers that simply label the next paragraph.
- Do not hedge with soft filler language when the point can be stated directly.
- Do not explain implementation details before the reader understands why they matter.
- Do not replace one abstract phrase with another abstract phrase and call it clarity.
- Do not use diagrams or examples that overstate certainty beyond what the implementation actually guarantees.
