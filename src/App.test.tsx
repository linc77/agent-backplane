// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type {
  AgentKind,
  AgentMemorySnapshot,
  CorrectionDraft,
  MemoryProfile,
  MemoryProfileGenerationTask,
  MemoryProfileLocale,
  ScanResult,
} from "./lib/types";

const invokeMock = vi.hoisted(() => vi.fn());
const revealItemInDirMock = vi.hoisted(() => vi.fn());

Object.defineProperty(window, "backplane", {
  configurable: true,
  value: {
    app: {
      getUpdateState: () => Promise.resolve({
        supported: true,
        phase: "idle" as const,
        currentVersion: "0.5.1",
        update: null,
        progress: null,
        error: null,
      }),
      checkForUpdates: () => Promise.resolve({
        supported: true,
        phase: "upToDate" as const,
        currentVersion: "0.5.1",
        update: null,
        progress: null,
        error: null,
      }),
      downloadUpdate: () => Promise.reject(new Error("No update")),
      installUpdate: () => Promise.reject(new Error("No update")),
    },
    memory: {
      scan: (rootOverride: string | null) => invokeMock("scan_memories", { rootOverride }),
      startProfileGeneration: (agent: AgentKind, locale: MemoryProfileLocale) =>
        invokeMock("start_memory_profile_generation", { agent, locale }),
      getProfileGeneration: () => invokeMock("get_memory_profile_generation"),
      cancelProfileGeneration: () => invokeMock("cancel_memory_profile_generation"),
      loadAgentSnapshot: (agent: AgentKind, locale: MemoryProfileLocale) =>
        invokeMock("load_agent_memory_snapshot", { agent, locale }),
      getSourceExcerpt: (
        rootOverride: string | null,
        path: string,
        startLine: number,
        endLine: number,
      ) => invokeMock("get_source_excerpt", { rootOverride, path, startLine, endLine }),
      draftCorrection: (
        agent: AgentKind,
        rootOverride: string | null,
        slug: string,
        bulletLines: string[],
        targets: unknown,
      ) => invokeMock("draft_correction", { agent, rootOverride, slug, bulletLines, targets }),
      draftCorrectionFromContent: () => Promise.reject(new Error("unused")),
      draftRevert: () => Promise.reject(new Error("unused")),
      writeCorrection: (rootOverride: string | null, draft: unknown) =>
        invokeMock("write_correction", { rootOverride, draft }),
    },
    skills: {
      load: () => Promise.reject(new Error("unused")),
      loadUsage: () => Promise.reject(new Error("unused")),
      saveManifest: () => Promise.reject(new Error("unused")),
    },
    agentConfig: {
      load: () => invokeMock("load_agent_config_inventory"),
      save: () => Promise.reject(new Error("unused")),
      delete: () => Promise.reject(new Error("unused")),
      activate: () => Promise.reject(new Error("unused")),
    },
    mcp: { load: () => Promise.reject(new Error("unused")) },
    shell: { revealSource: (path: string) => revealItemInDirMock(path) },
  },
});

const scan: ScanResult = {
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
      id: "correction",
      path: "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/profile.md",
      relativePath: "extensions/ad_hoc/notes/profile.md",
      kind: "adHocNote",
      modifiedMs: 2,
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
      summary: "The user's current technical stack is Python and Rust.",
      searchText: "The user's current technical stack is Python and Rust.",
      sourcePath: "MEMORY.md",
      startLine: 1,
      endLine: 3,
    },
    {
      id: "profile-correction",
      topic: "overrides",
      relatedTopics: ["profile"],
      title: "Profile correction",
      summary: "Treat Python and Rust as the current primary stack.",
      searchText: "Treat Python and Rust as the current primary stack.",
      sourcePath: "extensions/ad_hoc/notes/profile.md",
      startLine: 1,
      endLine: 3,
      change: {
        id: "change-profile",
        operation: "replace",
        targetEntryIds: ["profile"],
        revertsChangeId: null,
        createdAt: "2026-07-17T00:00:00.000Z",
      },
    },
  ],
  risks: [],
};

const profile: MemoryProfile = {
  schemaVersion: "1",
  generatedAt: "2026-07-17T02:00:00Z",
  sourceHash: "profile-source-hash",
  generator: "codex-profile-v4",
  cachePath: "/Users/qsh/.codex/memories/.backplane/profile.zh-CN.json",
  sections: [
    {
      id: "python-rust-current-stack",
      title: "你把 Python 和 Rust 作为当前主栈",
      body: "你的最新修正明确要求 Agent 以 Python 和 Rust 作为当前主要技术栈。",
      confidence: "high",
      stability: "stable",
      evidence: [
        {
          entryId: "profile-correction",
          sourcePath: "extensions/ad_hoc/notes/profile.md",
          startLine: 1,
          endLine: 3,
          summary: "The current primary stack is Python and Rust.",
        },
        {
          entryId: "profile",
          sourcePath: "MEMORY.md",
          startLine: 1,
          endLine: 3,
          summary: "Older durable profile evidence.",
        },
      ],
    },
  ],
  metadata: {
    memoryRoot: scan.root,
    inputEntries: 2,
    currentEntries: 1,
  },
};

function snapshot(overrides: Partial<AgentMemorySnapshot> = {}): AgentMemorySnapshot {
  return {
    agent: "codex",
    writable: true,
    scan,
    profile,
    profileStale: false,
    sourceHash: profile.sourceHash,
    ...overrides,
  };
}

function generationTask(
  status: MemoryProfileGenerationTask["status"],
  nextProfile: MemoryProfile | null = status === "succeeded" ? profile : null,
): MemoryProfileGenerationTask {
  return {
    id: status === "idle" ? null : "profile-task",
    agent: status === "idle" ? null : "codex",
    locale: status === "idle" ? null : "zh-CN",
    status,
    startedAt: status === "idle" ? null : "2026-07-17T02:00:00Z",
    finishedAt: status === "running" || status === "cancelling" ? null : "2026-07-17T02:00:01Z",
    error: status === "failed" ? "codex exec failed" : null,
    profile: nextProfile,
  };
}

function correctionDraft(): CorrectionDraft {
  return {
    agent: "codex",
    slug: "memory-profile-python-rust-current-stack",
    content: "Memory update request:\n\n- Correct the current stack.\n",
    targetPath: "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/profile-update.md",
    targetSourcePaths: ["MEMORY.md"],
    change: {
      id: "change-profile-update",
      operation: "replace",
      targetEntryIds: ["profile"],
      revertsChangeId: null,
      createdAt: "2026-07-17T03:00:00.000Z",
    },
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

describe("App memory profile", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/");
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
    invokeMock.mockImplementation((command: string) => {
      if (command === "load_agent_memory_snapshot") return Promise.resolve(snapshot());
      if (command === "load_agent_config_inventory") {
        return Promise.resolve({ generatedAt: "now", catalogPath: "/tmp", targets: [] });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
  });

  afterEach(() => {
    cleanup();
    invokeMock.mockReset();
    revealItemInDirMock.mockReset();
    window.localStorage.clear();
  });

  it("opens directly on the redesigned memory page without Home or Check", async () => {
    const { container, findByRole, queryByRole } = renderApp();

    expect(await findByRole("heading", { name: "Codex 记住的你" })).toBeInTheDocument();
    expect(await findByRole("button", { name: "更新画像" })).toBeInTheDocument();
    expect(queryByRole("button", { name: "首页" })).not.toBeInTheDocument();
    expect(queryByRole("button", { name: "检查" })).not.toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveClass("memory-mode");
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(container.querySelector(".inspector")).not.toBeInTheDocument();
  });

  it("loads the cached profile by Agent and locale without regenerating a fresh result", async () => {
    const { findByText } = renderApp();

    expect(await findByText(profile.sections[0].body)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("load_agent_memory_snapshot", {
      agent: "codex",
      locale: "zh-CN",
    });
    expect(invokeMock).not.toHaveBeenCalledWith(
      "start_memory_profile_generation",
      expect.anything(),
    );
  });

  it("keeps the last profile visible while stale memory updates in the background", async () => {
    const updatedProfile: MemoryProfile = {
      ...profile,
      sourceHash: "new-source-hash",
      sections: [{ ...profile.sections[0], body: "后台更新后的中文记忆画像。" }],
    };
    let loads = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "load_agent_memory_snapshot") {
        loads += 1;
        return Promise.resolve(
          loads === 1
            ? snapshot({ profileStale: true, sourceHash: "new-source-hash" })
            : snapshot({ profile: updatedProfile, sourceHash: "new-source-hash" }),
        );
      }
      if (command === "start_memory_profile_generation") {
        return Promise.resolve(generationTask("succeeded", updatedProfile));
      }
      if (command === "load_agent_config_inventory") {
        return Promise.resolve({ generatedAt: "now", catalogPath: "/tmp", targets: [] });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByText } = renderApp();

    expect(await findByText(profile.sections[0].body)).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("start_memory_profile_generation", {
        agent: "codex",
        locale: "zh-CN",
      }),
    );
    expect(await findByText("后台更新后的中文记忆画像。")).toBeInTheDocument();
  });

  it("keeps the previous profile when AI generation fails", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "load_agent_memory_snapshot") {
        return Promise.resolve(snapshot({ profileStale: true, sourceHash: "changed" }));
      }
      if (command === "start_memory_profile_generation") {
        return Promise.resolve(generationTask("failed", null));
      }
      if (command === "load_agent_config_inventory") {
        return Promise.resolve({ generatedAt: "now", catalogPath: "/tmp", targets: [] });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByText } = renderApp();

    expect(await findByText(profile.sections[0].body)).toBeInTheDocument();
    expect(await findByText("更新失败，继续显示上次结果。")).toBeInTheDocument();
    expect(await findByText("查看错误")).toBeInTheDocument();
  });

  it("generates the first profile automatically when memory exists", async () => {
    let loads = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "load_agent_memory_snapshot") {
        loads += 1;
        return Promise.resolve(
          loads === 1
            ? snapshot({ profile: null, sourceHash: "first-profile-source" })
            : snapshot(),
        );
      }
      if (command === "start_memory_profile_generation") {
        return Promise.resolve(generationTask("succeeded", profile));
      }
      if (command === "load_agent_config_inventory") {
        return Promise.resolve({ generatedAt: "now", catalogPath: "/tmp", targets: [] });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByText } = renderApp();

    expect(await findByText(profile.sections[0].body)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("start_memory_profile_generation", {
      agent: "codex",
      locale: "zh-CN",
    });
  });

  it("opens evidence and drafts a targeted correction", async () => {
    revealItemInDirMock.mockResolvedValue(undefined);
    invokeMock.mockImplementation((command: string) => {
      if (command === "load_agent_memory_snapshot") return Promise.resolve(snapshot());
      if (command === "load_agent_config_inventory") {
        return Promise.resolve({ generatedAt: "now", catalogPath: "/tmp", targets: [] });
      }
      if (command === "draft_correction") return Promise.resolve(correctionDraft());
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByRole, findByText, getByRole } = renderApp();

    fireEvent.click(await findByText("查看依据 2"));
    fireEvent.click(
      await findByRole("button", {
        name: /extensions\/ad_hoc\/notes\/profile\.md 第 1-3 行/,
      }),
    );
    await waitFor(() =>
      expect(revealItemInDirMock).toHaveBeenCalledWith(
        "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/profile.md",
      ),
    );

    fireEvent.click(getByRole("button", { name: "修改" }));
    expect(await findByRole("heading", { name: "修改这条记忆" })).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("draft_correction", expect.objectContaining({
      agent: "codex",
      slug: "memory-profile-python-rust-current-stack",
      targets: expect.arrayContaining([
        { entryId: "profile", sourcePath: "MEMORY.md" },
        {
          entryId: "profile-correction",
          sourcePath: "extensions/ad_hoc/notes/profile.md",
        },
      ]),
    }));
  });

  it("resizes only the sidebar pane", async () => {
    const { container, findByRole } = renderApp();
    await findByRole("heading", { name: "Codex 记住的你" });
    const separator = findByRole("separator", { name: "调整侧栏宽度" });
    const element = await separator;
    Object.defineProperty(element, "setPointerCapture", { value: vi.fn() });

    fireEvent.pointerDown(element, { pointerId: 1, clientX: 240 });
    fireEvent.pointerMove(element, { pointerId: 1, clientX: 280 });
    fireEvent.pointerUp(element, { pointerId: 1, clientX: 280 });

    await waitFor(() =>
      expect(container.querySelector(".app-shell")).toHaveStyle({
        gridTemplateColumns: expect.stringContaining("280px"),
      }),
    );
  });
});
