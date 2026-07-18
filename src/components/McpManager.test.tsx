// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getUiText } from "../lib/i18n";
import type { McpInventory } from "../lib/types";
import { McpManager } from "./McpManager";

const apiMocks = vi.hoisted(() => ({
  loadMcpInventory: vi.fn(),
  openSourceFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/api", () => apiMocks);

const inventory: McpInventory = {
  generatedAt: "2026-07-18T04:00:00.000Z",
  agent: "codex",
  sources: [
    {
      id: "source-loaded",
      path: "/Users/demo/.codex/config.toml",
      label: "config.toml",
      state: "loaded",
      diagnostic: null,
      serverCount: 3,
    },
    {
      id: "source-invalid",
      path: "/Users/demo/project/.codex/config.toml",
      label: "config.toml",
      state: "invalid",
      diagnostic: "parse-failed",
      serverCount: 0,
    },
  ],
  servers: [
    {
      id: "configured",
      name: "context7",
      scope: "user",
      scopeLabel: "",
      sourceId: "source-loaded",
      sourcePath: "/Users/demo/.codex/config.toml",
      transport: "stdio",
      endpoint: "npx",
      endpointKind: "value",
      state: "configured",
      diagnostics: [],
    },
    {
      id: "disabled",
      name: "computer-use",
      scope: "user",
      scopeLabel: "",
      sourceId: "source-loaded",
      sourcePath: "/Users/demo/.codex/config.toml",
      transport: "stdio",
      endpoint: "Local process",
      endpointKind: "local",
      state: "disabled",
      diagnostics: [],
    },
    {
      id: "invalid",
      name: "broken-remote",
      scope: "project",
      scopeLabel: "demo",
      sourceId: "source-loaded",
      sourcePath: "/Users/demo/.codex/config.toml",
      transport: "unknown",
      endpoint: "Remote endpoint",
      endpointKind: "remote",
      state: "invalid",
      diagnostics: ["missing-transport"],
    },
  ],
};

function renderManager(selectedAgent: "codex" | "claudeCode" = "codex") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <McpManager selectedAgent={selectedAgent} uiText={getUiText("zh-CN")} />
    </QueryClientProvider>,
  );
  return {
    ...rendered,
    rerenderAgent(agent: "codex" | "claudeCode") {
      rendered.rerender(
        <QueryClientProvider client={queryClient}>
          <McpManager selectedAgent={agent} uiText={getUiText("zh-CN")} />
        </QueryClientProvider>,
      );
    },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("McpManager", () => {
  it("separates configured state from diagnostics and exposes source evidence", async () => {
    apiMocks.loadMcpInventory.mockResolvedValue(inventory);
    const { findByRole, findByText, getByLabelText, getByRole, queryByText } = renderManager();

    expect(await findByRole("heading", { name: "Codex · MCP" })).toBeInTheDocument();
    expect(await findByText("配置已启用")).toBeInTheDocument();
    expect(await findByText("配置已停用")).toBeInTheDocument();
    expect(await findByText("配置无效")).toBeInTheDocument();
    expect(await findByText("远程 Claude MCP 必须声明 type。")).toBeInTheDocument();
    expect(await findByText("配置语法无法解析。")).toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "需处理" }));
    expect(await findByText("broken-remote")).toBeInTheDocument();
    expect(queryByText("context7")).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "全部" }));
    fireEvent.change(getByLabelText("搜索 Server、端点或项目..."), { target: { value: "context" } });
    expect(await findByText("context7")).toBeInTheDocument();
    expect(queryByText("computer-use")).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "在 Finder 中显示: /Users/demo/.codex/config.toml" }));
    expect(apiMocks.openSourceFile).toHaveBeenCalledWith("/Users/demo/.codex/config.toml");
  });

  it("keeps the last successful inventory visible when a refresh fails", async () => {
    apiMocks.loadMcpInventory
      .mockResolvedValueOnce(inventory)
      .mockRejectedValueOnce(new Error("private path must not be shown"));
    const { findByRole, findByText, getByRole } = renderManager();

    expect(await findByText("context7")).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "刷新" }));

    const alert = await findByRole("alert");
    expect(alert).toHaveTextContent("刷新失败，仍显示");
    expect(alert).not.toHaveTextContent("private path");
    expect(await findByText("context7")).toBeInTheDocument();
  });

  it("resets search and state filters when the selected Agent changes", async () => {
    const claudeInventory: McpInventory = {
      ...inventory,
      agent: "claudeCode",
      servers: [{ ...inventory.servers[0], id: "claude-drawio", name: "drawio" }],
    };
    apiMocks.loadMcpInventory.mockImplementation((agent) =>
      Promise.resolve(agent === "claudeCode" ? claudeInventory : inventory));
    const { findByText, getByLabelText, getByRole, rerenderAgent } = renderManager();

    expect(await findByText("context7")).toBeInTheDocument();
    fireEvent.change(getByLabelText("搜索 Server、端点或项目..."), { target: { value: "context" } });
    fireEvent.click(getByRole("button", { name: "配置启用" }));

    rerenderAgent("claudeCode");

    expect(await findByText("drawio")).toBeInTheDocument();
    expect(getByLabelText("搜索 Server、端点或项目...")).toHaveValue("");
    expect(getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a safe initial error without leaking the native error", async () => {
    apiMocks.loadMcpInventory.mockRejectedValue(new Error("/Users/private/secret-config"));
    const { findByRole } = renderManager();

    const alert = await findByRole("alert");
    expect(alert).toHaveTextContent("无法读取 MCP 配置");
    expect(alert).not.toHaveTextContent("secret-config");
  });

  it("distinguishes loading, an empty inventory, and a missing source", async () => {
    let resolveInventory!: (value: McpInventory) => void;
    apiMocks.loadMcpInventory.mockReturnValue(new Promise((resolve) => {
      resolveInventory = resolve;
    }));
    const { findByText, getByRole } = renderManager();

    expect(getByRole("status")).toHaveTextContent("正在读取 MCP 配置");
    await act(async () => resolveInventory({
      generatedAt: "2026-07-18T04:00:00.000Z",
      agent: "codex",
      sources: [{
        id: "missing",
        path: "/Users/demo/.codex/config.toml",
        label: "config.toml",
        state: "missing",
        diagnostic: null,
        serverCount: 0,
      }],
      servers: [],
    }));

    expect(await findByText("当前 Agent 还没有配置 MCP Server。")).toBeInTheDocument();
    await waitFor(() => expect(getByRole("button", {
      name: "在 Finder 中显示: /Users/demo/.codex/config.toml",
    })).toBeDisabled());
  });
});
