import { Bot } from "lucide-react";
import claudeLogo from "../assets/model-logos/claude.svg";
import deepSeekLogo from "../assets/model-logos/deepseek.svg";
import geminiLogo from "../assets/model-logos/gemini.svg";
import openAiLogo from "../assets/model-logos/openai.svg";

export type ModelBrand = "claude" | "deepseek" | "gemini" | "openai";

const MODEL_BRANDS: Record<ModelBrand, { label: string; logo: string }> = {
  claude: { label: "Claude", logo: claudeLogo },
  deepseek: { label: "DeepSeek", logo: deepSeekLogo },
  gemini: { label: "Gemini", logo: geminiLogo },
  openai: { label: "OpenAI", logo: openAiLogo },
};

function includesAny(value: string, candidates: string[]) {
  return candidates.some((candidate) => value.includes(candidate));
}

export function detectModelBrand(modelId: string, ownedBy: string | null): ModelBrand | null {
  const identity = `${modelId} ${ownedBy ?? ""}`.toLocaleLowerCase();
  if (identity.includes("deepseek")) return "deepseek";
  if (includesAny(identity, ["claude", "anthropic"])) return "claude";
  if (identity.includes("gemini")) return "gemini";
  if (
    includesAny(identity, ["openai", "chatgpt", "gpt-", "codex"])
    || /(?:^|[\s/_.:-])o[134](?:$|[\s/_.:-])/.test(identity)
  ) return "openai";
  return null;
}

export function ModelLogo({ modelId, ownedBy }: { modelId: string; ownedBy: string | null }) {
  const brand = detectModelBrand(modelId, ownedBy);
  const metadata = brand ? MODEL_BRANDS[brand] : null;

  return (
    <span
      aria-hidden="true"
      className={`model-provider-logo ${brand ?? "unknown"}`}
      data-model-brand={brand ?? "unknown"}
      title={metadata?.label}
    >
      {metadata
        ? <img alt="" src={metadata.logo} />
        : <Bot size={21} strokeWidth={1.7} />}
    </span>
  );
}
