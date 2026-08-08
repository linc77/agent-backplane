import { describe, expect, it } from "vitest";
import type { ModelGatewayProbeSample } from "../../../src/lib/types";
import { renderModelGatewayReport } from "./modelGatewayReport";

const sample: ModelGatewayProbeSample = {
  id: "sample-1",
  observedAt: "2026-08-07T00:00:00.000Z",
  providerId: "00000000-0000-4000-8000-000000000001",
  protocol: "responses",
  modelId: "gpt-test",
  connectionMode: "warm",
  outcome: "success",
  statusCode: 200,
  ttfbMs: 100,
  ttftMs: 200,
  totalMs: 300,
  inputTokens: 3,
  outputTokens: 1,
  generatedUnits: null,
  responseModel: "gpt-test",
  systemFingerprint: null,
  gatewayRequestId: "request-1",
  finishReason: "completed",
  retryAfterMs: null,
  error: null,
};

describe("model gateway report", () => {
  it("exports redacted JSON and CSV samples", () => {
    const input = { scope: "test" as const, id: "run-1", format: "json" as const };
    const json = renderModelGatewayReport(input, [sample], "2026-08-07T01:00:00.000Z");
    expect(JSON.parse(json)).toMatchObject({
      scope: "test",
      id: "run-1",
      summaries: { warm: { sampleCount: 1 }, cold: { sampleCount: 0 } },
      samples: [{ providerId: "00000000-0000-4000-8000-000000000001", ttftMs: 200 }],
    });
    expect(json).not.toContain("apiKey");
    const csv = renderModelGatewayReport({ ...input, format: "csv" }, [sample]);
    expect(csv).toContain("connectionMode,outcome");
    expect(csv).toContain("responses,gpt-test,warm,success");
  });
});
