// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";

function ensureLocalStorage() {
  try {
    if (window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Install a small storage shim for test runtimes without jsdom localStorage.
  }

  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, value),
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
  return storage;
}

function renderFixtureApp() {
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

describe("App browser fixture mode", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/?fixture=1");
    ensureLocalStorage().clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
  });

  afterEach(() => {
    cleanup();
    ensureLocalStorage().clear();
    window.history.pushState(null, "", "/");
  });

  it("uses Chinese UI chrome by default", async () => {
    const { findByRole, findByText, queryByRole } = renderFixtureApp();

    expect(await findByText("演示模式：仅使用示例记忆")).toBeInTheDocument();
    expect(await findByRole("heading", { name: "Codex 记住的你" })).toBeInTheDocument();
    expect(await findByRole("button", { name: /Codex/ })).toBeInTheDocument();
    expect(await findByRole("button", { name: "记忆" })).toBeInTheDocument();
    expect(queryByRole("button", { name: "检查" })).not.toBeInTheDocument();
    fireEvent.click(await findByRole("button", { name: "记忆" }));
    expect(queryByRole("button", { name: "检查" })).not.toBeInTheDocument();
    expect(queryByRole("button", { name: "Agents" })).not.toBeInTheDocument();
  });

  it("switches between Chinese and English", async () => {
    const { findByRole, getByRole, queryByRole } = renderFixtureApp();

    expect(await findByRole("heading", { name: "Codex 记住的你" })).toBeInTheDocument();
    expect(queryByRole("button", { name: "English" })).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "设置" }));
    fireEvent.click(await findByRole("button", { name: "English" }));
    expect(await findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: /Memory/ }));
    expect(
      await findByRole("heading", { name: "What Codex remembers about you" }),
    ).toBeInTheDocument();
    expect(ensureLocalStorage().getItem("agent-backplane.locale")).toBe("en-US");

    expect(queryByRole("button", { name: "中文" })).not.toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "Settings" }));
    fireEvent.click(getByRole("button", { name: "中文" }));
    expect(await findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(ensureLocalStorage().getItem("agent-backplane.locale")).toBe("zh-CN");
  });

  it("opens global update settings as a page without invoking native updater APIs", async () => {
    const { findByRole, findByText, getByRole, queryByRole } = renderFixtureApp();

    fireEvent.click(await findByRole("button", { name: "设置" }));

    expect(await findByRole("main")).toHaveClass("settings-page");
    expect(await findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(queryByRole("dialog", { name: "设置" })).not.toBeInTheDocument();
    expect(await findByText("应用更新")).toBeInTheDocument();
    expect(getByRole("group", { name: "语言" })).toBeInTheDocument();
    expect(await findByText("更新检查仅在安装后的桌面应用中可用。")).toBeInTheDocument();
    expect(getByRole("checkbox", { name: /启动时自动检查/ })).toBeDisabled();
    expect(getByRole("button", { name: "设置" })).toHaveAttribute("aria-current", "page");
  });

  it("browses and filters the managed skill inventory", async () => {
    const {
      findByPlaceholderText,
      findByRole,
      findByText,
      getAllByText,
      container,
      queryByRole,
      queryByText,
    } =
      renderFixtureApp();

    fireEvent.click(await findByRole("button", { name: "Skills" }));

    expect(await findByRole("heading", { name: "Codex · Skills" })).toBeInTheDocument();
    expect(await findByRole("button", { name: "查看 find-skills 详情" })).toBeInTheDocument();
    expect(queryByRole("heading", { name: "Skill 文档" })).not.toBeInTheDocument();
    expect(getAllByText("2 份副本").length).toBeGreaterThan(0);
    expect(queryByText("1 份副本")).not.toBeInTheDocument();
    expect(getAllByText(".agents").length).toBeGreaterThan(0);
    expect(await findByText("使用 3 次")).toBeInTheDocument();
    expect(getAllByText("Codex").length).toBeGreaterThan(0);
    expect(await findByRole("navigation", { name: "分类" })).toBeInTheDocument();
    expect(await findByRole("button", { name: "全部 4" })).toBeInTheDocument();
    expect(queryByRole("button", { name: /研究/ })).not.toBeInTheDocument();

    fireEvent.click(await findByRole("button", { name: "查看 find-skills 详情" }));
    expect(await findByRole("heading", { name: "find-skills" })).toBeInTheDocument();
    const locations = container.querySelector(".skill-locations");
    const markdownPanel = container.querySelector(".skill-markdown-panel");
    expect(locations).not.toBeNull();
    expect(markdownPanel).not.toBeNull();
    if (!locations || !markdownPanel) {
      throw new Error("Expected Skill detail sections");
    }
    expect(
      locations.compareDocumentPosition(markdownPanel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(queryByText("名称")).not.toBeInTheDocument();
    expect(queryByText("说明")).not.toBeInTheDocument();
    expect(queryByText("正常")).not.toBeInTheDocument();
    expect(queryByText("可见工具")).not.toBeInTheDocument();
    expect(queryByText("Discover installable agent skills.")).toBeInTheDocument();
    expect(queryByText(/使用 3 次.*Codex 2.*Claude Code 1/)).toBeInTheDocument();
    expect(await findByRole("heading", { name: "Skill 文档" })).toBeInTheDocument();
    expect(await findByRole("heading", { name: "Find Skills" })).toBeInTheDocument();
    expect(await findByRole("combobox", { name: "编辑副本" })).toBeInTheDocument();
    fireEvent.click(await findByRole("button", { name: "编辑" }));
    const editor = await findByRole("textbox", { name: "SKILL.md 内容" });
    fireEvent.change(editor, {
      target: { value: `${(editor as HTMLTextAreaElement).value}\nEdited.\n` },
    });
    fireEvent.click(await findByRole("button", { name: "保存" }));
    expect(await findByText("已保存到所选 SKILL.md。")).toBeInTheDocument();
    fireEvent.click(await findByRole("button", { name: "返回全部 Skills" }));

    fireEvent.click(await findByRole("button", { name: "查看 metadata-only 详情" }));
    expect(await findByRole("heading", { name: "metadata-only" })).toBeInTheDocument();
    expect(queryByText("A Skill with required metadata and no Markdown body.")).toBeInTheDocument();
    expect(queryByText("这个 Skill 暂无可显示的 Markdown 内容。")).toBeInTheDocument();
    fireEvent.click(await findByRole("button", { name: "返回全部 Skills" }));

    fireEvent.click(await findByRole("button", { name: "查看 broken-skill 详情" }));
    expect(await findByText("Missing YAML frontmatter")).toBeInTheDocument();
    fireEvent.click(await findByRole("button", { name: "返回全部 Skills" }));
    expect(queryByText(/SkillManager/)).not.toBeInTheDocument();
    expect(queryByRole("separator", { name: "调整依据栏宽度" })).not.toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveClass("skills-mode");

    fireEvent.change(await findByPlaceholderText("搜索能力、工具或路径..."), {
      target: { value: "diagnose" },
    });

    expect(await findByRole("button", { name: "查看 diagnose 详情" })).toBeInTheDocument();
    expect(queryByText("find-skills")).not.toBeInTheDocument();
  });

  it("switches the global Agent context across memory, Skills, MCP, and configuration", async () => {
    const {
      findByRole,
      findByText,
      getByRole,
      queryByRole,
      queryByText,
      container,
    } = renderFixtureApp();

    fireEvent.click(await findByRole("button", { name: /Codex/ }));
    fireEvent.click(await findByRole("menuitemradio", { name: /Claude Code/ }));

    expect(await findByRole("heading", { name: "Claude Code 记住的你" })).toBeInTheDocument();
    expect(await findByText("Claude Code 的记忆与 Codex 相互独立。")).toBeInTheDocument();
    expect(queryByRole("button", { name: "修改" })).toBeInTheDocument();
    expect(queryByRole("button", { name: "更新画像" })).toBeInTheDocument();
    expect(queryByRole("button", { name: "检查" })).not.toBeInTheDocument();
    expect(ensureLocalStorage().getItem("agent-backplane.selected-agent")).toBe(
      "claudeCode",
    );

    fireEvent.click(getByRole("button", { name: "Skills" }));
    expect(await findByRole("heading", { name: "Claude Code · Skills" })).toBeInTheDocument();
    expect(await findByText("claude-helper")).toBeInTheDocument();
    expect(await findByText(".claude")).toBeInTheDocument();
    expect(queryByText("hermes-helper")).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "MCP" }));
    expect(await findByRole("heading", { name: "Claude Code · MCP" })).toBeInTheDocument();
    expect(await findByText("drawio")).toBeInTheDocument();
    expect(queryByText("context7")).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: /Claude Code/ }));
    fireEvent.click(await findByRole("menuitemradio", { name: /Hermes/ }));
    expect(await findByRole("heading", { name: "Hermes · MCP" })).toBeInTheDocument();
    expect(await findByText("mnemosyne")).toBeInTheDocument();
    expect(queryByText("drawio")).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: /Hermes/ }));
    fireEvent.click(await findByRole("menuitem", { name: "管理当前 Agent 配置" }));
    expect(await findByRole("heading", { name: "Hermes · 配置" })).toBeInTheDocument();
    expect(await findByText("OpenRouter")).toBeInTheDocument();
    expect(queryByText("OpenAI Official")).not.toBeInTheDocument();
    expect(queryByText("Anthropic Official")).not.toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveClass("agent-mode");
    expect(queryByRole("separator", { name: "调整依据栏宽度" })).not.toBeInTheDocument();
  });

  it("restores the last selected Agent", async () => {
    ensureLocalStorage().setItem("agent-backplane.selected-agent", "hermes");

    const { findByRole, findByText, queryByRole } = renderFixtureApp();

    expect(await findByRole("heading", { name: "Hermes 记住的你" })).toBeInTheDocument();
    expect(await findByText("Hermes 的记忆与 Codex 相互独立。")).toBeInTheDocument();
    expect(queryByRole("button", { name: "检查" })).not.toBeInTheDocument();
  });

  it("activates a provider profile for the selected Agent only", async () => {
    const { findByRole, findByText, queryByText } = renderFixtureApp();

    fireEvent.click(await findByRole("button", { name: /Codex/ }));
    fireEvent.click(await findByRole("menuitem", { name: "管理当前 Agent 配置" }));

    expect(await findByRole("heading", { name: "Codex · 配置" })).toBeInTheDocument();
    expect(await findByText("OpenAI Official")).toBeInTheDocument();
    expect(queryByText("Anthropic Official")).not.toBeInTheDocument();
    fireEvent.click(await findByRole("button", { name: "启用" }));
    expect(await findByText(/Codex 已切换到新配置/)).toBeInTheDocument();
    expect(await findByText(/原配置已备份/)).toBeInTheDocument();
  });

  it("drives the core memory review flow without desktop IPC", async () => {
    const {
      findAllByText,
      findByRole,
      findByText,
      getAllByRole,
      getByRole,
    } =
      renderFixtureApp();

    expect(await findByText("演示模式：仅使用示例记忆")).toBeInTheDocument();
    expect(getByRole("heading", { name: "Codex 记住的你" })).toBeInTheDocument();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    expect(await findByText("Codex 记住的你")).toBeInTheDocument();
    expect(await findByText("你把 Python/Rust 作为当前主栈")).toBeInTheDocument();
    expect((await findAllByText(/优先相信 Python\/Rust/)).length).toBeGreaterThan(0);
    fireEvent.click(getByRole("button", { name: "全部记忆" }));
    expect(await findByRole("heading", { name: "Codex 当前记忆" })).toBeInTheDocument();
    expect(await findByText(/Treat Python\/Rust as the current primary stack/)).toBeInTheDocument();
    fireEvent.click(getAllByRole("button", { name: "修改" })[0]);
    expect(await findByText("修改这条记忆")).toBeInTheDocument();
    fireEvent.change(getByRole("textbox", { name: "正确情况是什么？" }), {
      target: { value: "我现在主要使用 TypeScript 和 Python。" },
    });
    fireEvent.click(getByRole("button", { name: "保存修改" }));
    expect(await findByText("记忆已修改，正在更新画像。")).toBeInTheDocument();
  });
});
