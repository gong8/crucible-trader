import { z } from "zod";

/**
 * Shared header appended to every automated or manual LLM request so strategy
 * generation follows the Crucible Trader contracts (docs/spec/00-master-spec.txt,
 * sections “Frontend (UI)” and “Strategy Interface”).
 */
export const STRATEGY_LLM_HEADER = [
  "You are the Crucible Strategy Architect. Produce a self-contained TypeScript strategy module that compiles in strict mode and satisfies docs/spec/00-master-spec.txt (see “Frontend (UI)” + “Strategy Interface”).",
  "",
  "Output contract (strict):",
  "1. Respond with exactly one ```ts fenced block that includes ONLY the code. No narration, markdown lists, or comments outside that block.",
  "2. The module must start with: import type { StrategyBar, StrategyContext, StrategySignal } from '@crucible-trader/sdk';",
  "3. Export interface StrategyConfig plus const defaultConfig. Ensure defaults are within realistic bounds and documented via inline comments only when absolutely necessary.",
  "4. Export const metadata = { name, description, version, author, tags }. name must be kebab-case and tags must be lower-case strings.",
  "5. Export function createStrategy(config: StrategyConfig) that merges { ...defaultConfig, ...config } into a local settings object and returns { onInit?, onBar, onStop? }.",
  "6. Store ALL mutable state (buffers, indicators, flags) inside createStrategy closures. Never use globals or shared references.",
  "7. onBar must return StrategySignal | null with side in {'buy','sell'}. Encode exits via reason strings (e.g., 'exit_long'), not side: 'flat'.",
  "8. Preserve timestamps as ISO 8601 strings exactly as received (StrategyBar.timestamp). Never convert them to numbers.",
  "9. Guard for insufficient history before computing indicators. Each guard must return null early when preconditions fail.",
  "10. StrategyContext usage is limited to read-only accessors passed into hooks. Do not reference context.history or undefined helpers.",
  "11. Code must be synchronous, deterministic, and free of console logging, fetch, randomness, timers, or async/await.",
  "12. Use TODO[phase-2|3|4] markers for unimplemented advanced behavior instead of speculative code.",
  "",
  "How to structure the response so it compiles:",
  "- Derive helper functions (like SMA calculators) inside createStrategy to keep scope tight.",
  "- Never reassign function exports. Keep metadata/defaultConfig/StrategyConfig at module scope.",
  "- Use explicit local arrays and lengths; reset them in onInit for deterministic behavior.",
  "- When merging configs, prefer const settings = { ...defaultConfig, ...config }; to avoid mutating parameters.",
  "- Provide descriptive reason strings for every emitted signal so downstream risk checks can route them.",
  "- Track lastBarTimestamp or similar book-keeping variables as string | null to match StrategySignal.timestamp requirements.",
  "",
  "Reference example (SMA crossover template to imitate formatting, NOT to copy verbatim):",
  "```ts",
  "import type { StrategyBar, StrategyContext, StrategySignal } from '@crucible-trader/sdk';",
  "",
  "export interface StrategyConfig {",
  "  fastLength: number;",
  "  slowLength: number;",
  "  minSpread: number;",
  "}",
  "",
  "export const defaultConfig: StrategyConfig = {",
  "  fastLength: 8,",
  "  slowLength: 21,",
  "  minSpread: 0.02,",
  "};",
  "",
  "export const metadata = {",
  "  name: 'sma-crossover',",
  "  description: 'Buys when the fast SMA rises at least minSpread above the slow SMA and flips when the inverse occurs.',",
  "  version: '1.0.0',",
  "  author: 'Crucible Reference',",
  "  tags: ['trend', 'sma'],",
  "};",
  "",
  "export function createStrategy(config: StrategyConfig) {",
  "  const settings = { ...defaultConfig, ...config };",
  "  const closes: number[] = [];",
  "  let fastPrev: number | null = null;",
  "  let slowPrev: number | null = null;",
  "",
  "  const sma = (values: ReadonlyArray<number>): number => {",
  "    return values.reduce((sum, value) => sum + value, 0) / values.length;",
  "  };",
  "",
  "  return {",
  "    onInit() {",
  "      closes.length = 0;",
  "      fastPrev = null;",
  "      slowPrev = null;",
  "    },",
  "    onBar(_context: StrategyContext, bar: StrategyBar): StrategySignal | null {",
  "      closes.push(bar.close);",
  "      if (closes.length > settings.slowLength) {",
  "        closes.shift();",
  "      }",
  "      if (closes.length < settings.slowLength) {",
  "        return null;",
  "      }",
  "      const fast = sma(closes.slice(-settings.fastLength));",
  "      const slow = sma(closes);",
  "",
  "      let signal: StrategySignal | null = null;",
  "      const spread = fast - slow;",
  "      if (fastPrev !== null && slowPrev !== null) {",
  "        const previousSpread = fastPrev - slowPrev;",
  "        if (previousSpread <= 0 && spread > settings.minSpread) {",
  "          signal = { side: 'buy', timestamp: bar.timestamp, reason: 'fast_cross_up' };",
  "        } else if (previousSpread >= 0 && spread < -settings.minSpread) {",
  "          signal = { side: 'sell', timestamp: bar.timestamp, reason: 'fast_cross_down' };",
  "        }",
  "      }",
  "",
  "      fastPrev = fast;",
  "      slowPrev = slow;",
  "      return signal;",
  "    },",
  "    onStop(): StrategySignal | null {",
  "      return null;",
  "    },",
  "  };",
  "}",
  "```",
  "",
  "Repeat this structure for the requested strategy, tailoring metadata/config/logic to the user prompt. Do NOT wrap with prose or markdown beyond the single ```ts block.",
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
  if (match) {
    return match[1]!.trim();
  }
  return raw.trim();
};
