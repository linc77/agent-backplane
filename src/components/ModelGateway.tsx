import { useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Gauge,
  KeyRound,
  Play,
  Search,
  Server,
  XCircle,
} from "lucide-react";
import { benchmarkModelGateway, discoverModelGateway } from "../lib/api";
import type { UiText } from "../lib/i18n";
import type {
  ModelBenchmarkResult,
  ModelGatewayCredentials,
  ModelGatewayDiscovery,
} from "../lib/types";
import { PageHeader } from "./PageHeader";

type BenchmarkViewStatus = "idle" | "queued" | "running" | "success" | "failed";

interface BenchmarkViewState {
  status: BenchmarkViewStatus;
  result: ModelBenchmarkResult | null;
}

const IDLE_BENCHMARK: BenchmarkViewState = { status: "idle", result: null };
const BENCHMARK_CONCURRENCY = 3;

function resultIcon(status: BenchmarkViewStatus) {
  if (status === "success") return <CheckCircle2 aria-hidden="true" size={15} />;
  if (status === "failed") return <XCircle aria-hidden="true" size={15} />;
  if (status === "running" || status === "queued") return <Clock3 aria-hidden="true" size={15} />;
  return <Gauge aria-hidden="true" size={15} />;
}

function discoveryErrorDetail(error: unknown, text: UiText["modelGateway"]) {
  const match = String(error).match(/HTTP\s+(\d{3})/i);
  const status = match ? Number(match[1]) : null;
  if (status === 401) return text.authenticationFailed;
  if (status === 402) return text.insufficientBalance;
  if (status === 403) return text.accessDenied;
  if (status === 404) return text.endpointNotFound;
  if (status === 429) return text.rateLimited;
  if (status === 500 || status === 503) return text.serviceUnavailable;
  if (status !== null) return text.httpFailed(status);
  return text.discoveryFailed;
}

export function ModelGateway({ uiText }: { uiText: UiText }) {
  const text = uiText.modelGateway;
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [search, setSearch] = useState("");
  const [gateway, setGateway] = useState<ModelGatewayDiscovery | null>(null);
  const [benchmarks, setBenchmarks] = useState<Record<string, BenchmarkViewState>>({});
  const [isBenchmarkingAll, setIsBenchmarkingAll] = useState(false);
  const credentialsRef = useRef<ModelGatewayCredentials | null>(null);
  const sessionRef = useRef(0);
  const allRunRef = useRef(0);

  const discovery = useMutation({
    mutationFn: discoverModelGateway,
    onSuccess: (result, credentials) => {
      sessionRef.current += 1;
      allRunRef.current += 1;
      credentialsRef.current = credentials;
      setGateway(result);
      setBenchmarks({});
      setIsBenchmarkingAll(false);
      setSearch("");
    },
  });

  const models = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return gateway?.models.filter((model) =>
      !needle || model.id.toLocaleLowerCase().includes(needle)
        || model.ownedBy?.toLocaleLowerCase().includes(needle)) ?? [];
  }, [gateway, search]);

  const results = Object.values(benchmarks);
  const benchmarkedCount = results.filter((item) =>
    item.status === "success" || item.status === "failed").length;
  const availableCount = results.filter((item) => item.status === "success").length;

  function submitDiscovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sessionRef.current += 1;
    allRunRef.current += 1;
    credentialsRef.current = null;
    setGateway(null);
    setBenchmarks({});
    setIsBenchmarkingAll(false);
    discovery.mutate({ baseUrl: baseUrl.trim(), apiKey });
  }

  async function benchmarkModel(modelId: string, session: number) {
    const credentials = credentialsRef.current;
    if (!credentials) return;
    setBenchmarks((current) => ({
      ...current,
      [modelId]: { status: "running", result: null },
    }));
    try {
      const result = await benchmarkModelGateway({ ...credentials, modelId });
      if (sessionRef.current !== session) return;
      setBenchmarks((current) => ({
        ...current,
        [modelId]: { status: result.status, result },
      }));
    } catch {
      if (sessionRef.current !== session) return;
      setBenchmarks((current) => ({
        ...current,
        [modelId]: {
          status: "failed",
          result: {
            modelId,
            status: "failed",
            latencyMs: 0,
            outputTokens: null,
            error: "Request failed.",
          },
        },
      }));
    }
  }

  async function benchmarkAll() {
    if (!gateway?.models.length || !credentialsRef.current) return;
    const session = sessionRef.current;
    const run = ++allRunRef.current;
    const modelIds = gateway.models.map((model) => model.id);
    setIsBenchmarkingAll(true);
    setBenchmarks(Object.fromEntries(modelIds.map((modelId) => [
      modelId,
      { status: "queued", result: null } satisfies BenchmarkViewState,
    ])));

    let cursor = 0;
    async function worker() {
      while (cursor < modelIds.length && allRunRef.current === run) {
        const modelId = modelIds[cursor];
        cursor += 1;
        await benchmarkModel(modelId, session);
      }
    }
    try {
      await Promise.all(
        Array.from({ length: Math.min(BENCHMARK_CONCURRENCY, modelIds.length) }, worker),
      );
    } finally {
      if (allRunRef.current === run) setIsBenchmarkingAll(false);
    }
  }

  const canDiscover = Boolean(baseUrl.trim() && apiKey.trim()) && !discovery.isPending;

  return (
    <main className="board model-gateway">
      <PageHeader
        className="model-gateway-toolbar"
        title={text.title}
        description={text.subtitle}
      />

      <form className="model-gateway-form" onSubmit={submitDiscovery}>
        <label>
          <span><Server aria-hidden="true" size={15} />{text.baseUrl}</span>
          <input
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={text.baseUrlPlaceholder}
            spellCheck={false}
            type="url"
            value={baseUrl}
          />
        </label>
        <label>
          <span><KeyRound aria-hidden="true" size={15} />{text.apiKey}</span>
          <input
            autoComplete="new-password"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={text.apiKeyPlaceholder}
            spellCheck={false}
            type="password"
            value={apiKey}
          />
        </label>
        <button className="primary-button" disabled={!canDiscover} type="submit">
          <Search aria-hidden="true" size={15} />
          {discovery.isPending ? text.discovering : text.discover}
        </button>
        <p>{text.apiKeyHint}</p>
      </form>

      {discovery.error && (
        <div className="inline-error model-gateway-error" role="alert">
          <strong>{text.discoveryFailed}</strong>
          <span>{discoveryErrorDetail(discovery.error, text)}</span>
        </div>
      )}

      {gateway && (
        <>
          <section className="model-gateway-overview">
            <div className="model-gateway-metrics">
              <div><span>{text.modelCount}</span><strong>{gateway.models.length}</strong></div>
              <div><span>{text.benchmarkedCount}</span><strong>{benchmarkedCount}</strong></div>
              <div className={availableCount ? "success" : ""}>
                <span>{text.availableCount}</span><strong>{availableCount}</strong>
              </div>
            </div>
            <button
              className="secondary-button"
              disabled={isBenchmarkingAll || !gateway.models.length}
              onClick={() => void benchmarkAll()}
              type="button"
            >
              <Play aria-hidden="true" size={15} />
              {isBenchmarkingAll ? text.benchmarkingAll : text.benchmarkAll}
            </button>
            <p><span>{text.normalizedBaseUrl}</span><code>{gateway.baseUrl}</code></p>
          </section>

          <section className="model-gateway-controls">
            <label>
              <Search aria-hidden="true" size={15} />
              <input
                aria-label={text.searchPlaceholder}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={text.searchPlaceholder}
                type="search"
                value={search}
              />
            </label>
            <p>{text.benchmarkHint}</p>
          </section>

          <section className="model-gateway-list" aria-label={text.title}>
            {models.map((model) => {
              const benchmark = benchmarks[model.id] ?? IDLE_BENCHMARK;
              const isPending = benchmark.status === "queued" || benchmark.status === "running";
              return (
                <article className={`model-gateway-row ${benchmark.status}`} key={model.id}>
                  <span className={`model-benchmark-status ${benchmark.status}`}>
                    {resultIcon(benchmark.status)}
                  </span>
                  <div className="model-gateway-copy">
                    <h2>{model.id}</h2>
                    <span>{model.ownedBy ?? text.ownerUnknown}</span>
                  </div>
                  <div className="model-benchmark-result">
                    <strong className={benchmark.status}>{text.statuses[benchmark.status]}</strong>
                    {benchmark.result && (
                      <span>
                        {text.latency(benchmark.result.latencyMs)}
                        {benchmark.result.outputTokens !== null
                          ? ` · ${text.tokenCount(benchmark.result.outputTokens)}`
                          : ""}
                      </span>
                    )}
                    {benchmark.result?.error && <small>{benchmark.result.error}</small>}
                  </div>
                  <button
                    className="secondary-button compact"
                    disabled={isBenchmarkingAll || isPending}
                    onClick={() => void benchmarkModel(model.id, sessionRef.current)}
                    type="button"
                  >
                    <Gauge aria-hidden="true" size={14} />
                    {benchmark.status === "idle" ? text.benchmark : text.retry}
                  </button>
                </article>
              );
            })}
            {!gateway.models.length && <div className="skill-state">{text.empty}</div>}
            {gateway.models.length > 0 && !models.length && (
              <div className="skill-state">{text.noMatches}</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
