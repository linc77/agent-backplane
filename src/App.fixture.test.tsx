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
    const { findByRole, findByText } = renderFixtureApp();

    expect(await findByText("演示模式：仅使用示例记忆")).toBeInTheDocument();
    expect(await findByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument();
    expect(await findByRole("button", { name: "记忆" })).toBeInTheDocument();
    expect(await findByRole("button", { name: "检查" })).toBeInTheDocument();
  });

  it("switches between Chinese and English", async () => {
    const { findByPlaceholderText, findByRole, getByRole } = renderFixtureApp();

    expect(await findByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument();

    fireEvent.click(await findByRole("button", { name: "English" }));
    expect(await findByRole("heading", { name: "How Codex currently understands you" })).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: /Memory/ }));
    expect(await findByPlaceholderText("Search current view...")).toBeInTheDocument();
    expect(ensureLocalStorage().getItem("agent-memory-manager.locale")).toBe("en-US");

    fireEvent.click(getByRole("button", { name: "中文" }));
    expect(await findByRole("heading", { name: "记忆" })).toBeInTheDocument();
    expect(await findByPlaceholderText("搜索当前视图...")).toBeInTheDocument();
    expect(ensureLocalStorage().getItem("agent-memory-manager.locale")).toBe("zh-CN");
  });

  it("browses and filters the managed skill inventory", async () => {
    const {
      findAllByText,
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

    expect(await findByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect((await findAllByText("find-skills")).length).toBeGreaterThan(0);
    expect(getAllByText("2 份副本").length).toBeGreaterThan(0);
    expect(getAllByText("Codex").length).toBeGreaterThan(0);
    fireEvent.click(await findByText("broken-skill"));
    expect(getAllByText("清单异常").length).toBeGreaterThan(0);
    expect(queryByText(/SkillManager/)).not.toBeInTheDocument();
    expect(queryByRole("separator", { name: "调整依据栏宽度" })).not.toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveClass("skills-mode");

    fireEvent.change(await findByPlaceholderText("搜索能力、工具或路径..."), {
      target: { value: "diagnose" },
    });

    expect(await findByRole("heading", { name: "diagnose" })).toBeInTheDocument();
    expect(queryByText("find-skills")).not.toBeInTheDocument();
  });

  it("switches Agent targets and activates a provider profile", async () => {
    const { findByRole, findByText, getByRole, queryByRole, container } = renderFixtureApp();

    fireEvent.click(await findByRole("button", { name: "Agents" }));

    expect(await findByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(await findByText("OpenAI Official")).toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveClass("agent-mode");
    expect(queryByRole("separator", { name: "调整依据栏宽度" })).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: /Claude Code/ }));
    expect(await findByText("Anthropic Official")).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: /Hermes/ }));
    expect(await findByText("OpenRouter")).toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: /Codex/ }));
    fireEvent.click(await findByRole("button", { name: "启用" }));
    expect(await findByText(/Codex 已切换到新配置/)).toBeInTheDocument();
    expect(await findByText(/原配置已备份/)).toBeInTheDocument();
  });

  it("drives the core memory review flow without Tauri commands", async () => {
    const {
      findAllByText,
      findByPlaceholderText,
      findByText,
      getAllByRole,
      getByRole,
      queryByPlaceholderText,
    } =
      renderFixtureApp();

    expect(await findByText("演示模式：仅使用示例记忆")).toBeInTheDocument();
    expect(getByRole("heading", { name: "Codex 目前这样理解你" })).toBeInTheDocument();

    fireEvent.click(await waitFor(() => getByRole("button", { name: "记忆" })));
    expect(await findByText("Codex 目前这样理解你")).toBeInTheDocument();
    expect(await findByText("你把 Python/Rust 作为当前主栈")).toBeInTheDocument();
    expect((await findAllByText(/优先相信 Python\/Rust/)).length).toBeGreaterThan(0);
    fireEvent.click(getAllByRole("button", { name: "这不对" })[0]);
    expect(await findByText("修正笔记")).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "取消" }));
    fireEvent.change(await findByPlaceholderText("搜索当前视图..."), {
      target: { value: "not-a-memory" },
    });
    expect(await findByText("还没有足够的当前记忆生成画像")).toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "检查" }));
    await waitFor(() => expect(queryByPlaceholderText("搜索当前视图...")).not.toBeInTheDocument());
    fireEvent.click(getByRole("button", { name: /开始检查/ }));
    expect(await findByText("Primary stack mismatch")).toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: /起草修正/ }));
    expect(await findByText("修正笔记")).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "写入修正笔记" }));
    expect(await findByText(/修正笔记已写入：/)).toBeInTheDocument();
  });
});
