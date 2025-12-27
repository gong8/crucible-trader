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
  const [hasChanges, setHasChanges] = useState(false);

  // Load strategy code
  useEffect(() => {
    async function loadStrategy() {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
        const response = await fetch(`${apiUrl}/api/strategies/${strategyId}`);

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
  };

  const handleSaveStrategy = async () => {
    setError(null);
    setSaving(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
      const response = await fetch(`${apiUrl}/api/strategies/${strategyId}`, {
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
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
      const response = await fetch(`${apiUrl}/api/strategies/${strategyId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete strategy");
      }

      router.push("/strategies");
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
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading strategy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Edit Strategy</h1>
            <p className="text-gray-600 text-sm mt-1">
              ID: <code className="bg-gray-100 px-2 py-1 rounded">{strategyId}</code>
              {hasChanges && (
                <span className="ml-2 text-orange-600 font-medium">● Unsaved changes</span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDeleteStrategy}
              disabled={deleting}
              className="px-4 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveStrategy}
              disabled={saving || !hasChanges}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Error Messages */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <StrategyEditor initialCode={code} onChange={handleCodeChange} />
      </div>

      {/* Status Bar */}
      <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 text-sm text-gray-600">
        {hasChanges ? (
          <span className="text-orange-600 font-medium">
            ● You have unsaved changes. Press Ctrl+S (Cmd+S) to save.
          </span>
        ) : (
          <span className="text-green-600">✓ All changes saved</span>
        )}
      </div>
    </div>
  );
}
