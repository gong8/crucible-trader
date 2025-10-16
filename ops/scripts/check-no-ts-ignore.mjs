#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const IGNORED_DIRS = new Set([
  ".git",
  ".husky",
  ".next",
  ".pnpm-store",
  "dist",
  "node_modules",
  "out",
  "build",
  "coverage",
  "tmp",
]);

const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".d.ts"]);

const TS_IGNORE_PATTERN = /@ts-ignore/;
let hasError = false;

const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;

    const dotIndex = entry.name.lastIndexOf(".");
    if (dotIndex === -1) continue;

    const ext = entry.name.slice(dotIndex);
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;

    const content = readFileSync(fullPath, "utf8");
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (TS_IGNORE_PATTERN.test(line)) {
        const relativePath = relative(ROOT, fullPath);
        console.error(`Forbidden // @ts-ignore found: ${relativePath}:${index + 1}`);
        hasError = true;
      }
    });
  }
};

walk(ROOT);

if (hasError) {
  process.exit(1);
}
