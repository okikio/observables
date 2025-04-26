import { test, expect, fn } from "@libs/testing";

import { Observable } from "../observable.ts";
import { Symbol } from "../symbol.ts";

// -----------------------------------------------------------------------------
// Resource Cleanup with Symbol.dispose tests
// -----------------------------------------------------------------------------

test("subscription supports Symbol.dispose for resource cleanup", () => {
  let disposed = false;

  const observable = new Observable(() => {
    return () => { disposed = true; };
  });

  const subscription = observable.subscribe({});

  // Check that Symbol.dispose is implemented
  expect(typeof subscription[Symbol.dispose]).toBe("function");

  // Use Symbol.dispose to clean up
  subscription[Symbol.dispose]();

  // Verify teardown was called
  expect(disposed).toBe(true);
  expect(subscription.closed).toBe(true);
});

test("subscription supports Symbol.asyncDispose for async resource cleanup", async () => {
  let disposed = false;

  const observable = new Observable(() => {
    return () => { disposed = true; };
  });

  const subscription = observable.subscribe({});

  // Check that Symbol.asyncDispose is implemented
  expect(typeof subscription[Symbol.asyncDispose]).toBe("function");

  // Use Symbol.asyncDispose to clean up asynchronously
  await subscription[Symbol.asyncDispose]();

  // Verify teardown was called
  expect(disposed).toBe(true);
  expect(subscription.closed).toBe(true);
});