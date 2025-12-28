"use client";

import { useEffect, useState } from "react";

import type { RiskProfile } from "@crucible-trader/sdk";

import { apiRoute } from "../../lib/api";
import { Alert } from "../../components";

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
        <p style={{ color: "var(--steel-200)", fontSize: "0.9rem" }}>
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
              onChange={(event) => {
                const val = event.currentTarget.value;
                setForm({ ...form, maxDailyLossPct: val === "" ? 0 : Number(val) });
              }}
            />
          </label>
          <label>
            max position %
            <input
              type="number"
              step="0.01"
              value={form.maxPositionPct}
              onChange={(event) => {
                const val = event.currentTarget.value;
                setForm({ ...form, maxPositionPct: val === "" ? 0 : Number(val) });
              }}
            />
          </label>
          <label>
            per order cap %
            <input
              type="number"
              step="0.01"
              value={form.perOrderCapPct}
              onChange={(event) => {
                const val = event.currentTarget.value;
                setForm({ ...form, perOrderCapPct: val === "" ? 0 : Number(val) });
              }}
            />
          </label>
          <label>
            kill switch drawdown %
            <input
              type="number"
              step="0.01"
              value={form.globalDDKillPct}
              onChange={(event) => {
                const val = event.currentTarget.value;
                setForm({ ...form, globalDDKillPct: val === "" ? 0 : Number(val) });
              }}
            />
          </label>
          <label>
            cooldown minutes
            <input
              type="number"
              value={form.cooldownMinutes}
              onChange={(event) => {
                const val = event.currentTarget.value;
                setForm({ ...form, cooldownMinutes: val === "" ? 0 : Number(val) });
              }}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          className="btn-primary"
        >
          save profile
        </button>
        {status ? (
          <Alert
            type={
              status.includes("unable") || status.includes("failed")
                ? "error"
                : status.includes("saved")
                  ? "success"
                  : "warning"
            }
          >
            {status}
          </Alert>
        ) : null}
      </div>

      <div className="grid" style={{ gap: "0.75rem" }}>
        {profiles.length === 0 ? (
          <Alert type="warning">no profiles saved yet.</Alert>
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
                <span style={{ color: "var(--ember-orange)" }}>{profile.id}</span>
              </header>
              <p style={{ fontSize: "0.85rem", color: "var(--steel-200)", marginTop: "0.5rem" }}>
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
