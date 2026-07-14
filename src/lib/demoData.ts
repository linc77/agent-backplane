import type { CodexAuditRun, MemoryProfile, ScanResult } from "./types";

export const demoScanResult: ScanResult = {
  root: "/demo/.codex/memories",
  sources: [
    {
      id: "demo-memory",
      path: "/demo/.codex/memories/MEMORY.md",
      relativePath: "MEMORY.md",
      kind: "registry",
      modifiedMs: 1,
      bytes: 420,
      lines: 8,
      sha256: "demo-memory-sha",
    },
    {
      id: "demo-activity",
      path: "/demo/.codex/memories/extensions/chronicle/resources/activity.md",
      relativePath: "extensions/chronicle/resources/activity.md",
      kind: "chronicle",
      modifiedMs: 1,
      bytes: 360,
      lines: 6,
      sha256: "demo-activity-sha",
    },
    {
      id: "demo-correction",
      path: "/demo/.codex/memories/extensions/ad_hoc/notes/profile.md",
      relativePath: "extensions/ad_hoc/notes/profile.md",
      kind: "adHocNote",
      modifiedMs: 1,
      bytes: 260,
      lines: 4,
      sha256: "demo-correction-sha",
    },
  ],
  entries: [
    {
      id: "demo-profile",
      topic: "profile",
      relatedTopics: [],
      title: "Current profile",
      summary: "The current durable profile says the user's primary stack is Python/Rust.",
      searchText: "The current durable profile says the user's primary stack is Python/Rust.",
      sourcePath: "MEMORY.md",
      startLine: 1,
      endLine: 8,
    },
    {
      id: "demo-activity",
      topic: "activityLog",
      relatedTopics: [],
      title: "Recent activity",
      summary: "The user inspected BeeBotOS during a recent screen recording.",
      searchText: "The user inspected BeeBotOS during a recent screen recording.",
      sourcePath: "extensions/chronicle/resources/activity.md",
      startLine: 1,
      endLine: 6,
    },
    {
      id: "demo-profile-correction",
      topic: "overrides",
      relatedTopics: ["profile"],
      title: "Profile correction",
      summary: "Memory update request: Treat Python/Rust as the current primary stack.",
      searchText: "Memory update request: Treat Python/Rust as the current primary stack.",
      sourcePath: "extensions/ad_hoc/notes/profile.md",
      startLine: 1,
      endLine: 4,
    },
  ],
  risks: [
    {
      id: "demo-risk",
      kind: "staleConflict",
      title: "Older stack reference",
      detail: "Older Java/Spring Boot text conflicts with the newer Python/Rust correction.",
      entryId: "demo-profile",
    },
  ],
};

export const demoAuditRun: CodexAuditRun = {
  cachePath: "/demo/.codex/memories/.amm/codex-runs/demo-curated.json",
  report: {
    schemaVersion: "1",
    mode: "curated",
    generatedAt: "2026-06-09T00:00:00Z",
    summary: "Demo audit: Python/Rust appears current; older Java/Spring Boot references are stale.",
    currentClaims: [
      {
        id: "demo-current-stack",
        subject: "user",
        field: "primary_stack",
        value: "Python/Rust",
        scope: "global",
        status: "current",
        confidence: 0.92,
        rationale: "The latest correction note says Python/Rust is current.",
        evidence: [
          {
            sourcePath: "extensions/ad_hoc/notes/profile.md",
            startLine: 1,
            endLine: 4,
            summary: "Python/Rust correction.",
          },
        ],
      },
    ],
    staleClaims: [
      {
        id: "demo-stale-stack",
        subject: "user",
        field: "primary_stack",
        value: "Java/Spring Boot",
        scope: "global",
        status: "stale",
        confidence: 0.78,
        rationale: "The old stack claim conflicts with newer correction evidence.",
        evidence: [
          {
            sourcePath: "MEMORY.md",
            startLine: 1,
            endLine: 8,
            summary: "Older stack text.",
          },
        ],
      },
    ],
    conflicts: [
      {
        id: "demo-stack-conflict",
        title: "Primary stack mismatch",
        detail: "Older Java/Spring Boot text conflicts with the newer Python/Rust correction.",
        confidence: 0.84,
        claimIds: ["demo-current-stack", "demo-stale-stack"],
        evidence: [
          {
            sourcePath: "MEMORY.md",
            startLine: 1,
            endLine: 8,
            summary: "Older stack text.",
          },
        ],
      },
    ],
    uncertainClaims: [
      {
        id: "demo-project-activity",
        subject: "project:beebotos",
        field: "activity",
        value: "recent activity",
        scope: "project",
        status: "uncertain",
        confidence: 0.56,
        rationale: "Recent activity exists, but durable status needs confirmation.",
        evidence: [
          {
            sourcePath: "extensions/chronicle/resources/activity.md",
            startLine: 1,
            endLine: 6,
            summary: "Recent BeeBotOS activity.",
          },
        ],
      },
    ],
    suggestedCorrections: [
      {
        id: "demo-correction-stack",
        title: "Clarify primary stack",
        reason: "Older memory may still imply Java/Spring Boot.",
        content: "Memory update request:\n\n- The user's current primary stack is Python/Rust.\n",
        confidence: 0.82,
        affectedClaimIds: ["demo-current-stack", "demo-stale-stack"],
        evidence: [
          {
            sourcePath: "extensions/ad_hoc/notes/profile.md",
            startLine: 1,
            endLine: 4,
            summary: "Python/Rust correction.",
          },
        ],
      },
    ],
    metadata: {
      memoryRoot: "/demo/.codex/memories",
      inputEntries: 3,
      model: "browser-fixture",
    },
  },
};

export const demoMemoryProfile: MemoryProfile = {
  schemaVersion: "1",
  generatedAt: "2026-06-09T00:00:00Z",
  sourceHash: "demo-profile-source-hash",
  generator: "deterministic-profile-v1",
  cachePath: "/demo/.codex/memories/.amm/profile.json",
  sections: [
    {
      id: "python-rust-is-current-stack",
      title: "你把 Python/Rust 作为当前主栈",
      body: "当前修正记忆显示，你希望 AMM 优先相信 Python/Rust 是现在的主技术栈。",
      confidence: "high",
      stability: "stable",
      evidence: [
        {
          sourcePath: "extensions/ad_hoc/notes/profile.md",
          startLine: 1,
          endLine: 4,
          summary: "Treat Python/Rust as the current primary stack.",
        },
      ],
    },
    {
      id: "correction-notes-override-old-stack",
      title: "你用修正笔记覆盖旧技术栈记忆",
      body: "这段画像来自修正笔记，而不是旧摘要；旧的 Java/Spring Boot 暗示应被当作历史上下文。",
      confidence: "high",
      stability: "stable",
      evidence: [
        {
          sourcePath: "extensions/ad_hoc/notes/profile.md",
          startLine: 1,
          endLine: 4,
          summary: "Treat Python/Rust as the current primary stack.",
        },
        {
          sourcePath: "MEMORY.md",
          startLine: 1,
          endLine: 8,
          summary: "Older profile text still appears in the memory registry.",
        },
      ],
    },
  ],
  metadata: {
    memoryRoot: "/demo/.codex/memories",
    inputEntries: 3,
    currentEntries: 1,
  },
};
