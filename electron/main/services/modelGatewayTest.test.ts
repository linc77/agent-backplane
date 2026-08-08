import { describe, expect, it, vi } from "vitest";
import type { ModelGatewayProbeSample, StartModelGatewayTestInput } from "../../../src/lib/types";
import { ModelGatewayTestManager } from "./modelGatewayTest";

function sample(index: number): ModelGatewayProbeSample {
  return {
    id: String(index),
    observedAt: "2026-08-07T00:00:00.000Z",
    providerId: null,
    protocol: "chatCompletions",
    modelId: "test-model",
    connectionMode: "warm",
    outcome: "success",
    statusCode: 200,
    ttfbMs: 10,
    ttftMs: 20,
    totalMs: 30,
    inputTokens: 2,
    outputTokens: 1,
    generatedUnits: null,
    responseModel: "test-model",
    systemFingerprint: null,
    gatewayRequestId: null,
    finishReason: "stop",
    retryAfterMs: null,
    error: null,
  };
}

const input: StartModelGatewayTestInput = {
  baseUrl: "https://gateway.example.com/v1",
  apiKey: "secret-key",
  config: {
    modelId: "test-model",
    protocol: "chatCompletions",
    stream: true,
    sampleCount: 3,
    warmupSamples: 1,
    targetRps: 100,
    maxConcurrency: 3,
    maxOutputTokens: 16,
    timeoutMs: 30_000,
    expertMode: false,
  },
};

async function completed(manager: ModelGatewayTestManager) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const task = manager.get();
    if (!["running", "cancelling"].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("task did not finish");
}

describe("ModelGatewayTestManager", () => {
  it("runs warm-up probes separately and reports progressive measured samples", async () => {
    let index = 0;
    const probe = vi.fn(async () => sample(index++));
    const onSample = vi.fn();
    const manager = new ModelGatewayTestManager({ probe, onSample });

    const started = manager.start(input);
    expect(started.status).toBe("running");
    expect(started.samples).toEqual([]);

    const result = await completed(manager);
    expect(probe).toHaveBeenCalledTimes(4);
    expect(onSample).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ status: "succeeded", completedSamples: 3, totalSamples: 3 });
    expect(result.summary).toMatchObject({ sampleCount: 3, successCount: 3, successRate: 1 });
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });

  it("cancels an active test without discarding partial state", async () => {
    const probe = vi.fn((_input, signal?: AbortSignal) => new Promise<ModelGatewayProbeSample>((resolve, reject) => {
      const timeout = setTimeout(() => resolve(sample(1)), 100);
      signal?.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new Error("cancelled"));
      }, { once: true });
    }));
    const manager = new ModelGatewayTestManager({ probe });
    manager.start({ ...input, config: { ...input.config, warmupSamples: 0, sampleCount: 10, targetRps: 1 } });
    manager.cancel();
    const result = await completed(manager);
    expect(result.status).toBe("cancelled");
    expect(result.summary).not.toBeNull();
  });
});
