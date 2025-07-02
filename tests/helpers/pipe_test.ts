import { test, expect } from "@libs/testing";

import { Observable } from "../../observable.ts";
import { Symbol } from "../../symbol.ts";
import { captureUnhandledOnce } from "../_utils/_uncaught.ts";

// -----------------------------------------------------------------------------
// Basic Push API Tests
// -----------------------------------------------------------------------------

test("Observable.of emits values then completes", () => {
  const results: number[] = [];
  let completed = false;

  const subscription = Observable.of(1, 2, 3).subscribe({
    next: (v) => results.push(v),
    complete: () => { completed = true; },
  });

  // All values emitted synchronously
  expect(results).toEqual([1, 2, 3]);
  // Completion callback invoked
  expect(completed).toBe(true);
  // Subscription closed after complete
  expect(subscription.closed).toBe(true);
});

