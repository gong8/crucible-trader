#!/usr/bin/env node

import { execSync } from "node:child_process";

try {
  const result = execSync('git grep -n "@ts-ignore" -- "*.ts" "*.tsx" || true', {
    encoding: "utf-8",
  });

  if (result.trim()) {
    console.error("❌ Found @ts-ignore comments in the codebase:");
    console.error(result);
    console.error("\nPlease remove @ts-ignore comments and fix the underlying TypeScript errors.");
    process.exit(1);
  }

  console.log("✅ No @ts-ignore comments found");
} catch (error) {
  console.error("Error checking for @ts-ignore:", error.message);
  process.exit(1);
}
