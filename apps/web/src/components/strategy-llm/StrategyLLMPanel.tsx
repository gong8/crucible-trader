"use client";

import { useEffect, useMemo, useState } from "react";
import {
  STRATEGY_LLM_HEADER,
  llmProviderMeta,
  llmProviders,
  type LLMProvider,
} from "@/lib/strategy-llm";

interface StrategyLLMPanelProps {
  readonly onCodeGenerated: (code: string) => void;
  readonly defaultPrompt?: string;
}

interface PanelStatus {
  readonly state: "idle" | "loading" | "error" | "success";
  readonly message?: string;
}

export function StrategyLLMPanel({
  onCodeGenerated,
  defaultPrompt = "",
}: StrategyLLMPanelProps): JSX.Element {
  const [provider, setProvider] = useState<LLMProvider>("openai");
  const [token, setToken] = useState("");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [modelOverride, setModelOverride] = useState("");
  const [status, setStatus] = useState<PanelStatus>({ state: "idle" });
  const [lastSnippet, setLastSnippet] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [modelStatus, setModelStatus] = useState<PanelStatus | null>(null);

  const providerMeta = useMemo(() => llmProviderMeta[provider], [provider]);
  useEffect(() => {
    setModelOptions([]);
    setModelOverride("");
    setModelStatus(null);
  }, [provider]);

  const toModelOption = (raw: string): ModelOption => {
    const trimmed = raw.replace(/^models\//, "");
    return {
      value: trimmed,
      label: trimmed,
    };
  };

  const handleCopyHeader = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(STRATEGY_LLM_HEADER);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy header", error);
    }
  };

  const handleGenerate = async (): Promise<void> => {
    if (!prompt || prompt.trim().length < 10) {
      setStatus({ state: "error", message: "Prompt must describe the desired strategy." });
      return;
    }
    if (!token || token.trim().length < 8) {
      setStatus({
        state: "error",
        message: "Provide a valid API token for the selected provider.",
      });
      return;
    }
    if (!modelOverride) {
      setStatus({ state: "error", message: "Load models and pick one before generating." });
      return;
    }

    setStatus({ state: "loading" });
    try {
      const response = await fetch("/api/strategies/llm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          token,
          prompt,
          model: modelOverride || undefined,
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        const errorMessage =
          typeof errorPayload?.error === "string"
            ? errorPayload.error
            : `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      const payload = (await response.json()) as { code: string };
      setLastSnippet(payload.code);
      onCodeGenerated(payload.code);
      setStatus({ state: "success", message: "Generated code inserted into editor." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM request failed";
      setStatus({ state: "error", message });
    }
  };

  const handleLoadModels = async (): Promise<void> => {
    if (!token || token.trim().length < 8) {
      setModelStatus({ state: "error", message: "Enter your API token first." });
      return;
    }

    setModelStatus({ state: "loading" });
    try {
      const response = await fetch("/api/strategies/llm/models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          token,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Failed to list models (status ${response.status})`);
      }

      const payload = (await response.json()) as { models?: string[]; error?: string };
      if (!payload.models || payload.models.length === 0) {
        throw new Error(payload.error ?? "No models available for this provider/token.");
      }
      const uniqueModels = Array.from(new Set(payload.models));
      const options = uniqueModels.map((raw) => toModelOption(raw));
      setModelOptions(options);
      setModelOverride(options[0]?.value ?? "");
      setModelStatus({ state: "success", message: `Loaded ${uniqueModels.length} models` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load models";
      setModelOptions([]);
      setModelOverride("");
      setModelStatus({ state: "error", message });
    }
  };

  return (
    <section className="card" style={{ display: "grid", gap: "1rem" }}>
      <header>
        <h3 style={{ fontSize: "1rem", color: "var(--ember-orange)", marginBottom: "0.25rem" }}>
          Strategy LLM Assistant
        </h3>
        <p style={{ fontSize: "0.75rem", color: "var(--steel-300)" }}>
          Token in? Hit generate. No token? Copy the header below.
        </p>
      </header>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          Provider
          <select
            value={provider}
            onChange={(event) => setProvider(event.currentTarget.value as LLMProvider)}
          >
            {llmProviders.map((entry) => (
              <option key={entry} value={entry}>
                {llmProviderMeta[entry].label}
              </option>
            ))}
          </select>
        </label>
        <div style={{ fontSize: "0.75rem", color: "var(--steel-400)" }}>
          <a href={providerMeta.docsUrl} target="_blank" rel="noreferrer">
            provider docs
          </a>
        </div>
        <label>
          API Token (kept local to this request)
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
          />
        </label>
        <label>
          Model
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select
              value={modelOverride}
              onChange={(event) => setModelOverride(event.currentTarget.value)}
              style={{ flex: 1 }}
              disabled={modelOptions.length === 0}
            >
              <option value="" disabled>
                {modelOptions.length === 0 ? "Load models" : "Select a model"}
              </option>
              {modelOptions.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary" onClick={handleLoadModels}>
              Load Models
            </button>
          </div>
        </label>
        {modelOptions.length === 0 ? (
          <div style={{ fontSize: "0.75rem", color: "var(--steel-400)" }}>
            Load models with your token before generating.
          </div>
        ) : null}
        {modelStatus && modelStatus.message ? (
          <div
            className="alert"
            style={{
              borderLeft: `3px solid ${modelStatus.state === "error" ? "var(--danger-red)" : "var(--success-green)"}`,
              color: modelStatus.state === "error" ? "var(--danger-red)" : "var(--success-green)",
            }}
          >
            {modelStatus.message}
          </div>
        ) : null}
        <label>
          Prompt
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            placeholder="Describe your edge, indicators, risk rules..."
            rows={4}
          />
        </label>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleGenerate}
          disabled={status.state === "loading"}
        >
          {status.state === "loading" ? "Generating..." : "Generate with LLM"}
        </button>
        {status.state === "error" && status.message ? (
          <div
            className="alert"
            style={{ borderLeft: "3px solid var(--danger-red)", color: "var(--danger-red)" }}
          >
            {status.message}
          </div>
        ) : null}
        {status.state === "success" && status.message ? (
          <div
            className="alert"
            style={{ borderLeft: "3px solid var(--success-green)", color: "var(--success-green)" }}
          >
            {status.message}
          </div>
        ) : null}
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "flex-start",
            marginBottom: "0.5rem",
          }}
        >
          <div>
            <h4
              style={{
                fontSize: "0.95rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "0.2rem",
              }}
            >
              Crucible Strategy Header
            </h4>
            <p style={{ fontSize: "0.7rem", color: "var(--steel-400)", maxWidth: "340px" }}>
              Drop this text into any LLM chat for a compliant strategy.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={handleCopyHeader}
            style={{ flexShrink: 0 }}
          >
            {copied ? "Copied" : "Copy Header"}
          </button>
        </div>
        <pre
          style={{
            background: "var(--graphite-400)",
            padding: "0.75rem",
            maxHeight: "260px",
            overflow: "auto",
            fontSize: "0.7rem",
            lineHeight: "1.4",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            border: "1px solid var(--graphite-100)",
          }}
        >
          {STRATEGY_LLM_HEADER}
        </pre>
      </div>

      {lastSnippet ? (
        <div>
          <h4
            style={{
              fontSize: "0.9rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.5rem",
            }}
          >
            Last Generated Snippet
          </h4>
          <pre
            style={{
              maxHeight: "180px",
              overflow: "auto",
              fontSize: "0.7rem",
              lineHeight: "1.4",
            }}
          >
            {lastSnippet}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
interface ModelOption {
  readonly label: string;
  readonly value: string;
}
