"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StrategyEditor, {
  STRATEGY_EDITOR_DEFAULT_TEMPLATE,
} from "@/components/strategy-editor/StrategyEditor";
import { StrategyLLMPanel } from "@/components/strategy-llm/StrategyLLMPanel";

type StrategyMode = "manual" | "assistant";

export default function NewStrategyPage(): JSX.Element {
  const router = useRouter();
  const [code, setCode] = useState(STRATEGY_EDITOR_DEFAULT_TEMPLATE);
  const [strategyName, setStrategyName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [mode, setMode] = useState<StrategyMode | null>(null);

  useEffect(() => {
    const handleSave = (): void => {
      void handleSaveStrategy();
    };
    window.addEventListener("editor-save", handleSave as EventListener);
    return () => window.removeEventListener("editor-save", handleSave as EventListener);
  }, [code, strategyName]);

  const extractMetadataFromCode = (value: string): { name?: string } | null => {
    try {
      const nameMatch = value.match(/name:\s*["']([^"']+)["']/);
      return nameMatch ? { name: nameMatch[1] } : null;
    } catch {
      return null;
    }
  };

  const handleCodeChange = (newCode: string): void => {
    setCode(newCode);
    setValidationErrors([]);
    setValidationWarnings([]);
    setError(null);

    const metadata = extractMetadataFromCode(newCode);
    if (metadata?.name && !strategyName) {
      setStrategyName(metadata.name);
    }
  };

  const handleSaveStrategy = async (): Promise<void> => {
    setError(null);
    setValidationErrors([]);
    setValidationWarnings([]);

    const validationResponse = await fetch("/api/strategies/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        name: strategyName,
      }),
    });

    if (!validationResponse.ok) {
      setError("Failed to validate strategy");
      return;
    }

    const validationResult = await validationResponse.json();
    if (!validationResult.valid) {
      setValidationErrors(validationResult.errorMessages || []);
      setValidationWarnings(validationResult.warningMessages || []);
      return;
    }

    if (validationResult.warningMessages?.length) {
      setValidationWarnings(validationResult.warningMessages);
    }

    setSaving(true);
    try {
      const response = await fetch("/api/strategies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: strategyName,
          code,
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error ?? "Failed to save strategy");
      }
      await response.json();
      router.push("/strategies");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save strategy");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = (): void => {
    if (code.trim() && !confirm("Are you sure? Your unsaved changes will be lost.")) {
      return;
    }
    router.push("/strategies");
  };

  const renderValidation = (): JSX.Element | null => {
    if (!error && validationErrors.length === 0 && validationWarnings.length === 0) {
      return null;
    }
    return (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {error ? (
          <div
            className="alert"
            style={{
              borderLeft: "4px solid var(--danger-red)",
              background: "rgba(239, 68, 68, 0.1)",
              color: "var(--danger-red)",
            }}
          >
            <strong>ERROR:</strong> {error}
          </div>
        ) : null}
        {validationErrors.length > 0 ? (
          <div
            className="alert"
            style={{
              borderLeft: "4px solid var(--danger-red)",
              background: "rgba(239, 68, 68, 0.1)",
              color: "var(--danger-red)",
            }}
          >
            <strong>VALIDATION ERRORS ({validationErrors.length}):</strong>
            <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem", fontSize: "0.85rem" }}>
              {validationErrors.map((err, index) => (
                <li key={index} style={{ marginBottom: "0.35rem", whiteSpace: "pre-wrap" }}>
                  {err}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {validationWarnings.length > 0 ? (
          <div
            className="alert"
            style={{
              borderLeft: "4px solid var(--spark-yellow)",
              background: "rgba(252, 211, 77, 0.1)",
              color: "var(--spark-yellow)",
            }}
          >
            <strong>WARNINGS ({validationWarnings.length}):</strong>
            <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem", fontSize: "0.85rem" }}>
              {validationWarnings.map((warn, index) => (
                <li key={index} style={{ marginBottom: "0.35rem", whiteSpace: "pre-wrap" }}>
                  {warn}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  };

  const renderManualWorkspace = (): JSX.Element => (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--graphite-500)",
      }}
    >
      <div
        style={{
          borderBottom: "2px solid var(--graphite-100)",
          background: "var(--graphite-400)",
          padding: "1.5rem 2rem",
          display: "grid",
          gap: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Create Strategy</h1>
            <p style={{ color: "var(--steel-300)", fontSize: "0.85rem", marginTop: "0.35rem" }}>
              Handcraft your logic directly in the crucible editor. Save when it is ready for
              review.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setMode(null)}
              style={{ background: "transparent", color: "var(--steel-200)" }}
            >
              Change Mode
            </button>
            <button onClick={handleCancel} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => void handleSaveStrategy()}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Saving..." : "Save Strategy"}
            </button>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "flex-end",
          }}
        >
          <label style={{ flex: "1 1 320px" }}>
            <span
              style={{
                display: "block",
                fontSize: "0.75rem",
                color: "var(--steel-300)",
                marginBottom: "0.4rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600,
              }}
            >
              Strategy Name
            </span>
            <input
              type="text"
              value={strategyName}
              onChange={(event) => setStrategyName(event.currentTarget.value)}
              placeholder="my-custom-strategy"
              style={{
                width: "100%",
                padding: "0.6rem",
                background: "var(--graphite-500)",
                border: "1px solid var(--graphite-100)",
                color: "var(--steel-100)",
                fontSize: "0.95rem",
              }}
            />
          </label>
        </div>
        {renderValidation()}
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <StrategyEditor value={code} onChange={handleCodeChange} />
      </div>
      <div
        style={{
          borderTop: "2px solid var(--graphite-100)",
          background: "var(--graphite-400)",
          padding: "0.75rem 2rem",
          fontSize: "0.7rem",
          color: "var(--steel-400)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Export `metadata`, `StrategyConfig`, and `createStrategy` from this module before saving.
      </div>
    </div>
  );

  const renderAssistantMode = (): JSX.Element => (
    <div className="grid">
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <StrategyLLMPanel
          onCodeGenerated={(generated) => {
            handleCodeChange(generated);
          }}
        />
        <div
          style={{
            border: "1px solid var(--graphite-100)",
            background: "var(--graphite-500)",
            minHeight: "70vh",
          }}
        >
          <StrategyEditor value={code} onChange={handleCodeChange} />
        </div>
      </div>
    </div>
  );

  const renderSelection = (): JSX.Element => (
    <div className="grid" style={{ gap: "1.5rem" }}>
      <section className="card" style={{ display: "grid", gap: "1rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.6rem" }}>Choose Strategy Creation Mode</h1>
        <p style={{ color: "var(--steel-200)", fontSize: "0.9rem" }}>
          Manual build gives you the full Monaco editor for hand-crafted logic. LLM Assist sends the
          crucible prompt header to ChatGPT, Claude, Gemini, or DeepSeek (or your own chat UI) and
          drops the response into the editor for finishing touches.
        </p>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          <div className="card" style={{ display: "grid", gap: "0.75rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--ember-orange)" }}>
              Manual Build
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--steel-300)" }}>
              You write every line of TypeScript with immediate validation. Ideal when you already
              know the edge and want maximum control.
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.2rem",
                fontSize: "0.8rem",
                color: "var(--steel-300)",
                lineHeight: 1.5,
              }}
            >
              <li>Full editor with live validation.</li>
              <li>Best for bespoke research.</li>
              <li>Matches existing code review expectations.</li>
            </ul>
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: "0.25rem" }}
              onClick={() => setMode("manual")}
            >
              Start Manual Build
            </button>
          </div>
          <div className="card" style={{ display: "grid", gap: "0.75rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--ember-orange)" }}>
              LLM Assist
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--steel-300)" }}>
              Provide a ChatGPT/Claude/Gemini/DeepSeek API token or copy the crucible header to
              paste into a chat window. The result lands in the editor so you can tighten logic
              locally.
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.2rem",
                fontSize: "0.8rem",
                color: "var(--steel-300)",
                lineHeight: 1.5,
              }}
            >
              <li>Shared prompt enforces metadata/export shape.</li>
              <li>Faster ideation with deterministic guardrails.</li>
              <li>Manual copy option for non-token workflows.</li>
            </ul>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: "0.25rem" }}
              onClick={() => setMode("assistant")}
            >
              Start LLM Assist
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  if (!mode) {
    return renderSelection();
  }

  if (mode === "manual") {
    return renderManualWorkspace();
  }

  const modeTitle = "LLM-Assisted Strategy Build";
  const modeDescription =
    "Leverage the crucible LLM header to draft code, then tighten it locally before saving.";

  return (
    <div className="grid" style={{ gap: "1.5rem" }}>
      <section className="card" style={{ display: "grid", gap: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{modeTitle}</h1>
            {modeDescription ? (
              <p style={{ color: "var(--steel-300)", fontSize: "0.85rem", marginTop: "0.35rem" }}>
                {modeDescription}
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setMode(null)}
              style={{ background: "transparent", color: "var(--steel-200)" }}
            >
              Change Mode
            </button>
            <button onClick={handleCancel} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => void handleSaveStrategy()}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Saving..." : "Save Strategy"}
            </button>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "flex-end",
          }}
        >
          <label style={{ flex: "1 1 320px" }}>
            <span
              style={{
                display: "block",
                fontSize: "0.75rem",
                color: "var(--steel-300)",
                marginBottom: "0.4rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600,
              }}
            >
              Strategy Name
            </span>
            <input
              type="text"
              value={strategyName}
              onChange={(event) => setStrategyName(event.currentTarget.value)}
              placeholder="my-custom-strategy"
              style={{
                width: "100%",
                padding: "0.6rem",
                background: "var(--graphite-500)",
                border: "1px solid var(--graphite-100)",
                color: "var(--steel-100)",
                fontSize: "0.95rem",
              }}
            />
          </label>
        </div>
        {renderValidation()}
      </section>

      {renderAssistantMode()}
    </div>
  );
}
