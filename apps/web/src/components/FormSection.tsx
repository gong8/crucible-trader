import React from "react";

export interface FormSectionProps {
  title: string;
  children: React.ReactNode;
}

export function FormSection({ title, children }: FormSectionProps) {
  return (
    <section
      style={{
        background: "var(--graphite-400)",
        border: "1px solid var(--graphite-200)",
        borderRadius: "8px",
        padding: "var(--space-xl)",
        marginBottom: "var(--space-xl)",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <h2
        style={{
          fontSize: "0.85rem",
          fontWeight: "700",
          color: "var(--ember-orange)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "var(--space-xl)",
          paddingBottom: "var(--space-md)",
          borderBottom: "1px solid var(--graphite-200)",
        }}
      >
        {title}
      </h2>
      <div style={{ display: "grid", gap: "var(--space-xl)" }}>{children}</div>
    </section>
  );
}
