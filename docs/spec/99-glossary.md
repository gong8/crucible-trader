## Purpose

Collect short definitions for recurring Crucible terms so contributors share the same vocabulary.

## Inputs

- Terms from the master spec (runs, manifests, guardrails, datasets, presets).
- Feedback from docs/users whenever ambiguity appears.

## Outputs

- Single markdown table/section that can be referenced from other docs.
- Consistent naming for UI labels, API fields, and log messages.

## Invariants

- Entries stay concise (1–2 sentences).
- Each term links back to the module that owns it when relevant.

## Example

`Run Manifest` → “JSON summary emitted after each run containing metrics, artifact paths, dataset metadata, engine seed.”

## Test Checklist

- When a new module introduces terminology, this file gains an entry in the same PR.
