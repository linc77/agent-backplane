# Language Switch

Status: completed
Date: 2026-06-09

## Intent

Let users switch the app UI between Chinese and English while keeping Chinese as the default.

## Decision

Add an English dictionary beside the existing Chinese dictionary, keep `zh-CN` as the default, expose a compact language segmented control in the sidebar, and persist the selected locale in `localStorage`.

## Scope

- Add `en-US` UI dictionary entries matching the current Chinese dictionary.
- Make `App` own runtime locale state and pass `uiText` to UI components.
- Replace static label exports from `memoryViews` with per-locale labels from `uiText`.
- Add a sidebar language switch control.
- Update fixture tests to verify default Chinese, switch to English, and switch back.

## Out Of Scope

- Translating memory entries, audit report content, file paths, or raw errors.
- Backend locale handling.
- More languages beyond Chinese and English.

## Acceptance Criteria

- On first load, the UI is Chinese.
- A visible option lets the user select English.
- Selecting English changes chrome labels such as overview heading, navigation, search placeholder, audit controls, inspector/dialog text, and source/topic labels to English.
- Selecting Chinese changes the same UI chrome back to Chinese.
- The selected language is persisted for the next app render.

## Ordered Implementation Steps

1. Add language switch fixture regression.
2. Add `en-US` dictionary and locale helpers.
3. Thread `uiText` and locale state through components.
4. Add sidebar language switch styling.
5. Run targeted tests, build, diff check, and full verification.
6. Record verification and handoff.

## Probe Per Step

1. `pnpm exec vitest run src/App.fixture.test.tsx -t "switches between Chinese and English"` fails before implementation.
2. The same test passes after implementation.
3. `pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx` passes.
4. `pnpm build` and `git diff --check` pass.
5. `pnpm verify` passes.

## Final Verification

Run `pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx`, `pnpm build`, `git diff --check`, and `pnpm verify`.
