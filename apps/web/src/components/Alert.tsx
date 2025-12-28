import React from "react";

export interface AlertProps {
  type: "success" | "error" | "warning";
  children: React.ReactNode;
  onClose?: () => void;
}

export function Alert({ type, children, onClose }: AlertProps) {
  const colors = {
    success: {
      border: "var(--success-green)",
      bg: "rgba(16, 185, 129, 0.1)",
      text: "var(--success-green)",
    },
    error: {
      border: "var(--danger-red)",
      bg: "rgba(239, 68, 68, 0.1)",
      text: "var(--danger-red)",
    },
    warning: {
      border: "var(--spark-yellow)",
      bg: "rgba(255, 210, 63, 0.1)",
      text: "var(--spark-yellow)",
    },
  };

  return (
    <div
      style={{
        padding: "var(--space-lg) var(--space-xl)",
        marginTop: "var(--space-lg)",
        borderRadius: "6px",
        border: `1px solid ${colors[type].border}`,
        background: colors[type].bg,
        color: colors[type].text,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "0.85rem",
      }}
    >
      <span>{children}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            fontSize: "1.2rem",
            cursor: "pointer",
            padding: "0 var(--space-sm)",
          }}
          aria-label="Close alert"
        >
          ×
        </button>
      )}
    </div>
  );
}
