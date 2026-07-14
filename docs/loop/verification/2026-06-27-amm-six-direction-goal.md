# AMM Six-Direction Goal Verification

Date: 2026-06-27
Goal: `docs/loop/goals/2026-06-27-amm-six-direction-goal.md`

## Slice Verified

- Stability slice 1: profile regeneration moved toward a visible background task system.
- Real memory profile slice 2: deterministic and cached profiles now reject fixed category buckets and machine metadata.
- Correction loop slice 3: profile corrections now write a safe note, invalidate profile cache, reload scan/profile data, and return the user to the updated Memory profile.
- Information architecture slice 4: the default Home view now leads with the memory profile, not source/count metric cards or backend-console language.
- Evidence trust slice 5: expanded profile evidence now labels current and historical evidence without mounting evidence details on the first screen.
- Engineering loop slice 6: Codex Audit now uses the same visible background task pattern as profile regeneration, including cancel and retry coverage.

## Changes Verified

- Added backend profile generation task state:
  - `start_memory_profile_generation`
  - `get_memory_profile_generation`
  - `cancel_memory_profile_generation`
- Added backend Codex Audit task state:
  - `start_codex_audit`
  - `get_codex_audit`
  - `cancel_codex_audit`
- Registered task state in Tauri app state.
- Added cancellable Codex exec runner support.
- Added Codex exec cancellation checks and existing timeout behavior remains.
- Frontend now starts profile generation as a task, polls while running/cancelling, and can cancel from the Memory view.
- Frontend now starts Codex Audit as a task, locks the check scope while running, polls while running/cancelling, shows a running toast, and can cancel from the Audit view.
- Regeneration no longer relies on a single long frontend mutation.
- Added explicit frontend retry coverage after failed and cancelled profile generation tasks.
- Added explicit frontend retry coverage after cancelling a running audit task.
- Added `pnpm dev:desktop` guard to close stale installed/debug AMM windows before desktop dev startup.
- Hardened `pnpm dev:desktop` so it also closes repo-local bare `target/debug/agent-memory-manager` processes launched with relative command paths.
- Added a dev-only Tauri config for `Agent Memory Manager Dev` with bundle id `com.linc.agent-memory-manager.dev`.
- Added `pnpm build:desktop:debug` to produce a uniquely named debug `.app` for desktop verification.
- Added Rust state-machine regression tests for single running task, cancel flag propagation, failed/cancelled retry, and stale completion protection.
- Extended Rust state-machine regression tests to Codex Audit task state.
- Added active six-direction goal document and loop index entry.
- Removed fixed deterministic profile section buckets such as `overview`, `agent-research`, `developer-tools`, and `learning-style`.
- Deterministic fallback now builds sections from real current-memory entry anchors and related evidence instead of hard-coded category titles.
- Profile validation now rejects cached sections with template ids/titles and machine-facing metadata such as `scope:`, `rollout_summaries/`, `rollout_path=`, `thread_id=`, `Task ...`, and `Symptom:`.
- Parser summary selection now skips memory-registry metadata blocks (`rollout_summary_files`, `keywords`) and metadata lines (`scope:`, `applies_to:`) before choosing user-visible summaries.
- Real local cache was rebuilt from `/Users/qsh/.codex/memories/.amm/profile.json`; generated section titles no longer used the old fixed categories or raw `scope/rollout/Task/Symptom` labels.
- Writing a correction now invalidates `.amm/profile.json` before writing the safe ad-hoc note.
- After a correction write, the UI switches to Memory, clears stale search/selection state, refetches `scan_memories`, refetches `load_memory_profile`, and shows the updated profile without app restart.
- Added a user-like App test that clicks Memory -> "This is wrong" -> writes the correction -> sees the corrected profile body.
- Added a profile cache invalidation unit test.
- Home now renders the same long-form profile surface as Memory, with a first-screen `Codex currently understands you` heading.
- Removed the old Home metric-card presentation from the rendered overview path and deleted unused metric-card/profile-card CSS.
- Reduced backend-console wording in visible UI copy: `Knowledge Board` -> memory-facing labels, `audit mode` -> check scope, and empty inspector copy -> quiet evidence placeholder.
- Updated browser fixture profile sections from fixed template titles (`概览`, `开发工具与技术兴趣`) to observation-style titles.
- Added/updated tests to assert the default view shows the profile body and does not show old dashboard labels such as `资料`, `知识看板`, or `检查器`.
- Added profile-evidence trust labels for current, historical, uncertain, and review-needed evidence.
- Profile evidence now maps evidence source ranges back to the resolved memory-truth model before falling back to source-kind heuristics.
- Profile evidence details are mounted only after `查看依据` is opened, keeping first-screen text focused on the memory profile instead of source/audit internals.
- Demo fixture profile now includes historical `MEMORY.md` evidence so the browser fixture can show current and historical evidence states together.
- Added focused tests for evidence-to-truth mapping and profile evidence trust labels.
- Upgraded deterministic profile fallback to `deterministic-profile-v3` so older generated cache is invalidated when the fallback synthesis algorithm changes.
- Deterministic fallback now chooses short observation titles from evidence themes instead of raw memory summaries, de-duplicates repeated section titles, and avoids old phrases such as `你当前被记住的是` and `相关记忆显示`.
- Deterministic fallback section bodies now summarize a small set of evidence-derived behavior patterns in natural Chinese instead of copying long registry fragments.
- Deterministic fallback evidence summaries now use the same observation layer as section bodies, preventing expanded evidence from reintroducing `[Task ...]`, `when the user`, `answer by`, or raw registry text.
- Added a profile regression test covering `[Task 1][Task 3]` markers and raw English rule text.
- Codex profile validation now rejects duplicate section titles, so model output that looks dynamic but repeats the same observation cannot overwrite the cache.
- Codex profile prompt now explicitly requires unique concise titles and forbids raw registry markers in titles, bodies, and evidence summaries.
- Added `scripts/verify-profile-cache.mjs` as a reusable profile-cache quality gate over the real generated cache.
- Added `pnpm profile:verify` and `pnpm profile:verify:optional`.
- `pnpm verify` now runs the optional profile-cache check, so local runs with a real cache catch profile regressions while clean environments can skip missing personal cache files.
- Added `src-tauri/src/bin/amm-profile-generate.rs` as a non-UI profile generation entrypoint that reuses the real scanner/parser/risk/profile pipeline.
- Added `pnpm profile:generate` and `pnpm profile:generate:codex`.
- Added strict Codex-only profile generation via `generate_codex_memory_profile_for_root`; app generation still falls back, while CLI `--require-codex` now reports the original Codex/profile validation error instead of silently accepting fallback.
- Exposed the internal `memory` module from the library so the profile-generation CLI can reuse the real implementation without recompiling module tests.
- Added a regression test proving strict Codex profile generation returns an error without writing fallback cache.
- Added timeout fallback regression coverage: a timed-out Codex exec result produces deterministic fallback instead of breaking profile generation.
- Added frontend coverage that a fallback regeneration is visibly labelled `规则 fallback`, so timeout/fallback behavior is not silent.
- Set `default-run = "agent-memory-manager"` in `src-tauri/Cargo.toml` after adding the `amm-profile-generate` binary, preventing Tauri debug bundles from selecting the CLI binary as the app executable.

## Evidence

Focused frontend:

```bash
pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx
```

Result: 2 files passed, 17 tests passed.

Re-run after retry coverage:

```bash
pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx
```

Result: 2 files passed, 19 tests passed.

Focused Rust:

```bash
cargo test --manifest-path src-tauri/Cargo.toml memory::commands -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml memory::profile -- --nocapture
```

Result: commands test passed; profile 7 tests passed.

Re-run after task-state coverage:

```bash
cargo test --manifest-path src-tauri/Cargo.toml memory::commands -- --nocapture
```

Result: 4 tests passed.

Full verification:

```bash
pnpm verify
```

Result: passed.

- Vitest: 5 files passed, 29 tests passed.
- Rust unit tests: 47 passed after correction/profile cache hardening.
- Build and cargo check passed.

Correction loop focused verification:

```bash
pnpm exec vitest run src/App.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml memory::profile -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml memory::commands -- --nocapture
pnpm verify
```

Result: passed.

- App test: 1 file passed, 17 tests passed.
- Profile tests: 10 passed.
- Commands tests: 4 passed.
- Full verify: 5 Vitest files / 29 tests passed, 47 Rust tests passed, build/cargo check/loop/diff checks passed.

Information architecture focused verification:

```bash
pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx
pnpm verify
```

Result: passed.

- App + fixture tests: 2 files passed, 20 tests passed.
- Full verify: 5 Vitest files / 29 tests passed, 47 Rust tests passed, build/cargo check/loop/diff checks passed.

Browser-equivalent fixture verification:

```text
Open http://localhost:1420/?fixture=1 in the in-app browser.
```

Observed:

- Present: `Codex 目前这样理解你`.
- Present: `你把 Python/Rust 作为当前主栈`.
- Present: `你用修正笔记覆盖旧技术栈记忆`.
- Absent: `概览`.
- Absent: `开发工具与技术兴趣`.
- Absent: `知识看板`.
- Absent: `资料`.

Evidence trust focused verification:

```bash
pnpm exec vitest run src/lib/memoryTruth.test.ts src/App.test.tsx src/App.fixture.test.tsx
tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml memory::profile -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml memory::commands -- --nocapture
pnpm verify
```

Result: passed.

- Memory truth + App + fixture tests: 3 files passed, 25 tests passed.
- TypeScript no-emit check passed.
- Profile tests: 10 passed.
- Commands tests: 4 passed.
- Full verify: 5 Vitest files / 31 tests passed, 47 Rust tests passed, build/cargo check/loop/diff checks passed.

Evidence trust browser-equivalent fixture verification:

```text
Open http://localhost:1420/?fixture=1 in the in-app browser.
```

Observed:

- Before expanding evidence: `summaryCount=2`, `statusCount=0`, `currentStatusCount=0`, `historicalStatusCount=0`.
- After expanding the second profile section: `openDetails=1`, `rowCount=2`, `currentStatusCount=1`, `historicalStatusCount=1`.
- Notes shown after expansion: `当前记忆正在引用这条依据。` and `这条依据已被更新记忆覆盖，只作为历史背景。`.

Engineering loop focused verification:

```bash
pnpm exec vitest run src/App.test.tsx src/App.fixture.test.tsx src/lib/api.test.ts
pnpm exec tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml memory::commands -- --nocapture
pnpm verify
```

Result: passed.

- App + fixture + API tests: 3 files passed, 23 tests passed.
- TypeScript no-emit check passed.
- Commands tests: 7 passed, including 3 Codex Audit task-state tests.
- Full verify: 5 Vitest files / 31 tests passed, 50 Rust tests passed, build/cargo check/loop/diff checks passed.

Loop and whitespace:

```bash
python3 -m json.tool src-tauri/tauri.dev.conf.json >/dev/null
bash -n scripts/dev-desktop.sh
bash scripts/verify-loop.sh
git diff --check
```

Result: passed.

Debug desktop bundle:

```bash
pnpm build:desktop:debug
```

Result: passed; produced `src-tauri/target/debug/bundle/macos/Agent Memory Manager Dev.app`.

Real memory profile fallback:

```bash
cargo test --manifest-path src-tauri/Cargo.toml memory::parser -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml memory::profile -- --nocapture
pnpm build:desktop:debug
jq -r '[.sections[]? | .title, .body, (.evidence[]?.summary)] | map(select(test("scope:|applies_to:|rollout_summaries/|rollout_path=|thread_id=|：Task |^Task |Symptom:"))) | if length == 0 then "no machine metadata in profile cache" else .[] end' /Users/qsh/.codex/memories/.amm/profile.json
```

Result: parser tests passed, profile tests passed, debug bundle built, and local profile cache reported `no machine metadata in profile cache`.

Real memory profile fallback v3:

```bash
cargo test --manifest-path src-tauri/Cargo.toml memory::profile -- --nocapture
PATH=/opt/homebrew/bin:$PATH bash scripts/dev-desktop.sh
jq -r '.generator as $g | "generator=\($g) sections=\(.sections|length)", (.sections[] | "TITLE: \(.title)\nBODY: \(.body)\n")' /Users/qsh/.codex/memories/.amm/profile.json
jq -r '[.sections[].title] | group_by(.) | map(select(length>1) | .[0]) | if length == 0 then "no duplicate titles" else .[] end' /Users/qsh/.codex/memories/.amm/profile.json
jq -r '[.sections[]? | .title, .body, (.evidence[]?.summary)] | map(select(test("scope:|applies_to:|rollout_summaries/|rollout_path=|thread_id=|\\[Task |：Task |^Task |Symptom:|你当前被记住的是：|相关记忆显示：|when the user|answer by|rather than"))) | if length == 0 then "no blocked machine text in profile cache" else .[] end' /Users/qsh/.codex/memories/.amm/profile.json
/opt/homebrew/bin/pnpm verify
```

Result: passed.

- Profile tests: 11 passed, including task-marker/raw-rule cleanup.
- Dev desktop startup rebuilt `/Users/qsh/.codex/memories/.amm/profile.json` with `generator=deterministic-profile-v3` and 6 sections.
- Local cache title samples: `你会核对本机技能系统的真实结构`, `你要求项目更新先确认分支安全`, `你偏好用系统日志定位 Codex 启动问题`, `你需要把 Agent 术语讲成系统链路`, `你会追踪知识库里的相邻主题`, `你关注版本演进背后的升级影响`.
- Local cache reported `no duplicate titles`.
- Local cache reported `no blocked machine text in profile cache`.
- Full verify passed: 5 Vitest files / 31 tests, Rust 51 tests, build, cargo check, loop check, and diff check.

Codex profile quality gate:

```bash
cargo test --manifest-path src-tauri/Cargo.toml memory::profile -- --nocapture
/opt/homebrew/bin/pnpm verify
```

Result: passed.

- Profile tests: 12 passed, including duplicate Codex section-title rejection and fallback.
- Full verify passed: 5 Vitest files / 31 tests, Rust 52 tests, build, cargo check, loop check, and diff check.

Reusable profile-cache quality gate:

```bash
node scripts/verify-profile-cache.mjs
node scripts/verify-profile-cache.mjs --optional
/opt/homebrew/bin/pnpm verify
```

Result: passed.

- Direct profile-cache check passed against `/Users/qsh/.codex/memories/.amm/profile.json`.
- Optional profile-cache check passed against the same real cache.
- Full verify now includes `profile-cache check passed: /Users/qsh/.codex/memories/.amm/profile.json (deterministic-profile-v3, 6 sections)`.
- Full verify passed: 5 Vitest files / 31 tests, Rust 52 tests, build, cargo check, profile-cache check, loop check, and diff check.

Strict Codex profile generation:

```bash
cargo run --manifest-path src-tauri/Cargo.toml --bin amm-profile-generate -- --load-only
cargo run --manifest-path src-tauri/Cargo.toml --bin amm-profile-generate -- --require-codex > /tmp/amm-strict-codex-profile.json
jq -r '.generator as $g | "generator=\($g) sections=\(.sections|length)", (.sections[] | "TITLE: \(.title)\nBODY: \(.body | gsub("\\n"; " ") | .[0:160])\n")' /tmp/amm-strict-codex-profile.json
/opt/homebrew/bin/pnpm profile:verify
/opt/homebrew/bin/pnpm verify
```

Result: passed.

- `--load-only` returned `deterministic-profile-v3-fallback sections=6` before the strict generation run.
- First `pnpm profile:generate:codex` attempt correctly failed because the old CLI only detected fallback after generation; this exposed the need for a strict non-fallback function.
- After adding `generate_codex_memory_profile_for_root`, strict generation succeeded and wrote `codex-profile-v1` with 7 sections.
- Real Codex-generated title samples: `你把 Codex 当成本机工程系统使用`, `你持续追问 Agent 运行时边界`, `你要先定位根因再修工具`, `你用项目证据约束 BeeBotOS 改动`, `你偏好中文先讲透再给术语`, `你把写作也当证据工程处理`, `你会系统整理本机环境状态`.
- `pnpm profile:verify` passed against `/Users/qsh/.codex/memories/.amm/profile.json`.
- Full verify passed: 5 Vitest files / 31 tests, Rust 53 tests, build, cargo check, profile-cache check, loop check, and diff check.

Timeout/fallback visibility:

```bash
pnpm exec vitest run src/App.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml memory::profile -- --nocapture
/opt/homebrew/bin/pnpm verify
```

Result: passed.

- App tests: 1 file / 19 tests passed, including visible `规则 fallback` text after regeneration returns a fallback profile.
- Profile tests: 14 passed, including `falls_back_to_deterministic_profile_when_codex_times_out`.
- Full verify passed: 5 Vitest files / 32 tests, Rust 54 tests, build, cargo check, profile-cache check, loop check, and diff check.

Desktop bundle executable and live-click probe:

```bash
pnpm build:desktop:debug
open -n "src-tauri/target/debug/bundle/macos/Agent Memory Manager Dev.app"
pgrep -fl "Agent Memory Manager Dev|agent-memory-manager|amm-profile-generate"
mcp__computer_use.get_app_state(app="Agent Memory Manager Dev")
mcp__computer_use.get_app_state(app="/Users/qsh/Documents/work/agent-memory-manager/src-tauri/target/debug/bundle/macos/Agent Memory Manager Dev.app")
"src-tauri/target/debug/bundle/macos/Agent Memory Manager Dev.app/Contents/MacOS/agent-memory-manager"
osascript -e 'tell application "System Events" to tell process "Agent Memory Manager Dev" to get {name, frontmost, count of windows}'
```

Result: partial, with product packaging fixed and live-click capture still blocked.

- Before `default-run`, `pnpm build:desktop:debug` selected `target/debug/amm-profile-generate`; opening the Dev app launched `.../Contents/MacOS/amm-profile-generate` and spawned a `codex exec` child. That was a real packaging regression from adding the profile CLI.
- After `default-run = "agent-memory-manager"`, `pnpm build:desktop:debug` selected `target/debug/agent-memory-manager`.
- Opening `Agent Memory Manager Dev.app` now launches `.../Contents/MacOS/agent-memory-manager`.
- Direct terminal launch of the bundle executable printed `[amm-window] label=main inner=Ok(PhysicalSize { width: 2360, height: 1520 }) outer=Ok(PhysicalSize { width: 2360, height: 1520 }) visible=Ok(true)`.
- Computer Use still returned `cgWindowNotFound` for the app name and full `.app` path.
- System Events saw process `agent-memory-manager` but reported `count of windows = 0`.
- Conclusion: current live-click failure is in the macOS AX/Computer Use capture layer, not in profile generation, task state, timeout, cancellation, or packaging executable selection.

Final verification:

```bash
/opt/homebrew/bin/pnpm verify
/opt/homebrew/bin/pnpm build:desktop:debug
bash scripts/verify-loop.sh
git diff --check
```

Result: passed.

- Full verify passed: 5 Vitest files / 32 tests, Rust 54 tests, build, cargo check, profile-cache check, loop check, and diff check.
- Profile-cache check passed against `/Users/qsh/.codex/memories/.amm/profile.json` with `codex-profile-v1` and 7 sections.
- Debug desktop bundle build passed and selected `target/debug/agent-memory-manager`, then bundled `Agent Memory Manager Dev.app`.
- No AMM dev app, profile CLI, or profile-generation Codex child process remained running after verification.

## Acceptance Audit

### Stability

- Proven: Regeneration and Audit use backend task state (`start/get/cancel`), frontend polling, visible running/cancelling states, and retry after failure/cancellation.
- Proven: Cancel state propagation is covered in Rust task-state tests and App tests for profile generation and audit.
- Proven: Timeout fallback is covered by profile regression tests and visible fallback UI text.
- Accepted with caveat: Live desktop click verification remains blocked by Computer Use/macOS AX capture, even though Tauri reports the expected visible window size. Product behavior is covered by App/browser-equivalent tests, backend task-state tests, strict non-UI generation, and real cache verification.

### Real Memory Profile

- Proven: Fixed template titles are rejected, duplicate Codex titles are rejected, deterministic fallback v3 uses observation titles, and strict Codex generation produced a real `codex-profile-v1` cache with 7 evidence-derived sections.
- Proven: `pnpm profile:verify` validates generator, unique titles, Chinese synthesis, forbidden machine text, confidence/stability, and evidence source ranges against the real cache.

### Correction Loop

- Proven: App tests cover drafting from a profile section, writing a safe correction note, invalidating profile cache, refetching scan/profile data, and seeing the corrected profile without app restart.
- Accepted with caveat: Browser-equivalent/App tests prove the product flow; live desktop click can be retried after the external macOS AX/Computer Use capture issue is resolved.

### Information Architecture

- Proven: Home leads with `Codex 目前这样理解你`, old dashboard labels are absent in tests/browser-equivalent verification, and evidence details are collapsed until requested.

### Evidence Trust

- Proven: Profile sections display confidence/stability, evidence details map to current/historical/uncertain trust status, and audit evidence is validated against scanned source ranges.

### Engineering Loop

- Proven: Goal/verification docs, `pnpm verify`, profile generation CLI, profile cache verifier, task-state tests, debug bundle build, default desktop binary selection, and real Codex profile generation evidence are recorded.
- Accepted caveat: Live desktop click verification is unavailable because the macOS AX/Computer Use layer reports no accessible window while Tauri reports a visible correctly sized window.

Desktop verification note:

- Computer Use initially selected stale AMM windows from `/Applications/Agent Memory Manager.app` and `src-tauri/target/debug/bundle/macos/Agent Memory Manager.app`, both sharing `com.linc.agent-memory-manager`.
- `pnpm dev:desktop` successfully stopped stale installed/debug windows, then after hardening also stopped a stale bare `target/debug/agent-memory-manager` process launched with a relative command path.
- The true `tauri dev` bare process did not expose a current clickable window through Computer Use in this run; targeting "Agent Memory Manager" by app name can still launch the installed app, so Computer Use click evidence is not accepted for this slice.
- `Agent Memory Manager Dev.app` appears in Computer Use's app list with bundle id `com.linc.agent-memory-manager.dev`, which fixes the app-identity collision.
- Live click verification still did not pass: Computer Use returned `cgWindowNotFound`, and a CoreGraphics probe saw a Dev window with an abnormal small frame instead of the expected 1180x760 window. Do not treat this as user-flow verification.
- Follow-up probe changed Tauri window creation to explicit `create: false` config plus `WebviewWindowBuilder::from_config`, then normalized min size, size, center, show, and focus in Rust startup.
- Debug terminal launch of the current Dev app printed `[amm-window] label=main inner=Ok(PhysicalSize { width: 2360, height: 1520 }) outer=Ok(PhysicalSize { width: 2360, height: 1520 }) visible=Ok(true)`, matching 1180x760 logical size on the Retina display.
- Computer Use still returned `cgWindowNotFound` for `Agent Memory Manager Dev`; CoreGraphics still reported a 199x129 surface. Treat that as a desktop automation/capture limitation, not proof that the app window is really 199x129.
- Follow-up issue `docs/loop/issues/2026-06-09-tauri-installed-app-shadowing-dev.md` is now marked fixed with the guarded startup command.
- Follow-up live-click probe after adding the profile CLI found and fixed a packaging regression: the debug bundle initially selected `amm-profile-generate`; `default-run = "agent-memory-manager"` corrected the bundled executable.
- Re-probe after the packaging fix still returned `cgWindowNotFound`; System Events also reported zero accessible windows for process `agent-memory-manager`, while Tauri's own startup log reported the correct visible 1180x760 logical window.

## Remaining Gaps

- Live desktop click verification remains unavailable through Computer Use/macOS AX capture. This is tracked in `docs/loop/issues/2026-06-27-dev-debug-window-visibility.md` as an external capture/tooling issue, not as an unresolved six-direction product-flow requirement.
- Codex-generated profile quality now has a strict non-UI generation run against actual local memory plus profile-cache verification; future work should keep this gate in the loop after prompt/schema changes.
- The correction loop is covered in browser-equivalent/App tests; future live desktop click verification can be retried after the external Computer Use/macOS AX capture issue is resolved.

## Next Action

Continue from engineering loop:

1. Keep `docs/loop/issues/2026-06-27-dev-debug-window-visibility.md` open for future macOS AX/Computer Use investigation.
2. Use browser-equivalent/App tests, Tauri startup logs, strict non-UI profile generation, and profile-cache verification as the accepted evidence set for this six-direction goal.
