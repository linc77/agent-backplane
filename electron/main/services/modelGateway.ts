import { performance } from "node:perf_hooks";
import type {
  GatewayModel,
  ModelBenchmarkInput,
  ModelBenchmarkResult,
  ModelGatewayCredentials,
  ModelGatewayDiscovery,
} from "../../../src/lib/types";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_MODELS = 5_000;

type Fetcher = typeof fetch;

interface ModelGatewayDependencies {
  fetcher?: Fetcher;
  now?: () => number;
  timeoutMs?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeModelGatewayBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Base URL must be a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error("Base URL must not contain credentials.");
  }

  url.search = "";
  url.hash = "";
  let pathname = url.pathname.replace(/\/+$/, "");
  if (pathname.endsWith("/models")) {
    pathname = pathname.slice(0, -"/models".length);
  }
  url.pathname = pathname;
  return url.toString().replace(/\/$/, "");
}

function validateCredentials(input: ModelGatewayCredentials) {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("API key is required.");
  if (apiKey.length > 16_384) throw new Error("API key is too long.");
  return {
    apiKey,
    baseUrl: normalizeModelGatewayBaseUrl(input.baseUrl),
  };
}

async function readJson(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("Gateway response is too large.");
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error("Gateway response is too large.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Gateway returned invalid JSON.");
  }
}

function parseModels(value: unknown): GatewayModel[] {
  const root = asRecord(value);
  const source = Array.isArray(value)
    ? value
    : Array.isArray(root?.data)
      ? root.data
      : Array.isArray(root?.models)
        ? root.models
        : null;
  if (!source) throw new Error("Gateway response does not contain a model list.");
  if (source.length > MAX_MODELS) throw new Error("Gateway returned too many models.");

  const models = new Map<string, GatewayModel>();
  for (const item of source) {
    const record = asRecord(item);
    const id = typeof item === "string"
      ? optionalString(item)
      : optionalString(record?.id) ?? optionalString(record?.name);
    if (!id || models.has(id)) continue;
    models.set(id, {
      id,
      ownedBy: optionalString(record?.owned_by) ?? optionalString(record?.ownedBy),
      createdAt: optionalNumber(record?.created),
    });
  }
  return [...models.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function outputTokenCount(value: unknown) {
  const root = asRecord(value);
  const usage = asRecord(root?.usage);
  return optionalNumber(usage?.completion_tokens)
    ?? optionalNumber(usage?.output_tokens)
    ?? null;
}

function requestHeaders(apiKey: string, withBody = false) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(withBody ? { "Content-Type": "application/json" } : {}),
  };
}

export function createModelGatewayService({
  fetcher = fetch,
  now = () => performance.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ModelGatewayDependencies = {}) {
  return {
    async discover(input: ModelGatewayCredentials): Promise<ModelGatewayDiscovery> {
      const credentials = validateCredentials(input);
      let response: Response;
      try {
        response = await fetcher(`${credentials.baseUrl}/models`, {
          headers: requestHeaders(credentials.apiKey),
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new Error("Unable to reach the model gateway.");
      }
      if (!response.ok) {
        throw new Error(`Model discovery failed with HTTP ${response.status}.`);
      }
      const models = parseModels(await readJson(response));
      return { baseUrl: credentials.baseUrl, models };
    },

    async benchmark(input: ModelBenchmarkInput): Promise<ModelBenchmarkResult> {
      const credentials = validateCredentials(input);
      const modelId = input.modelId.trim();
      if (!modelId || modelId.length > 1_024) throw new Error("Model ID is invalid.");

      const startedAt = now();
      try {
        const response = await fetcher(`${credentials.baseUrl}/chat/completions`, {
          method: "POST",
          headers: requestHeaders(credentials.apiKey, true),
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: "user", content: "Reply with only OK." }],
            max_tokens: 1,
            stream: false,
          }),
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          return {
            modelId,
            status: "failed",
            latencyMs: Math.max(0, Math.round(now() - startedAt)),
            outputTokens: null,
            error: `HTTP ${response.status}`,
          };
        }
        const body = await readJson(response);
        return {
          modelId,
          status: "success",
          latencyMs: Math.max(0, Math.round(now() - startedAt)),
          outputTokens: outputTokenCount(body),
          error: null,
        };
      } catch (error) {
        return {
          modelId,
          status: "failed",
          latencyMs: Math.max(0, Math.round(now() - startedAt)),
          outputTokens: null,
          error: error instanceof Error && error.message === "Gateway returned invalid JSON."
            ? error.message
            : "Request failed or timed out.",
        };
      }
    },
  };
}

const modelGatewayService = createModelGatewayService();

export const discoverModelGateway = modelGatewayService.discover;
export const benchmarkModelGateway = modelGatewayService.benchmark;
