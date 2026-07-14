# Source-First Memory Design Verification

Date: 2026-06-09

## Acceptance Target

AMM uses real Codex memory source kinds as the primary information architecture, keeps effective memory separate from raw activity evidence, and preserves review/correction/source-open flows.

## Baseline

The previous sidebar exposed topic buckets (`Profile`, `Projects`, `Rules`, `Tools`, `Writing`) as the main structure. User feedback: this was visually and conceptually confusing because it hid the real Codex memory data sources.

## Probe Run

- `pnpm vitest run src/App.test.tsx src/App.fixture.test.tsx`
- `pnpm verify && git diff --check`
- Chrome fixture inspection at `http://localhost:1420/?fixture=1`

## Expected Result

- First screen shows source-first structure.
- Sidebar sections are `Memory Model`, `Sources`, and `Review`.
- Overview shows scanned source counts, effective entry count, review load, and source priority.
- Effective Memory shows current derived entries without chronicle activity cards.
- Source views are filtered by actual source kind.
- Audit, corrections, source open, and safe write flows remain covered.

## Observed Result

- Focused UI tests passed: 2 files, 15 tests.
- Full verification passed: 4 test files, 21 frontend tests, frontend build, 33 Rust tests, cargo check, and `git diff --check`.
- Chrome fixture showed `Memory Overview`, `Memory Model`, `Sources`, `Review`, `Scanned Sources`, `Effective Entries`, `Review Load`, and source priority rows.
- Vite served updated source-first frontend from `http://localhost:1420/`.

## User-Like Acceptance

User-like probe actually run: yes, via Chrome fixture page and Computer Use screenshot. Additional click interactions are covered by the fixture test because Computer Use click did not attach to the active Chrome session and Chrome Apple Event JavaScript was disabled.

## Review Decision

Pass for the source-first frontend redesign. Desktop app verification has one unrelated environment issue: the installed `/Applications/Agent Memory Manager.app` can shadow the current dev window. Recorded follow-up: `docs/loop/issues/2026-06-09-tauri-installed-app-shadowing-dev.md`.

## Record Path

`docs/loop/verification/2026-06-09-source-first-memory-design.md`
