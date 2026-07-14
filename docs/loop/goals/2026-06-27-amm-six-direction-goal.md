# AMM Six-Direction Product Goal

Status: complete
Date: 2026-06-27

## Objective

Complete the six product directions for Agent Memory Manager so the app becomes a reliable local memory understanding tool, not a memory-admin dashboard.

## Loop Mode

`/goal`

## User Need

The user wants AMM to show how Codex truly understands them from local memory, while remaining responsive and correct when Codex generation is slow, wrong, cancelled, or retried.

## Directions

1. Stability: profile regeneration and audit work must run as visible background tasks, not freeze the desktop app.
2. Real memory profile: generated sections must be discovered from local evidence, not fixed category titles.
3. Correction loop: when the user says a profile section is wrong, the app should draft a safe correction note, write it, reload memory, and let regeneration reflect the change.
4. Information architecture: the first screen should emphasize "how AI understands me"; sources, audit, and evidence should stay accessible without feeling like a backend console.
5. Evidence trust: every profile section needs evidence, confidence, and stability/recent/uncertain framing.
6. Engineering loop: the repo should preserve goal docs, verification commands, task-state checks, and handoff evidence so Codex can continue without chat memory.

## Current Baseline

- Sidebar has been simplified to Home, Memory, and Audit/Check.
- The default Home view now leads directly with the long-form memory profile rather than metric cards.
- Memory view shows long-form profile sections rather than raw cards.
- Profile generation uses Codex with schema and evidence validation.
- Fixed template Codex section titles are rejected; deterministic fallback now uses current-memory anchors and evidence.
- Startup uses cached/lightweight profile loading instead of automatically launching Codex.
- Profile regeneration now has a backend task state: start, poll, cancel.
- Codex exec has timeout handling and cancellation checks.

## Acceptance Criteria

### Stability

- Clicking Regenerate returns quickly and does not block navigation or other UI interaction.
- The UI exposes running and cancelling states.
- Cancel requests stop the current Codex process or mark the task cancelled before accepting a new run.
- Timeout leaves the app usable and reports failure or deterministic fallback clearly.
- Retry after failed or cancelled generation starts a new task.

### Real Memory Profile

- Codex output uses dynamic section ids and specific observation titles derived from evidence.
- Template titles such as `概览`, `开发工具与技术兴趣`, and `学习方式偏好` are rejected for Codex-generated profiles.
- Each section body uses natural Chinese and avoids raw copied memory fragments where synthesis is possible.
- Cached profiles are invalidated when their source hash or schema no longer matches.

### Correction Loop

- "This is wrong" drafts a correction note with the profile section and evidence.
- Writing the correction invalidates scan/profile cache.
- Regeneration after correction can surface the corrected memory without restarting the app.
- Correction writes remain under the existing safe ad-hoc note path boundary.

### Information Architecture

- The default experience leads with a calm overview and the Memory profile.
- Evidence and source browsing are secondary inspection paths.
- Audit/Check remains available but does not dominate the first-run mental model.
- UI labels avoid teaching the user internal implementation concepts.

### Evidence Trust

- Profile sections show confidence and stability.
- Evidence links open known local source files when present in the scan.
- Stale or uncertain material is not presented as stable current understanding.
- Review/audit evidence remains validated against scanned sources and line ranges.

### Engineering Loop

- `pnpm verify` passes.
- Focused tests cover task-state behavior and profile generation boundaries.
- Live or browser-equivalent verification is recorded when UI behavior changes.
- A handoff/verification record documents completed work and remaining gaps.

## Ordered Execution Plan

1. Finish the stability task system.
   - Keep `load_memory_profile` lightweight.
   - Use `start_memory_profile_generation`, `get_memory_profile_generation`, and `cancel_memory_profile_generation` for profile regeneration.
   - Ensure Codex child processes can be cancelled or timed out.
   - Cover start, cancel, success, failure, and retry behavior.

2. Harden real memory profile generation.
   - Keep schema dynamic.
   - Strengthen prompt and validation for evidence-derived titles.
   - Add fixture examples that look like real observations, not category labels.

3. Complete correction-to-regeneration flow.
   - Verify correction draft content is useful.
   - After write, rescan and reload profile.
   - Make retry/regenerate flow obvious after correction.

4. Simplify IA around the profile.
   - Reduce always-visible metadata.
   - Keep evidence behind details/open-source affordances.
   - Preserve Audit/Check for deliberate review.

5. Improve evidence trust display.
   - Make confidence/stability visible but quiet.
   - Surface stale/uncertain states only where they matter.
   - Keep source validation strict.

6. Record verification and handoff.
   - Run focused tests after each slice.
   - Run `pnpm verify` before stopping.
   - Record evidence in `docs/loop/verification/2026-06-27-amm-six-direction-goal.md`.

## Current Active Slice

Engineering loop, slice 6: stability, correction loop, IA, evidence trust, deterministic fallback, real Codex profile generation, reusable profile-cache quality verification, debug bundle executable selection, and requirement-by-requirement acceptance audit have focused evidence. Live desktop click verification is accepted as an external macOS AX/Computer Use capture limitation tracked separately; next work should run final verification and mark the goal complete if the current evidence still passes.

## Verification Commands

Focused:

```bash
pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml memory::profile -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml memory::commands -- --nocapture
pnpm profile:generate:codex
pnpm profile:verify
```

Final:

```bash
pnpm verify
```

## Stop Condition

Stop only when all six direction acceptance criteria pass, `pnpm verify` passes, and a verification record explains what changed, what was tested, what remains risky, and how the next Codex session should continue.
