import type { StrategyConfig, StrategyField } from "@crucible-trader/sdk";
import type { ZodIssue } from "zod";

interface CustomStrategyConfigSchema {
  [key: string]: {
    type: "number" | "string" | "boolean";
    label: string;
    default: number | string | boolean;
    min?: number;
    max?: number;
    step?: number;
    description?: string;
  };
}

interface StrategyControlsProps {
  readonly config?: StrategyConfig;
  readonly customConfig?: CustomStrategyConfigSchema;
  readonly values: Record<string, string | number>;
  readonly onChange: (field: string, value: string | number) => void;
  readonly errors?: Record<string, string | undefined>;
}

export const mapZodIssues = (issues: ReadonlyArray<ZodIssue>): Record<string, string> => {
  const messages: Record<string, string> = {};
  for (const issue of issues) {
    const key = Array.isArray(issue.path) ? (issue.path[0] as string) : undefined;
    if (key) {
      messages[key] = issue.message;
    }
  }
  return messages;
};

const formatField = (field: StrategyField, value: number): string => {
  if (Number.isFinite(field.step ?? 0.001)) {
    return value.toString();
  }
  return value.toString();
};

export function StrategyControls({
  config,
  customConfig,
  values,
  onChange,
  errors = {},
}: StrategyControlsProps): JSX.Element {
  // Render built-in strategy fields
  if (config) {
    return (
      <div className="grid" style={{ gap: "0.75rem" }}>
        {config.fields.map((field) => {
          const currentValue = values[field.key] ?? 0;
          const error = errors[field.key];
          return (
            <label key={field.key} style={{ display: "grid", gap: "0.25rem" }}>
              <span style={{ fontWeight: 500 }}>
                {field.label}
                {field.description ? (
                  <span style={{ marginLeft: "0.35rem", color: "#94a3b8", fontWeight: 400 }}>
                    {field.description}
                  </span>
                ) : null}
              </span>
              <input
                type="number"
                value={
                  Number.isFinite(currentValue) ? formatField(field, currentValue as number) : ""
                }
                min={field.min}
                max={field.max}
                step={field.step ?? "any"}
                onChange={(event) => {
                  const parsed = Number(event.currentTarget.value);
                  onChange(field.key, Number.isNaN(parsed) ? 0 : parsed);
                }}
              />
              {error ? <span style={{ color: "#f97316", fontSize: "0.8rem" }}>{error}</span> : null}
            </label>
          );
        })}
      </div>
    );
  }

  // Render custom strategy fields
  if (customConfig) {
    return (
      <div className="grid" style={{ gap: "0.75rem" }}>
        {Object.entries(customConfig).map(([key, field]) => {
          if (field.type !== "number") return null; // Only handle number fields for now
          const currentValue = values[key] ?? field.default;
          const error = errors[key];
          return (
            <label key={key} style={{ display: "grid", gap: "0.25rem" }}>
              <span style={{ fontWeight: 500 }}>
                {field.label}
                {field.description ? (
                  <span style={{ marginLeft: "0.35rem", color: "#94a3b8", fontWeight: 400 }}>
                    {field.description}
                  </span>
                ) : null}
              </span>
              <input
                type="number"
                value={
                  Number.isFinite(currentValue as number) ? (currentValue as number).toString() : ""
                }
                min={field.min}
                max={field.max}
                step={field.step ?? "any"}
                onChange={(event) => {
                  const parsed = Number(event.currentTarget.value);
                  onChange(key, Number.isNaN(parsed) ? 0 : parsed);
                }}
              />
              {error ? <span style={{ color: "#f97316", fontSize: "0.8rem" }}>{error}</span> : null}
            </label>
          );
        })}
      </div>
    );
  }

  return <div>No strategy configuration available</div>;
}
