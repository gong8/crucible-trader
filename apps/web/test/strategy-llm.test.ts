import { strict as assert } from "node:assert";
import test from "node:test";

import {
  STRATEGY_LLM_HEADER,
  extractCodeBlock,
  strategyLLMRequestSchema,
  llmProviders,
  llmProviderMeta,
} from "../src/lib/strategy-llm.js";

// ============================================================================
// extractCodeBlock tests - Critical for parsing LLM responses
// ============================================================================

test("extractCodeBlock extracts code from triple-backtick with ts language", () => {
  const input = "```ts\nconst x = 1;\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "const x = 1;");
});

test("extractCodeBlock extracts code from triple-backtick with typescript language", () => {
  const input = "```typescript\nconst x = 1;\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "const x = 1;");
});

test("extractCodeBlock extracts code from triple-backtick without language specifier", () => {
  const input = "```\nconst x = 1;\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "const x = 1;");
});

test("extractCodeBlock trims whitespace from extracted code", () => {
  const input = "```ts\n\n  const x = 1;  \n\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "const x = 1;");
});

test("extractCodeBlock returns trimmed raw string when no code block found", () => {
  const input = "  Just some plain text  ";
  const result = extractCodeBlock(input);
  assert.equal(result, "Just some plain text");
});

test("extractCodeBlock handles code with newlines correctly", () => {
  const input = "```ts\nconst x = 1;\nconst y = 2;\nconsole.log(x + y);\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "const x = 1;\nconst y = 2;\nconsole.log(x + y);");
});

test("extractCodeBlock extracts first code block when multiple blocks present", () => {
  const input = "```ts\nconst x = 1;\n```\n\nSome text\n\n```ts\nconst y = 2;\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "const x = 1;");
});

test("extractCodeBlock handles code block with markdown outside", () => {
  const input = "Here is the code:\n\n```ts\nconst x = 1;\n```\n\nThat's it!";
  const result = extractCodeBlock(input);
  assert.equal(result, "const x = 1;");
});

test("extractCodeBlock handles empty code block", () => {
  const input = "```ts\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "");
});

test("extractCodeBlock handles code block with only whitespace", () => {
  const input = "```ts\n   \n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "");
});

test("extractCodeBlock handles malformed code block (unclosed)", () => {
  const input = "```ts\nconst x = 1;";
  const result = extractCodeBlock(input);
  assert.equal(result, "```ts\nconst x = 1;");
});

test("extractCodeBlock handles nested backticks inside code block", () => {
  const input = "```ts\nconst str = `template literal`;\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "const str = `template literal`;");
});

test("extractCodeBlock handles code block with special regex characters", () => {
  const input = "```ts\nconst regex = /[a-z]+/g;\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "const regex = /[a-z]+/g;");
});

test("extractCodeBlock handles code block with unicode characters", () => {
  const input = "```ts\nconst emoji = '🚀';\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "const emoji = '🚀';");
});

test("extractCodeBlock handles CRLF line endings", () => {
  const input = "```ts\r\nconst x = 1;\r\n```";
  const result = extractCodeBlock(input);
  assert.equal(result, "const x = 1;");
});

// ============================================================================
// strategyLLMRequestSchema validation tests
// ============================================================================

test("strategyLLMRequestSchema accepts valid request with all fields", () => {
  const input = {
    provider: "openai",
    token: "sk-test1234",
    prompt: "Create a momentum strategy",
    model: "gpt-4",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(result.success);
  if (result.success) {
    assert.equal(result.data.provider, "openai");
    assert.equal(result.data.token, "sk-test1234");
    assert.equal(result.data.prompt, "Create a momentum strategy");
    assert.equal(result.data.model, "gpt-4");
  }
});

test("strategyLLMRequestSchema accepts valid request without optional model", () => {
  const input = {
    provider: "anthropic",
    token: "sk-ant-123456",
    prompt: "Create a mean reversion strategy",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(result.success);
  if (result.success) {
    assert.equal(result.data.model, undefined);
  }
});

test("strategyLLMRequestSchema rejects invalid provider", () => {
  const input = {
    provider: "invalid-provider",
    token: "sk-test1234",
    prompt: "Create a strategy",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(!result.success);
});

test("strategyLLMRequestSchema rejects token that is too short", () => {
  const input = {
    provider: "openai",
    token: "short",
    prompt: "Create a strategy",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(!result.success);
});

test("strategyLLMRequestSchema rejects empty token", () => {
  const input = {
    provider: "openai",
    token: "",
    prompt: "Create a strategy",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(!result.success);
});

test("strategyLLMRequestSchema rejects prompt that is too short", () => {
  const input = {
    provider: "openai",
    token: "sk-test1234",
    prompt: "short",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(!result.success);
});

test("strategyLLMRequestSchema rejects empty prompt", () => {
  const input = {
    provider: "openai",
    token: "sk-test1234",
    prompt: "",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(!result.success);
});

test("strategyLLMRequestSchema rejects missing provider", () => {
  const input = {
    token: "sk-test1234",
    prompt: "Create a strategy",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(!result.success);
});

test("strategyLLMRequestSchema rejects missing token", () => {
  const input = {
    provider: "openai",
    prompt: "Create a strategy",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(!result.success);
});

test("strategyLLMRequestSchema rejects missing prompt", () => {
  const input = {
    provider: "openai",
    token: "sk-test1234",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(!result.success);
});

test("strategyLLMRequestSchema accepts all valid providers", () => {
  for (const provider of llmProviders) {
    const input = {
      provider,
      token: "sk-test1234",
      prompt: "Create a strategy",
    };
    const result = strategyLLMRequestSchema.safeParse(input);
    assert.ok(result.success, `Provider ${provider} should be valid`);
  }
});

test("strategyLLMRequestSchema rejects null values", () => {
  const input: unknown = {
    provider: null,
    token: null,
    prompt: null,
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(!result.success);
});

test("strategyLLMRequestSchema rejects undefined values", () => {
  const input: unknown = {
    provider: undefined,
    token: undefined,
    prompt: undefined,
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(!result.success);
});

test("strategyLLMRequestSchema accepts very long token", () => {
  const input = {
    provider: "openai",
    token: "sk-" + "x".repeat(200),
    prompt: "Create a strategy",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(result.success);
});

test("strategyLLMRequestSchema accepts very long prompt", () => {
  const input = {
    provider: "openai",
    token: "sk-test1234",
    prompt: "Create a strategy that " + "does something ".repeat(100),
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(result.success);
});

test("strategyLLMRequestSchema accepts empty model string", () => {
  const input = {
    provider: "openai",
    token: "sk-test1234",
    prompt: "Create a strategy",
    model: "",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(result.success);
});

test("strategyLLMRequestSchema accepts whitespace-only token (validation happens elsewhere)", () => {
  const input = {
    provider: "openai",
    token: "        ",
    prompt: "Create a strategy",
  };
  const result = strategyLLMRequestSchema.safeParse(input);
  assert.ok(result.success); // Schema accepts it, but app may trim/reject
});

// ============================================================================
// llmProviderMeta tests
// ============================================================================

test("llmProviderMeta contains all providers", () => {
  for (const provider of llmProviders) {
    assert.ok(provider in llmProviderMeta, `Missing metadata for provider: ${provider}`);
  }
});

test("llmProviderMeta has correct structure for each provider", () => {
  for (const provider of llmProviders) {
    const meta = llmProviderMeta[provider];
    assert.equal(meta.id, provider);
    assert.ok(typeof meta.label === "string");
    assert.ok(meta.label.length > 0);
    assert.ok(typeof meta.docsUrl === "string");
    assert.ok(meta.docsUrl.startsWith("https://"));
  }
});

// ============================================================================
// STRATEGY_LLM_HEADER tests - Critical for prompt engineering
// ============================================================================

test("STRATEGY_LLM_HEADER is a non-empty string", () => {
  assert.ok(typeof STRATEGY_LLM_HEADER === "string");
  assert.ok(STRATEGY_LLM_HEADER.length > 0);
});

test("STRATEGY_LLM_HEADER contains key instructions", () => {
  // Check for critical keywords that ensure proper strategy generation
  assert.ok(STRATEGY_LLM_HEADER.includes("StrategyBar"));
  assert.ok(STRATEGY_LLM_HEADER.includes("StrategyContext"));
  assert.ok(STRATEGY_LLM_HEADER.includes("StrategySignal"));
  assert.ok(STRATEGY_LLM_HEADER.includes("createStrategy"));
  assert.ok(STRATEGY_LLM_HEADER.includes("metadata"));
  assert.ok(STRATEGY_LLM_HEADER.includes("defaultConfig"));
});

test("STRATEGY_LLM_HEADER mentions TypeScript", () => {
  assert.ok(STRATEGY_LLM_HEADER.includes("TypeScript") || STRATEGY_LLM_HEADER.includes("ts"));
});

test("STRATEGY_LLM_HEADER includes example code block", () => {
  assert.ok(STRATEGY_LLM_HEADER.includes("```ts"));
  assert.ok(STRATEGY_LLM_HEADER.includes("sma-crossover"));
});

test("STRATEGY_LLM_HEADER mentions crucial constraints", () => {
  // Ensure critical security and determinism constraints are documented
  assert.ok(
    STRATEGY_LLM_HEADER.toLowerCase().includes("deterministic") ||
      STRATEGY_LLM_HEADER.toLowerCase().includes("reproducib"),
  );
  assert.ok(STRATEGY_LLM_HEADER.includes("timestamp"));
});

test("STRATEGY_LLM_HEADER does not contain placeholder text", () => {
  // Common placeholder patterns that indicate incomplete documentation
  // Note: TODO[phase-X] is intentional instruction to LLMs, not a placeholder
  assert.ok(!STRATEGY_LLM_HEADER.includes("FIXME"));
  assert.ok(!STRATEGY_LLM_HEADER.includes("XXX"));
  assert.ok(!STRATEGY_LLM_HEADER.includes("TBD"));
});
