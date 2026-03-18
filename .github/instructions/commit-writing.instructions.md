---
description: Commit message writing standards for this repo
applyTo: "**"
---

# Commit messages

Apply these rules only when writing or revising commit messages.

Do not apply these rules to changelog entries, release notes, docs, PR prose,
code comments, or TSDoc unless the task is specifically about commit messages.

A commit message is not just a Git label. It is a durable record for other
developers reading history later to understand what changed, why it changed, and
how the change should be interpreted.

Write commit messages so a reader can understand the important change without
opening the diff first.

Keep commit messages changelog-friendly, but do not write them like polished
release notes. A commit should preserve implementation-relevant detail that may
later help someone write a changelog.

## Core goal

Each commit message should make these questions easy to answer:

1. What changed?
2. Why did it matter?
3. What behavior, workflow, edge case, or maintenance outcome changed?
4. Does this have migration or upgrade impact?
5. If a future changelog writer reads this commit, what details are worth
   carrying forward?

The subject is the scan line. The body is where nuance goes.

## Subject format

Use Conventional Commits.

Use this shape:

`type(scope?): short precise outcome summary`

Replace `type`, `scope`, and the summary with real values. Do not output
placeholder text literally. Do not use vague explanation verbs such as
`clarify`, `explain`, `document`, `improve`, or `update` unless the rest of the
subject names the exact fact, contract, rule, behavior, or workflow being
documented.

Good:

- `fix(parser): preserve trailing blank lines in stringify`
- `feat(events): add outline-only section events`
- `docs(instructions): clarify commit body expectations`
- `perf(tokenizer): avoid substring allocation in delimiter scan`

Bad:

- `<type>(<scope>): <description>`
- `fix: improve parser`
- `chore: update stuff`
- `docs: update instructions`

## Subject rules

- Use lowercase for the type.
- Use a single space after the colon.
- Do not end the subject with a period.
- Keep the subject specific and outcome-focused.
- Describe the result, not just the activity.
- Name the actual behavior, workflow, edge case, or repository outcome that
  changed.
- Avoid filler verbs such as `improve`, `update`, `enhance`, `clean up`, or
  `address` unless the object makes the change concrete.
- Prefer the most important outcome when the commit includes several changes.

Good:

- `fix(ast): keep heading end offsets aligned after recovery`
- `feat(cli): add --json extraction summary output`
- `docs(parser): explain why recovery never throws`

Bad:

- `fix: improve parsing`
- `feat: add new option`
- `refactor: clean up code`
- `docs: improve docs`

## Choosing the subject when a commit has several changes

A commit often includes one main change and several supporting changes.

The subject should name the highest-value outcome. The body should capture the
important secondary details.

Do not turn the subject into a shopping list.

Bad:

- `fix(parser): handle headings, tables, and links better`

Better:

- `fix(parser): recover table parsing after unmatched row delimiter`

Body:

- stop recovery from swallowing following link tokens
- preserve heading parsing after malformed tables
- add regression coverage for mixed table and heading input

## When to add a body

Add a body when any of these are true:

- the change is not obvious from the subject alone
- the commit changes more than one important case
- the change is subtle or easy to misunderstand
- the commit has migration or upgrade impact
- the commit is likely to matter in a future changelog
- the subject would be accurate but incomplete without context

A good body explains:

- what was wrong or limited before
- what is true now
- the most important cases covered
- any migration, upgrade, compatibility, or rollout note if relevant

Prefer short bullets or short paragraphs. Keep the body concrete. Do not waste
the body on empty filler.

Good:

- previously the final blank line could disappear when the source ended in
  `\r\n`
- stringify now preserves the original trailing blank line count
- keeps roundtrip output stable for range-based consumers

Weak:

- improve behavior
- add tests
- cleanup
- various fixes

## Type-specific precision rules

Different commit types need different kinds of specificity.

### feat

For `feat`, say what new capability now exists.

Good:

- `feat(events): add outline-only section events`
- `feat(cli): add --json extraction summary output`

Avoid:

- `feat: add support`
- `feat: improve API`

### fix

For `fix`, say what broken behavior now works correctly.

Good:

- `fix(tokenizer): stop merging adjacent pipe runs across template boundaries`
- `fix(stringify): preserve trailing blank lines in CRLF input`

Avoid:

- `fix: improve parser`
- `fix: handle edge cases`

### docs

For `docs`, name the specific fact, contract, rule, workflow, guarantee,
limitation, or migration step that the docs now make clear.

Good:

- `docs(text_source): explain that plain strings satisfy the TextSource contract`
- `docs(parser): document why recovery never throws`
- `docs(events): define stack balancing rules for nested sections`
- `docs(api): describe when callers must preserve UTF-16 offsets`

Avoid:

- `docs: update docs`
- `docs: improve readme`
- `docs: clarify usage`
- `docs(text_source): clarify purpose and usage of TextSource interface`

Do not describe the writing effort in vague terms such as `clarify`, `improve`,
or `update` unless the rest of the subject names the exact thing that is now
easier to understand.

### refactor

For `refactor`, say what internal structure changed and why that matters.

Good:

- `refactor(events): split section balancing from text emission`
- `refactor(parser): isolate table recovery from inline parsing`

Avoid:

- `refactor: clean up code`
- `refactor: reorganize internals`

Use `refactor` only when there is no intended behavior change.

### perf

For `perf`, say what got faster, smaller, or cheaper.

Good:

- `perf(tokenizer): avoid substring allocation in delimiter scan`
- `perf(stringify): reduce intermediate joins for large table output`
- `perf(events): reuse section frame objects during recovery`

Avoid:

- `perf: improve performance`
- `perf: optimize code`

If the improvement is measurable and worth mentioning, say what improved in the
body such as allocation count, hot-path work, latency, or steady-state
throughput.

### test

For `test`, say what behavior is now protected.

Good:

- `test(parser): add regression case for malformed heading recovery`
- `test(tokenizer): cover adjacent pipe runs across template boundaries`
- `test(stringify): verify trailing blank line preservation with CRLF input`

Avoid:

- `test: add tests`
- `test: improve coverage`

### bench

For `bench`, say what benchmark coverage or measurement trust improved.

Good:

- `bench(tokenizer): add malformed table hot-path scenarios`
- `bench(parser): separate recovery cases from steady-state runs`
- `bench(stringify): compare CRLF roundtrip cost against baseline`

Avoid:

- `bench: add benchmarks`
- `bench: improve perf tests`

### chore

For `chore`, say what maintenance outcome changed.

Good:

- `chore(deps): pin jsr imports for reproducible installs`
- `chore(repo): remove generated parser snapshots from source control`
- `chore(scripts): standardize release script argument parsing`

Avoid:

- `chore: clean up repo`
- `chore: maintenance`
- `chore: update dependencies`

Do not use `chore` as a bucket for meaningful fixes, behavior changes, or
performance work.

### build

For `build`, say what build, packaging, or dependency behavior changed.

Good:

- `build(npm): include generated type maps in published package`
- `build(jsr): stop bundling fixture files into release tarballs`

### ci

For `ci`, say what pipeline or automation behavior changed.

Good:

- `ci(actions): fail release workflow when changelog generation is missing`
- `ci(test): run parser regression suite on pull requests`

## Scopes

Use a scope when it helps a reader locate the area of change quickly.

Good scopes:

- `parser`
- `tokenizer`
- `events`
- `ast`
- `stringify`
- `cli`
- `instructions`
- `deps`
- `repo`
- `scripts`

Avoid vague scopes such as:

- `misc`
- `general`
- `stuff`

Skip the scope if it does not add useful meaning.

## Breaking changes

Mark breaking changes with `!` and explain the migration impact in the body or
footer.

Example:

```text
feat(api)!: remove implicit trim from align()

BREAKING CHANGE: Callers that relied on implicit trimming must call trimEnd() explicitly before align().
```

A breaking commit must make these things clear:

- what changed
- who is affected
- what they now need to do

## Anti-patterns

Avoid:

- typeless commits
- WIP commits on main
- vague subjects
- issue or PR numbers in the subject
- subjects that describe effort instead of result
- internal implementation detail with no meaning to later readers
- bodies that only say `add tests`, `cleanup`, or `misc fixes`
- using `chore` or `refactor` to hide meaningful behavior changes

## Final check

Before finalizing a commit message, check:

- Can another developer tell what changed from the subject alone?
- If they read the body too, can they understand the problem and outcome without
  opening the diff?
- Would a future changelog writer know what details are worth carrying forward?
- If the commit is breaking, is the migration impact explicit?
- If the commit has several important changes, does the body capture the
  secondary details clearly?
