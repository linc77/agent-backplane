import { describe, expect, it, vi } from "vitest";
import {
  createModelGatewayService,
  normalizeModelGatewayBaseUrl,
} from "./modelGateway";

describe("model gateway service", () => {
  it("normalizes common OpenAI-compatible Base URL shapes", () => {
    expect(normalizeModelGatewayBaseUrl("https://gateway.example.com"))
      .toBe("https://gateway.example.com");
    expect(normalizeModelGatewayBaseUrl("https://gateway.example.com/openai/v1/"))
      .toBe("https://gateway.example.com/openai/v1");
    expect(normalizeModelGatewayBaseUrl("https://gateway.example.com/v1/models?ignored=1"))
      .toBe("https://gateway.example.com/v1");
    expect(() => normalizeModelGatewayBaseUrl("file:///tmp/gateway"))
      .toThrow("http or https");
    expect(() => normalizeModelGatewayBaseUrl("https://user:secret@gateway.example.com/v1"))
      .toThrow("must not contain credentials");
  });

  it("respects a provider root Base URL when building the models endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200,
    }));
    const service = createModelGatewayService({ fetcher });

    await service.discover({
      baseUrl: "https://api.deepseek.com",
      apiKey: "secret-key",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.deepseek.com/models",
      expect.anything(),
    );
  });

  it("discovers, deduplicates, and sorts model IDs without returning the key", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: "zeta", owned_by: "gateway", created: 20 },
        { id: "alpha", ownedBy: "team" },
        { id: "zeta", owned_by: "duplicate" },
        { object: "model" },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const service = createModelGatewayService({ fetcher });

    const result = await service.discover({
      baseUrl: "https://gateway.example.com/openai/v1/",
      apiKey: "secret-key",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://gateway.example.com/openai/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret-key" }),
        redirect: "error",
      }),
    );
    expect(result).toEqual({
      baseUrl: "https://gateway.example.com/openai/v1",
      models: [
        { id: "alpha", ownedBy: "team", createdAt: null },
        { id: "zeta", ownedBy: "gateway", createdAt: 20 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });

  it("benchmarks one model with a minimal Chat Completions request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "OK" } }],
      usage: { completion_tokens: 1 },
    }), { status: 200 }));
    const now = vi.fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(548);
    const service = createModelGatewayService({ fetcher, now });

    const result = await service.benchmark({
      baseUrl: "https://gateway.example.com/v1",
      apiKey: "secret-key",
      modelId: "gpt-test",
    });

    const [, request] = fetcher.mock.calls[0];
    expect(JSON.parse(String(request.body))).toEqual({
      model: "gpt-test",
      messages: [{ role: "user", content: "Reply with only OK." }],
      max_tokens: 1,
      stream: false,
    });
    expect(result).toEqual({
      modelId: "gpt-test",
      status: "success",
      latencyMs: 448,
      outputTokens: 1,
      error: null,
    });
  });

  it("returns a per-model failure without exposing gateway response bodies", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: "secret-key cannot use embeddings/private" } }),
      { status: 403 },
    ));
    const now = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(35);
    const service = createModelGatewayService({ fetcher, now });

    const result = await service.benchmark({
      baseUrl: "http://127.0.0.1:4000/v1",
      apiKey: "secret-key",
      modelId: "embeddings/private",
    });

    expect(result).toEqual({
      modelId: "embeddings/private",
      status: "failed",
      latencyMs: 25,
      outputTokens: null,
      error: "HTTP 403",
    });
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });

  it("uses a safe discovery error for network failures", async () => {
    const fetcher = vi.fn().mockRejectedValue(
      new Error("connect failed for https://gateway.example.com/v1?key=secret-key"),
    );
    const service = createModelGatewayService({ fetcher });

    await expect(service.discover({
      baseUrl: "https://gateway.example.com/v1",
      apiKey: "secret-key",
    })).rejects.toThrow("Unable to reach the model gateway.");
  });
});
