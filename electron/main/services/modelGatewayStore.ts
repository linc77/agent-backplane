import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ModelGatewayProbeOutcome,
  ModelGatewayProbeSample,
  ModelGatewayProbeSummary,
  ModelGatewayProtocol,
} from "../../../src/lib/types";
import { summarizeModelGatewaySamples } from "./modelGatewayProbe";

interface SampleScope {
  monitorId?: string | null;
  runId?: string | null;
}

interface SampleRow {
  id: string;
  observed_at: string;
  provider_id: string | null;
  protocol: string;
  model_id: string;
  connection_mode: string;
  outcome: string;
  status_code: number | null;
  ttfb_ms: number | null;
  ttft_ms: number | null;
  total_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  generated_units: number | null;
  response_model: string | null;
  system_fingerprint: string | null;
  gateway_request_id: string | null;
  finish_reason: string | null;
  retry_after_ms: number | null;
  error: string | null;
}

function fromRow(row: SampleRow): ModelGatewayProbeSample {
  return {
    id: row.id,
    observedAt: row.observed_at,
    providerId: row.provider_id,
    protocol: row.protocol as ModelGatewayProtocol,
    modelId: row.model_id,
    connectionMode: row.connection_mode as "warm" | "cold",
    outcome: row.outcome as ModelGatewayProbeOutcome,
    statusCode: row.status_code,
    ttfbMs: row.ttfb_ms,
    ttftMs: row.ttft_ms,
    totalMs: row.total_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    generatedUnits: row.generated_units,
    responseModel: row.response_model,
    systemFingerprint: row.system_fingerprint,
    gatewayRequestId: row.gateway_request_id,
    finishReason: row.finish_reason,
    retryAfterMs: row.retry_after_ms,
    error: row.error,
  };
}

function emptySummary(): ModelGatewayProbeSummary {
  return summarizeModelGatewaySamples([]);
}

export class ModelGatewayStore {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS gateway_samples (
        id TEXT PRIMARY KEY,
        monitor_id TEXT,
        run_id TEXT,
        observed_at TEXT NOT NULL,
        provider_id TEXT,
        protocol TEXT NOT NULL,
        model_id TEXT NOT NULL,
        connection_mode TEXT NOT NULL DEFAULT 'warm',
        outcome TEXT NOT NULL,
        status_code INTEGER,
        ttfb_ms INTEGER,
        ttft_ms INTEGER,
        total_ms INTEGER NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        generated_units INTEGER,
        response_model TEXT,
        system_fingerprint TEXT,
        gateway_request_id TEXT,
        finish_reason TEXT,
        retry_after_ms INTEGER,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS gateway_samples_monitor_time
        ON gateway_samples (monitor_id, observed_at);
      CREATE INDEX IF NOT EXISTS gateway_samples_run_time
        ON gateway_samples (run_id, observed_at);
      CREATE TABLE IF NOT EXISTS gateway_hourly (
        monitor_id TEXT NOT NULL,
        bucket_at TEXT NOT NULL,
        connection_mode TEXT NOT NULL DEFAULT 'warm',
        sample_count INTEGER NOT NULL,
        success_count INTEGER NOT NULL,
        failure_count INTEGER NOT NULL,
        total_ms_sum INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        generated_units INTEGER NOT NULL,
        PRIMARY KEY (monitor_id, bucket_at, connection_mode)
      );
    `);
    const columns = this.database.prepare("PRAGMA table_info(gateway_samples)").all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "connection_mode")) {
      this.database.exec("ALTER TABLE gateway_samples ADD COLUMN connection_mode TEXT NOT NULL DEFAULT 'warm'");
    }
    if (!columns.some((column) => column.name === "provider_id")) {
      this.database.exec("ALTER TABLE gateway_samples ADD COLUMN provider_id TEXT");
    }
    const hourlyColumns = this.database.prepare("PRAGMA table_info(gateway_hourly)").all() as unknown as Array<{ name: string }>;
    if (!hourlyColumns.some((column) => column.name === "connection_mode")) {
      this.database.exec(`
        BEGIN;
        ALTER TABLE gateway_hourly RENAME TO gateway_hourly_legacy;
        CREATE TABLE gateway_hourly (
          monitor_id TEXT NOT NULL,
          bucket_at TEXT NOT NULL,
          connection_mode TEXT NOT NULL DEFAULT 'warm',
          sample_count INTEGER NOT NULL,
          success_count INTEGER NOT NULL,
          failure_count INTEGER NOT NULL,
          total_ms_sum INTEGER NOT NULL,
          output_tokens INTEGER NOT NULL,
          generated_units INTEGER NOT NULL,
          PRIMARY KEY (monitor_id, bucket_at, connection_mode)
        );
        INSERT INTO gateway_hourly (
          monitor_id, bucket_at, connection_mode, sample_count, success_count,
          failure_count, total_ms_sum, output_tokens, generated_units
        ) SELECT
          monitor_id, bucket_at, 'warm', sample_count, success_count,
          failure_count, total_ms_sum, output_tokens, generated_units
        FROM gateway_hourly_legacy;
        DROP TABLE gateway_hourly_legacy;
        COMMIT;
      `);
    }
  }

  close() {
    this.database.close();
  }

  insertSample(scope: SampleScope, sample: ModelGatewayProbeSample) {
    this.database.prepare(`
      INSERT OR REPLACE INTO gateway_samples (
        id, monitor_id, run_id, observed_at, provider_id, protocol, model_id, connection_mode, outcome, status_code,
        ttfb_ms, ttft_ms, total_ms, input_tokens, output_tokens, generated_units,
        response_model, system_fingerprint, gateway_request_id, finish_reason,
        retry_after_ms, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sample.id,
      scope.monitorId ?? null,
      scope.runId ?? null,
      sample.observedAt,
      sample.providerId,
      sample.protocol,
      sample.modelId,
      sample.connectionMode,
      sample.outcome,
      sample.statusCode,
      sample.ttfbMs,
      sample.ttftMs,
      sample.totalMs,
      sample.inputTokens,
      sample.outputTokens,
      sample.generatedUnits,
      sample.responseModel,
      sample.systemFingerprint,
      sample.gatewayRequestId,
      sample.finishReason,
      sample.retryAfterMs,
      sample.error,
    );
    if (scope.monitorId) {
      const bucketAt = `${sample.observedAt.slice(0, 13)}:00:00.000Z`;
      const success = sample.outcome === "success" ? 1 : 0;
      this.database.prepare(`
        INSERT INTO gateway_hourly (
          monitor_id, bucket_at, connection_mode, sample_count, success_count, failure_count,
          total_ms_sum, output_tokens, generated_units
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
        ON CONFLICT(monitor_id, bucket_at, connection_mode) DO UPDATE SET
          sample_count = sample_count + 1,
          success_count = success_count + excluded.success_count,
          failure_count = failure_count + excluded.failure_count,
          total_ms_sum = total_ms_sum + excluded.total_ms_sum,
          output_tokens = output_tokens + excluded.output_tokens,
          generated_units = generated_units + excluded.generated_units
      `).run(
        scope.monitorId,
        bucketAt,
        sample.connectionMode,
        success,
        success ? 0 : 1,
        sample.totalMs,
        sample.outputTokens ?? 0,
        sample.generatedUnits ?? 0,
      );
    }
  }

  samplesForRun(runId: string) {
    const rows = this.database.prepare(`
      SELECT * FROM gateway_samples WHERE run_id = ? ORDER BY observed_at ASC
    `).all(runId) as unknown as SampleRow[];
    return rows.map(fromRow);
  }

  samplesForMonitor(monitorId: string, since: string, limit = 10_000, connectionMode: "warm" | "cold" | null = "warm") {
    const rows = this.database.prepare(connectionMode ? `
      SELECT * FROM gateway_samples
      WHERE monitor_id = ? AND observed_at >= ? AND connection_mode = ?
      ORDER BY observed_at DESC LIMIT ?
    ` : `
      SELECT * FROM gateway_samples
      WHERE monitor_id = ? AND observed_at >= ?
      ORDER BY observed_at DESC LIMIT ?
    `).all(...(connectionMode ? [monitorId, since, connectionMode, limit] : [monitorId, since, limit])) as unknown as SampleRow[];
    return rows.reverse().map(fromRow);
  }

  latestForMonitor(monitorId: string) {
    const row = this.database.prepare(`
      SELECT * FROM gateway_samples
      WHERE monitor_id = ? AND connection_mode = 'warm' ORDER BY observed_at DESC LIMIT 1
    `).get(monitorId) as unknown as SampleRow | undefined;
    return row ? fromRow(row) : null;
  }

  summaryForMonitor(monitorId: string, since: string) {
    return summarizeModelGatewaySamples(this.samplesForMonitor(monitorId, since));
  }

  dailyUsage(monitorId: string, since: string) {
    const row = this.database.prepare(`
      SELECT COUNT(*) AS requests,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(CASE
          WHEN protocol IN ('imageGeneration', 'audioGeneration') THEN 1
          ELSE 0
        END), 0) AS generated_requests
      FROM gateway_samples WHERE monitor_id = ? AND observed_at >= ?
    `).get(monitorId, since) as unknown as {
      requests: number;
      output_tokens: number;
      generated_requests: number;
    } | undefined;
    return row ?? { requests: 0, output_tokens: 0, generated_requests: 0 };
  }

  deleteMonitor(monitorId: string) {
    this.database.exec("BEGIN");
    try {
      this.database.prepare("DELETE FROM gateway_samples WHERE monitor_id = ?").run(monitorId);
      this.database.prepare("DELETE FROM gateway_hourly WHERE monitor_id = ?").run(monitorId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  applyRetention(now = new Date()) {
    const rawCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString();
    const hourlyCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000).toISOString();
    this.database.prepare("DELETE FROM gateway_samples WHERE observed_at < ?").run(rawCutoff);
    this.database.prepare("DELETE FROM gateway_hourly WHERE bucket_at < ?").run(hourlyCutoff);
  }

  static emptySummary() {
    return emptySummary();
  }
}
