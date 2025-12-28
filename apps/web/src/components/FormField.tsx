import React from "react";

export interface FormFieldProps {
  label: string;
  children: React.ReactNode;
}

export function FormField({ label, children }: FormFieldProps) {
  return (
    <label style={{ display: "grid", gap: "var(--space-sm)" }}>
      <span
        style={{
          fontSize: "0.8rem",
          color: "var(--steel-200)",
          fontWeight: "500",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
