import { NextRequest, NextResponse } from "next/server";
import {
  STRATEGY_LLM_HEADER,
  extractCodeBlock,
  strategyLLMRequestSchema,
  type LLMProvider,
  type StrategyLLMResponse,
} from "@/lib/strategy-llm";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const GEMINI_MODEL_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface OpenAIChatResponse {
  readonly choices?: Array<{
    readonly message?: {
      readonly content?: string;
    };
  }>;
}

interface AnthropicMessageResponse {
  readonly content?: Array<{
    readonly text?: string;
  }>;
}

interface GeminiResponse {
  readonly candidates?: Array<{
    readonly content?: {
      readonly parts?: Array<{
        readonly text?: string;
      }>;
    };
  }>;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<StrategyLLMResponse | object>> {
  const json = await request.json().catch(() => null);
  const parsed = strategyLLMRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      {
        status: 400,
      },
    );
  }

  const { provider, token, prompt, model } = parsed.data;
  const sanitizedToken = token.trim();

  try {
    const text = await routeToProvider({
      provider,
      token: sanitizedToken,
      model,
      prompt,
    });
    return NextResponse.json({ code: extractCodeBlock(text) });
  } catch (error) {
    console.error("[strategy-llm] provider error", error);
    const message =
      error instanceof Error ? error.message : "Failed to reach selected LLM provider";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function routeToProvider(args: {
  provider: LLMProvider;
  token: string;
  prompt: string;
  model?: string;
}): Promise<string> {
  const { provider, token, prompt, model } = args;
  const headerAndPrompt = `${STRATEGY_LLM_HEADER}\n\nUser request:\n${prompt.trim()}`;
  const resolvedModel = model && model.trim().length > 0 ? model.trim() : undefined;
  if (!resolvedModel) {
    throw new Error(`No model provided for ${provider}`);
  }

  switch (provider) {
    case "openai":
      return fetchOpenAI({
        token,
        model: resolvedModel,
        prompt: headerAndPrompt,
      });
    case "anthropic":
      return fetchAnthropic({
        token,
        model: resolvedModel,
        prompt: headerAndPrompt,
      });
    case "google":
      if (!resolvedModel.startsWith("models/")) {
        return fetchGemini({
          token,
          model: `models/${resolvedModel}`,
          prompt: headerAndPrompt,
        });
      }
      return fetchGemini({
        token,
        model: resolvedModel,
        prompt: headerAndPrompt,
      });
    case "deepseek":
      return fetchDeepSeek({
        token,
        model: resolvedModel,
        prompt: headerAndPrompt,
      });
    default:
      throw new Error(`Unsupported provider ${provider satisfies never}`);
  }
}

async function fetchOpenAI(args: {
  token: string;
  prompt: string;
  model: string;
}): Promise<string> {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.token}`,
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: "system", content: STRATEGY_LLM_HEADER },
        { role: "user", content: args.prompt },
      ],
    }),
  });
  return parseProviderResponse<OpenAIChatResponse>(
    response,
    (payload) => payload.choices?.[0]?.message?.content,
    "OpenAI",
  );
}

async function fetchDeepSeek(args: {
  token: string;
  prompt: string;
  model: string;
}): Promise<string> {
  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.token}`,
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: "system", content: STRATEGY_LLM_HEADER },
        { role: "user", content: args.prompt },
      ],
    }),
  });
  return parseProviderResponse<OpenAIChatResponse>(
    response,
    (payload) => payload.choices?.[0]?.message?.content,
    "DeepSeek",
  );
}

async function fetchAnthropic(args: {
  token: string;
  prompt: string;
  model: string;
}): Promise<string> {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": args.token,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 2048,
      system: STRATEGY_LLM_HEADER,
      messages: [
        {
          role: "user",
          content: args.prompt,
        },
      ],
    }),
  });
  return parseProviderResponse<AnthropicMessageResponse>(
    response,
    (payload) => payload.content?.[0]?.text,
    "Anthropic",
  );
}

async function fetchGemini(args: {
  token: string;
  prompt: string;
  model: string;
}): Promise<string> {
  const normalizedModel = args.model.replace(/^models\//, "");
  const url = `${GEMINI_MODEL_URL_BASE}/${normalizedModel}:generateContent?key=${encodeURIComponent(args.token)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: args.prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
      },
    }),
  });
  return parseProviderResponse<GeminiResponse>(
    response,
    (payload) => payload.candidates?.[0]?.content?.parts?.[0]?.text,
    "Google Gemini",
  );
}

type ProviderErrorPayload = {
  readonly error?: { readonly message?: string };
  readonly message?: string;
} | null;

async function parseProviderResponse<T>(
  response: Response,
  pickText: (payload: T) => string | undefined,
  providerLabel: string,
): Promise<string> {
  const rawBody = await response.text();
  let payload: T | ProviderErrorPayload | null = null;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as T) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    let message: string | undefined;
    if (payload && typeof payload === "object") {
      const errorPayload = payload as ProviderErrorPayload;
      message = errorPayload.error?.message ?? errorPayload.message;
    }
    if (!message && rawBody) {
      message = rawBody.slice(0, 400);
    }
    throw new Error(
      `${providerLabel} responded with ${response.status}: ${message ?? "unknown error"}`,
    );
  }

  const typedPayload = payload as T | null;
  const text = typedPayload ? pickText(typedPayload) : undefined;
  if (!text || text.trim().length === 0) {
    throw new Error(`${providerLabel} returned an empty completion`);
  }
  return text.trim();
}
