import { z } from "zod";

/**
 * Shared header appended to every automated or manual LLM request so strategy
 * generation follows the Crucible Trader contracts (docs/spec/00-master-spec.txt,
 * sections “Frontend (UI)” and “Strategy Interface”).
 */
export const STRATEGY_LLM_HEADER = [
  "You are the Crucible Strategy Architect. Produce a self-contained TypeScript strategy module that compiles in strict mode.",
  "",
  "Mandatory structure:",
  "1. Only import { StrategyBar, StrategyContext, StrategySignal } from '@crucible-trader/sdk'. No other imports.",
  "2. Export interface StrategyConfig plus const defaultConfig describing parameters and defaults.",
  "3. Export const metadata = { name, description, version, author, tags } with a kebab-case name.",
  "4. Export function createStrategy(config: StrategyConfig) that keeps all mutable state local and returns { onInit?, onBar, onStop? }.",
  "5. onBar must return StrategySignal | null. Valid signal sides are strictly 'buy' or 'sell'. Encode exits via reason text (e.g., 'exit_long').",
  "6. Do not reference context.history or any undefined helper. Only use the StrategyContext passed into hooks.",
  "7. No console logging, random numbers, timers, fetch, or asynchronous code. Everything must be deterministic.",
  "8. Guard against insufficient data (e.g., warmup periods) before computing indicators.",
  "9. Use TODO[phase-2] style markers to indicate deferred functionality rather than implementing it.",
  "",
  "Reference implementation (follow format, do not copy verbatim):",
  "```ts",
  "import type { StrategyBar, StrategyContext, StrategySignal } from '@crucible-trader/sdk';",
  "",
  "export interface StrategyConfig {",
  "  fastLength: number;",
  "  slowLength: number;",
  "}",
  "",
  "const defaultConfig: StrategyConfig = { fastLength: 5, slowLength: 20 };",
  "",
  "export const metadata = {",
  "  name: 'sma-demo',",
  "  description: 'Buys when a fast SMA rises above a slow SMA and sells on the inverse cross.',",
  "  version: '1.0.0',",
  "  author: 'Crucible Reference',",
  "  tags: ['trend', 'sma'],",
  "};",
  "",
  "export function createStrategy(config: StrategyConfig) {",
  "  const settings = { ...defaultConfig, ...config };",
  "  const closes: number[] = [];",
  "  let prevFast: number | null = null;",
  "  let prevSlow: number | null = null;",
  "",
  "  const average = (values: ReadonlyArray<number>): number => {",
  "    const sum = values.reduce((acc, value) => acc + value, 0);",
  "    return sum / values.length;",
  "  };",
  "",
  "  return {",
  "    onInit() {",
  "      closes.length = 0;",
  "      prevFast = null;",
  "      prevSlow = null;",
  "    },",
  "    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {",
  "      closes.push(bar.close);",
  "      if (closes.length > settings.slowLength) {",
  "        closes.shift();",
  "      }",
  "      if (closes.length < settings.slowLength) {",
  "        return null;",
  "      }",
  "      const fastAvg = average(closes.slice(-settings.fastLength));",
  "      const slowAvg = average(closes);",
  "",
  "      let signal: StrategySignal | null = null;",
  "      if (prevFast !== null && prevSlow !== null) {",
  "        if (prevFast <= prevSlow && fastAvg > slowAvg) {",
  "          signal = { side: 'buy', timestamp: bar.timestamp, reason: 'fast_cross_up' };",
  "        } else if (prevFast >= prevSlow && fastAvg < slowAvg) {",
  "          signal = { side: 'sell', timestamp: bar.timestamp, reason: 'fast_cross_down' };",
  "        }",
  "      }",
  "",
  "      prevFast = fastAvg;",
  "      prevSlow = slowAvg;",
  "      return signal;",
  "    },",
  "    onStop(): StrategySignal | null {",
  "      return null;",
  "    },",
  "  };",
  "}",
  "```",
  "",
  "End of reference. Respond with exactly one ```ts fenced block containing ONLY the requested module.",
].join("\n");

export const llmProviders = ["openai", "anthropic", "google", "deepseek"] as const;

export type LLMProvider = (typeof llmProviders)[number];

export interface LLMProviderMeta {
  readonly id: LLMProvider;
  readonly label: string;
  readonly docsUrl: string;
}

export const llmProviderMeta: Record<LLMProvider, LLMProviderMeta> = {
  openai: {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    docsUrl: "https://platform.openai.com/docs/api-reference/chat",
  },
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    docsUrl: "https://docs.anthropic.com/en/api/messages",
  },
  google: {
    id: "google",
    label: "Gemini (Google)",
    docsUrl: "https://ai.google.dev/api/generate-content",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    docsUrl: "https://platform.deepseek.com/api-docs",
  },
};

export const strategyLLMRequestSchema = z.object({
  provider: z.enum(llmProviders),
  token: z.string().min(8, "API token is required"),
  prompt: z.string().min(10, "Prompt must include strategy intent"),
  model: z.string().optional(),
});

export type StrategyLLMRequest = z.infer<typeof strategyLLMRequestSchema>;

export interface StrategyLLMResponse {
  readonly code: string;
}

export const extractCodeBlock = (raw: string): string => {
  const match = raw.match(/```(?:ts|typescript)?\s*([\s\S]*?)```/);
  if (match?.[1]) {
    return match[1].trim();
  }
  return raw.trim();
};
