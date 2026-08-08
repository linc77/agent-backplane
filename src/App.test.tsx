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

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

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
      draftRevert: (
        agent: AgentKind,
        rootOverride: string | null,
        change: unknown,
        sourcePath: string,
      ) => invokeMock("draft_revert", { agent, rootOverride, change, sourcePath }),
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
  generator: "codex-profile-v7",
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
    targetSourcePaths: ["MEMORY.md", "extensions/ad_hoc/notes/profile.md"],
    change: {
      id: "change-profile-update",
      operation: "replace",
      targetEntryIds: ["profile", "profile-correction"],
      revertsChangeId: null,
      createdAt: "2026-07-17T03:00:00.000Z",
    },
  };
}

function appendDraft(): CorrectionDraft {
  return {
    ...correctionDraft(),
    slug: "memory-new",
    targetSourcePaths: [],
    change: {
      ...correctionDraft().change,
      id: "change-memory-new",
      operation: "append",
      targetEntryIds: [],
    },
  };
}

function revertDraft(): CorrectionDraft {
  return {
    ...correctionDraft(),
    slug: "revert-change-profile",
    targetSourcePaths: ["extensions/ad_hoc/notes/profile.md"],
    change: {
      id: "change-revert-profile",
      operation: "revert",
      targetEntryIds: ["change-profile"],
      revertsChangeId: "change-profile",
      createdAt: "2026-07-17T04:00:00.000Z",
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
    const { container, findByLabelText, findByRole, findByText, queryByRole } = renderApp();

    const overviewHeading = await findByRole("heading", { name: "Codex 记住的你" });
    expect(overviewHeading).toBeInTheDocument();
    expect(await findByRole("button", { name: "更新画像" })).toBeInTheDocument();
    expect(await findByRole("region", { name: "Codex 记忆图谱" })).toBeInTheDocument();
    expect(await findByRole("button", { name: "记忆图谱" })).toHaveAttribute("aria-pressed", "true");
    const memoryViewSwitch = await findByRole("group", { name: "记忆展示方式" });
    expect(
      Array.from(memoryViewSwitch.querySelectorAll("button"), (button) => button.textContent),
    ).toEqual(["关键记忆", "记忆图谱", "原始记忆"]);
    expect(container.querySelector(".memory-overview-sidebar")).toContainElement(overviewHeading);
    expect(await findByRole("button", { name: "折叠侧边栏" })).toHaveClass(
      "app-sidebar-toggle",
    );
    expect(container.querySelector(".memory-overview-sidebar-header")).toContainElement(
      await findByRole("button", { name: "折叠记忆侧栏" }),
    );
    expect(await findByRole("button", { name: "明亮" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(await findByRole("button", { name: "折叠侧边栏" }));
    expect(container.querySelector(".app-shell")).toHaveClass("sidebar-collapsed");
    expect(await findByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();
    fireEvent.click(await findByLabelText(/你把 Python 和 Rust 作为当前主栈/));
    expect(await findByText(profile.sections[0].body)).toBeInTheDocument();
    expect(await findByRole("button", { name: "收起依据" })).toBeInTheDocument();
    fireEvent.click(await findByRole("button", { name: "知识簇" }));
    expect(await findByRole("button", { name: "知识簇" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(await findByRole("button", { name: "树状图" }));
    expect(await findByRole("button", { name: "树状图" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(await findByRole("button", { name: "深海蓝" }));
    expect(await findByRole("button", { name: "深海蓝" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(await findByRole("button", { name: "明亮" }));
    expect(await findByRole("button", { name: "明亮" })).toHaveAttribute("aria-pressed", "true");
    expect(queryByRole("button", { name: "首页" })).not.toBeInTheDocument();
    expect(queryByRole("button", { name: "检查" })).not.toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveClass("memory-mode");
    expect(await findByRole("separator", { name: "调整侧栏宽度" })).toBeInTheDocument();
    expect(await findByRole("separator", { name: "调整记忆侧栏宽度" })).toBeInTheDocument();
    expect(container.querySelector(".inspector")).not.toBeInTheDocument();
  });

  it("loads the cached profile by Agent and locale without regenerating a fresh result", async () => {
    const { findByRole, findByText } = renderApp();

    fireEvent.click(await findByRole("button", { name: "关键记忆" }));
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
    let finishGeneration!: (task: MemoryProfileGenerationTask) => void;
    const generation = new Promise<MemoryProfileGenerationTask>((resolve) => {
      finishGeneration = resolve;
    });
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
        return generation;
      }
      if (command === "load_agent_config_inventory") {
        return Promise.resolve({ generatedAt: "now", catalogPath: "/tmp", targets: [] });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByRole, findByText } = renderApp();

    fireEvent.click(await findByRole("button", { name: "关键记忆" }));
    expect(await findByText(profile.sections[0].body)).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("start_memory_profile_generation", {
        agent: "codex",
        locale: "zh-CN",
      }),
    );
    finishGeneration(generationTask("succeeded", updatedProfile));
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
    const { findByRole, findByText } = renderApp();

    fireEvent.click(await findByRole("button", { name: "关键记忆" }));
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
    const { findByRole, findByText } = renderApp();

    fireEvent.click(await findByRole("button", { name: "关键记忆" }));
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

    fireEvent.click(await findByRole("button", { name: "关键记忆" }));
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
    expect(await findByText("将影响 2 条原始记忆")).toBeInTheDocument();
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

  it("omits the review inbox and supports adding and reverting explicit memory", async () => {
    let draftKind: "append" | "revert" | null = null;
    invokeMock.mockImplementation((command: string, payload?: { targets?: unknown[] }) => {
      if (command === "load_agent_memory_snapshot") return Promise.resolve(snapshot());
      if (command === "load_agent_config_inventory") {
        return Promise.resolve({ generatedAt: "now", catalogPath: "/tmp", targets: [] });
      }
      if (command === "draft_correction" && payload?.targets?.length === 0) {
        draftKind = "append";
        return Promise.resolve(appendDraft());
      }
      if (command === "draft_revert") {
        draftKind = "revert";
        return Promise.resolve(revertDraft());
      }
      if (command === "write_correction") {
        return Promise.resolve({ path: "/tmp/memory-change.md", changeId: `written-${draftKind}` });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const { findByRole, findByText, getByRole, queryByRole, queryByText } = renderApp();

    expect(await findByRole("heading", { name: "Codex 记住的你" })).toBeInTheDocument();
    expect(queryByRole("button", { name: /待确认/ })).not.toBeInTheDocument();
    expect(queryByText("建议确认")).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "原始记忆" }));
    fireEvent.click(await findByRole("button", { name: "新增记忆" }));
    expect(await findByRole("heading", { name: "新增一条记忆" })).toBeInTheDocument();
    expect(await findByText("不会覆盖现有记忆")).toBeInTheDocument();
    fireEvent.change(getByRole("textbox", { name: "希望 Codex 记住什么？" }), {
      target: { value: "回答时先给结论。" },
    });
    fireEvent.click(getByRole("button", { name: "保存记忆" }));
    expect(await findByText("记忆已修改，正在更新画像。")).toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "原始记忆" }));
    fireEvent.click(await findByRole("button", { name: "撤销修正" }));
    expect(await findByRole("heading", { name: "撤销这条修正" })).toBeInTheDocument();
    expect(await findByText(/撤销不会删除历史文件/)).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "确认撤销" }));
    await waitFor(() => expect(draftKind).toBe("revert"));
  });

  it("resizes only the sidebar pane", async () => {
    const { container, findByRole } = renderApp();
    await findByRole("heading", { name: "Codex 记住的你" });
    const separator = findByRole("separator", { name: "调整侧栏宽度" });
    const element = await separator;
    Object.defineProperty(element, "setPointerCapture", { value: vi.fn() });

    fireEvent.pointerDown(element, { pointerId: 1, clientX: 240 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 280 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 280 });

    await waitFor(() =>
      expect(container.querySelector(".app-shell")).toHaveStyle({
        "--sidebar-width": "280px",
      }),
    );
    expect(element).not.toHaveClass("active");
  });

  it("resizes the memory overview sidebar from its divider", async () => {
    const { container, findByRole } = renderApp();
    await findByRole("heading", { name: "Codex 记住的你" });
    const separator = await findByRole("separator", { name: "调整记忆侧栏宽度" });
    Object.defineProperty(separator, "setPointerCapture", { value: vi.fn() });

    fireEvent.pointerDown(separator, { pointerId: 2, clientX: 1000 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 960 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 960 });

    await waitFor(() =>
      expect(container.querySelector(".memory-profile")).toHaveStyle({
        "--memory-sidebar-width": "332px",
      }),
    );
    expect(separator).not.toHaveClass("active");
  });

  it("collapses and restores both sidebars from their top controls", async () => {
    const { container, findByRole, getByRole, queryByRole } = renderApp();
    await findByRole("heading", { name: "Codex 记住的你" });

    const leftCollapse = getByRole("button", { name: "折叠侧边栏" });
    const rightCollapse = getByRole("button", { name: "折叠记忆侧栏" });
    expect(leftCollapse).toHaveClass("app-sidebar-toggle");
    expect(container.querySelector(".memory-overview-sidebar-header")).toContainElement(
      rightCollapse,
    );

    fireEvent.click(leftCollapse);

    expect(container.querySelector(".sidebar")).toHaveClass("collapsed");
    expect(container.querySelector(".app-shell")).toHaveClass("sidebar-collapsed");
    expect(container.querySelector(".app-shell")).toHaveStyle({
      "--sidebar-width": "64px",
    });

    fireEvent.click(getByRole("button", { name: "展开侧边栏" }));

    expect(container.querySelector(".sidebar")).not.toHaveClass("collapsed");
    expect(container.querySelector(".app-shell")).not.toHaveClass("sidebar-collapsed");

    fireEvent.click(rightCollapse);

    expect(container.querySelector(".memory-view-layout")).toHaveClass("overview-collapsed");
    expect(container.querySelector(".memory-overview-sidebar")).not.toBeInTheDocument();
    expect(queryByRole("heading", { name: "Codex 记住的你" })).not.toBeInTheDocument();
    expect(container.querySelector(".memory-view-toolbar")).toContainElement(
      getByRole("button", { name: "展开记忆侧栏" }),
    );

    fireEvent.click(getByRole("button", { name: "展开记忆侧栏" }));

    expect(container.querySelector(".memory-view-layout")).not.toHaveClass("overview-collapsed");
    expect(await findByRole("heading", { name: "Codex 记住的你" })).toBeInTheDocument();
  });
});
