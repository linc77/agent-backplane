import type { AgentKind } from "./types";

export const agentKinds: AgentKind[] = ["codex", "claudeCode", "hermes"];

export const agentMeta: Record<
  AgentKind,
  {
    label: string;
    mark: string;
    skillTools: string[];
    memoryWritable: boolean;
  }
> = {
  codex: {
    label: "Codex",
    mark: "◎",
    skillTools: ["Agents", "Codex"],
    memoryWritable: true,
  },
  claudeCode: {
    label: "Claude Code",
    mark: "C",
    skillTools: ["Agents", "Claude Code"],
    memoryWritable: false,
  },
  hermes: {
    label: "Hermes",
    mark: "H",
    skillTools: ["Hermes"],
    memoryWritable: false,
  },
};

const storageKey = "agent-backplane.selected-agent";

export function isAgentKind(value: unknown): value is AgentKind {
  return typeof value === "string" && agentKinds.includes(value as AgentKind);
}

export function readStoredAgent(): AgentKind {
  if (typeof window === "undefined") {
    return "codex";
  }
  const stored = window.localStorage.getItem(storageKey);
  return isAgentKind(stored) ? stored : "codex";
}

export function writeStoredAgent(agent: AgentKind) {
  window.localStorage.setItem(storageKey, agent);
}
