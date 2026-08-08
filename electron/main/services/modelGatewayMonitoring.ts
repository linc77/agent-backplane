import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ModelGatewayMonitor,
  ModelGatewayMonitorInventory,
  ModelGatewayProbeSample,
  SaveModelGatewayMonitorInput,
} from "../../../src/lib/types";
import { probeModelGateway } from "./modelGatewayProbe";
import type { ModelGatewayProviderService } from "./modelGatewayProviders";
import { ModelGatewayStore } from "./modelGatewayStore";
import { atomicWrite, isoNow } from "./shared";

const GLOBAL_MONITOR_CONCURRENCY = 3;
const SCHEDULER_TICK_MS = 15_000;
const HOUR_MS = 60 * 60 * 1_000;

type StoredMonitor = Omit<ModelGatewayMonitor, "baseUrl" | "hasSecret" | "latestSample" | "summary7d">;

interface MonitorCatalog {
  schemaVersion: 1;
  monitors: StoredMonitor[];
}

export interface ModelGatewayMonitoringPaths {
  catalog: string;
  database: string;
}

export interface ModelGatewayMonitoringDependencies {
  paths: ModelGatewayMonitoringPaths;
  providers: Pick<ModelGatewayProviderService, "inventory" | "resolve">;
  store?: ModelGatewayStore;
  probe?: typeof probeModelGateway;
  notify?: (title: string, body: string) => void;
  now?: () => Date;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export function defaultModelGatewayMonitoringPaths(home = homedir()): ModelGatewayMonitoringPaths {
  const root = join(home, ".agent-backplane");
  return {
    catalog: join(root, "model-gateway-monitors.json"),
    database: join(root, "model-gateway.sqlite"),
  };
}

function emptyCatalog(): MonitorCatalog {
  return { schemaVersion: 1, monitors: [] };
}

function todayStart(now: Date) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function hoursAgo(now: Date, hours: number) {
  return new Date(now.getTime() - hours * HOUR_MS).toISOString();
}

function jitter(milliseconds: number) {
  return Math.round(milliseconds * (0.8 + Math.random() * 0.4));
}

function abortableWait(milliseconds: number, signal: AbortSignal) {
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

function validateMonitorInput(input: SaveModelGatewayMonitorInput) {
  if (!input.name.trim()) throw new Error("Monitor name is required.");
  if (input.protocol !== "models" && !input.modelId.trim()) throw new Error("Model is required.");
  return {
    ...input,
    name: input.name.trim(),
    modelId: input.modelId.trim(),
  };
}

export class ModelGatewayMonitoringService {
  private catalog: MonitorCatalog | null = null;
  private timer: NodeJS.Timeout | null = null;
  private active = new Map<string, AbortController>();
  private persistQueue: Promise<void> = Promise.resolve();
  private lastRetentionAt = 0;
  private readonly store: ModelGatewayStore;
  private readonly probe: typeof probeModelGateway;
  private readonly notify?: ModelGatewayMonitoringDependencies["notify"];
  private readonly now: () => Date;
  private readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;

  constructor(private readonly dependencies: ModelGatewayMonitoringDependencies) {
    this.store = dependencies.store ?? new ModelGatewayStore(dependencies.paths.database);
    this.probe = dependencies.probe ?? probeModelGateway;
    this.notify = dependencies.notify;
    this.now = dependencies.now ?? (() => new Date());
    this.wait = dependencies.wait ?? abortableWait;
  }

  async start() {
    await this.loadCatalog();
    if (this.timer) return;
    const now = this.now();
    for (const monitor of this.catalog?.monitors ?? []) {
      if (monitor.enabled) {
        monitor.nextProbeAt = new Date(now.getTime() + jitter(30_000)).toISOString();
      }
    }
    await this.persist();
    this.store.applyRetention(now);
    this.lastRetentionAt = now.getTime();
    this.timer = setInterval(() => void this.tick(), SCHEDULER_TICK_MS);
    this.timer.unref();
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
  }

  close() {
    this.stop();
    this.store.close();
  }

  async inventory(): Promise<ModelGatewayMonitorInventory> {
    const catalog = await this.loadCatalog();
    const since = hoursAgo(this.now(), 7 * 24);
    const providers = await this.dependencies.providers.inventory();
    const byId = new Map(providers.providers.map((provider) => [provider.id, provider]));
    const monitors = catalog.monitors.map((monitor): ModelGatewayMonitor => {
      const provider = byId.get(monitor.providerId);
      return {
        ...structuredClone(monitor),
        baseUrl: provider?.baseUrl ?? "",
        hasSecret: provider?.hasSecret ?? false,
        latestSample: this.store.latestForMonitor(monitor.id),
        summary7d: this.store.summaryForMonitor(monitor.id, since),
      };
    });
    return { generatedAt: isoNow(), monitors };
  }

  async save(rawInput: SaveModelGatewayMonitorInput) {
    const input = validateMonitorInput(rawInput);
    const catalog = await this.loadCatalog();
    const now = isoNow();
    const id = input.id ?? randomUUID();
    const existing = catalog.monitors.find((monitor) => monitor.id === id);
    await this.dependencies.providers.resolve(input.providerId);

    const stored: StoredMonitor = {
      id,
      name: input.name,
      providerId: input.providerId,
      modelId: input.modelId,
      protocol: input.protocol,
      stream: input.stream,
      enabled: input.enabled,
      fixtureId: input.fixtureId,
      intervalMinutes: input.intervalMinutes,
      latencyBatchSize: input.latencyBatchSize,
      maxOutputTokens: input.maxOutputTokens,
      timeoutMs: input.timeoutMs,
      thresholds: structuredClone(input.thresholds),
      budget: structuredClone(input.budget),
      health: input.enabled ? existing?.health ?? "learning" : "paused",
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      consecutiveSuccesses: existing?.consecutiveSuccesses ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastProbeAt: existing?.lastProbeAt ?? null,
      nextProbeAt: input.enabled
        ? existing?.nextProbeAt ?? new Date(this.now().getTime() + jitter(30_000)).toISOString()
        : null,
      lastLatencyBatchAt: existing?.lastLatencyBatchAt ?? null,
      lastColdProbeAt: existing?.lastColdProbeAt ?? null,
    };
    const index = catalog.monitors.findIndex((monitor) => monitor.id === id);
    if (index >= 0) catalog.monitors[index] = stored;
    else catalog.monitors.push(stored);
    await this.persist();
    void this.tick();
    return this.inventory();
  }

  async setEnabled(id: string, enabled: boolean) {
    const catalog = await this.loadCatalog();
    const monitor = catalog.monitors.find((item) => item.id === id);
    if (!monitor) throw new Error("Monitor not found.");
    if (enabled) await this.dependencies.providers.resolve(monitor.providerId);
    monitor.enabled = enabled;
    monitor.health = enabled ? "learning" : "paused";
    monitor.updatedAt = isoNow();
    monitor.nextProbeAt = enabled ? new Date(this.now().getTime() + jitter(15_000)).toISOString() : null;
    if (!enabled) this.active.get(id)?.abort();
    await this.persist();
    void this.tick();
    return this.inventory();
  }

  async runNow(id: string) {
    const catalog = await this.loadCatalog();
    const monitor = catalog.monitors.find((item) => item.id === id);
    if (!monitor) throw new Error("Monitor not found.");
    await this.dependencies.providers.resolve(monitor.providerId);
    if (!this.active.has(id)) await this.runMonitor(monitor, true);
    return this.inventory();
  }

  async delete(id: string) {
    const catalog = await this.loadCatalog();
    this.active.get(id)?.abort();
    catalog.monitors = catalog.monitors.filter((monitor) => monitor.id !== id);
    this.store.deleteMonitor(id);
    await this.persist();
    return this.inventory();
  }

  private async loadCatalog() {
    if (this.catalog) return this.catalog;
    const text = await readFile(this.dependencies.paths.catalog, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (!text.trim()) this.catalog = emptyCatalog();
    else {
      const value = JSON.parse(text) as MonitorCatalog;
      if (value.schemaVersion !== 1 || !Array.isArray(value.monitors)) throw new Error("Unsupported Monitor catalog.");
      this.catalog = value;
    }
    return this.catalog;
  }

  private persist() {
    const content = `${JSON.stringify(this.catalog ?? emptyCatalog(), null, 2)}\n`;
    this.persistQueue = this.persistQueue.then(() => atomicWrite(this.dependencies.paths.catalog, content));
    return this.persistQueue;
  }

  private async tick() {
    const catalog = await this.loadCatalog();
    if (this.active.size >= GLOBAL_MONITOR_CONCURRENCY) return;
    const now = this.now().getTime();
    if (now - this.lastRetentionAt >= 24 * HOUR_MS) {
      this.store.applyRetention(new Date(now));
      this.lastRetentionAt = now;
    }
    const due = catalog.monitors.filter((monitor) =>
      monitor.enabled
      && !this.active.has(monitor.id)
      && (!monitor.nextProbeAt || Date.parse(monitor.nextProbeAt) <= now));
    for (const monitor of due.slice(0, GLOBAL_MONITOR_CONCURRENCY - this.active.size)) {
      void this.runMonitor(monitor, false);
    }
  }

  private budgetExceeded(monitor: StoredMonitor) {
    const usage = this.store.dailyUsage(monitor.id, todayStart(this.now()));
    return usage.requests >= monitor.budget.maximumDailyRequests
      || usage.output_tokens >= monitor.budget.maximumDailyOutputTokens
      || usage.generated_requests >= monitor.budget.maximumDailyGeneratedRequests;
  }

  private async runMonitor(monitor: StoredMonitor, manual: boolean) {
    if (this.active.has(monitor.id)) return;
    const controller = new AbortController();
    this.active.set(monitor.id, controller);
    let credentials;
    try {
      credentials = await this.dependencies.providers.resolve(monitor.providerId);
    } catch {
      monitor.health = "credentials_required";
      monitor.enabled = false;
      monitor.nextProbeAt = null;
      await this.persist();
      this.active.delete(monitor.id);
      return;
    }
    if (this.budgetExceeded(monitor)) {
      monitor.health = "paused";
      const tomorrow = new Date(this.now());
      tomorrow.setHours(24, 0, 0, 0);
      monitor.nextProbeAt = new Date(tomorrow.getTime() + jitter(30_000)).toISOString();
      await this.persist();
      this.notify?.("Model gateway Monitor paused", `${monitor.name} reached its daily budget and will resume tomorrow.`);
      this.active.delete(monitor.id);
      return;
    }
    const previousHealth = monitor.health;
    try {
      const latencyBatchDue = manual || !monitor.lastLatencyBatchAt
        || this.now().getTime() - Date.parse(monitor.lastLatencyBatchAt) >= HOUR_MS;
      const coldProbeDue = !monitor.lastColdProbeAt
        || this.now().getTime() - Date.parse(monitor.lastColdProbeAt) >= 6 * HOUR_MS;
      const count = latencyBatchDue ? Math.max(1, monitor.latencyBatchSize) : 1;
      let latest: ModelGatewayProbeSample | null = null;
      for (let index = 0; index < count; index += 1) {
        if (controller.signal.aborted) throw new Error("cancelled");
        if (this.budgetExceeded(monitor)) break;
        latest = await this.probe({
          baseUrl: credentials.baseUrl,
          apiKey: credentials.apiKey,
          providerId: monitor.providerId,
          modelId: monitor.modelId,
          protocol: monitor.protocol,
          stream: monitor.stream,
          maxOutputTokens: monitor.maxOutputTokens,
          timeoutMs: monitor.timeoutMs,
          connectionMode: "warm",
        }, controller.signal);
        this.store.insertSample({ monitorId: monitor.id }, latest);
        this.applyHealth(monitor, latest);
        if (latest.outcome === "rate_limited" || latest.outcome === "authentication_error") break;
        if (index < count - 1) await this.wait(1_000, controller.signal);
      }
      if (!latest) return;
      monitor.lastProbeAt = latest.observedAt;
      if (latencyBatchDue) monitor.lastLatencyBatchAt = latest.observedAt;
      if (coldProbeDue && !this.budgetExceeded(monitor)) {
        const cold = await this.probe({
          baseUrl: credentials.baseUrl,
          apiKey: credentials.apiKey,
          providerId: monitor.providerId,
          modelId: monitor.modelId,
          protocol: monitor.protocol,
          stream: monitor.stream,
          maxOutputTokens: monitor.maxOutputTokens,
          timeoutMs: monitor.timeoutMs,
          connectionMode: "cold",
        }, controller.signal);
        this.store.insertSample({ monitorId: monitor.id }, cold);
        monitor.lastColdProbeAt = cold.observedAt;
      }
      this.applyThresholds(monitor);
      monitor.updatedAt = isoNow();
      monitor.nextProbeAt = this.nextProbeAt(monitor, latest);
      await this.persist();
      if (previousHealth !== monitor.health && monitor.health === "unhealthy") {
        this.notify?.("Model gateway Monitor is unhealthy", `${monitor.name} is failing end-to-end probes.`);
      } else if (previousHealth === "unhealthy" && monitor.health === "healthy") {
        this.notify?.("Model gateway Monitor recovered", `${monitor.name} is healthy again.`);
      }
    } catch (error) {
      if (!controller.signal.aborted && error instanceof Error) {
        monitor.consecutiveFailures += 1;
        monitor.health = monitor.consecutiveFailures >= 2 ? "unhealthy" : "degraded";
        monitor.nextProbeAt = new Date(this.now().getTime() + jitter(monitor.intervalMinutes * 60_000)).toISOString();
        await this.persist();
      }
    } finally {
      this.active.delete(monitor.id);
    }
  }

  private applyHealth(monitor: StoredMonitor, sample: ModelGatewayProbeSample) {
    if (sample.outcome === "authentication_error") {
      monitor.health = "credentials_required";
      monitor.consecutiveFailures += 1;
      monitor.consecutiveSuccesses = 0;
      return;
    }
    if (sample.outcome === "success") {
      monitor.consecutiveFailures = 0;
      monitor.consecutiveSuccesses += 1;
      const learning = this.now().getTime() - Date.parse(monitor.createdAt) < 24 * HOUR_MS;
      const recovering = monitor.health === "unhealthy" || monitor.health === "degraded";
      if (recovering) {
        if (monitor.consecutiveSuccesses >= 2) monitor.health = "healthy";
        return;
      }
      monitor.health = learning ? "learning" : monitor.consecutiveSuccesses >= 2 ? "healthy" : monitor.health;
      return;
    }
    monitor.consecutiveSuccesses = 0;
    monitor.consecutiveFailures += 1;
    const recent = this.store.samplesForMonitor(monitor.id, hoursAgo(this.now(), 24), 3);
    const recentFailures = recent.filter((item) => item.outcome !== "success").length;
    monitor.health = recentFailures >= 2 ? "unhealthy" : "degraded";
  }

  private applyThresholds(monitor: StoredMonitor) {
    const summary24h = this.store.summaryForMonitor(monitor.id, hoursAgo(this.now(), 24));
    const summary7d = this.store.summaryForMonitor(monitor.id, hoursAgo(this.now(), 7 * 24));
    if (!summary24h.sampleCount) return;
    const successRateFailed = summary24h.sampleCount >= 20
      && summary24h.successRate < monitor.thresholds.minimumSuccessRate;
    const p95Failed = summary24h.totalLatency.p95Ms !== null
      && summary24h.totalLatency.p95Ms > monitor.thresholds.maximumP95Ms;
    const p99Failed = summary7d.totalLatency.p99Ms !== null
      && summary7d.totalLatency.p99Ms > monitor.thresholds.maximumP99Ms;
    if (successRateFailed || p95Failed || p99Failed) monitor.health = "unhealthy";
  }

  private nextProbeAt(monitor: StoredMonitor, sample: ModelGatewayProbeSample) {
    let delay = monitor.intervalMinutes * 60_000;
    if (sample.outcome === "authentication_error") delay = HOUR_MS;
    else if (sample.outcome === "rate_limited") delay = Math.max(15 * 60_000, sample.retryAfterMs ?? 0);
    else if (monitor.consecutiveFailures >= 5) {
      delay = Math.min(HOUR_MS, delay * 2 ** Math.min(4, monitor.consecutiveFailures - 4));
    }
    return new Date(this.now().getTime() + jitter(delay)).toISOString();
  }
}
