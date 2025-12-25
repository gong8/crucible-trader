"use client";

import { useEffect, useState } from "react";

import type { RiskProfile } from "@crucible-trader/sdk";

import { apiRoute } from "../../lib/api";

export default function RiskPage(): JSX.Element {
  const [profiles, setProfiles] = useState<RiskProfile[]>([]);
  const [form, setForm] = useState<RiskProfile>({
    id: "default",
    name: "default",
    maxDailyLossPct: 0.03,
    maxPositionPct: 0.2,
    perOrderCapPct: 0.1,
    globalDDKillPct: 0.05,
    cooldownMinutes: 15,
  });
  const [status, setStatus] = useState<string | null>(null);

  const loadProfiles = async (): Promise<void> => {
    try {
      const response = await fetch(apiRoute("/api/risk-profiles"), {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("failed to load profiles");
      }
      const payload = (await response.json()) as RiskProfile[];
      setProfiles(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error(error);
      setStatus("unable to load profiles");
    }
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  const handleSubmit = async (): Promise<void> => {
    setStatus("saving profile…");
    try {
      const response = await fetch(apiRoute("/api/risk-profiles"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await loadProfiles();
      setStatus("profile saved");
    } catch (error) {
      console.error(error);
      setStatus("unable to save profile");
    }
  };

  return (
    <section className="grid" aria-label="risk profiles" style={{ gap: "1rem" }}>
      <header className="grid" style={{ gap: "0.5rem" }}>
        <h1 className="section-title">risk profiles</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          configure per-run guardrails used by the engine.
        </p>
      </header>

      <div className="card" style={{ display: "grid", gap: "0.5rem" }}>
        <div className="grid">
          <label>
            profile id
            <input
              value={form.id}
              onChange={(event) => setForm({ ...form, id: event.currentTarget.value })}
            />
          </label>
          <label>
            name
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
            />
          </label>
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "0.75rem" }}
        >
          <label>
            max daily loss %
            <input
              type="number"
              step="0.01"
              value={form.maxDailyLossPct}
              onChange={(event) =>
                setForm({ ...form, maxDailyLossPct: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            max position %
            <input
              type="number"
              step="0.01"
              value={form.maxPositionPct}
              onChange={(event) =>
                setForm({ ...form, maxPositionPct: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            per order cap %
            <input
              type="number"
              step="0.01"
              value={form.perOrderCapPct}
              onChange={(event) =>
                setForm({ ...form, perOrderCapPct: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            kill switch drawdown %
            <input
              type="number"
              step="0.01"
              value={form.globalDDKillPct}
              onChange={(event) =>
                setForm({ ...form, globalDDKillPct: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            cooldown minutes
            <input
              type="number"
              value={form.cooldownMinutes}
              onChange={(event) =>
                setForm({ ...form, cooldownMinutes: Number(event.currentTarget.value) })
              }
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #f97316",
            background: "#f97316",
            color: "#0f172a",
            cursor: "pointer",
          }}
        >
          save profile
        </button>
        {status ? <div className="alert">{status}</div> : null}
      </div>

      <div className="grid" style={{ gap: "0.75rem" }}>
        {profiles.length === 0 ? (
          <div className="alert">no profiles saved yet.</div>
        ) : (
          profiles.map((profile) => (
            <article key={profile.id} className="card" aria-label={`profile ${profile.id}`}>
              <header
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <strong>{profile.name}</strong>
                <span style={{ color: "#38bdf8" }}>{profile.id}</span>
              </header>
              <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.5rem" }}>
                max position {toPercent(profile.maxPositionPct)} · kill switch{" "}
                {toPercent(profile.globalDDKillPct)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

const toPercent = (value: number): string => `${(value * 100).toFixed(2)}%`;
