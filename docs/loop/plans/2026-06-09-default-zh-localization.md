# Default Chinese Localization

Status: completed
Date: 2026-06-09

## Intent

Make Agent Memory Manager localization-ready without adding dependency weight, and show Chinese UI chrome by default.

## Decision

Use a small local `src/lib/i18n.ts` dictionary with `zh-CN` as the default locale. Keep memory content, audit report content, file paths, and raw errors as source data instead of translating them.

## Scope

- Add a default locale and Chinese UI dictionary.
- Route sidebar labels, view titles, board controls, inspector text, dialog text, status toasts, source/topic/risk labels, and simple count/line formatters through the dictionary.
- Update tests to assert Chinese UI chrome while preserving English fixture memory data.

## Out Of Scope

- Runtime language switching.
- Machine translation of memory entries, audit results, file paths, or raw error messages.
- New i18n dependencies.

## Acceptance Criteria

- The app default locale is `zh-CN`.
- The browser fixture flow shows Chinese UI chrome by default.
- Existing source-first navigation and audit workflows still work.
- Build and targeted tests pass after the change.

## Ordered Implementation Steps

1. Add default Chinese localization regression.
2. Add the local i18n dictionary and replace UI chrome strings.
3. Update existing UI tests for the Chinese default while leaving source data assertions intact.
4. Run targeted verification and record evidence.
5. Record handoff continuity.

## Probe Per Step

1. `pnpm exec vitest run src/App.fixture.test.tsx -t "uses Chinese UI chrome by default"` fails before implementation.
2. `pnpm exec vitest run src/App.fixture.test.tsx -t "uses Chinese UI chrome by default"` passes.
3. `pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx` passes.
4. `pnpm build` passes.
5. Handoff file names goal, plan, verification evidence, and no remaining next action.

## Final Verification

Run `pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx`, `pnpm build`, and `git diff --check`.
