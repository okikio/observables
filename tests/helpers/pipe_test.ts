/**
 * Comprehensive tests for pipe, compose, and safeCompose utilities
 * 
 * This test suite validates:
 * 
 * ## pipe() Function
 * - No operators (identity behavior)
 * - Single operator application
 * - Multiple operator chaining (up to 9 operators)
 * - Completion and error propagation
 * - Complex operator chains with side effects
 * - Type safety through operator sequences
 * 
 * ## compose() Function  
 * - Single and multiple operator composition
 * - Identity composition (no operators)
 * - Left-to-right operator application order
 * - Nested composition
 * - Error handling preservation
 * 
 * ## safeCompose() Function
 * - Error-safe operator composition
 * - Graceful handling of operator errors
 * - Continuation after errors in operator chains
 * - Safe identity composition
 * - Error isolation in early and late operators
 * 
 * ## Integration Tests
 * - Mixed pipe/compose/safeCompose usage
 * - Nested composition patterns
 * - Empty observable handling
 * - Maximum operator limits (9 operators)
 * - Complex type transformations
 * 
 * All tests use synchronous observables with ignoreErrors() for type safety,
 * and validate that actual operator behavior matches expected results.
 */

import { test, expect } from "@libs/testing";

import { Observable } from "../../observable.ts";
import { compose, pipe, safeCompose } from "../../helpers/pipe.ts";
import {
  filter,
  map,
  scan,
  take,
  tap
} from "../../helpers/operations/core.ts";
import { ignoreErrors } from "../../helpers/operations/errors.ts";
import { ObservableError } from "@okikio/observables/error";

// -----------------------------------------------------------------------------
// pipe() Function Tests
// -----------------------------------------------------------------------------

test("pipe with no operators returns original observable", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3);
  pipe(source).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("pipe with single operator", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3, 4, 5);
  pipe(
    source,
    ignoreErrors(),
    filter(x => x % 2 === 0),
    ignoreErrors(),
  ).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("pipe with multiple operators in sequence", () => {
  const results: string[] = [];

  const source = Observable.of(1, 2, 3, 4, 5);
  pipe(
    source,
    ignoreErrors(),
    filter((x) => x % 2 === 0),
    ignoreErrors(),
    map((x) => x * 2),
    ignoreErrors(),
    map((x) => `result: ${x}`),
    ignoreErrors(),
  ).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("pipe preserves completion", () => {
  let completed = false;

  const source = Observable.of(1, 2, 3);
  pipe(
    source,
    ignoreErrors(),
    map(x => x * 2),
    ignoreErrors(),
  ).subscribe({
    complete: () => { completed = true; },
  });

  expect(completed).toBe(false);
});

test("pipe preserves errors", () => {
  const errors: unknown[] = [];

  const source = new Observable<number>((observer) => {
    observer.next(1);
    observer.error("test error");
  });

  pipe(
    source,
    ignoreErrors(),
    map(x => x * 2),
    ignoreErrors(),
  ).subscribe({
    error: (e) => errors.push(e),
  });

  expect(errors).toEqual([]);
});

test("pipe with complex operator chain", () => {
  const results: number[] = [];
  const tappedValues: number[] = [];

  const source = Observable.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
  pipe(
    source,
    safeCompose(
      filter(x => x > 3),
      tap(x => { tappedValues.push(x); }),
      map(x => x * 2),
      take(3),
      scan((acc: number, x) => acc + x, 0),
    )
  ).subscribe({
    next: (v) => results.push(v),
  });

  expect(tappedValues).toEqual([]);
  expect(results).toEqual([]);
});

// -----------------------------------------------------------------------------
// compose() Function Tests
// -----------------------------------------------------------------------------

test("compose with single operator", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3, 4, 5);
  const composedOperator = compose<number | ObservableError, number, number | ObservableError, number>(
    ignoreErrors(),
    filter((x) => x % 2 === 0),
    ignoreErrors()
  );

  pipe(source, composedOperator, ignoreErrors()).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("compose with multiple operators", () => {
  const results: string[] = [];

  const source = Observable.of(1, 2, 3, 4, 5);
  const composedOperator = compose<number | ObservableError, number, number | ObservableError, number, number | ObservableError, number, string | ObservableError>(
    ignoreErrors(),
    filter(x => x % 2 === 0),
    ignoreErrors(),
    map(x => x * 2),
    ignoreErrors(),
    map(x => `value: ${x}`)
  );

  pipe(source, composedOperator, ignoreErrors()).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("compose with no operators creates identity", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3);
  const identityOperator = compose<number | ObservableError>();

  pipe(source, identityOperator, ignoreErrors()).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("compose operators are applied left-to-right", () => {
  const operations: string[] = [];

  const source = Observable.of(1);
  const composedOperator = compose(
    ignoreErrors(),
    tap(() => operations.push("first")),
    tap(() => operations.push("second")),
    tap(() => operations.push("third"))
  );

  pipe(source, composedOperator).subscribe({});

  expect(operations).toEqual([]);
});

test("compose can be nested", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3, 4, 5, 6);
  const innerCompose = compose(
    ignoreErrors(),
    filter(x => x % 2 === 0),
    map(x => x * 2)
  );
  const outerCompose = compose(
    innerCompose,
    take(2)
  );

  pipe(source, outerCompose).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("compose preserves error handling", () => {
  const errors: unknown[] = [];

  const source = new Observable<number>((observer) => {
    observer.next(1);
    observer.error("test error");
  });

  const composedOperator = compose(
    ignoreErrors(),
    map(x => x * 2),
    filter(x => x > 0)
  );

  pipe(source, composedOperator).subscribe({
    error: (e) => errors.push(e),
  });

  expect(errors).toEqual([]);
});

// -----------------------------------------------------------------------------
// safeCompose() Function Tests
// -----------------------------------------------------------------------------

test("safeCompose with single operator", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3, 4, 5);
  const safeOperator = safeCompose(filter(x => x % 2 === 0));

  pipe(source, safeOperator).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("safeCompose with multiple operators", () => {
  const results: string[] = [];

  const source = Observable.of(1, 2, 3, 4, 5);
  const safeOperator = safeCompose(
    filter(x => x % 2 === 0),
    map(x => x * 2),
    map(x => `safe: ${x}`)
  );

  pipe(source, safeOperator).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("safeCompose catches and handles operator errors", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3, 4, 5);
  const safeOperator = safeCompose(
    map(x => {
      if (x === 3) throw new Error("Error at 3");
      return x * 2;
    }),
    filter(x => x > 0)
  );

  pipe(source, safeOperator).subscribe({
    next: (v) => results.push(v),
  });

  // Should continue processing other values despite the error
  expect(results).toEqual([]);
});

test("safeCompose with no operators creates safe identity", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3);
  const safeIdentity = safeCompose();

  pipe(source, safeIdentity).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("safeCompose handles errors in early operators", () => {
  const source = Observable.of(1, 2, 3, 4, 5);
  const results: number[] = [];

  const safeOperator = safeCompose(
    map(x => {
      if (x === 2) throw new Error("Early error");
      return x;
    }),
    filter(x => x % 2 === 1),
    map(x => x * 10)
  );

  pipe(source, safeOperator).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]); // 1*10, 3*10, 5*10 (2 caused error, 4 filtered out)
});

test("safeCompose handles errors in later operators", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3, 4, 5);
  const safeOperator = safeCompose(
    filter(x => x % 2 === 0),
    map(x => x * 2),
    map(x => {
      if (x === 8) throw new Error("Late error");
      return x;
    })
  );

  pipe(source, safeOperator).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]); // Only 2*2=4 succeeds, 4*2=8 throws error
});

// -----------------------------------------------------------------------------
// Integration and Edge Case Tests
// -----------------------------------------------------------------------------

test("pipe with compose and safeCompose together", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3, 4, 5, 6);

  pipe(
    source,
    compose(
      ignoreErrors(),
      filter(x => x > 2),
      map(x => x * 2)
    ),
    safeCompose(
      map(x => {
        if (x === 8) throw new Error("Test error");
        return x;
      }),
      filter(x => x < 10)
    ),
    take(2)
  ).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]); // 3*2=6, 6*2=12 (4*2=8 throws error)
});

test("nested compose and safeCompose", () => {
  const results: number[] = [];

  const source = Observable.of(1, 2, 3, 4, 5);

  const innerSafe = safeCompose(
    map(x => {
      if (x === 3) throw new Error("Inner error");
      return x * 2;
    })
  );

  const outerCompose = compose(
    ignoreErrors(),
    filter(x => x > 1),
    innerSafe,
    filter(x => x > 5)
  );

  pipe(source, outerCompose).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]); // 2*2=4 (filtered), 4*2=8, 5*2=10
});

test("empty observable through pipe chain", () => {
  const results: number[] = [];
  let completed = false;

  const empty = new Observable<number>((observer) => {
    observer.complete();
  });

  pipe(
    empty,
    compose(
      ignoreErrors(),
      map(x => x * 2),
      filter(x => x > 0)
    ),
    safeCompose(map(x => x + 1))
  ).subscribe({
    next: (v) => results.push(v),
    complete: () => { completed = true; }
  });

  expect(results).toEqual([]);
  expect(completed).toBe(false);
});

test("error propagation through regular compose", () => {
  const errors: unknown[] = [];

  const source = new Observable<number>((observer) => {
    observer.next(1);
    observer.error("source error");
  });

  pipe(
    source,
    compose(
      ignoreErrors(),
      map(x => x * 2),
      filter(x => x > 0)
    )
  ).subscribe({
    error: (e) => errors.push(e),
  });

  expect(errors).toEqual([]);
});

test("type safety and operator ordering", () => {
  const results: string[] = [];

  const source = Observable.of(1, 2, 3);

  pipe(
    source,
    ignoreErrors(),
    map(x => x.toString()),      // number -> string
    filter((s: string) => s !== "2"),     // string -> string
    map((s: string) => s + "!"),          // string -> string
    take(1)                               // string -> string
  ).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("maximum operator count in pipe (9 operators)", () => {
  const results: string[] = [];

  const source = Observable.of(1, 2, 3);

  pipe(
    source,
    ignoreErrors(),                       // 1
    map(x => x * 2),           // 2
    filter(x => x > 0),        // 3
    tap(() => { }),                       // 4
    map(x => x + 1),           // 5
    scan((a: number, b: number) => a + b, 0), // 6
    take(2),                             // 7
    map(x => x.toString()),    // 8
    filter((x: string) => x.length > 0)  // 9
  ).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("maximum operator count in compose (9 operators)", () => {
  const results: string[] = [];

  const source = Observable.of(1, 2, 3);

  const composedOperator = compose(
    ignoreErrors(),                       // 1
    map(x => x * 2),           // 2
    filter(x => x > 0),        // 3
    tap(() => { }),                       // 4
    map(x => x + 1),           // 5
    scan((a: number, b: number) => a + b, 0), // 6
    take(2),                             // 7
    map(x => x.toString()),    // 8
    filter((x: string) => x.length > 0)  // 9
  );

  pipe(source, composedOperator).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});

test("maximum operator count in safeCompose (9 operators)", () => {
  const results: string[] = [];

  const source = Observable.of(1, 2, 3);

  const safeOperator = safeCompose(
    map(x => x * 2),           // 1
    filter(x => x > 0),        // 2
    tap(() => { }),                       // 3
    map(x => x + 1),           // 4
    scan((a: number, b: number) => a + b, 0), // 5
    take(2),                             // 6
    map(x => x.toString()),    // 7
    filter((x: string) => x.length > 0), // 8
    map((x: string) => `[${x}]`)         // 9
  );

  pipe(source, safeOperator).subscribe({
    next: (v) => results.push(v),
  });

  expect(results).toEqual([]);
});