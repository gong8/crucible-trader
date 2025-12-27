import { strict as assert } from "node:assert";
import test from "node:test";

import { JSDOM } from "jsdom";
import { cleanup, render } from "@testing-library/react";
import React from "react";

import { strategyConfigs } from "@crucible-trader/sdk";
import type { ZodIssue } from "zod";

import { StrategyControls, mapZodIssues } from "../src/app/new-run/StrategyControls.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

test("mapZodIssues maps field errors to a lookup object", () => {
  const issues: ReadonlyArray<ZodIssue> = [
    {
      path: ["fastLength"],
      message: "too fast",
      code: "custom",
    } as ZodIssue,
    {
      path: ["slowLength"],
      message: "too slow",
      code: "custom",
    } as ZodIssue,
    {
      path: [],
      message: "ignored",
      code: "custom",
    } as ZodIssue,
  ];

  const mapped = mapZodIssues(issues);
  assert.deepEqual(mapped, { fastLength: "too fast", slowLength: "too slow" });
});

test("StrategyControls renders inputs with expected defaults", (t) => {
  t.after(cleanup);
  const config = strategyConfigs.sma_crossover;

  const { getAllByRole, getByLabelText } = render(
    React.createElement(StrategyControls, {
      config,
      values: config.defaults,
      onChange: () => {},
    }),
  );

  const inputs = getAllByRole("spinbutton");
  assert.equal(inputs.length, config.fields.length);

  const fastInput = getByLabelText(/Fast Length/i) as HTMLInputElement;
  assert.equal(fastInput.value, "5");
  assert.equal(fastInput.min, "1");
  assert.equal(fastInput.step, "1");
});

test("StrategyControls surfaces field errors next to the input", (t) => {
  t.after(cleanup);
  const config = strategyConfigs.sma_crossover;

  const { getByText } = render(
    React.createElement(StrategyControls, {
      config,
      values: config.defaults,
      errors: { fastLength: "must be greater than zero" },
      onChange: () => {},
    }),
  );

  assert.ok(getByText("must be greater than zero"));
});
