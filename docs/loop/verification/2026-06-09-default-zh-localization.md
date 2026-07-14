# Default Chinese Localization Verification

Status: stop
Date: 2026-06-09

## Acceptance Target

Default UI locale is `zh-CN`; fixture UI shows Chinese chrome while source memory and audit content remain unmodified source data.

## Baseline

- `pnpm exec vitest run src/App.fixture.test.tsx -t "uses Chinese UI chrome by default"` failed before implementation.
- Expected failure: Testing Library could not find `演示模式：仅使用示例记忆` because the current UI was still English.

## Probe Run

- `pnpm exec vitest run src/App.fixture.test.tsx -t "uses Chinese UI chrome by default"` passed after implementation.
- `pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx` passed: 2 files, 16 tests.
- `pnpm build` passed.
- `git diff --check` passed.
- `pnpm verify` passed: 4 Vitest files / 22 tests, Vite build, 33 Rust tests, cargo check, loop verification script, and diff check.
- The `pnpm verify` output included `rg: docs/README.md: No such file or directory` from an existing deleted doc in the worktree; the command still exited 0.

## Browser Probe

Browser plugin live verification was attempted against `http://localhost:1420/?fixture=1`, but the in-app Browser timed out waiting for the webview to attach. A second tab-list check hit the same attach timeout. This is recorded as a tooling limitation, not acceptance evidence.

## Observed Result

The React fixture flow now renders Chinese chrome by default: fixture banner, overview heading, navigation labels, search placeholder, audit controls, correction dialog, and write toast are all asserted in Chinese. Memory entries, audit report values, file paths, and raw errors remain source data.

## Scope Review

In-scope files changed for localization: `src/lib/i18n.ts`, `src/lib/memoryViews.ts`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/KnowledgeBoard.tsx`, `src/components/Inspector.tsx`, `src/components/CorrectionDialog.tsx`, `src/App.test.tsx`, and `src/App.fixture.test.tsx`.

Existing unrelated WIP remains in the worktree, including deleted docs and source-first changes present before this goal.

## Decision

Stop. Acceptance passed with automated UI-flow evidence and full repo verification. Browser live verification remains unavailable due to attach timeout.
