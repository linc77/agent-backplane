# Source-First Memory Design

Status: completed
Date: 2026-06-09

## Intent

Redesign AMM around the real Codex memory files instead of topic-first buckets. The user should understand where memory comes from, which sources are trusted, which facts are effective now, and what needs review.

## Decision

Make memory source kind the primary information architecture. Keep topic labels as filters or badges inside derived views, not as the top-level navigation. Preserve safe correction writes and Codex Audit behavior.

Source priority:

1. `extensions/ad_hoc/notes/*.md`
2. `MEMORY.md`
3. `memory_summary.md`
4. `skills/*/SKILL.md`
5. `rollout_summaries/*.md`
6. `raw_memories.md`
7. `extensions/chronicle/resources/*.md`

## Scope

- Replace the left navigation with source-first sections: Overview, Effective Memory, Sources, Review.
- Add source-kind views for summary, registry, corrections, session summaries, activity records, raw memory, and skills.
- Add an overview that explains scanned source distribution, priority stack, and review load using live scan data.
- Keep entry selection, source opening, correction drafting, root override, global search, and Codex Audit.
- Update tests to assert the new source-first workflow.

## Out Of Scope

- Backend memory deletion, migration, or consolidation.
- Changing Codex's actual memory ingestion behavior.
- New write targets outside `extensions/ad_hoc/notes/`.
- Replacing Codex Audit JSON schema.

## Acceptance Criteria

- The sidebar no longer presents `Profile / Projects / Rules / Tools / Writing` as the primary structure.
- The first screen shows real source categories and makes the difference between effective memory, review items, and raw evidence clear.
- Source views are filtered by actual `MemorySourceKind`, with counts derived from scanned files.
- Effective Memory still exposes profile/project/rule/tool/writing entries and correction notes without mixing chronicle activity as current truth.
- Review still exposes Audit, Conflicts, and Corrections.
- Existing safe correction and source-open workflows continue to work.
- The browser fixture flow proves the new source-first navigation without relying on code inspection alone.

## Ordered Implementation Steps

1. Introduce source-first navigation/view definitions and live count helpers.
2. Refactor the board to render overview, effective memory, source-kind views, review views, and existing Audit.
3. Update tests and fixture data for source-first behavior.
4. Run user-like UI verification and repo checks; record evidence.
5. Run handoff verification for the `/goal`.

## Probe Per Step

- Step 1: `pnpm vitest run src/App.test.tsx -- -t "source-first"`
- Step 2: `pnpm vitest run src/App.test.tsx src/App.fixture.test.tsx`
- Step 3: `pnpm vitest run src/App.test.tsx src/App.fixture.test.tsx`
- Step 4: browser fixture probe on `http://localhost:1420/?fixture=1`, then `pnpm verify && git diff --check`.
- Step 5: fresh-agent read of `docs/loop/goals/2026-06-09-source-first-memory-design.md` and this plan.

## Final Verification

Open the live Tauri/Vite app in fixture mode, verify the sidebar and board communicate the source-first model, verify source open/correction/audit remain usable in tests, then run `pnpm verify && git diff --check`.
