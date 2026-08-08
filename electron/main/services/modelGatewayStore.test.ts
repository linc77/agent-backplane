import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ModelGatewayProbeSample } from "../../../src/lib/types";
import { ModelGatewayStore } from "./modelGatewayStore";

const roots: string[] = [];

function sample(id: string, outcome: ModelGatewayProbeSample["outcome"] = "success"): ModelGatewayProbeSample {
  return {
    id,
    observedAt: "2026-08-07T08:00:00.000Z",
    providerId: "00000000-0000-4000-8000-000000000001",
    protocol: "responses",
    modelId: "gpt-test",
    connectionMode: "warm",
    outcome,
    statusCode: outcome === "success" ? 200 : 500,
    ttfbMs: 100,
    ttftMs: 200,
    totalMs: 300,
    inputTokens: 4,
    outputTokens: 2,
    generatedUnits: null,
    responseModel: "gpt-test",
    systemFingerprint: null,
    gatewayRequestId: null,
    finishReason: "completed",
    retryAfterMs: null,
    error: outcome === "success" ? null : "HTTP 500",
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ModelGatewayStore", () => {
  it("persists scoped samples, summaries, budgets, and deletes Monitor history", async () => {
    const root = await mkdtemp(join(tmpdir(), "gateway-store-"));
    roots.push(root);
    const store = new ModelGatewayStore(join(root, "gateway.sqlite"));
    store.insertSample({ monitorId: "monitor-1", runId: "run-1" }, sample("one"));
    store.insertSample({ monitorId: "monitor-1", runId: "run-1" }, sample("two", "server_error"));

    expect(store.samplesForRun("run-1")).toHaveLength(2);
    expect(store.summaryForMonitor("monitor-1", "2026-08-07T00:00:00.000Z")).toMatchObject({
      sampleCount: 2,
      successCount: 1,
      successRate: 0.5,
    });
    expect(store.dailyUsage("monitor-1", "2026-08-07T00:00:00.000Z")).toEqual({
      requests: 2,
      output_tokens: 4,
      generated_requests: 0,
    });

    store.insertSample({ monitorId: "monitor-2" }, {
      ...sample("audio"),
      protocol: "audioGeneration",
      generatedUnits: 250_000,
    });
    store.insertSample({ monitorId: "monitor-2" }, {
      ...sample("image"),
      protocol: "imageGeneration",
      generatedUnits: 1,
    });
    store.insertSample({ monitorId: "monitor-2" }, {
      ...sample("embedding"),
      protocol: "embeddings",
      generatedUnits: 1,
    });
    expect(store.dailyUsage("monitor-2", "2026-08-07T00:00:00.000Z")).toEqual({
      requests: 3,
      output_tokens: 6,
      generated_requests: 2,
    });

    store.deleteMonitor("monitor-1");
    expect(store.samplesForMonitor("monitor-1", "2026-08-07T00:00:00.000Z")).toEqual([]);
    store.close();
  });

  it("migrates legacy hourly aggregates into a separate warm connection bucket", async () => {
    const root = await mkdtemp(join(tmpdir(), "gateway-store-"));
    roots.push(root);
    const path = join(root, "gateway.sqlite");
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE gateway_hourly (
        monitor_id TEXT NOT NULL,
        bucket_at TEXT NOT NULL,
        sample_count INTEGER NOT NULL,
        success_count INTEGER NOT NULL,
        failure_count INTEGER NOT NULL,
        total_ms_sum INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        generated_units INTEGER NOT NULL,
        PRIMARY KEY (monitor_id, bucket_at)
      );
      INSERT INTO gateway_hourly VALUES ('monitor-1', '2026-08-07T08:00:00.000Z', 2, 2, 0, 600, 4, 0);
    `);
    legacy.close();

    const store = new ModelGatewayStore(path);
    store.close();
    const migrated = new DatabaseSync(path);
    const row = migrated.prepare("SELECT connection_mode, sample_count FROM gateway_hourly").get() as {
      connection_mode: string;
      sample_count: number;
    };
    expect(row).toEqual({ connection_mode: "warm", sample_count: 2 });
    migrated.close();
  });
});
