import type { ExportModelGatewayReportInput, ModelGatewayProbeSample } from "../../../src/lib/types";
import { summarizeModelGatewaySamples } from "./modelGatewayProbe";

function csvCell(value: string | number | null) {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function renderModelGatewayReport(
  input: ExportModelGatewayReportInput,
  samples: ModelGatewayProbeSample[],
  generatedAt = new Date().toISOString(),
) {
  if (input.format === "json") {
    return `${JSON.stringify({
      schemaVersion: 1,
      generatedAt,
      scope: input.scope,
      id: input.id,
      summaries: {
        warm: summarizeModelGatewaySamples(samples.filter((sample) => sample.connectionMode === "warm")),
        cold: summarizeModelGatewaySamples(samples.filter((sample) => sample.connectionMode === "cold")),
      },
      samples,
    }, null, 2)}\n`;
  }
  const columns: Array<keyof ModelGatewayProbeSample> = [
    "id",
    "observedAt",
    "providerId",
    "protocol",
    "modelId",
    "connectionMode",
    "outcome",
    "statusCode",
    "ttfbMs",
    "ttftMs",
    "totalMs",
    "inputTokens",
    "outputTokens",
    "generatedUnits",
    "responseModel",
    "systemFingerprint",
    "gatewayRequestId",
    "finishReason",
    "retryAfterMs",
    "error",
  ];
  return [
    columns.join(","),
    ...samples.map((sample) => columns.map((column) => csvCell(sample[column] as string | number | null)).join(",")),
  ].join("\n") + "\n";
}
