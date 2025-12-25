import { strict as assert } from "node:assert";
import test from "node:test";
import { createReportManifest, type ReportManifest } from "../src/index.js";

test("createReportManifest returns a report manifest with title", () => {
  const manifest = createReportManifest();

  assert.ok(manifest.title);
  assert.equal(typeof manifest.title, "string");
});

test("createReportManifest returns expected placeholder title", () => {
  const manifest = createReportManifest();

  assert.equal(manifest.title, "Crucible Trader Report Placeholder");
});

test("createReportManifest returns readonly structure", () => {
  const manifest = createReportManifest();

  assert.ok(typeof manifest.title === "string");
  assert.equal(Object.keys(manifest).length, 1);
});

test("createReportManifest returns new object on each call", () => {
  const manifest1 = createReportManifest();
  const manifest2 = createReportManifest();

  assert.notEqual(manifest1, manifest2);
  assert.deepEqual(manifest1, manifest2);
});

test("report manifest has correct interface structure", () => {
  const manifest = createReportManifest();
  const props: (keyof ReportManifest)[] = ["title"];

  for (const prop of props) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(manifest, prop),
      `manifest should have property ${prop}`,
    );
  }
});

test("report manifest title is non-empty", () => {
  const manifest = createReportManifest();

  assert.ok(manifest.title.length > 0);
});

test("report manifest title contains expected keywords", () => {
  const manifest = createReportManifest();

  assert.ok(manifest.title.toLowerCase().includes("crucible"));
  assert.ok(manifest.title.toLowerCase().includes("trader"));
  assert.ok(manifest.title.toLowerCase().includes("report"));
});
