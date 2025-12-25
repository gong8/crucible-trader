import type { StrategyConfig, StrategyField } from "@crucible-trader/sdk";
import type { ZodIssue } from "zod";

interface StrategyControlsProps {
  readonly config: StrategyConfig;
  readonly values: Record<string, number>;
  readonly onChange: (field: string, value: number) => void;
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
  values,
  onChange,
  errors = {},
}: StrategyControlsProps): JSX.Element {
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
              value={Number.isFinite(currentValue) ? formatField(field, currentValue) : ""}
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
