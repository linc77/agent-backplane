# Language Switch Verification

Status: stop
Date: 2026-06-09

## Acceptance Target

The app starts in Chinese, exposes a visible Chinese/English language option, switches UI chrome to English, switches back to Chinese, and persists the selected locale.

## Baseline

- `pnpm exec vitest run src/App.fixture.test.tsx -t "switches between Chinese and English"` failed before implementation.
- Expected failure: Testing Library could not find the `English` button because no language switch existed.

## Probe Run

- `pnpm exec vitest run src/App.fixture.test.tsx -t "switches between Chinese and English"` passed after implementation.
- `pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx` passed: 2 files, 17 tests.
- Browser live probe reused the current `tauri dev` server on `http://localhost:1420/?fixture=1`:
  - clicking `中文` showed `记忆概览` and Chinese navigation;
  - clicking `English` showed `Memory Overview`;
  - clicking `All Sources` showed English title, English source labels, and `Search current view...`.
- `pnpm build` passed.
- `git diff --check` passed.
- `pnpm verify` passed: 4 Vitest files / 23 tests, Vite build, 33 Rust tests, cargo check, loop verification script, and diff check.
- The `pnpm verify` output still included `rg: docs/README.md: No such file or directory` from an existing deleted doc in the worktree; the command exited 0.

## Observed Result

The sidebar now has a compact `中文` / `English` segmented control. Chinese remains the default. Switching to English updates view titles, navigation labels, source/topic badges, search placeholder, audit controls, inspector chrome, correction dialog labels, line/evidence formats, status toasts, and empty states. Switching back restores Chinese. The selected locale is saved to `localStorage` under `agent-memory-manager.locale`.

## Scope Review

In-scope files changed for this goal: `src/lib/i18n.ts`, `src/lib/memoryViews.ts`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/KnowledgeBoard.tsx`, `src/components/Inspector.tsx`, `src/components/CorrectionDialog.tsx`, `src/App.fixture.test.tsx`, and `src/App.css`.

Memory entries, audit report values, file paths, and raw errors remain source data and are not translated.

Existing unrelated WIP remains in the worktree, including deleted docs, source-first loop artifacts, and prior style changes present before this goal.

## Decision

Stop. The requested Chinese/English switch is implemented and verified.
