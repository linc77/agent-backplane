import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type {
  ModelGatewayProbeSample,
  ModelGatewayTestTask,
  StartModelGatewayTestInput,
} from "../../../src/lib/types";
import { probeModelGateway, summarizeModelGatewaySamples } from "./modelGatewayProbe";

const MAX_TASK_SAMPLES = 10_000;

export interface ModelGatewayTestDependencies {
  probe?: typeof probeModelGateway;
  onSample?: (runId: string, sample: ModelGatewayProbeSample) => void | Promise<void>;
  now?: () => number;
  isoNow?: () => string;
}

function initialTask(): ModelGatewayTestTask {
  return {
    id: null,
    providerId: null,
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
  };
}

function wait(milliseconds: number, signal: AbortSignal) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error("cancelled"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class ModelGatewayTestManager {
  private task = initialTask();
  private controller: AbortController | null = null;
  private readonly probe: typeof probeModelGateway;
  private readonly onSample?: ModelGatewayTestDependencies["onSample"];
  private readonly now: () => number;
  private readonly isoNow: () => string;

  constructor({
    probe = probeModelGateway,
    onSample,
    now = () => performance.now(),
    isoNow = () => new Date().toISOString(),
  }: ModelGatewayTestDependencies = {}) {
    this.probe = probe;
    this.onSample = onSample;
    this.now = now;
    this.isoNow = isoNow;
  }

  get() {
    return structuredClone(this.task);
  }

  start(input: StartModelGatewayTestInput) {
    if (this.task.status === "running" || this.task.status === "cancelling") return this.get();
    const id = randomUUID();
    const controller = new AbortController();
    this.controller = controller;
    this.task = {
      ...initialTask(),
      id,
      providerId: input.providerId ?? null,
      status: "running",
      startedAt: this.isoNow(),
      totalSamples: input.config.sampleCount,
      config: structuredClone(input.config),
    };
    void this.execute(id, input, controller.signal).then(() => {
      if (this.task.id !== id) return;
      this.task = {
        ...this.task,
        status: controller.signal.aborted ? "cancelled" : "succeeded",
        finishedAt: this.isoNow(),
        summary: summarizeModelGatewaySamples(this.task.samples),
      };
      this.controller = null;
    }).catch((error) => {
      if (this.task.id !== id) return;
      const cancelled = controller.signal.aborted || (error instanceof Error && error.message === "cancelled");
      this.task = {
        ...this.task,
        status: cancelled ? "cancelled" : "failed",
        finishedAt: this.isoNow(),
        summary: summarizeModelGatewaySamples(this.task.samples),
        error: cancelled ? null : error instanceof Error ? error.message : "Test failed.",
      };
      this.controller = null;
    });
    return this.get();
  }

  cancel() {
    if (this.task.status === "running") {
      this.task = { ...this.task, status: "cancelling" };
      this.controller?.abort();
    }
    return this.get();
  }

  private async record(runId: string, sample: ModelGatewayProbeSample) {
    if (this.task.id !== runId) return;
    const samples = this.task.samples.length >= MAX_TASK_SAMPLES
      ? [...this.task.samples.slice(1), sample]
      : [...this.task.samples, sample];
    this.task = {
      ...this.task,
      samples,
      completedSamples: this.task.completedSamples + 1,
      summary: summarizeModelGatewaySamples(samples),
    };
    await this.onSample?.(runId, sample);
  }

  private async execute(runId: string, input: StartModelGatewayTestInput, signal: AbortSignal) {
    const probeInput = {
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      providerId: input.providerId ?? null,
      modelId: input.config.modelId,
      protocol: input.config.protocol,
      stream: input.config.stream,
      maxOutputTokens: input.config.maxOutputTokens,
      timeoutMs: input.config.timeoutMs,
      connectionMode: "warm" as const,
    };

    for (let index = 0; index < input.config.warmupSamples; index += 1) {
      if (signal.aborted) throw new Error("cancelled");
      await this.probe(probeInput, signal);
    }

    const active = new Set<Promise<void>>();
    const startedAt = this.now();
    let consecutiveRateLimits = 0;
    let stopScheduling = false;
    const intervalMs = 1_000 / input.config.targetRps;

    const launch = () => {
      let operation: Promise<void>;
      operation = this.probe(probeInput, signal).then(async (sample) => {
        consecutiveRateLimits = sample.outcome === "rate_limited" ? consecutiveRateLimits + 1 : 0;
        await this.record(runId, sample);
        if (consecutiveRateLimits >= 3) {
          stopScheduling = true;
          if (this.task.id === runId) this.task = { ...this.task, stopReason: "rate_limit" };
        }
      }).catch((error) => {
        if (!signal.aborted) throw error;
      }).finally(() => {
        active.delete(operation);
      });
      active.add(operation);
    };

    for (let index = 0; index < input.config.sampleCount; index += 1) {
      if (signal.aborted) throw new Error("cancelled");
      if (stopScheduling) break;
      await wait(startedAt + index * intervalMs - this.now(), signal);
      if (active.size >= input.config.maxConcurrency) {
        await this.record(runId, {
          id: randomUUID(),
          observedAt: this.isoNow(),
          providerId: input.providerId ?? null,
          protocol: input.config.protocol,
          modelId: input.config.modelId,
          connectionMode: "warm",
          outcome: "dropped",
          statusCode: null,
          ttfbMs: null,
          ttftMs: null,
          totalMs: 0,
          inputTokens: null,
          outputTokens: null,
          generatedUnits: null,
          responseModel: null,
          systemFingerprint: null,
          gatewayRequestId: null,
          finishReason: null,
          retryAfterMs: null,
          error: "Target rate exceeded the configured concurrency.",
        });
      } else {
        launch();
      }
    }
    await Promise.all(active);
    if (signal.aborted) throw new Error("cancelled");
  }
}
