import { strict as assert } from "node:assert";
import test from "node:test";

const importApiModule = async (baseUrl?: string) => {
  const original = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof baseUrl === "string") {
    process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;
  } else {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  const module = await import(`../src/lib/api.ts?cacheBust=${Math.random()}`);
  if (original) {
    process.env.NEXT_PUBLIC_API_BASE_URL = original;
  } else {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  return module;
};

test("apiRoute normalizes paths and uses default base", async () => {
  const { apiRoute } = await importApiModule(undefined);
  assert.equal(apiRoute("/api/runs"), "http://localhost:3000/api/runs");
  assert.equal(apiRoute("api/runs"), "http://localhost:3000/api/runs");
});

test("apiRoute respects NEXT_PUBLIC_API_BASE_URL override", async () => {
  const { apiRoute } = await importApiModule("http://127.0.0.1:4000");
  assert.equal(apiRoute("/api/runs"), "http://127.0.0.1:4000/api/runs");
});
