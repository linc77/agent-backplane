// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type {
  CodexAuditMode,
  CodexAuditRun,
  CodexAuditTask,
  MemoryProfile,
  ScanResult,
} from "./lib/types";

const invokeMock = vi.hoisted(() => vi.fn());
const revealItemInDirMock = vi.hoisted(() => vi.fn());

Object.defineProperty(window, "amm", {
  configurable: true,
  value: {
    app: {
      getVersion: () => Promise.resolve("0.2.0"),
      checkForUpdates: () => Promise.resolve(null),
      openReleasePage: () => Promise.resolve(),
    },
    memory: {
      scan: (rootOverride: string | null) => invokeMock("scan_memories", { rootOverride }),
      generateProfile: (rootOverride: string | null) => invokeMock("generate_memory_profile", { rootOverride }),
      startProfileGeneration: (rootOverride: string | null) => invokeMock("start_memory_profile_generation", { rootOverride }),
      getProfileGeneration: () => invokeMock("get_memory_profile_generation"),
      cancelProfileGeneration: () => invokeMock("cancel_memory_profile_generation"),
      loadProfile: (rootOverride: string | null) => invokeMock("load_memory_profile", { rootOverride }),
      loadAgentSnapshot: (agent: string) => invokeMock("load_agent_memory_snapshot", { agent }),
      getSourceExcerpt: (rootOverride: string | null, path: string, startLine: number, endLine: number) =>
        invokeMock("get_source_excerpt", { rootOverride, path, startLine, endLine }),
      draftCorrection: (rootOverride: string | null, slug: string, bulletLines: string[]) =>
        invokeMock("draft_correction", { rootOverride, slug, bulletLines }),
      draftCorrectionFromContent: (rootOverride: string | null, slug: string, content: string) =>
        invokeMock("draft_correction_from_content", { rootOverride, slug, content }),
      writeCorrection: (rootOverride: string | null, draft: unknown) => invokeMock("write_correction", { rootOverride, draft }),
    },
    audit: {
      start: (rootOverride: string | null, mode: string) => invokeMock("start_codex_audit", { rootOverride, mode }),
      get: () => invokeMock("get_codex_audit"),
      cancel: () => invokeMock("cancel_codex_audit"),
      run: (rootOverride: string | null, mode: string) => invokeMock("run_codex_audit", { rootOverride, mode }),
    },
    skills: { load: (projectRootOverride: string | null) => invokeMock("load_skill_inventory", { projectRootOverride }) },
    agentConfig: {
      load: () => invokeMock("load_agent_config_inventory"),
      save: (input: unknown) => invokeMock("save_agent_provider_profile", { input }),
      delete: (agent: string, profileId: string) => invokeMock("delete_agent_provider_profile", { agent, profileId }),
      activate: (agent: string, profileId: string) => invokeMock("activate_agent_provider_profile", { agent, profileId }),
    },
    mcp: { load: (agent: string) => invokeMock("load_mcp_inventory", { agent }) },
    shell: { revealSource: (path: string) => revealItemInDirMock(path) },
  },
});

const scanResult: ScanResult = {
  root: "/Users/qsh/.codex/memories",
  sources: [],
  entries: [],
  risks: [],
};

const clarityScanResult: ScanResult = {
  root: "/Users/qsh/.codex/memories",
  sources: [
    {
      id: "memory",
      path: "/Users/qsh/.codex/memories/MEMORY.md",
      relativePath: "MEMORY.md",
      kind: "registry",
      modifiedMs: 1,
      bytes: 256,
      lines: 3,
      sha256: "memory-sha",
    },
    {
      id: "activity-source",
      path: "/Users/qsh/.codex/memories/extensions/chronicle/resources/example.md",
      relativePath: "extensions/chronicle/resources/example.md",
      kind: "chronicle",
      modifiedMs: 1,
      bytes: 256,
      lines: 3,
      sha256: "activity-sha",
    },
    {
      id: "summary-source",
      path: "/Users/qsh/.codex/memories/memory_summary.md",
      relativePath: "memory_summary.md",
      kind: "summary",
      modifiedMs: 1,
      bytes: 512,
      lines: 30,
      sha256: "summary-sha",
    },
    {
      id: "correction-source",
      path: "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/profile.md",
      relativePath: "extensions/ad_hoc/notes/profile.md",
      kind: "adHocNote",
      modifiedMs: 1,
      bytes: 256,
      lines: 3,
      sha256: "correction-sha",
    },
  ],
  entries: [
    {
      id: "profile",
      topic: "profile",
      relatedTopics: [],
      title: "Stable profile",
      summary: "The user's current technical stack is Python/Rust.",
      searchText: "The user's current technical stack is Python/Rust.",
      sourcePath: "MEMORY.md",
      startLine: 1,
      endLine: 3,
    },
    {
      id: "activity",
      topic: "activityLog",
      relatedTopics: [],
      title: "10-minute activity",
      summary: "The user reviewed BeeBotOS in a recording.",
      searchText: "The user reviewed BeeBotOS in a recording.",
      sourcePath: "extensions/chronicle/resources/example.md",
      startLine: 1,
      endLine: 3,
    },
    {
      id: "profile-correction",
      topic: "overrides",
      relatedTopics: ["profile"],
      title: "Profile correction",
      summary: "The user's current profile explicitly prefers Python/Rust.",
      searchText: "Memory update request: The user's current profile explicitly prefers Python/Rust.",
      sourcePath: "extensions/ad_hoc/notes/profile.md",
      startLine: 1,
      endLine: 3,
    },
  ],
  risks: [],
};

const clarityMemoryProfile: MemoryProfile = {
  schemaVersion: "1",
  generatedAt: "2026-06-09T00:00:00Z",
  sourceHash: "clarity-profile-hash",
  generator: "deterministic-profile-v1",
  cachePath: "/Users/qsh/.codex/memories/.amm/profile.json",
  sections: [
    {
      id: "python-rust-current-stack",
      title: "你明确把 Python/Rust 作为当前主栈",
      body: "目前的记忆主要显示：The user's current profile explicitly prefers Python/Rust.",
      confidence: "high",
      stability: "stable",
      evidence: [
        {
          sourcePath: "extensions/ad_hoc/notes/profile.md",
          startLine: 1,
          endLine: 3,
          summary: "The user's current profile explicitly prefers Python/Rust.",
        },
        {
          sourcePath: "MEMORY.md",
          startLine: 1,
          endLine: 3,
          summary: "The user's current technical stack is Python/Rust.",
        },
      ],
    },
  ],
  metadata: {
    memoryRoot: "/Users/qsh/.codex/memories",
    inputEntries: 3,
    currentEntries: 1,
  },
};

const auditRun: CodexAuditRun = {
  cachePath: "/Users/qsh/.codex/memories/.amm/codex-runs/20260608-curated.json",
  report: {
    schemaVersion: "1",
    mode: "curated",
    generatedAt: "2026-06-08T09:30:00Z",
    summary: "The durable profile favors Python/Rust over older Java/Spring Boot references.",
    currentClaims: [
      {
        id: "claim-user-primary-stack",
        subject: "user",
        field: "primary_stack",
        value: "Python/Rust",
        scope: "global",
        status: "current",
        confidence: 0.92,
        rationale: "A newer correction note names Python/Rust as current.",
        evidence: [
          {
            sourcePath: "extensions/ad_hoc/notes/profile.md",
            startLine: 1,
            endLine: 3,
            summary: "Python/Rust correction.",
          },
        ],
      },
    ],
    staleClaims: [
      {
        id: "claim-old-stack",
        subject: "user",
        field: "primary_stack",
        value: "Java/Spring Boot",
        scope: "global",
        status: "stale",
        confidence: 0.78,
        rationale: "Older summary conflicts with newer correction.",
        evidence: [
          {
            sourcePath: "memory_summary.md",
            startLine: 20,
            endLine: 24,
            summary: "Older stack note.",
          },
        ],
      },
    ],
    conflicts: [
      {
        id: "conflict-primary-stack",
        title: "Primary stack mismatch",
        detail: "Older Java/Spring Boot text conflicts with newer Python/Rust evidence.",
        confidence: 0.84,
        claimIds: ["claim-user-primary-stack", "claim-old-stack"],
        evidence: [
          {
            sourcePath: "memory_summary.md",
            startLine: 20,
            endLine: 24,
            summary: "Older stack note.",
          },
        ],
      },
    ],
    uncertainClaims: [
      {
        id: "claim-beebotos-active",
        subject: "project:beebotos",
        field: "activity",
        value: "Active project is uncertain",
        scope: "project",
        status: "uncertain",
        confidence: 0.55,
        rationale: "Recent activity exists, but durable status needs confirmation.",
        evidence: [
          {
            sourcePath: "extensions/chronicle/resources/activity.md",
            startLine: 1,
            endLine: 20,
            summary: "Recent BeeBotOS work.",
          },
        ],
      },
    ],
    suggestedCorrections: [
      {
        id: "correction-primary-stack",
        title: "Clarify current primary stack",
        reason: "Older profile text may still imply Java/Spring Boot.",
        content: "Memory update request:\n\n- The user's current primary technical stack is Python/Rust.\n",
        confidence: 0.81,
        affectedClaimIds: ["claim-user-primary-stack", "claim-old-stack"],
        evidence: [
          {
            sourcePath: "extensions/ad_hoc/notes/profile.md",
            startLine: 1,
            endLine: 3,
            summary: "Python/Rust correction.",
          },
        ],
      },
    ],
    metadata: {
      memoryRoot: "/Users/qsh/.codex/memories",
      inputEntries: 4,
      model: "codex-exec-fixture",
    },
  },
};

function auditTask(
  status: CodexAuditTask["status"],
  mode: CodexAuditTask["mode"] = "curated",
  run: CodexAuditRun | null = status === "succeeded" ? auditRun : null,
): CodexAuditTask {
  return {
    id: status === "idle" ? null : "audit-task",
    mode: status === "idle" ? null : mode,
    status,
    startedAt: status === "idle" ? null : "2026-06-09T00:00:00Z",
    finishedAt: status === "running" || status === "cancelling" ? null : "2026-06-09T00:00:01Z",
    error: status === "failed" ? "codex exec failed" : null,
    run,
  };
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App pane resizing", () => {
  beforeEach(() => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        return Promise.resolve(scanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve({ ...clarityMemoryProfile, sections: [] });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    cleanup();
    invokeMock.mockReset();
    revealItemInDirMock.mockReset();
  });

  it("wires pointer dragging into the app grid columns", async () => {
    const { container, getAllByRole } = renderApp();
    const shell = container.querySelector(".app-shell") as HTMLElement;
    const [leftResizer, rightResizer] = getAllByRole("separator");

    expect(shell.style.gridTemplateColumns).toBe("240px 8px minmax(420px, 1fr) 8px 430px");

    fireEvent.pointerDown(leftResizer, { clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(leftResizer, { clientX: 304, pointerId: 1 });
    fireEvent.pointerUp(leftResizer, { pointerId: 1 });

    await waitFor(() =>
      expect(shell.style.gridTemplateColumns).toBe("304px 8px minmax(420px, 1fr) 8px 430px"),
    );

    fireEvent.pointerDown(rightResizer, { clientX: 960, pointerId: 2 });
    fireEvent.pointerMove(rightResizer, { clientX: 888, pointerId: 2 });
    fireEvent.pointerUp(rightResizer, { pointerId: 2 });

    await waitFor(() =>
      expect(shell.style.gridTemplateColumns).toBe("304px 8px minmax(420px, 1fr) 8px 502px"),
    );
  });
});

describe("App memory clarity", () => {
  beforeEach(() => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "get_source_excerpt") {
        return Promise.resolve("The user's current technical stack is Python/Rust.");
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
  });

  afterEach(() => {
    cleanup();
    invokeMock.mockReset();
    revealItemInDirMock.mockReset();
  });

  it("shows a calm overview and minimal sidebar", async () => {
    const { findByText, getByRole, queryByText } = renderApp();

    await waitFor(() =>
      expect(getByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument(),
    );
    expect(getByRole("button", { name: "记忆" })).toBeInTheDocument();
    expect(getByRole("button", { name: "检查" })).toBeInTheDocument();
    expect(queryByText("复核队列")).not.toBeInTheDocument();
    expect(queryByText("已加载摘要")).not.toBeInTheDocument();
    expect(queryByText("记忆注册表")).not.toBeInTheDocument();
    expect(queryByText("活动记录")).not.toBeInTheDocument();
    expect(queryByText("全部来源")).not.toBeInTheDocument();
    expect(queryByText("资料")).not.toBeInTheDocument();
    expect(queryByText("知识看板")).not.toBeInTheDocument();
    expect(queryByText("检查器")).not.toBeInTheDocument();
    expect(await findByText(/current profile explicitly prefers Python\/Rust/)).toBeInTheDocument();
    expect(queryByText("长期稳定")).not.toBeInTheDocument();
    expect(queryByText("高可信")).not.toBeInTheDocument();
    expect(queryByText("来源优先级")).not.toBeInTheDocument();
    expect(queryByText("演示模式：仅使用示例记忆")).not.toBeInTheDocument();
    expect(queryByText("还没有检查结果")).not.toBeInTheDocument();
    expect(queryByText("10-minute activity")).not.toBeInTheDocument();
  });

  it("keeps effective memory separate from activity source records", async () => {
    const { getByRole, queryByText } = renderApp();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));

    await waitFor(() =>
      expect(getByRole("heading", { name: "记忆" })).toBeInTheDocument(),
    );
    expect(queryByText(/current profile explicitly prefers Python\/Rust/)).toBeInTheDocument();
    expect(queryByText(/current technical stack is Python\/Rust/)).not.toBeInTheDocument();
    expect(queryByText("10-minute activity")).not.toBeInTheDocument();
  });

  it("keeps profile correction notes visible in memory", async () => {
    const { getByRole, queryByText } = renderApp();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    await waitFor(() =>
      expect(queryByText(/current profile explicitly prefers Python\/Rust/)).toBeInTheDocument(),
    );
  });

  it("labels profile evidence as current or historical", async () => {
    const { findAllByText, findByText, getByRole } = renderApp();

    await waitFor(() =>
      expect(getByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument(),
    );
    fireEvent.click((await findAllByText("查看依据"))[0]);

    expect(await findByText("当前依据")).toBeInTheDocument();
    expect(await findByText("历史依据")).toBeInTheDocument();
    expect(await findByText("当前记忆正在引用这条依据。")).toBeInTheDocument();
    expect(await findByText("这条依据已被更新记忆覆盖，只作为历史背景。")).toBeInTheDocument();
  });

  it("keeps Codex profile generation out of startup and runs it on demand", async () => {
    const codexProfile: MemoryProfile = {
      ...clarityMemoryProfile,
      generator: "codex-profile-v1",
      sections: [
        {
          ...clarityMemoryProfile.sections[0],
          body: "Codex regenerated this memory profile from current evidence.",
        },
      ],
    };
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "start_memory_profile_generation") {
        return Promise.resolve({
          id: "profile-task-1",
          status: "succeeded",
          startedAt: "2026-06-09T00:00:00Z",
          finishedAt: "2026-06-09T00:00:01Z",
          error: null,
          profile: codexProfile,
        });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByText, getByRole } = renderApp();

    await waitFor(() =>
      expect(getByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument(),
    );
    expect(invokeMock).not.toHaveBeenCalledWith("generate_memory_profile", expect.anything());

    fireEvent.click(getByRole("button", { name: "记忆" }));
    fireEvent.click(await waitFor(() => getByRole("button", { name: "重新生成" })));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("start_memory_profile_generation", {
        rootOverride: null,
      }),
    );
    expect(await findByText("Codex regenerated this memory profile from current evidence.")).toBeInTheDocument();
  });

  it("shows when regeneration returns the deterministic fallback profile", async () => {
    const fallbackProfile: MemoryProfile = {
      ...clarityMemoryProfile,
      generator: "deterministic-profile-v3-fallback",
      sections: [
        {
          ...clarityMemoryProfile.sections[0],
          body: "Fallback regenerated this memory profile after Codex timed out.",
        },
      ],
    };
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "start_memory_profile_generation") {
        return Promise.resolve({
          id: "profile-task-fallback",
          status: "succeeded",
          startedAt: "2026-06-09T00:00:00Z",
          finishedAt: "2026-06-09T00:02:00Z",
          error: null,
          profile: fallbackProfile,
        });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByText, getByRole } = renderApp();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    fireEvent.click(await waitFor(() => getByRole("button", { name: "重新生成" })));

    expect(await findByText("Fallback regenerated this memory profile after Codex timed out.")).toBeInTheDocument();
    expect(await findByText("由 规则 fallback 基于 1 条当前记忆生成")).toBeInTheDocument();
  });

  it("can cancel a running memory profile generation task", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "start_memory_profile_generation") {
        return Promise.resolve({
          id: "profile-task-2",
          status: "running",
          startedAt: "2026-06-09T00:00:00Z",
          finishedAt: null,
          error: null,
          profile: null,
        });
      }
      if (command === "cancel_memory_profile_generation") {
        return Promise.resolve({
          id: "profile-task-2",
          status: "cancelling",
          startedAt: "2026-06-09T00:00:00Z",
          finishedAt: null,
          error: null,
          profile: null,
        });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { getByRole } = renderApp();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    fireEvent.click(await waitFor(() => getByRole("button", { name: "重新生成" })));
    fireEvent.click(await waitFor(() => getByRole("button", { name: "取消" })));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("cancel_memory_profile_generation"),
    );
  });

  it("retries profile generation after a failed task", async () => {
    const codexProfile: MemoryProfile = {
      ...clarityMemoryProfile,
      generator: "codex-profile-v1",
      sections: [
        {
          ...clarityMemoryProfile.sections[0],
          body: "Retry regenerated the memory profile.",
        },
      ],
    };
    let startCount = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "start_memory_profile_generation") {
        startCount += 1;
        return Promise.resolve(
          startCount === 1
            ? {
                id: "profile-task-failed",
                status: "failed",
                startedAt: "2026-06-09T00:00:00Z",
                finishedAt: "2026-06-09T00:00:01Z",
                error: "codex exec failed",
                profile: null,
              }
            : {
                id: "profile-task-retry",
                status: "succeeded",
                startedAt: "2026-06-09T00:00:02Z",
                finishedAt: "2026-06-09T00:00:03Z",
                error: null,
                profile: codexProfile,
              },
        );
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findAllByText, findByText, getByRole } = renderApp();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    fireEvent.click(await waitFor(() => getByRole("button", { name: "重新生成" })));
    expect((await findAllByText("codex exec failed")).length).toBeGreaterThan(0);

    fireEvent.click(getByRole("button", { name: "重新生成" }));

    await waitFor(() => expect(startCount).toBe(2));
    expect(await findByText("Retry regenerated the memory profile.")).toBeInTheDocument();
  });

  it("retries profile generation after cancellation completes", async () => {
    const codexProfile: MemoryProfile = {
      ...clarityMemoryProfile,
      generator: "codex-profile-v1",
      sections: [
        {
          ...clarityMemoryProfile.sections[0],
          body: "Regenerated after cancellation.",
        },
      ],
    };
    let startCount = 0;
    let pollCount = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "start_memory_profile_generation") {
        startCount += 1;
        return Promise.resolve(
          startCount === 1
            ? {
                id: "profile-task-running",
                status: "running",
                startedAt: "2026-06-09T00:00:00Z",
                finishedAt: null,
                error: null,
                profile: null,
              }
            : {
                id: "profile-task-after-cancel",
                status: "succeeded",
                startedAt: "2026-06-09T00:00:02Z",
                finishedAt: "2026-06-09T00:00:03Z",
                error: null,
                profile: codexProfile,
              },
        );
      }
      if (command === "cancel_memory_profile_generation") {
        return Promise.resolve({
          id: "profile-task-running",
          status: "cancelling",
          startedAt: "2026-06-09T00:00:00Z",
          finishedAt: null,
          error: null,
          profile: null,
        });
      }
      if (command === "get_memory_profile_generation") {
        pollCount += 1;
        return Promise.resolve({
          id: "profile-task-running",
          status: pollCount > 0 ? "cancelled" : "cancelling",
          startedAt: "2026-06-09T00:00:00Z",
          finishedAt: "2026-06-09T00:00:01Z",
          error: null,
          profile: null,
        });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByText, getByRole } = renderApp();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    fireEvent.click(await waitFor(() => getByRole("button", { name: "重新生成" })));
    fireEvent.click(await waitFor(() => getByRole("button", { name: "取消" })));
    await waitFor(
      () => expect(getByRole("button", { name: "重新生成" })).toBeInTheDocument(),
      { timeout: 2500 },
    );

    fireEvent.click(getByRole("button", { name: "重新生成" }));

    await waitFor(() => expect(startCount).toBe(2));
    expect(await findByText("Regenerated after cancellation.")).toBeInTheDocument();
  });

  it("opens the selected source location", async () => {
    revealItemInDirMock.mockResolvedValue(undefined);
    const { getAllByText, getByRole } = renderApp();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    fireEvent.click(await waitFor(() => getAllByText("查看依据")[0]));
    fireEvent.click(getByRole("button", { name: "extensions/ad_hoc/notes/profile.md 第 1-3 行" }));

    await waitFor(() =>
      expect(revealItemInDirMock).toHaveBeenCalledWith(
        "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/profile.md",
      ),
    );
  });

  it("drafts a correction from a memory profile section", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "draft_correction") {
        return Promise.resolve({
          slug: "memory-profile-python-rust-current-stack",
          content: "Memory update request:\n\n- Review profile overview.\n",
          targetPath:
            "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/memory-profile-python-rust-current-stack.md",
        });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByText, getAllByRole, getByRole } = renderApp();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    fireEvent.click(getAllByRole("button", { name: "这不对" })[0]);

    expect(await findByText("修正笔记")).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("draft_correction", {
        rootOverride: null,
        slug: "memory-profile-python-rust-current-stack",
        bulletLines: expect.arrayContaining([
          expect.stringContaining(
            'Review and update memory profile section "你明确把 Python/Rust 作为当前主栈"',
          ),
        ]),
      }),
    );
  });

  it("reloads the memory profile after writing a profile correction", async () => {
    const correctedProfile: MemoryProfile = {
      ...clarityMemoryProfile,
      sourceHash: "corrected-profile-hash",
      sections: [
        {
          id: "python-rust-correction-is-current",
          title: "你明确把 Python/Rust 作为当前主栈",
          body: "修正后画像显示：你希望 AMM 优先相信 Python/Rust，而不是旧的 Java/Spring Boot 描述。",
          confidence: "high",
          stability: "stable",
          evidence: [
            {
              sourcePath: "extensions/ad_hoc/notes/memory-profile-python-rust-current-stack.md",
              startLine: 1,
              endLine: 3,
              summary: "The user's current primary technical stack is Python/Rust.",
            },
          ],
        },
      ],
    };
    let scanCalls = 0;
    let profileCalls = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        scanCalls += 1;
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        profileCalls += 1;
        return Promise.resolve(profileCalls === 1 ? clarityMemoryProfile : correctedProfile);
      }
      if (command === "draft_correction") {
        return Promise.resolve({
          slug: "memory-profile-python-rust-current-stack",
          content: "Memory update request:\n\n- Review profile overview.\n",
          targetPath:
            "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/memory-profile-python-rust-current-stack.md",
        });
      }
      if (command === "write_correction") {
        return Promise.resolve(
          "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/memory-profile-python-rust-current-stack.md",
        );
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByText, getAllByRole, getByRole } = renderApp();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    fireEvent.click(getAllByRole("button", { name: "这不对" })[0]);
    expect(await findByText("修正笔记")).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "写入修正笔记" }));

    expect(await findByText(/修正后画像显示/)).toBeInTheDocument();
    expect(getByRole("heading", { name: "记忆" })).toBeInTheDocument();
    await waitFor(() => {
      expect(scanCalls).toBeGreaterThanOrEqual(2);
      expect(profileCalls).toBeGreaterThanOrEqual(2);
    });
  });

  it("searches entries inside the current derived memory view", async () => {
    const { findByPlaceholderText, findByText, getAllByRole, getByRole, getByText } = renderApp();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    fireEvent.change(await findByPlaceholderText("搜索当前视图..."), {
      target: { value: "Python/Rust" },
    });

    expect(getByRole("heading", { name: "记忆" })).toBeInTheDocument();
    expect(getByText("1 个匹配章节")).toBeInTheDocument();
    expect(await findByText("你明确把 Python/Rust 作为当前主栈")).toBeInTheDocument();
    expect(getAllByRole("button", { name: "这不对" }).length).toBeGreaterThan(0);
  });

  it("uses the default memory root without override controls", async () => {
    const { getByRole, queryByLabelText, queryByRole } = renderApp();
    const scanCalls = () => invokeMock.mock.calls.filter(([command]) => command === "scan_memories");
    const lastScanCall = () => {
      const calls = scanCalls();
      return calls[calls.length - 1];
    };

    await waitFor(() => expect(getByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument());
    expect(lastScanCall()).toEqual(["scan_memories", { rootOverride: null }]);
    expect(queryByRole("button", { name: /Users\/qsh/ })).not.toBeInTheDocument();
    expect(queryByLabelText("Memory root")).not.toBeInTheDocument();
    expect(queryByRole("button", { name: "应用" })).not.toBeInTheDocument();
    expect(queryByRole("button", { name: "默认" })).not.toBeInTheDocument();
  });
});

describe("App Codex audit", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
  });

  afterEach(() => {
    cleanup();
    invokeMock.mockReset();
    revealItemInDirMock.mockReset();
  });

  it("runs a mocked audit and renders every report section", async () => {
    revealItemInDirMock.mockResolvedValue(undefined);
    invokeMock.mockImplementation((command: string, args?: { mode?: CodexAuditMode }) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "start_codex_audit") {
        return Promise.resolve(auditTask("succeeded", args?.mode ?? "curated"));
      }
      if (command === "draft_correction_from_content") {
        return Promise.resolve({
          slug: "correction-primary-stack",
          content: auditRun.report.suggestedCorrections[0].content,
          targetPath:
            "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/20260609-correction-primary-stack.md",
        });
      }
      if (command === "write_correction") {
        return Promise.resolve(
          "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/20260609-correction-primary-stack.md",
        );
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    const {
      findByLabelText,
      findByText,
      getAllByRole,
      getAllByText,
      getByRole,
      getByText,
      queryByPlaceholderText,
    } = renderApp();

    await waitFor(() =>
      expect(getByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument(),
    );
    fireEvent.click(getByRole("button", { name: "检查" }));
    await waitFor(() =>
      expect(getByRole("heading", { name: "检查" })).toBeInTheDocument(),
    );
    expect(queryByPlaceholderText("搜索当前视图...")).not.toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: /开始检查/ }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("start_codex_audit", {
        rootOverride: null,
        mode: "curated",
      }),
    );
    await findByText("Primary stack mismatch");

    expect(getByText("Python/Rust")).toBeInTheDocument();
    expect(getByText("A newer correction note names Python/Rust as current.")).toBeInTheDocument();
    expect(getByText("Java/Spring Boot")).toBeInTheDocument();
    expect(getByText("Active project is uncertain")).toBeInTheDocument();
    expect(getByText("Clarify current primary stack")).toBeInTheDocument();
    expect(getAllByText("memory_summary.md 第 20-24 行").length).toBeGreaterThan(0);

    fireEvent.click(getAllByRole("button", { name: "memory_summary.md 第 20-24 行" })[0]);
    await waitFor(() =>
      expect(revealItemInDirMock).toHaveBeenCalledWith("/Users/qsh/.codex/memories/memory_summary.md"),
    );

    fireEvent.click(getByRole("button", { name: /起草修正/ }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("draft_correction_from_content", {
        rootOverride: null,
        slug: "correction-primary-stack",
        content: auditRun.report.suggestedCorrections[0].content,
      }),
    );
    expect(getByRole("heading", { name: "修正笔记" })).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith("write_correction", expect.anything());

    const editedCorrectionContent =
      "Memory update request:\n\n- Edited correction content before write.\n";
    fireEvent.change(await findByLabelText("内容"), {
      target: { value: editedCorrectionContent },
    });
    fireEvent.click(getByRole("button", { name: "写入修正笔记" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("write_correction", {
        rootOverride: null,
        draft: {
          slug: "correction-primary-stack",
          content: editedCorrectionContent,
          targetPath:
            "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/20260609-correction-primary-stack.md",
        },
      }),
    );
    expect(
      await findByText(
        "修正笔记已写入：/Users/qsh/.codex/memories/extensions/ad_hoc/notes/20260609-correction-primary-stack.md",
      ),
    ).toBeInTheDocument();
  });

  it("clears stale audit reports when switching audit mode", async () => {
    invokeMock.mockImplementation((command: string, args?: { mode?: string }) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "start_codex_audit") {
        const mode = (args?.mode ?? "curated") as CodexAuditMode;
        const run = {
          ...auditRun,
          report: {
            ...auditRun.report,
            mode,
          },
        } satisfies CodexAuditRun;
        return Promise.resolve(auditTask("succeeded", mode, run));
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    const { findByText, getByRole, queryByText } = renderApp();

    await waitFor(() =>
      expect(getByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument(),
    );
    fireEvent.click(getByRole("button", { name: "检查" }));
    fireEvent.click(getByRole("button", { name: /开始检查/ }));
    expect(await findByText("Primary stack mismatch")).toBeInTheDocument();

    fireEvent.change(getByRole("combobox", { name: "检查范围" }), {
      target: { value: "full" },
    });

    expect(queryByText("Primary stack mismatch")).not.toBeInTheDocument();
    expect(getByRole("heading", { name: "还没有检查结果" })).toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: /开始检查/ }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("start_codex_audit", {
        rootOverride: null,
        mode: "full",
      }),
    );
  });

  it("can cancel a running audit task and retry after cancellation", async () => {
    let startCount = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "start_codex_audit") {
        startCount += 1;
        return Promise.resolve(
          startCount === 1
            ? auditTask("running", "curated")
            : auditTask("succeeded", "curated"),
        );
      }
      if (command === "cancel_codex_audit") {
        return Promise.resolve(auditTask("cancelled", "curated"));
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    const { findByText, getByRole } = renderApp();

    await waitFor(() =>
      expect(getByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument(),
    );
    fireEvent.click(getByRole("button", { name: "检查" }));
    fireEvent.click(getByRole("button", { name: /开始检查/ }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("start_codex_audit", {
        rootOverride: null,
        mode: "curated",
      }),
    );
    expect(getByRole("combobox", { name: "检查范围" })).toBeDisabled();
    fireEvent.click(getByRole("button", { name: "取消" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("cancel_codex_audit"));
    fireEvent.click(getByRole("button", { name: /开始检查/ }));

    await waitFor(() => expect(startCount).toBe(2));
    expect(await findByText("Primary stack mismatch")).toBeInTheDocument();
  });

  it("shows audit errors without writing corrections", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "scan_memories") {
        return Promise.resolve(clarityScanResult);
      }
      if (command === "load_memory_profile") {
        return Promise.resolve(clarityMemoryProfile);
      }
      if (command === "start_codex_audit") {
        return Promise.reject(new Error("codex exec failed"));
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    const { getAllByText, getByRole } = renderApp();

    await waitFor(() =>
      expect(getByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument(),
    );
    fireEvent.click(getByRole("button", { name: "检查" }));
    await waitFor(() =>
      expect(getByRole("heading", { name: "检查" })).toBeInTheDocument(),
    );
    fireEvent.click(getByRole("button", { name: /开始检查/ }));

    await waitFor(() => expect(getAllByText("Error: codex exec failed").length).toBeGreaterThan(0));
    expect(invokeMock).not.toHaveBeenCalledWith("write_correction", expect.anything());
  });
});
