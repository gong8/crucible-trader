import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { NavBar } from "@/components/navigation/NavBar";

export const metadata: Metadata = {
  title: "crucible trader",
  description: "phase 0 run console",
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <NavBar />
        </Suspense>
        <main>{children}</main>
        <footer
          style={{
            maxWidth: "1400px",
            margin: "4rem auto 0",
            padding: "2rem",
            textAlign: "center",
            fontSize: "0.75rem",
            color: "var(--steel-400)",
            borderTop: "1px solid var(--graphite-100)",
          }}
        >
          <p style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>
            trial by fire — only truth survives
          </p>
        </footer>
      </body>
    </html>
  );
}
