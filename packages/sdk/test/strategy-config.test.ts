import { strict as assert } from "node:assert";
import test from "node:test";

import { strategyConfigs, strategyList } from "../src/strategies/config.js";

test("all strategy defaults satisfy their schemas", () => {
  for (const config of strategyList) {
    const result = config.schema.safeParse(config.defaults);
    assert.ok(result.success, `defaults for ${config.key} should be valid`);
  }
});

test("invalid SMA crossover params throw schema errors", () => {
  const config = strategyConfigs.sma_crossover;
  const result = config.schema.safeParse({ fastLength: 30, slowLength: 10 });
  assert.ok(!result.success);
});
