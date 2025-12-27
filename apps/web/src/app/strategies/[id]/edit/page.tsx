"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import StrategyEditor from "@/components/strategy-editor/StrategyEditor";

export default function EditStrategyPage() {
  const router = useRouter();
  const params = useParams();
  const strategyId = params.id as string;

  const [code, setCode] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Load strategy code
  useEffect(() => {
    async function loadStrategy() {
      try {
        const response = await fetch(`/api/strategies/${strategyId}`);

        if (!response.ok) {
          throw new Error("Strategy not found");
        }

        const data = await response.json();
        setCode(data.code);
        setOriginalCode(data.code);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load strategy");
      } finally {
        setLoading(false);
      }
    }

    loadStrategy();
  }, [strategyId]);

  // Listen for Ctrl+S / Cmd+S from editor
  useEffect(() => {
    const handleSave = () => {
      handleSaveStrategy();
    };

    window.addEventListener("editor-save", handleSave);
    return () => window.removeEventListener("editor-save", handleSave);
  }, [code]);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    setHasChanges(newCode !== originalCode);
    setError(null);
    setValidationErrors([]);
    setValidationWarnings([]);
  };

  const handleSaveStrategy = async () => {
    setError(null);
    setValidationErrors([]);
    setValidationWarnings([]);

    // Run validation first
    try {
      const validationResponse = await fetch("/api/strategies/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          name: strategyId,
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

      // Show warnings but allow saving
      if (validationResult.warningMessages && validationResult.warningMessages.length > 0) {
        setValidationWarnings(validationResult.warningMessages);
      }
    } catch (err) {
      setError("Failed to validate strategy");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/strategies/${strategyId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save strategy");
      }

      setOriginalCode(code);
      setHasChanges(false);

      // Show success (could use a toast notification)
      alert("Strategy saved successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save strategy");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStrategy = async () => {
    if (!confirm("Are you sure you want to delete this strategy? This action cannot be undone.")) {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch(`/api/strategies/${strategyId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete strategy");
      }

      router.push("/strategies");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete strategy");
      setDeleting(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges && !confirm("You have unsaved changes. Discard them?")) {
      return;
    }
    router.push("/strategies");
    router.refresh();
  };

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--graphite-500)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "3px solid var(--graphite-200)",
              borderTop: "3px solid var(--ember-orange)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 1rem",
            }}
          ></div>
          <p
            style={{
              color: "var(--steel-300)",
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            LOADING STRATEGY...
          </p>
        </div>
      </div>
    );
  }

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
              EDIT STRATEGY
            </h1>
            <p
              style={{
                color: "var(--steel-400)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              ID: {strategyId}
              {hasChanges && (
                <span
                  style={{
                    marginLeft: "1rem",
                    color: "var(--spark-yellow)",
                    fontWeight: 600,
                  }}
                >
                  ● UNSAVED CHANGES
                </span>
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={handleDeleteStrategy}
              disabled={deleting}
              className="btn-secondary"
              style={{
                borderColor: "var(--danger-red)",
                color: "var(--danger-red)",
              }}
            >
              {deleting ? "DELETING..." : "DELETE"}
            </button>
            <button onClick={handleCancel} className="btn-secondary">
              CANCEL
            </button>
            <button
              onClick={handleSaveStrategy}
              disabled={saving || !hasChanges}
              className="btn-primary"
            >
              {saving ? "SAVING..." : "SAVE CHANGES"}
            </button>
          </div>
        </div>

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
        <StrategyEditor initialCode={code} onChange={handleCodeChange} />
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
        {hasChanges ? (
          <span style={{ color: "var(--spark-yellow)", fontWeight: 600 }}>
            ● YOU HAVE UNSAVED CHANGES. PRESS CTRL+S (CMD+S) TO SAVE.
          </span>
        ) : (
          <span style={{ color: "var(--success-green)" }}>✓ ALL CHANGES SAVED</span>
        )}
      </div>
    </div>
  );
}
