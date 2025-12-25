import { strict as assert } from "node:assert";
import test from "node:test";

import type { ZodIssue } from "zod";

import { mapZodIssues } from "./StrategyControls.js";

test("mapZodIssues maps issue paths to messages", () => {
  const issues: ZodIssue[] = [
    {
      code: "too_small",
      path: ["fastLength"],
      message: "too small",
      minimum: 1,
      type: "number",
      inclusive: true,
      exact: false,
    },
    { code: "custom", path: ["slowLength"], message: "must exceed fastLength" },
  ];
  const result = mapZodIssues(issues);
  assert.deepEqual(result, {
    fastLength: "too small",
    slowLength: "must exceed fastLength",
  });
});
