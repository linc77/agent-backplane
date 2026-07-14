# Language Switch

Objective: Add an option to switch between Chinese and English.
Loop mode: /goal
Agent topology: multi-agent
Orchestrator: main; owns routing, docs/loop writes, and final decision
Planner: emulated; output: docs/loop/plans/2026-06-09-language-switch.md; limitation: real subagent not spawned because subagent tools require explicit user delegation
Builder: done; Write scope: src/lib/i18n.ts, src/lib/memoryViews.ts, src/App.tsx, src/components/Sidebar.tsx, src/components/KnowledgeBoard.tsx, src/components/Inspector.tsx, src/components/CorrectionDialog.tsx, src/App.test.tsx, src/App.fixture.test.tsx, src/App.css; output: docs/loop/verification/2026-06-09-language-switch.md; limitation: none
Verifier: emulated; output: docs/loop/verification/2026-06-09-language-switch.md; limitation: real subagent not spawned because subagent tools require explicit user delegation
Handoff: emulated; output: docs/loop/verification/2026-06-09-language-switch-handoff.md; limitation: real subagent not spawned because subagent tools require explicit user delegation
Plan artifact: docs/loop/plans/2026-06-09-language-switch.md
Active step: completed
Verification target: fixture UI starts in Chinese, switches to English from the visible control, and switches back to Chinese
Baseline: red Vitest run for the new language switch fixture assertion
Record path: docs/loop/verification/2026-06-09-language-switch.md
Handoff target: docs/loop/verification/2026-06-09-language-switch-handoff.md
Stop condition: stop
