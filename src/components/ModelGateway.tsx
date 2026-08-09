import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Gauge,
  KeyRound,
  Pause,
  Play,
  Radio,
  Search,
  Server,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  benchmarkModelGateway,
  cancelModelGatewayTest,
  deleteModelGatewayProvider,
  deleteModelGatewayMonitor,
  discoverModelGateway,
  exportModelGatewayReport,
  getModelGatewayTest,
  loadModelGatewayProviders,
  loadModelGatewayMonitors,
  runModelGatewayMonitorNow,
  saveModelGatewayProvider,
  saveModelGatewayMonitor,
  setModelGatewayMonitorEnabled,
  startModelGatewayTest,
} from "../lib/api";
import type { UiText } from "../lib/i18n";
import type {
  ModelBenchmarkResult,
  ModelGatewayCredentials,
  ModelGatewayDiscovery,
  ModelGatewayProbeSummary,
  ModelGatewayProtocol,
} from "../lib/types";
import { ModelLogo } from "./ModelLogo";
import { PageHeader } from "./PageHeader";

type BenchmarkViewStatus = "idle" | "queued" | "running" | "success" | "failed";
type GatewayTab = "models" | "test" | "monitors" | "reports";

interface BenchmarkViewState {
  status: BenchmarkViewStatus;
  result: ModelBenchmarkResult | null;
}

const IDLE_BENCHMARK: BenchmarkViewState = { status: "idle", result: null };
const BENCHMARK_CONCURRENCY = 3;

function resultIcon(status: BenchmarkViewStatus) {
  if (status === "success") return <CheckCircle2 aria-hidden="true" size={11} />;
  if (status === "failed") return <XCircle aria-hidden="true" size={11} />;
  if (status === "running" || status === "queued") return <Clock3 aria-hidden="true" size={11} />;
  return <Gauge aria-hidden="true" size={11} />;
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

function percentage(value: number) {
  return `${(value * 100).toFixed(value === 1 ? 0 : 1)}%`;
}

function metric(value: number | null, fallback: string) {
  return value === null ? fallback : `${value} ms`;
}

function SummaryCards({ summary, text }: { summary: ModelGatewayProbeSummary; text: UiText["modelGateway"] }) {
  return (
    <div className="model-gateway-metrics gateway-summary-cards">
      <div><span>{text.successRate}</span><strong>{percentage(summary.successRate)}</strong></div>
      <div><span>{text.ttftP50}</span><strong>{metric(summary.ttft.p50Ms, "—")}</strong></div>
      <div><span>{text.ttftP95}</span><strong>{metric(summary.ttft.p95Ms, "—")}</strong></div>
      <div><span>{text.ttftP99}</span><strong>{metric(summary.ttft.p99Ms, text.p99Pending)}</strong></div>
      <div><span>{text.e2eP50}</span><strong>{metric(summary.totalLatency.p50Ms, "—")}</strong></div>
      <div><span>{text.e2eP95}</span><strong>{metric(summary.totalLatency.p95Ms, "—")}</strong></div>
      <div><span>{text.e2eP99}</span><strong>{metric(summary.totalLatency.p99Ms, text.p99Pending)}</strong></div>
    </div>
  );
}

export function ModelGateway({ uiText }: { uiText: UiText }) {
  const text = uiText.modelGateway;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<GatewayTab>("models");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [search, setSearch] = useState("");
  const [gateway, setGateway] = useState<ModelGatewayDiscovery | null>(null);
  const [benchmarks, setBenchmarks] = useState<Record<string, BenchmarkViewState>>({});
  const [isBenchmarkingAll, setIsBenchmarkingAll] = useState(false);
  const [protocol, setProtocol] = useState<ModelGatewayProtocol>("chatCompletions");
  const [selectedModel, setSelectedModel] = useState("");
  const [stream, setStream] = useState(true);
  const [sampleCount, setSampleCount] = useState(20);
  const [warmupSamples, setWarmupSamples] = useState(3);
  const [targetRps, setTargetRps] = useState(1);
  const [maxConcurrency, setMaxConcurrency] = useState(3);
  const [maxOutputTokens, setMaxOutputTokens] = useState(16);
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [expertMode, setExpertMode] = useState(false);
  const [monitorName, setMonitorName] = useState("");
  const [monitorInterval, setMonitorInterval] = useState(5);
  const [latencyBatchSize, setLatencyBatchSize] = useState(20);
  const [dailyRequests, setDailyRequests] = useState(1_000);
  const [dailyTokens, setDailyTokens] = useState(10_000);
  const [dailyGeneratedRequests, setDailyGeneratedRequests] = useState(10);
  const [enableMonitor, setEnableMonitor] = useState(true);
  const credentialsRef = useRef<ModelGatewayCredentials | null>(null);
  const providerInitializedRef = useRef(false);
  const sessionRef = useRef(0);
  const allRunRef = useRef(0);

  const discovery = useMutation({
    mutationFn: discoverModelGateway,
    onSuccess: (result, credentials) => {
      sessionRef.current += 1;
      allRunRef.current += 1;
      credentialsRef.current = credentials;
      setGateway(result);
      setSelectedModel((current) => current || result.models[0]?.id || "");
      setBenchmarks({});
      setIsBenchmarkingAll(false);
      setSearch("");
    },
  });

  const providers = useQuery({
    queryKey: ["model-gateway-providers"],
    queryFn: loadModelGatewayProviders,
  });
  const saveProvider = useMutation({
    mutationFn: saveModelGatewayProvider,
    onSuccess: (inventory) => queryClient.setQueryData(["model-gateway-providers"], inventory),
  });
  const removeProvider = useMutation({
    mutationFn: deleteModelGatewayProvider,
    onSuccess: (inventory) => queryClient.setQueryData(["model-gateway-providers"], inventory),
  });

  const testTask = useQuery({
    queryKey: ["model-gateway-test"],
    queryFn: getModelGatewayTest,
    enabled: tab === "test" || tab === "reports",
    refetchInterval: 750,
  });
  const monitors = useQuery({
    queryKey: ["model-gateway-monitors"],
    queryFn: loadModelGatewayMonitors,
    enabled: tab === "monitors" || tab === "reports",
    refetchInterval: 5_000,
  });

  const startTest = useMutation({
    mutationFn: startModelGatewayTest,
    onSuccess: (task) => queryClient.setQueryData(["model-gateway-test"], task),
  });
  const cancelTest = useMutation({
    mutationFn: cancelModelGatewayTest,
    onSuccess: (task) => queryClient.setQueryData(["model-gateway-test"], task),
  });
  const saveMonitor = useMutation({
    mutationFn: saveModelGatewayMonitor,
    onSuccess: (inventory) => {
      queryClient.setQueryData(["model-gateway-monitors"], inventory);
      setMonitorName("");
    },
  });
  const toggleMonitor = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setModelGatewayMonitorEnabled(id, enabled),
    onSuccess: (inventory) => queryClient.setQueryData(["model-gateway-monitors"], inventory),
  });
  const runMonitor = useMutation({
    mutationFn: runModelGatewayMonitorNow,
    onSuccess: (inventory) => queryClient.setQueryData(["model-gateway-monitors"], inventory),
  });
  const removeMonitor = useMutation({
    mutationFn: deleteModelGatewayMonitor,
    onSuccess: (inventory) => queryClient.setQueryData(["model-gateway-monitors"], inventory),
  });
  const exportReport = useMutation({ mutationFn: exportModelGatewayReport });

  const selectedProvider = providers.data?.providers.find((provider) => provider.id === selectedProviderId);

  useEffect(() => {
    if (providerInitializedRef.current || !providers.data) return;
    providerInitializedRef.current = true;
    if (!providers.data.providers.length) return;
    const provider = providers.data.providers[0];
    setSelectedProviderId(provider.id);
    setProviderName(provider.name);
    setBaseUrl(provider.baseUrl);
    setApiKey("");
  }, [providers.data]);

  const models = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return gateway?.models.filter((model) =>
      !needle || model.id.toLocaleLowerCase().includes(needle)
        || model.ownedBy?.toLocaleLowerCase().includes(needle)) ?? [];
  }, [gateway, search]);
  const results = Object.values(benchmarks);
  const benchmarkedCount = results.filter((item) => item.status === "success" || item.status === "failed").length;
  const availableCount = results.filter((item) => item.status === "success").length;

  function submitDiscovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sessionRef.current += 1;
    allRunRef.current += 1;
    credentialsRef.current = null;
    setGateway(null);
    setBenchmarks({});
    setIsBenchmarkingAll(false);
    discovery.mutate({ providerId: selectedProviderId, baseUrl: baseUrl.trim(), apiKey });
  }

  function selectProvider(id: string) {
    const provider = providers.data?.providers.find((item) => item.id === id);
    setSelectedProviderId(id);
    setProviderName(provider?.name ?? "");
    setBaseUrl(provider?.baseUrl ?? "");
    setApiKey("");
    setGateway(null);
    setBenchmarks({});
  }

  async function persistProvider() {
    if (!providerName.trim() || !baseUrl.trim() || (!selectedProvider?.hasSecret && !apiKey.trim())) return;
    try {
      const inventory = await saveProvider.mutateAsync({
        id: selectedProviderId || null,
        name: providerName.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || null,
        clearSecret: false,
      });
      const provider = selectedProviderId
        ? inventory.providers.find((item) => item.id === selectedProviderId)
        : inventory.providers[inventory.providers.length - 1];
      if (provider) {
        setSelectedProviderId(provider.id);
        setProviderName(provider.name);
        setBaseUrl(provider.baseUrl);
        setApiKey("");
      }
    } catch {
      // The mutation error is rendered below the form.
    }
  }

  async function removeSelectedProvider() {
    if (!selectedProviderId) return;
    if (!window.confirm(text.confirmDeleteProvider(selectedProvider?.name ?? providerName))) return;
    try {
      const inventory = await removeProvider.mutateAsync(selectedProviderId);
      const provider = inventory.providers[0];
      setSelectedProviderId(provider?.id ?? "");
      setProviderName(provider?.name ?? "");
      setBaseUrl(provider?.baseUrl ?? "");
      setApiKey("");
    } catch {
      // The mutation error is rendered below the form.
    }
  }

  async function benchmarkModel(modelId: string, session: number) {
    const credentials = credentialsRef.current;
    if (!credentials) return;
    setBenchmarks((current) => ({ ...current, [modelId]: { status: "running", result: null } }));
    try {
      const result = await benchmarkModelGateway({ ...credentials, modelId });
      if (sessionRef.current !== session) return;
      setBenchmarks((current) => ({ ...current, [modelId]: { status: result.status, result } }));
    } catch {
      if (sessionRef.current !== session) return;
      setBenchmarks((current) => ({
        ...current,
        [modelId]: {
          status: "failed",
          result: { modelId, status: "failed", latencyMs: 0, outputTokens: null, error: "Request failed." },
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
    setBenchmarks(Object.fromEntries(modelIds.map((modelId) => [modelId, { status: "queued", result: null }] as const)));
    let cursor = 0;
    async function worker() {
      while (cursor < modelIds.length && allRunRef.current === run) {
        const modelId = modelIds[cursor];
        cursor += 1;
        await benchmarkModel(modelId, session);
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(BENCHMARK_CONCURRENCY, modelIds.length) }, worker));
    } finally {
      if (allRunRef.current === run) setIsBenchmarkingAll(false);
    }
  }

  function startTemporaryTest() {
    if (!selectedProviderId || !selectedProvider?.hasSecret || (protocol !== "models" && !selectedModel.trim())) return;
    startTest.mutate({
      providerId: selectedProviderId,
      baseUrl: baseUrl.trim(),
      apiKey,
      config: {
        modelId: selectedModel.trim(),
        protocol,
        stream,
        sampleCount,
        warmupSamples,
        targetRps,
        maxConcurrency,
        maxOutputTokens,
        timeoutMs: timeoutSeconds * 1_000,
        expertMode,
      },
    });
  }

  function createMonitor() {
    if (!monitorName.trim() || !selectedProviderId || !selectedProvider?.hasSecret) return;
    saveMonitor.mutate({
      id: null,
      name: monitorName.trim(),
      providerId: selectedProviderId,
      modelId: selectedModel.trim(),
      protocol,
      stream,
      enabled: enableMonitor,
      fixtureId: "gateway-probe-v1",
      intervalMinutes: monitorInterval,
      latencyBatchSize,
      maxOutputTokens,
      timeoutMs: timeoutSeconds * 1_000,
      thresholds: { minimumSuccessRate: 0.995, maximumP95Ms: 5_000, maximumP99Ms: 8_000 },
      budget: {
        maximumDailyRequests: dailyRequests,
        maximumDailyOutputTokens: dailyTokens,
        maximumDailyGeneratedRequests: dailyGeneratedRequests,
      },
    });
  }

  const providerSaved = Boolean(
    selectedProviderId
    && selectedProvider?.hasSecret
    && selectedProvider.name === providerName.trim()
    && selectedProvider.baseUrl === baseUrl.trim().replace(/\/$/, "")
    && !apiKey.trim(),
  );
  const canDiscover = providerSaved && !discovery.isPending;
  const task = testTask.data;
  const taskActive = task?.status === "running" || task?.status === "cancelling";

  return (
    <main className="board model-gateway">
      <PageHeader className="model-gateway-toolbar" title={text.title} description={text.subtitle} />

      <nav className="model-gateway-tabs" aria-label={text.title}>
        {(Object.keys(text.tabs) as GatewayTab[]).map((id) => (
          <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)} type="button">
            {id === "models" ? <Search size={14} /> : id === "test" ? <Activity size={14} /> : id === "monitors" ? <Radio size={14} /> : <BarChart3 size={14} />}
            {text.tabs[id]}
          </button>
        ))}
      </nav>

      <form className="model-gateway-form model-gateway-provider-form" onSubmit={submitDiscovery}>
        <label>
          <span><Server aria-hidden="true" size={15} />{text.provider}</span>
          <select onChange={(event) => selectProvider(event.target.value)} value={selectedProviderId}>
            <option value="">{text.newProvider}</option>
            {providers.data?.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </label>
        <label>
          <span>{text.providerName}</span>
          <input onChange={(event) => setProviderName(event.target.value)} placeholder={text.providerNamePlaceholder} value={providerName} />
        </label>
        <label>
          <span><Server aria-hidden="true" size={15} />{text.baseUrl}</span>
          <input autoCapitalize="none" autoCorrect="off" onChange={(event) => setBaseUrl(event.target.value)} placeholder={text.baseUrlPlaceholder} spellCheck={false} type="url" value={baseUrl} />
        </label>
        <label>
          <span><KeyRound aria-hidden="true" size={15} />{text.apiKey}</span>
          <input autoComplete="new-password" onChange={(event) => setApiKey(event.target.value)} placeholder={selectedProvider?.hasSecret ? text.encryptedKeyPlaceholder : text.apiKeyPlaceholder} spellCheck={false} type="password" value={apiKey} />
        </label>
        <div className="gateway-actions model-gateway-provider-actions">
          <button className="primary-button" disabled={saveProvider.isPending || !providerName.trim() || !baseUrl.trim() || (!selectedProvider?.hasSecret && !apiKey.trim())} onClick={() => void persistProvider()} type="button">{text.saveProvider}</button>
          {selectedProviderId && <button className="secondary-button danger" disabled={removeProvider.isPending} onClick={() => void removeSelectedProvider()} type="button"><Trash2 size={14} />{text.deleteProvider}</button>}
          <button className="secondary-button" disabled={!canDiscover} type="submit"><Search aria-hidden="true" size={15} />{discovery.isPending ? text.discovering : text.discover}</button>
        </div>
        <p>{text.apiKeyHint}</p>
      </form>

      {saveProvider.error && <div className="inline-error model-gateway-error" role="alert">{String(saveProvider.error)}</div>}
      {removeProvider.error && <div className="inline-error model-gateway-error" role="alert">{String(removeProvider.error)}</div>}

      {discovery.error && (
        <div className="inline-error model-gateway-error" role="alert">
          <strong>{text.discoveryFailed}</strong><span>{discoveryErrorDetail(discovery.error, text)}</span>
        </div>
      )}

      {tab === "models" && gateway && (
        <>
          <section className="model-gateway-overview">
            <div className="model-gateway-metrics">
              <div><span>{text.modelCount}</span><strong>{gateway.models.length}</strong></div>
              <div><span>{text.benchmarkedCount}</span><strong>{benchmarkedCount}</strong></div>
              <div className={availableCount ? "success" : ""}><span>{text.availableCount}</span><strong>{availableCount}</strong></div>
            </div>
            <button className="secondary-button" disabled={isBenchmarkingAll || !gateway.models.length} onClick={() => void benchmarkAll()} type="button">
              <Play aria-hidden="true" size={15} />{isBenchmarkingAll ? text.benchmarkingAll : text.benchmarkAll}
            </button>
            <p><span>{text.normalizedBaseUrl}</span><code>{gateway.baseUrl}</code></p>
          </section>
          <section className="model-gateway-controls">
            <label><Search aria-hidden="true" size={15} /><input aria-label={text.searchPlaceholder} onChange={(event) => setSearch(event.target.value)} placeholder={text.searchPlaceholder} type="search" value={search} /></label>
            <p>{text.benchmarkHint}</p>
          </section>
          <section className="model-gateway-list" aria-label={text.title}>
            {models.map((model) => {
              const benchmark = benchmarks[model.id] ?? IDLE_BENCHMARK;
              const isPending = benchmark.status === "queued" || benchmark.status === "running";
              return (
                <article className={`model-gateway-row ${benchmark.status}`} key={model.id}>
                  <div className="model-logo-stack">
                    <ModelLogo modelId={model.id} ownedBy={model.ownedBy} />
                    <span className={`model-benchmark-status ${benchmark.status}`}>
                      {resultIcon(benchmark.status)}
                    </span>
                  </div>
                  <div className="model-gateway-copy">
                    <h2>{model.id}</h2>
                    <span>{model.ownedBy ?? text.ownerUnknown}</span>
                  </div>
                  <div className="model-benchmark-result">
                    <strong className={benchmark.status}>{text.statuses[benchmark.status]}</strong>
                    {benchmark.result && <span>{text.latency(benchmark.result.latencyMs)}{benchmark.result.outputTokens !== null ? ` · ${text.tokenCount(benchmark.result.outputTokens)}` : ""}</span>}
                    {benchmark.result?.error && <small>{benchmark.result.error}</small>}
                  </div>
                  <button className="secondary-button compact" disabled={isBenchmarkingAll || isPending} onClick={() => void benchmarkModel(model.id, sessionRef.current)} type="button">
                    <Gauge aria-hidden="true" size={14} />{benchmark.status === "idle" ? text.benchmark : text.retry}
                  </button>
                </article>
              );
            })}
            {!gateway.models.length && <div className="skill-state">{text.empty}</div>}
            {gateway.models.length > 0 && !models.length && <div className="skill-state">{text.noMatches}</div>}
          </section>
        </>
      )}

      {tab === "test" && (
        <section className="gateway-workspace">
          <div className="gateway-config-grid">
            <label><span>{text.protocol}</span><select value={protocol} onChange={(event) => setProtocol(event.target.value as ModelGatewayProtocol)}>{Object.entries(text.protocols).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label><span>{text.model}</span><input disabled={protocol === "models"} list="gateway-model-options" onChange={(event) => setSelectedModel(event.target.value)} value={selectedModel} /></label>
            <label><span>{text.sampleCount}</span><input min="1" max="10000" onChange={(event) => setSampleCount(Number(event.target.value))} type="number" value={sampleCount} /></label>
            <label><span>{text.warmupSamples}</span><input min="0" max="100" onChange={(event) => setWarmupSamples(Number(event.target.value))} type="number" value={warmupSamples} /></label>
            <label><span>{text.targetRps}</span><input min="0.05" max="100" onChange={(event) => setTargetRps(Number(event.target.value))} step="0.05" type="number" value={targetRps} /></label>
            <label><span>{text.maxConcurrency}</span><input min="1" max="100" onChange={(event) => setMaxConcurrency(Number(event.target.value))} type="number" value={maxConcurrency} /></label>
            <label><span>{text.maxOutputTokens}</span><input min="1" max="4096" onChange={(event) => setMaxOutputTokens(Number(event.target.value))} type="number" value={maxOutputTokens} /></label>
            <label><span>{text.timeoutSeconds}</span><input min="1" max="600" onChange={(event) => setTimeoutSeconds(Number(event.target.value))} type="number" value={timeoutSeconds} /></label>
            <label className="gateway-check"><input checked={stream} disabled={!(["chatCompletions", "responses", "anthropicMessages"] as ModelGatewayProtocol[]).includes(protocol)} onChange={(event) => setStream(event.target.checked)} type="checkbox" /><span>{text.stream}</span></label>
            <label className="gateway-check"><input checked={expertMode} onChange={(event) => setExpertMode(event.target.checked)} type="checkbox" /><span>{text.expertMode}</span></label>
          </div>
          <datalist id="gateway-model-options">{gateway?.models.map((model) => <option key={model.id} value={model.id} />)}</datalist>
          <div className="gateway-actions"><button className="primary-button" disabled={Boolean(taskActive) || startTest.isPending || !providerSaved || (protocol !== "models" && !selectedModel.trim())} onClick={startTemporaryTest} type="button"><Play size={15} />{text.startTest}</button>{taskActive && <button className="secondary-button" onClick={() => cancelTest.mutate()} type="button"><Pause size={15} />{text.cancelTest}</button>}</div>
          <p className="gateway-hint">{text.testHint}</p>
          {startTest.error && <div className="inline-error" role="alert">{String(startTest.error)}</div>}
          {task ? (
            <div className="gateway-result-card">
              <div><strong>{task.status}</strong><span>{text.testProgress(task.completedSamples, task.totalSamples)}</span></div>
              {task.summary && <SummaryCards summary={task.summary} text={text} />}
            </div>
          ) : <div className="skill-state">{text.testEmpty}</div>}
        </section>
      )}

      {tab === "monitors" && (
        <section className="gateway-workspace">
          <p className="gateway-hint">{text.monitorHint}</p>
          <div className="gateway-config-grid">
            <label><span>{text.monitorName}</span><input onChange={(event) => setMonitorName(event.target.value)} value={monitorName} /></label>
            <label><span>{text.protocol}</span><select value={protocol} onChange={(event) => setProtocol(event.target.value as ModelGatewayProtocol)}>{Object.entries(text.protocols).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label><span>{text.model}</span><input disabled={protocol === "models"} list="gateway-model-options" onChange={(event) => setSelectedModel(event.target.value)} value={selectedModel} /></label>
            <label><span>{text.monitorInterval}</span><input min="1" max="1440" onChange={(event) => setMonitorInterval(Number(event.target.value))} type="number" value={monitorInterval} /></label>
            <label><span>{text.latencyBatchSize}</span><input min="1" max="100" onChange={(event) => setLatencyBatchSize(Number(event.target.value))} type="number" value={latencyBatchSize} /></label>
            <label><span>{text.dailyRequests}</span><input min="1" onChange={(event) => setDailyRequests(Number(event.target.value))} type="number" value={dailyRequests} /></label>
            <label><span>{text.dailyTokens}</span><input min="1" onChange={(event) => setDailyTokens(Number(event.target.value))} type="number" value={dailyTokens} /></label>
            <label><span>{text.dailyGeneratedRequests}</span><input min="1" onChange={(event) => setDailyGeneratedRequests(Number(event.target.value))} type="number" value={dailyGeneratedRequests} /></label>
            <label className="gateway-check"><input checked={enableMonitor} onChange={(event) => setEnableMonitor(event.target.checked)} type="checkbox" /><span>{text.enableMonitor}</span></label>
          </div>
          <div className="gateway-actions"><button className="primary-button" disabled={saveMonitor.isPending || !monitorName.trim() || !providerSaved || (protocol !== "models" && !selectedModel.trim())} onClick={createMonitor} type="button"><Radio size={15} />{text.createMonitor}</button></div>
          {saveMonitor.error && <div className="inline-error" role="alert">{String(saveMonitor.error)}</div>}
          <div className="gateway-monitor-list">
            {monitors.data?.monitors.map((monitor) => (
              <article className={`gateway-monitor-card ${monitor.health}`} key={monitor.id}>
                <div className="gateway-monitor-heading"><div><strong>{monitor.name}</strong><span>{providers.data?.providers.find((provider) => provider.id === monitor.providerId)?.name ?? monitor.baseUrl} · {text.protocols[monitor.protocol]} · {monitor.modelId || text.protocols.models}</span></div><span className={`gateway-health ${monitor.health}`}>{text.health[monitor.health]}</span></div>
                <SummaryCards summary={monitor.summary7d} text={text} />
                <div className="gateway-monitor-meta"><span>{monitor.baseUrl}</span><span>{monitor.lastProbeAt ?? "—"}</span></div>
                <div className="gateway-actions compact-actions">
                  <button className="secondary-button compact" onClick={() => runMonitor.mutate(monitor.id)} type="button"><Play size={13} />{text.runNow}</button>
                  <button className="secondary-button compact" onClick={() => toggleMonitor.mutate({ id: monitor.id, enabled: !monitor.enabled })} type="button">{monitor.enabled ? <Pause size={13} /> : <Play size={13} />}{monitor.enabled ? text.pause : text.resume}</button>
                  <button className="secondary-button compact danger" onClick={() => removeMonitor.mutate(monitor.id)} type="button"><Trash2 size={13} />{text.remove}</button>
                </div>
              </article>
            ))}
            {!monitors.isLoading && !monitors.data?.monitors.length && <div className="skill-state">{text.monitorsEmpty}</div>}
          </div>
        </section>
      )}

      {tab === "reports" && (
        <section className="gateway-workspace">
          <p className="gateway-hint">{text.reportsHint}</p>
          {task?.summary && task.id && <article className="gateway-report-card"><div><strong>{text.tabs.test}</strong><span>{task.config ? `${providers.data?.providers.find((provider) => provider.id === task.providerId)?.name ?? "—"} · ${text.protocols[task.config.protocol]} · ${task.config.modelId}` : ""}</span></div><SummaryCards summary={task.summary} text={text} /><div className="gateway-actions compact-actions"><button className="secondary-button compact" onClick={() => exportReport.mutate({ scope: "test", id: task.id!, format: "json" })} type="button"><Download size={13} />JSON</button><button className="secondary-button compact" onClick={() => exportReport.mutate({ scope: "test", id: task.id!, format: "csv" })} type="button"><Download size={13} />CSV</button></div></article>}
          {monitors.data?.monitors.map((monitor) => <article className="gateway-report-card" key={monitor.id}><div><strong>{monitor.name}</strong><span>{providers.data?.providers.find((provider) => provider.id === monitor.providerId)?.name ?? monitor.baseUrl} · {text.protocols[monitor.protocol]} · {monitor.modelId}</span></div><SummaryCards summary={monitor.summary7d} text={text} /><div className="gateway-actions compact-actions"><button className="secondary-button compact" onClick={() => exportReport.mutate({ scope: "monitor", id: monitor.id, format: "json" })} type="button"><Download size={13} />JSON</button><button className="secondary-button compact" onClick={() => exportReport.mutate({ scope: "monitor", id: monitor.id, format: "csv" })} type="button"><Download size={13} />CSV</button></div></article>)}
          {exportReport.data && <p className="gateway-hint">{text.reportSaved(exportReport.data.path)}</p>}
          {exportReport.error && <div className="inline-error" role="alert">{String(exportReport.error)}</div>}
          {!task?.summary && !monitors.data?.monitors.length && <div className="skill-state">{text.reportsEmpty}</div>}
        </section>
      )}
    </main>
  );
}
