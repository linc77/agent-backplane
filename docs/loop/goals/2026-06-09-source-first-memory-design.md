# Source-First Memory Design Goal

Objective: Redesign Agent Memory Manager around real Codex memory data sources, with source-first navigation, effective memory views, review workflow, and user-like verification.
Loop mode: /goal
Status: completed
Plan artifact: docs/loop/plans/2026-06-09-source-first-memory-design.md
Active step: completed
Verification target: Browser fixture on `http://localhost:1420/?fixture=1`, focused Vitest probes, `pnpm verify`, and `git diff --check`.
Baseline: Current `main` already passes `pnpm verify && git diff --check`; feature baseline is the screenshot feedback that topic-first navigation is confusing.
Record path: docs/loop/verification/2026-06-09-source-first-memory-design.md
Handoff target: docs/loop/verification/2026-06-09-source-first-memory-design-handoff.md
Stop condition: stop when source-first UI passes user-like fixture verification, repo checks pass, and durable evidence is recorded.
