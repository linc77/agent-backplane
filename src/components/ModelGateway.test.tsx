// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUiText } from "../lib/i18n";
import { ModelGateway } from "./ModelGateway";

const apiMocks = vi.hoisted(() => ({
  loadModelGatewayProviders: vi.fn(),
  saveModelGatewayProvider: vi.fn(),
  deleteModelGatewayProvider: vi.fn(),
  discoverModelGateway: vi.fn(),
  benchmarkModelGateway: vi.fn(),
  getModelGatewayTest: vi.fn(),
  startModelGatewayTest: vi.fn(),
  cancelModelGatewayTest: vi.fn(),
  loadModelGatewayMonitors: vi.fn(),
  saveModelGatewayMonitor: vi.fn(),
  deleteModelGatewayMonitor: vi.fn(),
  setModelGatewayMonitorEnabled: vi.fn(),
  runModelGatewayMonitorNow: vi.fn(),
  exportModelGatewayReport: vi.fn(),
}));

const providerId = "00000000-0000-4000-8000-000000000001";
const providerInventory = {
  generatedAt: "2026-08-07T00:00:00.000Z",
  providers: [{
    id: providerId,
    name: "Test Gateway",
    baseUrl: "https://gateway.example.com/v1",
    hasSecret: true,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  }],
};

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

beforeEach(() => {
  apiMocks.loadModelGatewayProviders.mockResolvedValue(providerInventory);
  apiMocks.saveModelGatewayProvider.mockResolvedValue(providerInventory);
  apiMocks.deleteModelGatewayProvider.mockResolvedValue({ generatedAt: "2026-08-07T00:00:00.000Z", providers: [] });
  apiMocks.getModelGatewayTest.mockResolvedValue({
    id: null,
    status: "idle",
    startedAt: null,
    finishedAt: null,
    completedSamples: 0,
    totalSamples: 0,
    stopReason: null,
    config: null,
    summary: null,
    samples: [],
    error: null,
  });
  apiMocks.loadModelGatewayMonitors.mockResolvedValue({ generatedAt: "2026-08-07T00:00:00.000Z", monitors: [] });
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

    await waitFor(() => expect(getByLabelText("厂商配置")).toHaveValue(providerId));
    fireEvent.click(getByRole("button", { name: "获取模型" }));

    expect(await findByText("alpha-chat")).toBeInTheDocument();
    expect(apiMocks.discoverModelGateway).toHaveBeenCalledWith(
      { providerId, baseUrl: "https://gateway.example.com/v1", apiKey: "" },
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

    await waitFor(() => expect(getByLabelText("厂商配置")).toHaveValue(providerId));
    fireEvent.click(getByRole("button", { name: "获取模型" }));
    expect(await findByText("local-small")).toBeInTheDocument();

    fireEvent.change(getByLabelText("搜索模型..."), { target: { value: "small" } });
    expect(queryByText("remote-large")).not.toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "测速" }));

    expect(await findByText("88 ms · 1 输出 token")).toBeInTheDocument();
    expect(apiMocks.benchmarkModelGateway).toHaveBeenCalledWith({
      baseUrl: "https://gateway.example.com/v1",
      apiKey: "",
      providerId,
      modelId: "local-small",
    });
  });

  it("shows a safe discovery failure state", async () => {
    apiMocks.discoverModelGateway.mockRejectedValue(
      new Error("Error invoking remote method 'model-gateway:discover': HTTP 401"),
    );
    const { findByRole, getByLabelText, getByRole } = renderGateway();

    await waitFor(() => expect(getByLabelText("厂商配置")).toHaveValue(providerId));
    fireEvent.click(getByRole("button", { name: "获取模型" }));

    const alert = await findByRole("alert");
    expect(alert).toHaveTextContent("无法获取模型");
    expect(alert).toHaveTextContent("API Key 认证失败（HTTP 401）");
    expect(alert).not.toHaveTextContent("remote method");
    expect(alert).not.toHaveTextContent("secret-key");
  });

  it("starts a protocol-aware temporary stability test", async () => {
    apiMocks.startModelGatewayTest.mockResolvedValue({
      id: "run-1",
      status: "running",
      startedAt: "2026-08-07T00:00:00.000Z",
      finishedAt: null,
      completedSamples: 0,
      totalSamples: 20,
      stopReason: null,
      config: null,
      summary: null,
      samples: [],
      error: null,
    });
    const { getByLabelText, getByRole } = renderGateway();
    await waitFor(() => expect(getByLabelText("厂商配置")).toHaveValue(providerId));
    fireEvent.click(getByRole("button", { name: "临时测试" }));
    fireEvent.change(getByLabelText("协议"), { target: { value: "responses" } });
    fireEvent.change(getByLabelText("模型"), { target: { value: "gpt-test" } });
    fireEvent.click(getByRole("button", { name: "开始稳定性测试" }));

    await waitFor(() => expect(apiMocks.startModelGatewayTest).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://gateway.example.com/v1",
        apiKey: "",
        providerId,
        config: expect.objectContaining({ protocol: "responses", modelId: "gpt-test", sampleCount: 20 }),
      }),
      expect.anything(),
    ));
  });

  it("creates a continuous Monitor that references the saved provider", async () => {
    apiMocks.saveModelGatewayMonitor.mockResolvedValue({ generatedAt: "2026-08-07T00:00:00.000Z", monitors: [] });
    const { getByLabelText, getByRole } = renderGateway();
    await waitFor(() => expect(getByLabelText("厂商配置")).toHaveValue(providerId));
    fireEvent.click(getByRole("button", { name: "持续监控" }));
    fireEvent.change(getByLabelText("Monitor 名称"), { target: { value: "Production" } });
    fireEvent.change(getByLabelText("模型"), { target: { value: "gpt-test" } });
    fireEvent.click(getByRole("button", { name: "创建 Monitor" }));

    await waitFor(() => expect(apiMocks.saveModelGatewayMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Production",
        modelId: "gpt-test",
        providerId,
        enabled: true,
      }),
      expect.anything(),
    ));
  });

  it("saves a new provider with its URL and key", async () => {
    const createdInventory = {
      ...providerInventory,
      providers: [{ ...providerInventory.providers[0], id: "00000000-0000-4000-8000-000000000002", name: "DeepSeek" }],
    };
    apiMocks.saveModelGatewayProvider.mockResolvedValue(createdInventory);
    const { getByLabelText, getByRole } = renderGateway();
    await waitFor(() => expect(getByLabelText("厂商配置")).toHaveValue(providerId));
    fireEvent.change(getByLabelText("厂商配置"), { target: { value: "" } });
    fireEvent.change(getByLabelText("厂商名称"), { target: { value: "DeepSeek" } });
    fireEvent.change(getByLabelText("Base URL"), { target: { value: "https://api.deepseek.com/v1" } });
    fireEvent.change(getByLabelText("API Key"), { target: { value: "deepseek-secret" } });
    fireEvent.click(getByRole("button", { name: "保存厂商" }));

    await waitFor(() => expect(apiMocks.saveModelGatewayProvider).toHaveBeenCalledWith(
      {
        id: null,
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "deepseek-secret",
        clearSecret: false,
      },
      expect.anything(),
    ));
  });
});
