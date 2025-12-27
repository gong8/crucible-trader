"use client";

import { useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

interface StrategyEditorProps {
  initialCode?: string;
  onChange?: (code: string) => void;
  readOnly?: boolean;
}

const DEFAULT_TEMPLATE = `import type { StrategyBar, StrategySignal, StrategyContext } from "@crucible-trader/sdk";

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
  // Track state between bars
  const bars: StrategyBar[] = [];

  return {
    /**
     * Called once before the backtest starts.
     */
    onInit(context: StrategyContext): void {
      console.log(\`Strategy initialized for symbol: \${context.symbol}\`);
    },

    /**
     * Called for each bar in the backtest.
     * @param context - Strategy context with symbol info
     * @param bar - Current price bar
     * @returns Signal object or null
     */
    onBar(context: StrategyContext, bar: StrategyBar): StrategySignal | null {
      // Store bars for indicator calculations
      bars.push(bar);

      // Not enough data yet
      if (bars.length < config.period) {
        return null;
      }

      // TODO: Implement your strategy logic here
      // 1. Calculate indicators using bars array
      // 2. Generate buy/sell signals
      // 3. Return signal object with side, timestamp, and reason

      // Example signal (replace with your logic):
      // return {
      //   side: "buy",
      //   timestamp: bar.timestamp,
      //   reason: "Your entry reason here"
      // };

      return null;
    },

    /**
     * Called once at the end of the backtest.
     */
    onStop(context: StrategyContext): StrategySignal | null {
      // Optional: Return exit signal to close any open positions
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

  const handleBeforeMount = (monaco: Monaco) => {
    // Disable JavaScript validation (we only want TypeScript)
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    // Configure TypeScript compiler options
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      allowJs: false,
      strict: false,
      typeRoots: ["node_modules/@types"],
    });

    // Enable TypeScript diagnostics
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    // Add type definitions for @crucible-trader/sdk
    const sdkTypes = `
declare module "@crucible-trader/sdk" {
  export interface StrategyBar {
    readonly timestamp: string;
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume: number;
  }

  export interface StrategySignal {
    readonly side: "buy" | "sell";
    readonly timestamp: string;
    readonly reason: string;
    readonly strength?: number;
  }

  export interface StrategyContext {
    readonly symbol: string;
  }

  export interface Strategy {
    onInit?(context: StrategyContext): void;
    onBar(context: StrategyContext, bar: StrategyBar): StrategySignal | null;
    onStop?(context: StrategyContext): StrategySignal | null;
  }
}
`;
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      sdkTypes,
      "file:///node_modules/@crucible-trader/sdk/index.d.ts",
    );
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
      fixedOverflowWidgets: true, // Keep tooltips/widgets within editor bounds
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
          language="typescript"
          defaultLanguage="typescript"
          value={code}
          onChange={handleEditorChange}
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          theme={theme}
          path="strategy.tsx"
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
            fixedOverflowWidgets: true,
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
