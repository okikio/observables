---
description: Benchmark quality standards for this repo
applyTo: "**/*_bench.ts,**/*bench*.ts"
---

# Benchmarking Rules

This repo uses `mitata`.

## Non-negotiable

Always wrap benchmark results with `do_not_optimize()`.

```ts
import { bench, do_not_optimize } from "npm:mitata";

bench("parse: simple article", () => {
  do_not_optimize(parse(simpleArticle));
});
```

A benchmark that does not consume its result is not trustworthy.

## Prevent constant folding and loop hoisting

Use computed parameters or generated inputs when a constant input could be
hoisted or folded by the engine.

Do not benchmark the same precomputable literal in every iteration when that
would let the engine optimize away meaningful work.

## GC control

Use `.gc('inner')` for allocation-heavy benchmarks.

```ts
bench("parse: large article", () => {
  do_not_optimize(parse(largeArticle));
}).gc("inner");
```

Use `.gc('outer')` when you want lower overhead and can tolerate less stable
per-iteration numbers.

## Scaling benchmarks

Prefer `.range()` for scaling tests instead of manually enumerating many
`.args(...)` values.

## Compare against competitors

Do not make performance claims without baseline comparisons.

Benchmark against relevant alternatives on the same inputs.

Keep competitor and local benchmarks in the same group when possible.

## Benchmark realistic scenarios

Do not rely only on tiny microbenchmarks.

Include representative scenarios such as:

- token-only
- events-only
- full AST
- round-trip
- outline-only
- large real-world article
- pathological input

## Memory and allocation tests

Do not mix ad-hoc heap measurement inside the hot benchmark callback.

Either:

- convert the scenario into a proper mitata benchmark with controlled GC
- or move memory checks into a separate regression-focused test or benchmark
  file

## Anti-patterns

- forgetting `do_not_optimize()`
- benchmarking only happy paths
- benchmarking only tiny synthetic inputs
- using different inputs across libraries while claiming a comparison
- making performance claims without a baseline
- mixing manual heap checks into benchmark callbacks

## Live editing and streaming benchmarks

When incremental or session APIs exist, include benchmarks for:

- keystroke edits
- append-only streaming
- burst edit merges

Measure the full user-relevant operation, not just the cheapest internal
sub-step.
