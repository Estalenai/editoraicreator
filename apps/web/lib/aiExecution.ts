import { normalizePlanCode, resolvePlanLabel } from "./planLabel";

export type AutomaticExecutionPreference = "automatic_quality" | "automatic_economy";
export type AiExecutionUiMode = AutomaticExecutionPreference | "manual";
export type AiExecutionFeature = "text" | "video" | "music";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ProvidersByFeatureEntry = {
  enabled?: boolean;
  availability?: string;
  providers?: string[];
  prepared_providers?: string[];
  max_tier?: string | null;
  mock_only?: boolean;
};

export type CatalogPlanExecution = {
  code: string;
  name?: string;
  quality_outputs?: string[];
  model_tier_max?: string | null;
  providers_by_feature?: Partial<Record<AiExecutionFeature | "image" | "voice" | "slides" | "avatar_preview", ProvidersByFeatureEntry>>;
  runtime_rules?: {
    manual_mode_allowed?: boolean;
    manual_mode_level?: string;
    automatic_mode_default?: boolean;
    primary_mode_label?: string;
    quality_default?: boolean;
    economy_mode_available?: boolean;
  };
  availability?: {
    mode?: string;
    assisted?: boolean;
    contract_only?: boolean;
    hidden_beta?: boolean;
  };
};

export type ExecutionCapabilities = {
  planCode: string;
  planLabel: string;
  planAvailabilityMode: string;
  featureAvailable: boolean;
  featureAvailability: string;
  mockOnly: boolean;
  automaticDefault: AutomaticExecutionPreference;
  economyAvailable: boolean;
  manualAvailable: boolean;
  manualModeLevel: "none" | "limited" | "full";
  providerOptions: SelectOption[];
  tierOptions: SelectOption[];
  qualityOutputs: string[];
  modeOptions: SelectOption[];
};

const TIER_ORDER = ["basic", "standard", "intermediate", "pro"] as const;

const TIER_LABELS: Record<string, string> = {
  basic: "Básico",
  standard: "Padrão",
  intermediate: "Avançado",
  pro: "Pro",
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  elevenlabs: "ElevenLabs",
  suno: "Suno",
  runway: "Runway",
  claude: "Claude (em preparo)",
};

function normalizeCatalogCode(planCode: string | null | undefined): string {
  const raw = String(planCode || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  if (!raw) return "FREE";
  return raw;
}

function buildFeatureEntry({
  enabled = false,
  availability = "unavailable",
  providers = [],
  maxTier = null,
  mockOnly = false,
}: {
  enabled?: boolean;
  availability?: string;
  providers?: string[];
  maxTier?: string | null;
  mockOnly?: boolean;
} = {}): ProvidersByFeatureEntry {
  return {
    enabled,
    availability,
    providers,
    max_tier: maxTier,
    mock_only: mockOnly,
    prepared_providers: [],
  };
}

function buildFallbackCatalogPlan(planCode: string | null | undefined): CatalogPlanExecution {
  const raw = normalizeCatalogCode(planCode);
  const normalized = normalizePlanCode(raw);

  if (raw === "EMPRESARIAL") {
    return {
      code: "EMPRESARIAL",
      availability: { mode: "assisted", assisted: true },
      quality_outputs: ["720p", "1080p", "1440p", "2160p"],
      model_tier_max: "pro",
      runtime_rules: {
        manual_mode_allowed: true,
        manual_mode_level: "full",
        economy_mode_available: true,
      },
      providers_by_feature: {
        text: buildFeatureEntry({ enabled: true, availability: "real", providers: ["openai", "gemini", "deepseek"], maxTier: "pro" }),
        video: buildFeatureEntry({ enabled: true, availability: "real", providers: ["runway"], maxTier: "pro" }),
        music: buildFeatureEntry({ enabled: true, availability: "real", providers: ["suno"], maxTier: "pro" }),
      },
    };
  }

  if (normalized === "EDITOR_ULTRA" || normalized === "ENTERPRISE") {
    return {
      code: normalized,
      availability: { mode: normalized === "ENTERPRISE" ? "contract" : "self_serve" },
      quality_outputs: ["720p", "1080p", "1440p", "2160p"],
      model_tier_max: "pro",
      runtime_rules: {
        manual_mode_allowed: true,
        manual_mode_level: "full",
        economy_mode_available: true,
      },
      providers_by_feature: {
        text: buildFeatureEntry({ enabled: true, availability: "real", providers: ["openai", "gemini", "deepseek"], maxTier: "pro" }),
        video: buildFeatureEntry({ enabled: true, availability: "real", providers: ["runway"], maxTier: "pro" }),
        music: buildFeatureEntry({ enabled: true, availability: "real", providers: ["suno"], maxTier: "pro" }),
      },
    };
  }

  if (normalized === "EDITOR_PRO") {
    return {
      code: "EDITOR_PRO",
      availability: { mode: "self_serve" },
      quality_outputs: ["720p", "1080p", "1440p", "2160p"],
      model_tier_max: "intermediate",
      runtime_rules: {
        manual_mode_allowed: true,
        manual_mode_level: "full",
        economy_mode_available: true,
      },
      providers_by_feature: {
        text: buildFeatureEntry({ enabled: true, availability: "real", providers: ["openai", "gemini", "deepseek"], maxTier: "intermediate" }),
        video: buildFeatureEntry({ enabled: true, availability: "real", providers: ["runway"], maxTier: "intermediate" }),
        music: buildFeatureEntry({ enabled: true, availability: "real", providers: ["suno"], maxTier: "intermediate" }),
      },
    };
  }

  if (normalized === "EDITOR_FREE") {
    return {
      code: "EDITOR_FREE",
      availability: { mode: "self_serve" },
      quality_outputs: ["720p", "1080p", "1440p"],
      model_tier_max: "standard",
      runtime_rules: {
        manual_mode_allowed: true,
        manual_mode_level: "limited",
        economy_mode_available: true,
      },
      providers_by_feature: {
        text: buildFeatureEntry({ enabled: true, availability: "real", providers: ["openai", "gemini", "deepseek"], maxTier: "standard" }),
        video: buildFeatureEntry({ enabled: true, availability: "limited", providers: ["runway"], maxTier: "standard" }),
        music: buildFeatureEntry({ enabled: true, availability: "limited", providers: ["suno"], maxTier: "standard" }),
      },
    };
  }

  return {
    code: "FREE",
    availability: { mode: "hidden_beta", hidden_beta: true },
    quality_outputs: ["720p", "1080p"],
    model_tier_max: "basic",
    runtime_rules: {
      manual_mode_allowed: false,
      manual_mode_level: "none",
      economy_mode_available: true,
    },
    providers_by_feature: {
      text: buildFeatureEntry({ enabled: true, availability: "real", providers: ["openai", "gemini"], maxTier: "basic" }),
      video: buildFeatureEntry({ enabled: false, availability: "mock_only", providers: [], maxTier: "basic", mockOnly: true }),
      music: buildFeatureEntry({ enabled: false, availability: "mock_only", providers: [], maxTier: "basic", mockOnly: true }),
    },
  };
}

export function resolveCatalogPlan(plans: CatalogPlanExecution[], planCode: string | null | undefined): CatalogPlanExecution {
  const raw = normalizeCatalogCode(planCode);
  const normalized = normalizePlanCode(raw);
  const exact = plans.find((plan) => normalizeCatalogCode(plan.code) === raw);
  if (exact) return exact;
  const alias = plans.find((plan) => normalizePlanCode(plan.code) === normalized);
  return alias || buildFallbackCatalogPlan(raw);
}

function buildTierOptions(maxTier: string | null | undefined): SelectOption[] {
  const normalizedMaxTier = String(maxTier || "").trim().toLowerCase();
  const maxIndex = Math.max(0, TIER_ORDER.findIndex((tier) => tier === normalizedMaxTier));
  const allowed = maxIndex >= 0 ? TIER_ORDER.slice(0, maxIndex + 1) : ["basic"];
  return allowed.map((tier) => ({ value: tier, label: TIER_LABELS[tier] || tier }));
}

function labelProvider(provider: string): string {
  const normalized = String(provider || "").trim().toLowerCase();
  return PROVIDER_LABELS[normalized] || normalized || "Provider";
}

export function resolveDefaultManualTier(tierOptions: SelectOption[]): string {
  if (tierOptions.some((option) => option.value === "standard")) return "standard";
  return tierOptions[tierOptions.length - 1]?.value || "basic";
}

export function getExecutionModeLabel(mode: AiExecutionUiMode): string {
  if (mode === "automatic_economy") return "Automático · Econômico";
  if (mode === "manual") return "Manual";
  return "Automático (Recomendado)";
}

export function getTierLabel(tier: string | null | undefined): string {
  const normalized = String(tier || "").trim().toLowerCase();
  return TIER_LABELS[normalized] || normalized || "Padrão";
}

export function formatQualityOutputs(outputs: string[] | null | undefined): string {
  const list = Array.isArray(outputs) ? outputs.filter(Boolean) : [];
  if (list.length === 0) return "Qualidade conforme o plano";
  return list.join(" • ");
}

export function buildExecutionCapabilities(
  plan: CatalogPlanExecution | null,
  feature: AiExecutionFeature,
  planCode: string | null | undefined
): ExecutionCapabilities {
  const resolvedPlan = plan || buildFallbackCatalogPlan(planCode);
  const featureConfig = resolvedPlan.providers_by_feature?.[feature] || buildFeatureEntry();
  const providers = Array.isArray(featureConfig.providers)
    ? [...new Set(featureConfig.providers.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))]
    : [];
  const providerOptions = providers.map((provider) => ({ value: provider, label: labelProvider(provider) }));
  const manualAvailable =
    resolvedPlan.runtime_rules?.manual_mode_allowed === true &&
    featureConfig.enabled !== false &&
    featureConfig.availability !== "unavailable" &&
    featureConfig.mock_only !== true;
  const manualModeLevel = manualAvailable
    ? (String(resolvedPlan.runtime_rules?.manual_mode_level || "full").trim().toLowerCase() as "limited" | "full")
    : "none";
  const economyAvailable = resolvedPlan.runtime_rules?.economy_mode_available !== false;
  const automaticDefault: AutomaticExecutionPreference =
    economyAvailable !== true || resolvedPlan.runtime_rules?.quality_default !== false
      ? "automatic_quality"
      : "automatic_economy";

  const modeOptions: SelectOption[] = [
    { value: "automatic_quality", label: "Automático (Recomendado)" },
    ...(economyAvailable ? [{ value: "automatic_economy", label: "Automático · Econômico" }] : []),
    ...(manualAvailable ? [{ value: "manual", label: manualModeLevel === "limited" ? "Manual (limitado)" : "Manual" }] : []),
  ];

  return {
    planCode: resolvedPlan.code || normalizePlanCode(planCode),
    planLabel: resolvedPlan.name || resolvePlanLabel(planCode),
    planAvailabilityMode: String(resolvedPlan.availability?.mode || "hidden_beta"),
    featureAvailable: Boolean(featureConfig.enabled) && featureConfig.availability !== "unavailable",
    featureAvailability: String(featureConfig.availability || "unavailable"),
    mockOnly: featureConfig.mock_only === true,
    automaticDefault,
    economyAvailable,
    manualAvailable,
    manualModeLevel,
    providerOptions,
    tierOptions: buildTierOptions(featureConfig.max_tier || resolvedPlan.model_tier_max || "basic"),
    qualityOutputs: Array.isArray(resolvedPlan.quality_outputs) ? [...resolvedPlan.quality_outputs] : [],
    modeOptions,
  };
}

export function buildExecutionRoutingPayload({
  mode,
  manualProvider,
  manualTier,
}: {
  mode: AiExecutionUiMode;
  manualProvider?: string | null;
  manualTier?: string | null;
}) {
  if (mode === "manual") {
    return {
      mode: "manual" as const,
      requested: {
        ...(manualProvider ? { provider: manualProvider } : {}),
        ...(manualTier ? { tier: manualTier } : {}),
      },
    };
  }
  return {
    mode: mode === "automatic_economy" ? "economy" : "quality",
  };
}
