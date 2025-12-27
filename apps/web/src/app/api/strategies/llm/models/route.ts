import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { llmProviders } from "@/lib/strategy-llm";

const GOOGLE_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const DEEPSEEK_MODELS_URL = "https://api.deepseek.com/v1/models";
const ANTHROPIC_MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-3-opus-20240229",
  "claude-3-haiku-20240307",
];

const requestSchema = z.object({
  provider: z.enum(llmProviders),
  token: z.string().min(1, "API token is required"),
});

interface ProviderModelResponse {
  models: string[];
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ProviderModelResponse | { error: string }>> {
  const json = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { provider, token } = parsed.data;

  try {
    const models = await fetchModelsForProvider(provider, token.trim());
    if (!models.length) {
      return NextResponse.json(
        { error: "No models available for this provider/token." },
        { status: 404 },
      );
    }
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list models";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function fetchModelsForProvider(
  provider: (typeof llmProviders)[number],
  token: string,
): Promise<string[]> {
  switch (provider) {
    case "openai":
      return fetchOpenAIModels(token);
    case "google":
      return fetchGoogleModels(token);
    case "anthropic":
      return ANTHROPIC_MODELS;
    case "deepseek":
      return fetchDeepSeekModels(token);
    default:
      return [];
  }
}

async function fetchOpenAIModels(token: string): Promise<string[]> {
  const response = await fetch(OPENAI_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAI model list failed (${response.status})`);
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ id?: string }>;
  } | null;
  return Array.isArray(payload?.data)
    ? payload!.data!.map((entry) => entry.id).filter((id): id is string => typeof id === "string")
    : [];
}

async function fetchGoogleModels(apiKey: string): Promise<string[]> {
  const url = `${GOOGLE_MODELS_URL}?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google model list failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = (await response.json().catch(() => null)) as {
    models?: Array<{ name?: string }>;
  } | null;
  const names =
    payload?.models
      ?.map((entry) => entry.name?.replace(/^models\//, ""))
      .filter((name): name is string => typeof name === "string" && name.startsWith("gemini-")) ??
    [];
  return names;
}

async function fetchDeepSeekModels(token: string): Promise<string[]> {
  const response = await fetch(DEEPSEEK_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`DeepSeek model list failed (${response.status})`);
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ id?: string }>;
  } | null;
  return Array.isArray(payload?.data)
    ? payload!.data!.map((entry) => entry.id).filter((id): id is string => typeof id === "string")
    : [];
}
