// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getUiText } from "../lib/i18n";
import { ModelGateway } from "./ModelGateway";

const apiMocks = vi.hoisted(() => ({
  discoverModelGateway: vi.fn(),
  benchmarkModelGateway: vi.fn(),
}));

vi.mock("../lib/api", () => apiMocks);

function renderGateway() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ModelGateway uiText={getUiText("zh-CN")} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ModelGateway", () => {
  it("discovers models and benchmarks every model with bounded progressive state", async () => {
    apiMocks.discoverModelGateway.mockResolvedValue({
      baseUrl: "https://gateway.example.com/v1",
      models: [
        { id: "alpha-chat", ownedBy: "team", createdAt: null },
        { id: "beta-chat", ownedBy: "team", createdAt: null },
        { id: "embedding-only", ownedBy: null, createdAt: null },
      ],
    });
    apiMocks.benchmarkModelGateway.mockImplementation(async ({ modelId }) => ({
      modelId,
      status: modelId === "embedding-only" ? "failed" : "success",
      latencyMs: modelId === "alpha-chat" ? 210 : 430,
      outputTokens: modelId === "embedding-only" ? null : 1,
      error: modelId === "embedding-only" ? "HTTP 400" : null,
    }));
    const { findByText, getByLabelText, getByRole, queryByText } = renderGateway();

    fireEvent.change(getByLabelText("Base URL"), {
      target: { value: "https://gateway.example.com/v1" },
    });
    fireEvent.change(getByLabelText("API Key"), { target: { value: "secret-key" } });
    fireEvent.click(getByRole("button", { name: "获取模型" }));

    expect(await findByText("alpha-chat")).toBeInTheDocument();
    expect(apiMocks.discoverModelGateway).toHaveBeenCalledWith(
      { baseUrl: "https://gateway.example.com/v1", apiKey: "secret-key" },
      expect.anything(),
    );
    expect(queryByText("secret-key")).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "全部测速" }));
    await waitFor(() => expect(apiMocks.benchmarkModelGateway).toHaveBeenCalledTimes(3));
    expect(await findByText("210 ms · 1 输出 token")).toBeInTheDocument();
    expect(await findByText("HTTP 400")).toBeInTheDocument();
    expect(await findByText("2")).toBeInTheDocument();
  });

  it("supports filtering and a single-model retry", async () => {
    apiMocks.discoverModelGateway.mockResolvedValue({
      baseUrl: "http://127.0.0.1:11434/v1",
      models: [
        { id: "local-small", ownedBy: "local", createdAt: null },
        { id: "remote-large", ownedBy: "remote", createdAt: null },
      ],
    });
    apiMocks.benchmarkModelGateway.mockResolvedValue({
      modelId: "local-small",
      status: "success",
      latencyMs: 88,
      outputTokens: 1,
      error: null,
    });
    const { findByText, getByLabelText, getByRole, queryByText } = renderGateway();

    fireEvent.change(getByLabelText("Base URL"), {
      target: { value: "http://127.0.0.1:11434" },
    });
    fireEvent.change(getByLabelText("API Key"), { target: { value: "local-key" } });
    fireEvent.click(getByRole("button", { name: "获取模型" }));
    expect(await findByText("local-small")).toBeInTheDocument();

    fireEvent.change(getByLabelText("搜索模型..."), { target: { value: "small" } });
    expect(queryByText("remote-large")).not.toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "测速" }));

    expect(await findByText("88 ms · 1 输出 token")).toBeInTheDocument();
    expect(apiMocks.benchmarkModelGateway).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:11434",
      apiKey: "local-key",
      modelId: "local-small",
    });
  });

  it("shows recognized model logos and a neutral fallback", async () => {
    apiMocks.discoverModelGateway.mockResolvedValue({
      baseUrl: "https://gateway.example.com/v1",
      models: [
        { id: "deepseek-chat", ownedBy: "deepseek", createdAt: null },
        { id: "gpt-4o-mini", ownedBy: "openai", createdAt: null },
        { id: "claude-3-7-sonnet", ownedBy: "anthropic", createdAt: null },
        { id: "gemini-2.5-pro", ownedBy: "google", createdAt: null },
        { id: "private-model", ownedBy: "team", createdAt: null },
      ],
    });
    const { container, findByText, getByLabelText, getByRole } = renderGateway();

    fireEvent.change(getByLabelText("Base URL"), {
      target: { value: "https://gateway.example.com/v1" },
    });
    fireEvent.change(getByLabelText("API Key"), { target: { value: "secret-key" } });
    fireEvent.click(getByRole("button", { name: "获取模型" }));
    expect(await findByText("deepseek-chat")).toBeInTheDocument();

    for (const brand of ["deepseek", "openai", "claude", "gemini", "unknown"]) {
      expect(container.querySelector(`[data-model-brand="${brand}"]`)).toBeInTheDocument();
    }
  });

  it("shows a safe discovery failure state", async () => {
    apiMocks.discoverModelGateway.mockRejectedValue(
      new Error("Error invoking remote method 'model-gateway:discover': HTTP 401"),
    );
    const { findByRole, getByLabelText, getByRole } = renderGateway();

    fireEvent.change(getByLabelText("Base URL"), {
      target: { value: "https://gateway.example.com/v1" },
    });
    fireEvent.change(getByLabelText("API Key"), { target: { value: "secret-key" } });
    fireEvent.click(getByRole("button", { name: "获取模型" }));

    const alert = await findByRole("alert");
    expect(alert).toHaveTextContent("无法获取模型");
    expect(alert).toHaveTextContent("API Key 认证失败（HTTP 401）");
    expect(alert).not.toHaveTextContent("remote method");
    expect(alert).not.toHaveTextContent("secret-key");
  });
});
