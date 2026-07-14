# Memory Truth Console

Status: active
Date: 2026-06-15

## Intent

Make AMM answer the user's first question: which memories are usable now, which are stale, which are uncertain, and why. Treat source files as evidence, not the primary product surface.

## Decision

Introduce a deterministic `MemoryTruth` layer before changing the visual design. It resolves scanned memory slices into claim-like truth items with status, evidence, priority, stale candidates, and review reasons. The UI should lead with Current Truth and Review Queue; Sources remain available for inspection.

Resolution order:

1. `extensions/ad_hoc/notes/*.md`
2. `MEMORY.md`
3. `memory_summary.md`
4. `skills/*/SKILL.md`
5. `rollout_summaries/*.md`
6. `raw_memories.md`
7. `extensions/chronicle/resources/*.md`

## Scope

- Add a frontend truth resolver over the existing `ScanResult`.
- Replace Effective Memory with Current Truth backed by resolved items.
- Add a Review Queue for stale, uncertain, and conflicting memory.
- Show decision path, evidence, stale candidates, and safe correction actions in the inspector.
- Keep Codex Audit as an optional review/audit view, not the default truth model.

## Out Of Scope

- Editing Codex memory ingestion behavior.
- Automatic deletion or mutation of existing memory files.
- Graph, 3D, embeddings, or timeline-first visualization.
- Replacing the Rust scanner or Codex Audit schema.

## Acceptance Criteria

- Current Truth is derived from resolved memory items, not raw source filtering.
- Review Queue groups stale, uncertain, and conflicting items with user-facing reasons.
- Each current item explains its winning evidence, source priority, and displaced stale candidates.
- Inspector exposes the resolution path and keeps correction writes under the existing safe ad-hoc note flow.
- Source browsing and audit reports still work.

## Ordered Implementation Steps

1. Add `memoryTruth` model and focused resolver tests.
2. Route `effective` and `conflicts` view counts/lists through the truth model.
3. Rename and reshape the UI around Current Truth and Review Queue.
4. Extend Inspector to explain resolution status, evidence, stale candidates, and review action.
5. Verify with focused tests, browser fixture review, `pnpm verify`, and loop records.

## Probe Per Step

1. `pnpm exec vitest run src/lib/memoryTruth.test.ts`
2. `pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx`
3. Browser fixture on `http://127.0.0.1:8765/?fixture=1&tab=effective`
4. Browser fixture on `http://127.0.0.1:8765/?fixture=1&tab=conflicts`
5. `pnpm verify`

## Final Verification

Use fixture data to prove Current Truth and Review Queue are understandable without live Codex memory changes, then run the full repo verification and record evidence in `docs/loop/verification/2026-06-15-memory-truth-console.md`.
