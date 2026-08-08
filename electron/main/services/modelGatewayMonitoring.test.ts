import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelGatewayProbeInput, ModelGatewayProbeSample, SaveModelGatewayMonitorInput } from "../../../src/lib/types";
import { ModelGatewayMonitoringService } from "./modelGatewayMonitoring";
import { ModelGatewayStore } from "./modelGatewayStore";

const roots: string[] = [];

const providerId = "00000000-0000-4000-8000-000000000001";

class MemoryProviders {
  available = true;
  async inventory() {
    return {
      generatedAt: "2026-08-07T00:00:00.000Z",
      providers: this.available ? [{
        id: providerId,
        name: "Primary gateway",
        baseUrl: "https://gateway.example.com/v1",
        hasSecret: true,
        createdAt: "2026-08-07T00:00:00.000Z",
        updatedAt: "2026-08-07T00:00:00.000Z",
      }] : [],
    };
  }
  async resolve(id: string) {
    if (!this.available || id !== providerId) throw new Error("credentials unavailable");
    return { providerId, baseUrl: "https://gateway.example.com/v1", apiKey: "secret-key" };
  }
}

function sample(): ModelGatewayProbeSample {
  return {
    id: crypto.randomUUID(),
    observedAt: "2026-08-07T08:00:00.000Z",
    providerId,
    protocol: "chatCompletions",
    modelId: "test-model",
    connectionMode: "warm",
    outcome: "success",
    statusCode: 200,
    ttfbMs: 100,
    ttftMs: 200,
    totalMs: 300,
    inputTokens: 5,
    outputTokens: 1,
    generatedUnits: null,
    responseModel: "test-model",
    systemFingerprint: null,
    gatewayRequestId: "req-1",
    finishReason: "stop",
    retryAfterMs: null,
    error: null,
  };
}

function monitorInput(): SaveModelGatewayMonitorInput {
  return {
    id: null,
    name: "Primary gateway",
    providerId,
    modelId: "test-model",
    protocol: "chatCompletions",
    stream: true,
    enabled: true,
    fixtureId: "gateway-probe-v1",
    intervalMinutes: 5,
    latencyBatchSize: 2,
    maxOutputTokens: 16,
    timeoutMs: 30_000,
    thresholds: { minimumSuccessRate: 0.995, maximumP95Ms: 5_000, maximumP99Ms: 8_000 },
    budget: { maximumDailyRequests: 1_000, maximumDailyOutputTokens: 10_000, maximumDailyGeneratedRequests: 10 },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ModelGatewayMonitoringService", () => {
  it("stores Monitor configuration without the key and persists redacted probe history", async () => {
    const root = await mkdtemp(join(tmpdir(), "gateway-monitor-"));
    roots.push(root);
    const paths = { catalog: join(root, "monitors.json"), database: join(root, "gateway.sqlite") };
    const providers = new MemoryProviders();
    const store = new ModelGatewayStore(paths.database);
    const probe = vi.fn(async (input: ModelGatewayProbeInput) => ({ ...sample(), connectionMode: input.connectionMode }));
    const service = new ModelGatewayMonitoringService({
      paths,
      providers,
      store,
      probe,
      wait: async () => {},
    });

    const saved = await service.save(monitorInput());
    const monitor = saved.monitors[0];
    expect(monitor).toMatchObject({ name: "Primary gateway", enabled: true, hasSecret: true });
    expect(await readFile(paths.catalog, "utf8")).not.toContain("secret-key");

    const afterRun = await service.runNow(monitor.id);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(afterRun.monitors[0].latestSample).toMatchObject({ outcome: "success", ttftMs: 200 });
    expect(afterRun.monitors[0].summary7d).toMatchObject({ sampleCount: 2, successCount: 2 });

    const deleted = await service.delete(monitor.id);
    expect(deleted.monitors).toEqual([]);
    service.close();
  });

  it("refuses to enable continuous monitoring without a saved provider credential", async () => {
    const root = await mkdtemp(join(tmpdir(), "gateway-monitor-"));
    roots.push(root);
    const paths = { catalog: join(root, "monitors.json"), database: join(root, "gateway.sqlite") };
    const providers = new MemoryProviders();
    providers.available = false;
    const service = new ModelGatewayMonitoringService({ paths, providers });
    await expect(service.save(monitorInput())).rejects.toThrow("credentials unavailable");
    service.close();
  });

  it("marks two failures unhealthy and requires two successes to recover", async () => {
    const root = await mkdtemp(join(tmpdir(), "gateway-monitor-"));
    roots.push(root);
    const paths = { catalog: join(root, "monitors.json"), database: join(root, "gateway.sqlite") };
    const outcomes: ModelGatewayProbeSample["outcome"][] = [
      "server_error",
      "server_error",
      "success",
      "success",
      "success",
    ];
    const probe = vi.fn(async (input: ModelGatewayProbeInput) => ({
      ...sample(),
      connectionMode: input.connectionMode,
      outcome: outcomes.shift() ?? "success",
    }));
    const service = new ModelGatewayMonitoringService({
      paths,
      providers: new MemoryProviders(),
      probe,
      wait: async () => {},
    });
    const saved = await service.save({ ...monitorInput(), latencyBatchSize: 4 });

    const afterRun = await service.runNow(saved.monitors[0].id);

    expect(afterRun.monitors[0]).toMatchObject({
      health: "healthy",
      consecutiveFailures: 0,
      consecutiveSuccesses: 2,
    });
    service.close();
  });
});
