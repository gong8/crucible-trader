import React from "react";

export function Divider() {
  return (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--graphite-200)",
        margin: "var(--space-sm) 0",
      }}
    />
  );
}
