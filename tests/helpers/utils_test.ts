import { test, expect } from "@libs/testing";

import { isTransformStreamOptions, isTransformFunctionOptions } from "../../helpers/utils.ts";
import type { CreateOperatorOptions } from "../../helpers/_types.ts";

// -----------------------------------------------------------------------------
// Type guard tests
// -----------------------------------------------------------------------------

test("isTransformStreamOptions identifies stream options correctly", () => {
  const streamOptions: CreateOperatorOptions<number, string> = {
    name: 'test',
    stream: new TransformStream()
  };

  const functionOptions: CreateOperatorOptions<number, string> = {
    name: 'test',
    transform(chunk, controller) {
      controller.enqueue(String(chunk));
    }
  };

  expect(isTransformStreamOptions(streamOptions)).toBe(true);
  expect(isTransformStreamOptions(functionOptions)).toBe(false);
});

test("isTransformFunctionOptions identifies function options correctly", () => {
  const streamOptions: CreateOperatorOptions<number, string> = {
    name: 'test',
    stream: new TransformStream()
  };

  const functionOptions: CreateOperatorOptions<number, string> = {
    name: 'test',
    transform(chunk, controller) {
      controller.enqueue(String(chunk));
    }
  };

  expect(isTransformFunctionOptions(functionOptions)).toBe(true);
  expect(isTransformFunctionOptions(streamOptions)).toBe(false);
});

test("type guards handle options with both properties", () => {
  const optionsWithBoth = {
    name: 'test',
    stream: new TransformStream(),
    transform(chunk: number, controller: TransformStreamDefaultController<string>) {
      controller.enqueue(String(chunk));
    }
  };

  // Should identify both
  expect(isTransformStreamOptions(optionsWithBoth)).toBe(true);
  expect(isTransformFunctionOptions(optionsWithBoth)).toBe(true);
});
