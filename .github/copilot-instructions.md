# Repository-wide Copilot Instructions

## What this project is

This repo is `@okikio/observables`, a **spec-faithful TC39 Observable implementation** built on Web Streams for Deno v2+ and modern JavaScript runtimes.

**Core features:**
- TC39 Observable proposal compliance with ergonomic extensions
- Web Streams foundation (native backpressure, memory efficiency)
- 4 error handling modes (pass-through, ignore, throw, manual)
- O(1) circular buffer queue implementation
- Type-safe EventBus and EventDispatcher
- Automatic resource cleanup via `Symbol.dispose` and `Symbol.asyncDispose`
- Tree-shakeable, <4KB bundle size
- Full TypeScript support

**Architecture:**
- `observable.ts` - Core Observable implementation with cold semantics and deterministic teardown
- `queue.ts` - Circular buffer queue (O(1) enqueue/dequeue)
- `events.ts` - EventBus (multicast) and EventDispatcher (type-safe routing)
- `error.ts` - ObservableError with context preservation
- `helpers/operators.ts` - createOperator/createStatefulOperator utilities
- `helpers/operations/` - 19+ composable operators (map, filter, debounce, switchMap, etc.)
- `helpers/utils.ts` - Stream conversion and operator application utilities
- `tests/` - Comprehensive BDD test suite using @std/testing/bdd and @std/expect
- `bench/` - Performance benchmarks using npm:mitata

**Design principles:**
- **Memory safety**: No leaks, deterministic cleanup, backpressure prevents bloat
- **Performance**: O(1) operations, pre-compiled error modes, minimal allocation
- **Standards compliance**: TC39 proposal + Web Streams + TypeScript best practices
- **Developer experience**: Familiar API (like Array.map), clear error messages, progressive documentation

## Working defaults

- Preserve cold semantics for Observables (each subscription gets independent execution)
- Use Web Streams TransformStream as the foundation for operators
- Keep operators pure and composable
- Maintain O(1) performance for queue operations
- Ensure deterministic resource cleanup (teardown callbacks run exactly once)
- Follow TC39 Observable proposal semantics while adding practical ergonomic improvements

## Writing and explanation style

- Use familiar language that a JavaScript developer with 2-3 years of experience would understand.
- Do not assume deep async/reactive programming background.
- Ground abstract concepts in concrete behavior first, then introduce technical terms.
- When explaining Observable/stream concepts, use real-world analogies briefly then return to actual code behavior.
- Explain non-obvious behaviors: cold vs hot, backpressure, error propagation, resource cleanup.
- For performance-sensitive code (queue operations, operator chains), explain the O(n) characteristics.
- Use ASCII diagrams for circular buffer wrapping, event flow, or operator composition when helpful.

Good explanations:
- `Cold semantics means each subscribe() call runs the Observable logic from scratch. If 3 callers subscribe to Observable.of(1,2,3), each gets their own 1,2,3 sequence, not shared state.`
- `The circular buffer uses head/tail pointers that wrap around. When tail reaches capacity, it jumps to 0, reusing slots. This keeps enqueue O(1) instead of Array.shift()'s O(n).`

Weak explanations:
- `This Observable is cold.` (doesn't explain what that means in practice)
- `The queue is efficient.` (doesn't explain the O(1) mechanism)

## Default operating mode

- Be explicit and high-signal.
- Prefer the smallest correct change.
- Do not invent APIs, behavior, or guarantees not visible in the repo.
- When uncertain, state the assumption and give a verification step.
- Prefer TC39 Observable proposal semantics and Web Streams patterns.
- Call out trade-offs when multiple approaches exist (e.g., error mode selection).
- Optimize for tree-shakeability (avoid side effects, prefer named exports).
- Keep memory footprint minimal (important for observables handling large data streams).

## TypeScript and Deno

- Target Deno v2+ with strict TypeScript.
- Use explicit return types at module boundaries.
- Prefer `Iterable` and `AsyncIterable` in public APIs.
- Avoid `any`; use unions, generics, and type narrowing.
- Import types separately: `import type { Observer } from './types.ts'`
- Use explicit `.ts` extensions in imports.
- Run `deno doc --lint mod.ts` after public API changes.

## Testing standards

- Use `jsr:@std/testing/bdd` for describe/it structure.
- Use `jsr:@std/expect` for assertions.
- Test behavior, not implementation details.
- Follow AAA pattern (Arrange, Act, Assert).
- One logical behavior per test.
- No shared mutable state between tests.
- Cover edge cases: empty input, single value, errors, resource cleanup.
- For Observable tests, verify: cold semantics, deterministic teardown, backpressure, error propagation.
- For queue tests, verify: O(1) operations, FIFO order, circular wrapping, capacity limits.
- Run tests with: `deno task test` (includes --trace-leaks for memory leak detection).

## Benchmarking standards

- Use `npm:mitata` for benchmarks.
- Always wrap results with `do_not_optimize()`.
- Use `.gc('inner')` for allocation-heavy benchmarks.
- Include baseline comparisons (e.g., circular buffer vs Array.shift()).
- Test realistic scenarios, not just microbenchmarks.
- Scale tests from small (100 items) to stress (1GB, 1M operations).
- Document expected performance characteristics.
- Run benchmarks with: `deno task bench`.

## Error handling

- Observables support 4 error modes:
  - `pass-through` (default): Errors become ObservableError values
  - `ignore`: Skip errors silently
  - `throw`: Fail fast
  - `manual`: User handles everything
- Choose error mode based on use case (see docs for guidance).
- ObservableError preserves original error, stack, and context.
- Error propagation respects operator chains.

## Resource management

- All subscriptions return objects with `unsubscribe()` method.
- Subscriptions implement Symbol.dispose for `using` syntax.
- EventBus implements Symbol.asyncDispose for `await using`.
- Teardown callbacks run exactly once, even after completion/error.
- Memory leaks prevented by deterministic cleanup.
- Test resource cleanup with `--trace-leaks` flag.

## Public API documentation

For every exported function/interface:
- Explain why it exists and what problem it solves.
- Provide at least 2 examples (common case + edge case).
- Name all `@example` blocks descriptively.
- Explain non-obvious behavior (backpressure, cold semantics, error modes).
- Document performance characteristics (O(1) vs O(n)).
- Include memory/cleanup considerations where relevant.

## Safety and correctness

- Validate inputs at module boundaries.
- Preserve type safety through operator chains.
- Never expose internal state that could break invariants.
- Document thread-safety assumptions (though Observables are generally single-threaded).
- For Web Streams integration, respect backpressure signals.

## Validation commands

After changes, run:

```bash
# Tests (includes memory leak detection)
deno task test

# Type checking
deno check **/*.ts

# Documentation lint
deno doc --lint mod.ts

# Formatting
deno fmt

# Linting
deno lint

# Benchmarks
deno task bench
```

## Instruction routing

More specific instructions live under `.github/instructions/` and apply by file pattern or task type.

When a specific instruction file applies, follow that file for scoped tasks and use this file as the fallback base.

Examples:
- `typescript.instructions.md` for all `.ts` files
- `tsdoc-comments.instructions.md` for TSDoc and comments
- `testing.instructions.md` for test files
- `benchmarking.instructions.md` for benchmark files
- `commit-writing.instructions.md` for commit messages
- `pull-requests.instructions.md` for PR descriptions
- `changelog-writing.instructions.md` for changelog entries
- `code-review.instructions.md` for code reviews
- `docs-writing.instructions.md` for markdown documentation
- `ascii-diagrams.instructions.md` for diagrams
- `valid-url-resources.md` for approved documentation sources

## Common patterns in this codebase

### Observable creation
```ts
const obs = new Observable<T>((observer) => {
  // Emit values
  observer.next(value);
  observer.complete();
  
  // Return cleanup function
  return () => {
    // Cleanup resources
  };
});
```

### Operator composition
```ts
const result = pipe(
  source,
  map(x => x * 2),
  filter(x => x > 10),
  take(5)
);
```

### Resource cleanup
```ts
// Automatic cleanup with 'using'
{
  using sub = observable.subscribe(handleValue);
  // Use subscription...
} // Auto-cleanup on block exit
```

### Error handling
```ts
const operator = createOperator({
  errorMode: 'pass-through', // or 'ignore', 'throw', 'manual'
  transform(value, controller) {
    controller.enqueue(processValue(value));
  }
});
```

## Observables-specific reasoning

- **Cold semantics**: Each subscribe() starts fresh; no shared execution state.
- **Backpressure**: Web Streams handle slow consumers automatically.
- **O(1) queue**: Circular buffer uses head/tail pointers, no array shifting.
- **Error modes**: Different strategies for different use cases (recovery vs fail-fast).
- **Memory safety**: Deterministic teardown prevents leaks; test with --trace-leaks.
- **Type safety**: Full TypeScript support, narrow types at boundaries.

## What makes this library different

Unlike RxJS (100+ operators, 35KB, steep learning curve), this library provides:
- Essential patterns only (19+ operators)
- <4KB bundle size
- TC39 proposal compliance (future-proof)
- 4 error handling modes (vs 1 in RxJS)
- Built-in EventBus (no separate library needed)
- Native resource management (Symbol.dispose/asyncDispose)
- Gentler learning curve (familiar Array-like operators)

## Contributing workflow

1. Install Deno v2+ (via mise or manually)
2. Make changes
3. Run `deno task test` (must pass with no leaks)
4. Run `deno fmt` and `deno lint`
5. Run `deno doc --lint mod.ts` for public API changes
6. Run `deno task bench` for performance-sensitive changes
7. Use Conventional Commits format
8. Create PR with clear behavior description

## When adding new features

- Maintain TC39 Observable proposal compatibility.
- Keep tree-shakeability (avoid side effects).
- Preserve cold semantics for Observables.
- Document error mode behavior.
- Add comprehensive tests (behavior, edge cases, cleanup).
- Add benchmarks for performance-sensitive code.
- Update TSDoc with examples.
- Verify no memory leaks (--trace-leaks).

## When fixing bugs

- Write failing test first.
- Fix implementation.
- Verify no regressions (full test suite).
- Check memory leaks (--trace-leaks).
- Document edge case if non-obvious.
- Consider benchmark impact for hot paths.

## Code review priorities

1. **Correctness**: Does it match TC39 semantics? Handle edge cases?
2. **Resource cleanup**: No memory leaks? Deterministic teardown?
3. **Type safety**: No `any`? Proper narrowing?
4. **Performance**: Maintains O(1) where claimed? No unnecessary allocations?
5. **Documentation**: Clear TSDoc? Examples included?
6. **Tests**: Behavior tested? Edge cases covered? Cleanup verified?
7. **Standards**: Follows instructions? Conventional Commits used?
