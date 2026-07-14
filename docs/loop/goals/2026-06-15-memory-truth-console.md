# Memory Truth Console Goal

Objective: Turn AMM from a memory source browser into a memory truth console that shows which memories are currently usable, which are stale or uncertain, why each decision was made, and what review action the user should take.
Loop mode: /goal
Agent topology: multi-agent
Orchestrator: main; owns routing, docs/loop writes, and final decision
Planner: done; output: docs/loop/plans/2026-06-15-memory-truth-console.md; limitation: none
Builder: done; Write scope: AMM memory model, Effective Memory view, Review queue, Inspector, focused tests; output: docs/loop/verification/2026-06-15-memory-truth-console.md; limitation: none
Verifier: done; output: docs/loop/verification/2026-06-15-memory-truth-console.md; limitation: Browser screenshot capture timed out, DOM evidence used
Handoff: done; output: docs/loop/verification/2026-06-15-memory-truth-console-handoff.md; limitation: emulated fresh context
Need discovery: confirm the smallest claim/resolution model that solves current usable vs stale memory before adding visual complexity.
Plan artifact: docs/loop/plans/2026-06-15-memory-truth-console.md
Active step: complete
Verification target: focused Vitest/Rust tests for resolved memory claims, browser fixture review of Current Truth and Review Queue, then pnpm verify.
Baseline: Current AMM uses source-first navigation and filtered MemoryEntry views; it does not resolve current/stale/uncertain memory into a first-class truth model.
Record path: docs/loop/verification/2026-06-15-memory-truth-console.md
Handoff target: docs/loop/verification/2026-06-15-memory-truth-console-handoff.md
Stop condition: stop when AMM can answer which memories are usable, stale, uncertain, or conflicting with evidence and safe correction actions, and the behavior is verified with fixture and repo checks.

Status: completed
Completion evidence: `docs/loop/verification/2026-06-15-memory-truth-console.md`

## User Pain

- Users cannot tell which memories are currently usable and which memories are stale.
- Memory visualization is unclear because the app visualizes files and entries before it resolves memory truth.

## Product Direction

Make the primary flow:

1. Sources
2. Memory slices
3. Claims
4. Resolved truth
5. Review actions

Do not start with graph or 3D visualization. Build the visual layer around resolved claims, evidence, stale candidates, and safe correction actions.

## Initial Acceptance

- Effective Memory becomes Current Truth, backed by resolved claims rather than filtered entries.
- Review Queue groups unknown, stale, uncertain, and conflicting memory.
- Each truth item explains evidence, source priority, stale candidates, and why it is current.
- Inspector shows the decision path and a safe correction action.
- Source browsing remains available but is secondary to truth and review.
