import React from "react";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-md)",
        cursor: "pointer",
        padding: "var(--space-sm) 0",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: "18px",
          height: "18px",
          accentColor: "var(--ember-orange)",
          cursor: "pointer",
        }}
      />
      <span style={{ fontSize: "0.9rem", color: "var(--steel-100)" }}>{label}</span>
    </label>
  );
}
