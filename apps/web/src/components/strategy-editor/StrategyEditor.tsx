"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";

interface StrategyEditorProps {
  initialCode?: string;
  onChange?: (code: string) => void;
  readOnly?: boolean;
}

const DEFAULT_TEMPLATE = `import type { Bar, Signal } from "@crucible-trader/sdk";

export interface StrategyConfig {
  // Add your configuration parameters here
  period: number;
}

export const metadata = {
  name: "my-custom-strategy",
  description: "Describe what your strategy does",
  version: "1.0.0",
  author: "Your Name",
  tags: ["custom"],
};

/**
 * Create a strategy instance with the given configuration.
 */
export function createStrategy(config: StrategyConfig) {
  // Initialize any state here

  return {
    /**
     * Called for each bar in the backtest.
     */
    onBar(bar: Bar, index: number, bars: ReadonlyArray<Bar>): Signal | null {
      // Not enough data yet
      if (index < config.period) {
        return null;
      }

      // TODO: Implement your strategy logic here
      // 1. Calculate indicators
      // 2. Generate buy/sell signals
      // 3. Return 'buy', 'sell', or null

      return null;
    },
  };
}
`;

export default function StrategyEditor({
  initialCode = DEFAULT_TEMPLATE,
  onChange,
  readOnly = false,
}: StrategyEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [theme] = useState<"vs-dark" | "light">("vs-dark");

  const handleEditorChange = (value: string | undefined) => {
    const newCode = value ?? "";
    setCode(newCode);
    onChange?.(newCode);
  };

  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editor.updateOptions({
      fontSize: 13,
      tabSize: 2,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      formatOnPaste: true,
      formatOnType: true,
      fontFamily: "'JetBrains Mono', 'Consolas', 'Monaco', monospace",
    });

    editor.addCommand(2097 | 49, () => {
      const event = new CustomEvent("editor-save", { detail: { code } });
      window.dispatchEvent(event);
    });
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--graphite-300)",
          borderBottom: "1px solid var(--graphite-100)",
          padding: "0.6rem 1rem",
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ color: "var(--ember-orange)" }}>STRATEGY EDITOR</span>
          <span style={{ color: "var(--steel-400)" }}>TYPESCRIPT</span>
        </div>
        <div style={{ color: "var(--steel-400)" }}>LINES: {code.split("\n").length}</div>
      </div>

      {/* Monaco Editor */}
      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          defaultLanguage="typescript"
          value={code}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          theme={theme}
          options={{
            readOnly,
            minimap: { enabled: true },
            fontSize: 13,
            tabSize: 2,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            formatOnPaste: true,
            formatOnType: true,
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            fontFamily: "'JetBrains Mono', 'Consolas', 'Monaco', monospace",
          }}
          loading={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                background: "var(--graphite-500)",
                color: "var(--steel-200)",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    border: "3px solid var(--graphite-100)",
                    borderTopColor: "var(--ember-orange)",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                    margin: "0 auto 1rem",
                  }}
                />
                <p
                  style={{
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  LOADING EDITOR...
                </p>
              </div>
            </div>
          }
        />
      </div>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
