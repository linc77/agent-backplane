import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Agent } from "undici";
import type {
  ModelGatewayProbeInput,
  ModelGatewayProbeOutcome,
  ModelGatewayProbeSample,
  ModelGatewayProtocol,
  ModelGatewayProbeSummary,
  ModelGatewayLatencySummary,
} from "../../../src/lib/types";
import { normalizeModelGatewayBaseUrl } from "./modelGateway";

const MAX_JSON_BYTES = 2_000_000;
const MAX_BINARY_BYTES = 25_000_000;
const PROBE_TEXT = "Reply with only OK.";

type Fetcher = typeof fetch;

export interface ModelGatewayProbeDependencies {
  fetcher?: Fetcher;
  now?: () => number;
  isoNow?: () => string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nested(record: Record<string, unknown> | null, key: string) {
  return asRecord(record?.[key]);
}

function endpoint(protocol: ModelGatewayProtocol) {
  if (protocol === "chatCompletions") return "chat/completions";
  if (protocol === "responses") return "responses";
  if (protocol === "anthropicMessages") return "messages";
  if (protocol === "embeddings") return "embeddings";
  if (protocol === "imageGeneration") return "images/generations";
  if (protocol === "audioGeneration") return "audio/speech";
  return "models";
}

function headers(protocol: ModelGatewayProtocol, apiKey: string, withBody: boolean) {
  const result: Record<string, string> = {
    Accept: protocol === "audioGeneration" ? "audio/mpeg" : "application/json",
  };
  if (protocol === "anthropicMessages") {
    result["x-api-key"] = apiKey;
    result["anthropic-version"] = "2023-06-01";
  } else {
    result.Authorization = `Bearer ${apiKey}`;
  }
  if (withBody) result["Content-Type"] = "application/json";
  return result;
}

function requestBody(input: ModelGatewayProbeInput) {
  const common = { model: input.modelId };
  if (input.protocol === "chatCompletions") {
    return { ...common, messages: [{ role: "user", content: PROBE_TEXT }], max_tokens: input.maxOutputTokens, stream: input.stream };
  }
  if (input.protocol === "responses") {
    return { ...common, input: PROBE_TEXT, max_output_tokens: input.maxOutputTokens, stream: input.stream };
  }
  if (input.protocol === "anthropicMessages") {
    return { ...common, messages: [{ role: "user", content: PROBE_TEXT }], max_tokens: input.maxOutputTokens, stream: input.stream };
  }
  if (input.protocol === "embeddings") return { ...common, input: "gateway probe" };
  if (input.protocol === "imageGeneration") return { ...common, prompt: "A small blue circle on a white background.", n: 1 };
  if (input.protocol === "audioGeneration") return { ...common, input: "OK", voice: "alloy", response_format: "mp3" };
  return null;
}

function outcomeForStatus(status: number): ModelGatewayProbeOutcome {
  if (status === 401 || status === 403) return "authentication_error";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "invalid_response";
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function requestId(response: Response) {
  return response.headers.get("x-request-id")
    ?? response.headers.get("request-id")
    ?? response.headers.get("cf-ray");
}

function usage(value: unknown) {
  const root = asRecord(value);
  const source = nested(root, "usage");
  return {
    inputTokens: numberValue(source?.input_tokens)
      ?? numberValue(source?.prompt_tokens)
      ?? numberValue(nested(source, "input_tokens_details")?.total_tokens),
    outputTokens: numberValue(source?.output_tokens)
      ?? numberValue(source?.completion_tokens)
      ?? numberValue(nested(source, "output_tokens_details")?.total_tokens),
  };
}

function responseMetadata(value: unknown) {
  const root = asRecord(value);
  const response = nested(root, "response");
  return {
    responseModel: stringValue(root?.model) ?? stringValue(response?.model),
    systemFingerprint: stringValue(root?.system_fingerprint) ?? stringValue(response?.system_fingerprint),
    finishReason: stringValue(asRecord((Array.isArray(root?.choices) ? root.choices[0] : null))?.finish_reason)
      ?? stringValue(root?.stop_reason)
      ?? stringValue(response?.status),
  };
}

function generatedText(value: unknown, protocol: ModelGatewayProtocol) {
  const root = asRecord(value);
  if (protocol === "chatCompletions") {
    const choice = asRecord(Array.isArray(root?.choices) ? root.choices[0] : null);
    return stringValue(nested(choice, "message")?.content) ?? stringValue(choice?.text);
  }
  if (protocol === "responses") {
    const direct = stringValue(root?.output_text);
    if (direct) return direct;
    const output = Array.isArray(root?.output) ? root.output : [];
    for (const item of output) {
      const content = Array.isArray(asRecord(item)?.content) ? asRecord(item)?.content as unknown[] : [];
      for (const part of content) {
        const text = stringValue(asRecord(part)?.text);
        if (text) return text;
      }
    }
    return null;
  }
  if (protocol === "anthropicMessages") {
    const content = Array.isArray(root?.content) ? root.content : [];
    return content.map((item) => stringValue(asRecord(item)?.text)).find(Boolean) ?? null;
  }
  return "non-text";
}

async function readJson(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) throw new Error("response too large");
  const text = await response.text();
  if (text.length > MAX_JSON_BYTES) throw new Error("response too large");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("invalid JSON");
  }
}

async function consumeBinary(response: Response) {
  if (!response.body) throw new Error("missing response body");
  const reader = response.body.getReader();
  let size = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.byteLength;
    if (size > MAX_BINARY_BYTES) {
      await reader.cancel();
      throw new Error("response too large");
    }
  }
  if (!size) throw new Error("empty audio response");
  return size;
}

function streamEvent(protocol: ModelGatewayProtocol, value: unknown) {
  const root = asRecord(value);
  const type = stringValue(root?.type);
  if (protocol === "chatCompletions") {
    const choice = asRecord(Array.isArray(root?.choices) ? root.choices[0] : null);
    const delta = nested(choice, "delta");
    return {
      text: stringValue(delta?.content),
      terminal: Boolean(stringValue(choice?.finish_reason)),
    };
  }
  if (protocol === "responses") {
    return {
      text: type === "response.output_text.delta" ? stringValue(root?.delta) : null,
      terminal: type === "response.completed" || type === "response.failed" || type === "response.incomplete",
    };
  }
  return {
    text: type === "content_block_delta" ? stringValue(nested(root, "delta")?.text) : null,
    terminal: type === "message_stop",
  };
}

async function consumeEventStream(
  response: Response,
  protocol: ModelGatewayProtocol,
  startedAt: number,
  now: () => number,
) {
  if (!response.body) throw new Error("missing response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let size = 0;
  let ttftMs: number | null = null;
  let terminal = false;
  let lastValue: unknown = null;

  const acceptData = (data: string) => {
    if (data === "[DONE]") {
      terminal = true;
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      throw new Error("invalid SSE JSON");
    }
    lastValue = value;
    const event = streamEvent(protocol, value);
    if (event.text && ttftMs === null) ttftMs = Math.max(0, Math.round(now() - startedAt));
    terminal ||= event.terminal;
  };

  while (true) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.byteLength;
    if (size > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new Error("response too large");
    }
    buffer += decoder.decode(item.value, { stream: true }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame.split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) acceptData(data);
      boundary = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  const trailingData = buffer.split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (trailingData) acceptData(trailingData);
  if (ttftMs === null) throw new Error("stream returned no output text");
  return { ttftMs, terminal, lastValue };
}

function emptySample(input: ModelGatewayProbeInput, observedAt: string): ModelGatewayProbeSample {
  return {
    id: randomUUID(),
    observedAt,
    providerId: input.providerId ?? null,
    protocol: input.protocol,
    modelId: input.modelId,
    connectionMode: input.connectionMode,
    outcome: "network_error",
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
    error: null,
  };
}

export async function probeModelGateway(
  input: ModelGatewayProbeInput,
  signal?: AbortSignal,
  { fetcher = fetch, now = () => performance.now(), isoNow = () => new Date().toISOString() }: ModelGatewayProbeDependencies = {},
): Promise<ModelGatewayProbeSample> {
  const baseUrl = normalizeModelGatewayBaseUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("API key is required.");
  const stream = input.stream && ["chatCompletions", "responses", "anthropicMessages"].includes(input.protocol);
  const normalizedInput = { ...input, baseUrl, apiKey, stream };
  const sample = emptySample(normalizedInput, isoNow());
  const startedAt = now();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const coldDispatcher = input.connectionMode === "cold"
    ? new Agent({ connections: 1, pipelining: 0 })
    : null;

  try {
    const body = requestBody(normalizedInput);
    const response = await fetcher(`${baseUrl}/${endpoint(input.protocol)}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...headers(input.protocol, apiKey, Boolean(body)),
        ...(input.connectionMode === "cold" ? { Connection: "close" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(coldDispatcher ? { dispatcher: coldDispatcher } : {}),
      redirect: "error",
      signal: controller.signal,
    } as RequestInit);
    sample.ttfbMs = Math.max(0, Math.round(now() - startedAt));
    sample.statusCode = response.status;
    sample.gatewayRequestId = requestId(response);
    sample.retryAfterMs = retryAfterMs(response);
    if (!response.ok) {
      sample.outcome = outcomeForStatus(response.status);
      sample.error = `HTTP ${response.status}`;
      return sample;
    }

    if (stream) {
      const streamed = await consumeEventStream(response, input.protocol, startedAt, now);
      sample.ttftMs = streamed.ttftMs;
      const tokenUsage = usage(streamed.lastValue);
      const metadata = responseMetadata(streamed.lastValue);
      Object.assign(sample, tokenUsage, metadata);
      sample.outcome = streamed.terminal ? "success" : "stream_truncated";
      sample.error = streamed.terminal ? null : "Stream ended without a terminal event.";
    } else if (input.protocol === "audioGeneration") {
      sample.generatedUnits = await consumeBinary(response);
      sample.outcome = "success";
    } else {
      const value = await readJson(response);
      const root = asRecord(value);
      const tokenUsage = usage(value);
      const metadata = responseMetadata(value);
      Object.assign(sample, tokenUsage, metadata);
      if (["chatCompletions", "responses", "anthropicMessages"].includes(input.protocol)) {
        if (!generatedText(value, input.protocol)) throw new Error("response contained no output text");
      } else if (input.protocol === "embeddings") {
        sample.generatedUnits = Array.isArray(root?.data) ? root.data.length : null;
        if (!sample.generatedUnits) throw new Error("response contained no embeddings");
      } else if (input.protocol === "imageGeneration") {
        sample.generatedUnits = Array.isArray(root?.data) ? root.data.length : null;
        if (!sample.generatedUnits) throw new Error("response contained no images");
      } else {
        sample.generatedUnits = Array.isArray(root?.data)
          ? root.data.length
          : Array.isArray(root?.models) ? root.models.length : null;
        if (sample.generatedUnits === null) throw new Error("response contained no model list");
      }
      sample.outcome = "success";
    }
    return sample;
  } catch (error) {
    if (signal?.aborted && !timedOut) throw new Error("cancelled");
    sample.outcome = timedOut ? "timeout" : error instanceof Error && [
      "invalid JSON",
      "invalid SSE JSON",
      "response too large",
      "missing response body",
      "response contained no output text",
      "response contained no embeddings",
      "response contained no images",
      "response contained no model list",
      "stream returned no output text",
      "empty audio response",
    ].includes(error.message) ? "invalid_response" : "network_error";
    sample.error = timedOut ? "Request timed out." : sample.outcome === "invalid_response"
      ? "Gateway returned an invalid response."
      : "Request failed.";
    return sample;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
    sample.totalMs = Math.max(0, Math.round(now() - startedAt));
    await coldDispatcher?.close();
  }
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? null;
}

function latencySummary(values: Array<number | null>, allowP99: boolean): ModelGatewayLatencySummary {
  const numbers = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    count: numbers.length,
    minMs: numbers.length ? Math.min(...numbers) : null,
    p50Ms: percentile(numbers, 0.5),
    p95Ms: numbers.length >= 20 ? percentile(numbers, 0.95) : null,
    p99Ms: allowP99 ? percentile(numbers, 0.99) : null,
    maxMs: numbers.length ? Math.max(...numbers) : null,
  };
}

export function summarizeModelGatewaySamples(samples: ModelGatewayProbeSample[]): ModelGatewayProbeSummary {
  const successful = samples.filter((sample) => sample.outcome === "success");
  const outcomes: ModelGatewayProbeSummary["outcomes"] = {};
  for (const sample of samples) outcomes[sample.outcome] = (outcomes[sample.outcome] ?? 0) + 1;
  return {
    sampleCount: samples.length,
    successCount: successful.length,
    successRate: samples.length ? successful.length / samples.length : 0,
    outcomes,
    totalLatency: latencySummary(successful.map((sample) => sample.totalMs), successful.length >= 1_000),
    ttft: latencySummary(successful.map((sample) => sample.ttftMs), successful.length >= 1_000),
    outputTokens: successful.reduce((sum, sample) => sum + (sample.outputTokens ?? 0), 0),
    generatedUnits: successful.reduce((sum, sample) => sum + (sample.generatedUnits ?? 0), 0),
  };
}
