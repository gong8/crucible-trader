"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import StrategyEditor from "@/components/strategy-editor/StrategyEditor";

export default function NewStrategyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [strategyName, setStrategyName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  useEffect(() => {
    const handleSave = () => {
      handleSaveStrategy();
    };

    window.addEventListener("editor-save", handleSave as EventListener);
    return () => window.removeEventListener("editor-save", handleSave as EventListener);
  }, [code, strategyName]);

  const extractMetadataFromCode = (code: string): { name?: string } | null => {
    try {
      const nameMatch = code.match(/name:\s*["']([^"']+)["']/);
      return nameMatch ? { name: nameMatch[1] } : null;
    } catch {
      return null;
    }
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    setValidationErrors([]);
    setValidationWarnings([]);
    setError(null);

    const metadata = extractMetadataFromCode(newCode);
    if (metadata?.name && !strategyName) {
      setStrategyName(metadata.name);
    }
  };

  const handleSaveStrategy = async () => {
    setError(null);
    setValidationErrors([]);
    setValidationWarnings([]);

    // Run validation
    const result = await fetch("/api/strategies/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        name: strategyName,
      }),
    });

    if (!result.ok) {
      setError("Failed to validate strategy");
      return;
    }

    const validationResult = await result.json();

    if (!validationResult.valid) {
      setValidationErrors(validationResult.errorMessages || []);
      setValidationWarnings(validationResult.warningMessages || []);
      return;
    }

    // Show warnings but allow saving
    if (validationResult.warningMessages && validationResult.warningMessages.length > 0) {
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
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save strategy");
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

  const handleCancel = () => {
    if (code.trim() && !confirm("Are you sure? Your unsaved changes will be lost.")) {
      return;
    }
    router.push("/strategies");
  };

  return (
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
      {/* Header */}
      <div
        style={{
          borderBottom: "2px solid var(--graphite-100)",
          background: "var(--graphite-400)",
          padding: "1.5rem 2rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "var(--steel-100)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "0.5rem",
              }}
            >
              CREATE NEW STRATEGY
            </h1>
            <p
              style={{
                color: "var(--steel-400)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              WRITE YOUR CUSTOM TRADING STRATEGY IN TYPESCRIPT
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button onClick={handleCancel} className="btn-secondary">
              CANCEL
            </button>
            <button onClick={handleSaveStrategy} disabled={saving} className="btn-primary">
              {saving ? "SAVING..." : "SAVE STRATEGY"}
            </button>
          </div>
        </div>

        {/* Strategy Name Input */}
        <label style={{ display: "block" }}>
          <span
            style={{
              display: "block",
              fontSize: "0.7rem",
              color: "var(--steel-300)",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}
          >
            STRATEGY NAME
          </span>
          <input
            type="text"
            value={strategyName}
            onChange={(e) => setStrategyName(e.target.value)}
            placeholder="my-custom-strategy"
            style={{
              width: "100%",
              maxWidth: "400px",
            }}
          />
        </label>

        {/* Error Messages */}
        {error && (
          <div
            className="alert"
            style={{
              marginTop: "1rem",
              borderLeft: "4px solid var(--danger-red)",
              background: "rgba(239, 68, 68, 0.1)",
              color: "var(--danger-red)",
            }}
          >
            <strong>ERROR:</strong> {error}
          </div>
        )}

        {validationErrors.length > 0 && (
          <div
            className="alert"
            style={{
              marginTop: "1rem",
              borderLeft: "4px solid var(--danger-red)",
              background: "rgba(239, 68, 68, 0.1)",
              color: "var(--danger-red)",
              maxHeight: "200px",
              overflow: "auto",
            }}
          >
            <strong>VALIDATION ERRORS ({validationErrors.length}):</strong>
            <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem", fontSize: "0.85rem" }}>
              {validationErrors.map((err, i) => (
                <li key={i} style={{ marginBottom: "0.5rem", whiteSpace: "pre-wrap" }}>
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}

        {validationWarnings.length > 0 && (
          <div
            className="alert"
            style={{
              marginTop: "1rem",
              borderLeft: "4px solid var(--spark-yellow)",
              background: "rgba(252, 211, 77, 0.1)",
              color: "var(--spark-yellow)",
              maxHeight: "150px",
              overflow: "auto",
            }}
          >
            <strong>WARNINGS ({validationWarnings.length}):</strong>
            <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem", fontSize: "0.85rem" }}>
              {validationWarnings.map((warn, i) => (
                <li key={i} style={{ marginBottom: "0.5rem", whiteSpace: "pre-wrap" }}>
                  {warn}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <StrategyEditor onChange={handleCodeChange} />
      </div>

      {/* Footer */}
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
        REQUIRED: YOUR STRATEGY MUST EXPORT{" "}
        <code style={{ background: "var(--graphite-200)", padding: "0.2rem 0.4rem" }}>
          METADATA
        </code>{" "}
        AND{" "}
        <code style={{ background: "var(--graphite-200)", padding: "0.2rem 0.4rem" }}>
          CREATESTRATEGY
        </code>
      </div>
    </div>
  );
}
