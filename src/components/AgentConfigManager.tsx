import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  activateAgentProviderProfile,
  deleteAgentProviderProfile,
  loadAgentConfigInventory,
  saveAgentProviderProfile,
} from "../lib/api";
import { agentMeta } from "../lib/agentScope";
import type { UiText } from "../lib/i18n";
import type {
  AgentConfigInventory,
  AgentKind,
  AgentProtocol,
  AgentProviderProfile,
  SaveAgentProfileInput,
} from "../lib/types";
import { PageHeader } from "./PageHeader";
import { LoadingState } from "./LoadingState";

const defaultProfiles: Record<AgentKind, Omit<SaveAgentProfileInput, "agent">> = {
  codex: {
    id: null,
    name: "",
    providerKey: "",
    baseUrl: "",
    model: "",
    protocol: "responses",
    official: false,
    apiKey: null,
    clearSecret: false,
  },
  claudeCode: {
    id: null,
    name: "",
    providerKey: "",
    baseUrl: "",
    model: "",
    protocol: "anthropicMessages",
    official: false,
    apiKey: null,
    clearSecret: false,
  },
  hermes: {
    id: null,
    name: "",
    providerKey: "",
    baseUrl: "",
    model: "",
    protocol: "chatCompletions",
    official: false,
    apiKey: null,
    clearSecret: false,
  },
};

function inputFromProfile(agent: AgentKind, profile?: AgentProviderProfile): SaveAgentProfileInput {
  if (!profile) {
    return { agent, ...defaultProfiles[agent] };
  }
  return {
    id: profile.id,
    agent,
    name: profile.name,
    providerKey: profile.providerKey,
    baseUrl: profile.baseUrl,
    model: profile.model,
    protocol: profile.protocol,
    official: profile.official,
    apiKey: null,
    clearSecret: false,
  };
}

function protocolLabel(protocol: AgentProtocol) {
  return {
    responses: "Responses API",
    anthropicMessages: "Anthropic Messages",
    chatCompletions: "Chat Completions",
  }[protocol];
}

export function AgentConfigManager({
  selectedAgent,
  uiText,
}: {
  selectedAgent: AgentKind;
  uiText: UiText;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SaveAgentProfileInput | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inventoryQuery = useQuery({
    queryKey: ["agent-config-inventory"],
    queryFn: loadAgentConfigInventory,
  });
  const target = useMemo(
    () => inventoryQuery.data?.targets.find((item) => item.agent === selectedAgent),
    [inventoryQuery.data?.targets, selectedAgent],
  );

  useEffect(() => {
    setEditing(null);
    setNotice(null);
  }, [selectedAgent]);

  function applyInventory(inventory: AgentConfigInventory) {
    queryClient.setQueryData(["agent-config-inventory"], inventory);
  }

  const saveMutation = useMutation({
    mutationFn: saveAgentProviderProfile,
    onSuccess: (inventory) => {
      applyInventory(inventory);
      setEditing(null);
      setNotice(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: ({ agent, profileId }: { agent: AgentKind; profileId: string }) =>
      deleteAgentProviderProfile(agent, profileId),
    onSuccess: (inventory) => {
      applyInventory(inventory);
      setNotice(null);
    },
  });
  const activationMutation = useMutation({
    mutationFn: ({ agent, profileId }: { agent: AgentKind; profileId: string }) =>
      activateAgentProviderProfile(agent, profileId),
    onSuccess: (result) => {
      applyInventory(result.inventory);
      const activeTarget = result.inventory.targets.find((item) => item.agent === selectedAgent);
      setNotice(
        [
          uiText.agents.switched(activeTarget?.label ?? selectedAgent),
          result.backupPath ? uiText.agents.backupCreated(result.backupPath) : "",
          result.reloadHint,
        ]
          .filter(Boolean)
          .join(" "),
      );
    },
  });
  const error =
    inventoryQuery.error ?? saveMutation.error ?? deleteMutation.error ?? activationMutation.error;

  return (
    <main className="board agent-manager">
      <PageHeader
        className="agent-toolbar"
        title={`${target?.label ?? agentMeta[selectedAgent].label} · ${uiText.agents.title}`}
        description={uiText.agents.subtitle}
        actions={(
          <div className="agent-toolbar-actions">
            <button
              aria-label={uiText.agents.refresh}
              className="icon-button"
              disabled={inventoryQuery.isFetching}
              onClick={() => void inventoryQuery.refetch()}
              type="button"
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="primary-button agent-add-button"
              onClick={() => setEditing(inputFromProfile(selectedAgent))}
              type="button"
            >
              <Plus size={17} />
              {uiText.agents.addProfile}
            </button>
          </div>
        )}
      />

      {error && <div className="inline-error">{String(error)}</div>}
      {notice && <div className="agent-notice"><Check size={15} />{notice}</div>}
      {inventoryQuery.isLoading && <LoadingState label={uiText.agents.loading} />}

      {target && (
        <>
          <section className="agent-runtime-card">
            <div className="agent-runtime-heading">
              <span className={`agent-mark large ${target.agent}`}>{agentMeta[target.agent].mark}</span>
              <div>
                <strong>{target.label}</strong>
                <span className={target.installed ? "agent-install-status installed" : "agent-install-status"}>
                  {target.installed ? uiText.agents.installed : uiText.agents.notInstalled}
                </span>
              </div>
            </div>
            <dl>
              <div>
                <dt>{uiText.agents.currentProvider}</dt>
                <dd>{target.activeProviderKey || "-"}</dd>
              </div>
              <div>
                <dt>{uiText.agents.currentModel}</dt>
                <dd>{target.activeModel || "-"}</dd>
              </div>
              <div className="agent-config-path">
                <dt>{uiText.agents.configPath}</dt>
                <dd title={target.configPath}>{target.configPath}</dd>
              </div>
            </dl>
          </section>

          <section className="agent-profile-list" aria-label={uiText.agents.currentConfig}>
            {target.profiles.map((profile) => (
              <article className={profile.active ? "agent-profile-card active" : "agent-profile-card"} key={profile.id}>
                <div className="agent-profile-main">
                  <span className="provider-avatar">{profile.name.trim().charAt(0).toUpperCase() || "P"}</span>
                  <div className="agent-profile-copy">
                    <div className="agent-profile-title">
                      <h2>{profile.name}</h2>
                      {profile.active && <span className="agent-active-badge"><Check size={12} />{uiText.agents.active}</span>}
                      <span>{profile.official ? uiText.agents.official : uiText.agents.custom}</span>
                    </div>
                    <a href={profile.baseUrl || undefined} rel="noreferrer" target="_blank">
                      {profile.baseUrl || profile.providerKey}
                    </a>
                    <div className="agent-profile-meta">
                      <span>{profile.model}</span>
                      <span>{protocolLabel(profile.protocol)}</span>
                      <span>{profile.source === "imported" ? uiText.agents.imported : uiText.agents.managed}</span>
                      <span className={profile.hasSecret ? "secret-ready" : ""}>
                        <KeyRound size={12} />
                        {profile.hasSecret ? uiText.agents.credentialStored : uiText.agents.noCredential}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="agent-profile-actions">
                  {!profile.active && (
                    <button
                      className="primary-button"
                      disabled={activationMutation.isPending}
                      onClick={() => activationMutation.mutate({ agent: selectedAgent, profileId: profile.id })}
                      type="button"
                    >
                      <ShieldCheck size={15} />
                      {activationMutation.isPending ? uiText.agents.enabling : uiText.agents.enable}
                    </button>
                  )}
                  <button
                    aria-label={`${uiText.agents.edit}: ${profile.name}`}
                    className="icon-button"
                    onClick={() => setEditing(inputFromProfile(selectedAgent, profile))}
                    type="button"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    aria-label={`${uiText.agents.delete}: ${profile.name}`}
                    className="icon-button danger"
                    disabled={profile.active || deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate({ agent: selectedAgent, profileId: profile.id })}
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
            {!target.profiles.length && <div className="skill-state">{uiText.agents.noProfiles}</div>}
          </section>

          <footer className="agent-catalog-path">
            <Bot size={14} />
            <span>{uiText.agents.catalogPath}</span>
            <code>{inventoryQuery.data?.catalogPath}</code>
          </footer>
        </>
      )}

      {editing && (
        <AgentProfileDialog
          input={editing}
          isSaving={saveMutation.isPending}
          uiText={uiText}
          onCancel={() => setEditing(null)}
          onChange={setEditing}
          onSave={() => saveMutation.mutate(editing)}
        />
      )}
    </main>
  );
}

function AgentProfileDialog({
  input,
  isSaving,
  uiText,
  onCancel,
  onChange,
  onSave,
}: {
  input: SaveAgentProfileInput;
  isSaving: boolean;
  uiText: UiText;
  onCancel: () => void;
  onChange: (input: SaveAgentProfileInput) => void;
  onSave: () => void;
}) {
  const canSave =
    input.name.trim() &&
    input.providerKey.trim() &&
    input.model.trim() &&
    (input.official || /^https?:\/\//.test(input.baseUrl.trim()));

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-modal="true" className="dialog agent-profile-dialog" role="dialog">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{uiText.agents.eyebrow}</p>
            <h2>{input.id ? uiText.agents.editTitle : uiText.agents.createTitle}</h2>
          </div>
          <span className={`agent-mark ${input.agent}`}>{agentMeta[input.agent].mark}</span>
        </div>

        <div className="agent-form-grid">
          <label>
            <span>{uiText.agents.profileName}</span>
            <input value={input.name} onChange={(event) => onChange({ ...input, name: event.target.value })} />
          </label>
          <label>
            <span>{uiText.agents.providerKey}</span>
            <input value={input.providerKey} onChange={(event) => onChange({ ...input, providerKey: event.target.value })} />
          </label>
          <label className="full-width">
            <span>{uiText.agents.baseUrl}</span>
            <input
              disabled={input.official}
              placeholder="https://api.example.com/v1"
              value={input.baseUrl}
              onChange={(event) => onChange({ ...input, baseUrl: event.target.value })}
            />
          </label>
          <label>
            <span>{uiText.agents.model}</span>
            <input value={input.model} onChange={(event) => onChange({ ...input, model: event.target.value })} />
          </label>
          <label>
            <span>{uiText.agents.protocol}</span>
            <select
              disabled={input.agent !== "hermes"}
              value={input.protocol}
              onChange={(event) => onChange({ ...input, protocol: event.target.value as AgentProtocol })}
            >
              <option value="responses">Responses API</option>
              <option value="anthropicMessages">Anthropic Messages</option>
              <option value="chatCompletions">Chat Completions</option>
            </select>
          </label>
          <label className="full-width">
            <span>{uiText.agents.apiKey}</span>
            <input
              autoComplete="new-password"
              type="password"
              value={input.apiKey ?? ""}
              onChange={(event) => onChange({ ...input, apiKey: event.target.value || null, clearSecret: false })}
            />
            <small>{uiText.agents.apiKeyHint}</small>
          </label>
        </div>

        <div className="agent-form-toggles">
          <label>
            <input
              checked={input.official}
              onChange={(event) => onChange({ ...input, official: event.target.checked })}
              type="checkbox"
            />
            {uiText.agents.official}
          </label>
          {input.id && (
            <label>
              <input
                checked={input.clearSecret}
                onChange={(event) => onChange({ ...input, clearSecret: event.target.checked, apiKey: null })}
                type="checkbox"
              />
              {uiText.agents.clearCredential}
            </label>
          )}
        </div>

        <div className="dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">{uiText.agents.cancel}</button>
          <button className="primary-button" disabled={!canSave || isSaving} onClick={onSave} type="button">
            {isSaving ? uiText.agents.saving : uiText.agents.save}
          </button>
        </div>
      </section>
    </div>
  );
}
