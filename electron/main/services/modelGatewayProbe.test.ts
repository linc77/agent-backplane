import { describe, expect, it, vi } from "vitest";
import type { ModelGatewayProbeInput, ModelGatewayProbeSample } from "../../../src/lib/types";
import { probeModelGateway, summarizeModelGatewaySamples } from "./modelGatewayProbe";

const baseInput: ModelGatewayProbeInput = {
  baseUrl: "https://gateway.example.com/v1",
  apiKey: "secret-key",
  modelId: "test-model",
  protocol: "chatCompletions",
  stream: true,
  maxOutputTokens: 16,
  timeoutMs: 30_000,
  connectionMode: "warm",
};

function successSample(index: number): ModelGatewayProbeSample {
  return {
    id: String(index),
    observedAt: "2026-08-07T00:00:00.000Z",
    providerId: null,
    protocol: "chatCompletions",
    modelId: "test-model",
    connectionMode: "warm",
    outcome: "success",
    statusCode: 200,
    ttfbMs: 100 + index,
    ttftMs: 200 + index,
    totalMs: 300 + index,
    inputTokens: 5,
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

describe("model gateway protocol probe", () => {
  it("measures Chat Completions SSE TTFT without retaining response text", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream", "x-request-id": "req-1" },
    }));
    const now = vi.fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(350)
      .mockReturnValueOnce(500);

    const result = await probeModelGateway(baseInput, undefined, { fetcher, now });

    expect(fetcher).toHaveBeenCalledWith(
      "https://gateway.example.com/v1/chat/completions",
      expect.objectContaining({ method: "POST", redirect: "error" }),
    );
    const request = fetcher.mock.calls[0][1];
    expect(JSON.parse(String(request.body))).toEqual({
      model: "test-model",
      messages: [{ role: "user", content: "Reply with only OK." }],
      max_tokens: 16,
      stream: true,
    });
    expect(result).toMatchObject({
      outcome: "success",
      ttfbMs: 100,
      ttftMs: 250,
      totalMs: 400,
      gatewayRequestId: "req-1",
      error: null,
    });
    expect(JSON.stringify(result)).not.toContain("secret-key");
    expect(JSON.stringify(result)).not.toContain("OK");
  });

  it("uses the Anthropic Messages endpoint and authentication headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "claude-test",
      content: [{ type: "text", text: "OK" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 8, output_tokens: 1 },
    }), { status: 200 }));

    const result = await probeModelGateway({
      ...baseInput,
      protocol: "anthropicMessages",
      stream: false,
    }, undefined, { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      "https://gateway.example.com/v1/messages",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "secret-key",
          "anthropic-version": "2023-06-01",
        }),
      }),
    );
    expect(result).toMatchObject({ outcome: "success", inputTokens: 8, outputTokens: 1, ttftMs: null });
  });

  it.each([
    ["responses", "responses", { output_text: "OK", usage: { input_tokens: 2, output_tokens: 1 } }],
    ["embeddings", "embeddings", { data: [{ embedding: [0.1] }] }],
    ["imageGeneration", "images/generations", { data: [{ url: "https://example.com/image" }] }],
    ["models", "models", { data: [{ id: "test-model" }] }],
  ] as const)("supports %s probes", async (protocol, path, responseBody) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200 }));
    const result = await probeModelGateway({
      ...baseInput,
      protocol,
      stream: false,
      modelId: protocol === "models" ? "" : baseInput.modelId,
    }, undefined, { fetcher });
    expect(fetcher.mock.calls[0][0]).toBe(`https://gateway.example.com/v1/${path}`);
    expect(result.outcome).toBe("success");
  });

  it("classifies rate limits without returning a gateway response body", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: "secret-key is exhausted" } }),
      { status: 429, headers: { "retry-after": "15" } },
    ));
    const result = await probeModelGateway({ ...baseInput, stream: false }, undefined, { fetcher });
    expect(result).toMatchObject({ outcome: "rate_limited", statusCode: 429, retryAfterMs: 15_000, error: "HTTP 429" });
    expect(JSON.stringify(result)).not.toContain("exhausted");
  });

  it("uses an isolated dispatcher for a cold connection probe", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: "OK",
    }), { status: 200 }));

    const result = await probeModelGateway({
      ...baseInput,
      protocol: "responses",
      stream: false,
      connectionMode: "cold",
    }, undefined, { fetcher });

    expect(fetcher.mock.calls[0][1]).toEqual(expect.objectContaining({
      dispatcher: expect.any(Object),
      headers: expect.objectContaining({ Connection: "close" }),
    }));
    expect(result).toMatchObject({ outcome: "success", connectionMode: "cold" });
  });

  it("measures audio generation without retaining binary output", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    }));
    const result = await probeModelGateway({
      ...baseInput,
      protocol: "audioGeneration",
      stream: false,
    }, undefined, { fetcher });
    expect(fetcher.mock.calls[0][0]).toBe("https://gateway.example.com/v1/audio/speech");
    expect(result).toMatchObject({ outcome: "success", generatedUnits: 4 });
    expect(JSON.stringify(result)).not.toContain("AQIDBA");
  });

  it("withholds P99 until at least 1,000 successful samples", () => {
    const small = summarizeModelGatewaySamples(Array.from({ length: 999 }, (_, index) => successSample(index)));
    const sufficient = summarizeModelGatewaySamples(Array.from({ length: 1_000 }, (_, index) => successSample(index)));
    expect(small.totalLatency.p99Ms).toBeNull();
    expect(sufficient.totalLatency.p99Ms).toBe(1_289);
    expect(sufficient.ttft.p99Ms).toBe(1_189);
  });
});
