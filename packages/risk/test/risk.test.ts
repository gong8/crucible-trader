import { strict as assert } from "node:assert";
import test from "node:test";
import { createDefaultRiskLimits, type RiskLimits } from "../src/index.js";

test("createDefaultRiskLimits returns expected default values", () => {
  const limits = createDefaultRiskLimits();

  assert.equal(limits.maxDailyLossPct, 3);
  assert.equal(limits.maxPositionPct, 20);
  assert.equal(limits.orderCap, 10);
  assert.equal(limits.killSwitchDrawdownPct, 5);
  assert.equal(limits.cooldownMinutes, 15);
});

test("createDefaultRiskLimits returns readonly object structure", () => {
  const limits = createDefaultRiskLimits();

  assert.ok(typeof limits.maxDailyLossPct === "number");
  assert.ok(typeof limits.maxPositionPct === "number");
  assert.ok(typeof limits.orderCap === "number");
  assert.ok(typeof limits.killSwitchDrawdownPct === "number");
  assert.ok(typeof limits.cooldownMinutes === "number");
});

test("createDefaultRiskLimits returns new object on each call", () => {
  const limits1 = createDefaultRiskLimits();
  const limits2 = createDefaultRiskLimits();

  assert.notEqual(limits1, limits2);
  assert.deepEqual(limits1, limits2);
});

test("default risk limits are positive numbers", () => {
  const limits = createDefaultRiskLimits();

  assert.ok(limits.maxDailyLossPct > 0);
  assert.ok(limits.maxPositionPct > 0);
  assert.ok(limits.orderCap > 0);
  assert.ok(limits.killSwitchDrawdownPct > 0);
  assert.ok(limits.cooldownMinutes >= 0);
});

test("default risk limits are within reasonable ranges", () => {
  const limits = createDefaultRiskLimits();

  // Max daily loss should be a small percentage
  assert.ok(limits.maxDailyLossPct >= 1 && limits.maxDailyLossPct <= 100);

  // Max position should be a reasonable percentage
  assert.ok(limits.maxPositionPct >= 1 && limits.maxPositionPct <= 100);

  // Order cap should be reasonable
  assert.ok(limits.orderCap >= 1 && limits.orderCap <= 100);

  // Kill switch should be a small percentage
  assert.ok(limits.killSwitchDrawdownPct >= 1 && limits.killSwitchDrawdownPct <= 100);

  // Cooldown should be reasonable
  assert.ok(limits.cooldownMinutes >= 0 && limits.cooldownMinutes <= 1440);
});

test("default risk limits have expected property types", () => {
  const limits = createDefaultRiskLimits();
  const props: (keyof RiskLimits)[] = [
    "maxDailyLossPct",
    "maxPositionPct",
    "orderCap",
    "killSwitchDrawdownPct",
    "cooldownMinutes",
  ];

  for (const prop of props) {
    assert.ok(
      typeof limits[prop] === "number",
      `${prop} should be a number, got ${typeof limits[prop]}`,
    );
    assert.ok(Number.isFinite(limits[prop]), `${prop} should be finite`);
    assert.ok(!Number.isNaN(limits[prop]), `${prop} should not be NaN`);
  }
});

test("maxDailyLossPct default allows for reasonable drawdown", () => {
  const limits = createDefaultRiskLimits();
  // 3% daily loss is a standard risk management threshold
  assert.equal(limits.maxDailyLossPct, 3);
});

test("maxPositionPct default prevents over-concentration", () => {
  const limits = createDefaultRiskLimits();
  // 20% max position prevents putting all eggs in one basket
  assert.equal(limits.maxPositionPct, 20);
});

test("orderCap default provides reasonable trade sizing", () => {
  const limits = createDefaultRiskLimits();
  // 10% order cap allows for meaningful positions without excessive risk
  assert.equal(limits.orderCap, 10);
});

test("killSwitchDrawdownPct default protects against catastrophic losses", () => {
  const limits = createDefaultRiskLimits();
  // 5% global drawdown kill switch prevents runaway losses
  assert.equal(limits.killSwitchDrawdownPct, 5);
});

test("cooldownMinutes default allows for recovery period", () => {
  const limits = createDefaultRiskLimits();
  // 15 minutes cooldown gives time to reassess after hitting limits
  assert.equal(limits.cooldownMinutes, 15);
});

test("risk limits are consistent with each other", () => {
  const limits = createDefaultRiskLimits();

  // Kill switch should generally be stricter than daily loss
  assert.ok(limits.killSwitchDrawdownPct >= limits.maxDailyLossPct);

  // Max position should generally be larger than order cap
  assert.ok(limits.maxPositionPct >= limits.orderCap);
});
