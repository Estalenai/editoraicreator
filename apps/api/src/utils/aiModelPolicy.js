const FALLBACK_PLAN = "FREE";
const TIER_LEVEL = { basic: 1, standard: 2, intermediate: 3, pro: 4 };
const TIER_BY_MODEL_HINT = {
  basic: "basic",
  standard: "standard",
  intermediate: "intermediate",
  pro: "pro",
};

const TIER_SET = {
  FREE: ["basic"],
  INICIANTE: ["basic", "standard"],
  EDITOR_PRO: ["basic", "standard", "intermediate"],
  CREATOR_PRO: ["basic", "standard", "intermediate", "pro"],
  EMPRESARIAL: ["basic", "standard", "intermediate", "pro"],
  ENTERPRISE: ["basic", "standard", "intermediate", "pro"],
};

const OPENAI_MODEL_BY_TIER = {
  basic: "gpt-5-nano",
  standard: "gpt-5-mini",
  intermediate: "gpt-5.2",
  pro: "gpt-5.2-pro",
};

const GEMINI_MODEL_BY_TIER = {
  basic: "gemini-2.5-flash-lite",
  standard: "gemini-2.5-flash",
  intermediate: "gemini-3-flash-preview",
  pro: "gemini-3.1-pro-preview",
};

const DEEPSEEK_MODEL_BY_TIER = {
  standard: "deepseek-chat",
  intermediate: "deepseek-chat",
  pro: "deepseek-reasoner",
};

const RUNWAY_VIDEO_MODEL_BY_TIER = {
  standard: "gen4.5",
  intermediate: "gen4_aleph",
  pro: "veo3.1",
};

const SUNO_MODEL_BY_TIER = {
  standard: "V4",
  intermediate: "V4_5PLUS",
  pro: "V5",
};

const ELEVENLABS_MODEL_BY_TIER = {
  standard: "eleven_turbo_v2",
  intermediate: "eleven_multilingual_v2",
  pro: "eleven_turbo_v2_5",
};

function pickModelByTier(modelByTier, tiers) {
  const next = {};
  for (const tier of tiers) {
    if (modelByTier?.[tier]) next[tier] = modelByTier[tier];
  }
  return next;
}

function createFeaturePolicy({
  providers,
  modelByTier = {},
  mockOnly = false,
}) {
  return {
    ...(mockOnly ? { mock_only: true } : {}),
    providers: providers || {},
    model_by_tier: modelByTier || {},
  };
}

const PLAN_POLICIES = {
  FREE: {
    tiers: [...TIER_SET.FREE],
    byFeature: {
      text_generate: createFeaturePolicy({
        providers: { openai: [...TIER_SET.FREE], gemini: [...TIER_SET.FREE] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.FREE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.FREE),
        },
      }),
      fact_check: createFeaturePolicy({
        providers: { openai: [...TIER_SET.FREE], gemini: [...TIER_SET.FREE] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.FREE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.FREE),
        },
      }),
      image_generate: createFeaturePolicy({
        providers: { openai: [...TIER_SET.FREE], gemini: [...TIER_SET.FREE] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.FREE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.FREE),
        },
      }),
      image_variation: createFeaturePolicy({
        providers: { openai: [...TIER_SET.FREE], gemini: [...TIER_SET.FREE] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.FREE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.FREE),
        },
      }),
      video_generate: createFeaturePolicy({ mockOnly: true }),
      music_generate: createFeaturePolicy({ mockOnly: true }),
      voice_generate: createFeaturePolicy({ mockOnly: true }),
      slides_generate: createFeaturePolicy({ mockOnly: true }),
    },
  },
  INICIANTE: {
    tiers: [...TIER_SET.INICIANTE],
    byFeature: {
      text_generate: createFeaturePolicy({
        providers: {
          openai: [...TIER_SET.INICIANTE],
          gemini: [...TIER_SET.INICIANTE],
          deepseek: ["standard"],
        },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.INICIANTE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.INICIANTE),
          deepseek: pickModelByTier(DEEPSEEK_MODEL_BY_TIER, ["standard"]),
        },
      }),
      fact_check: createFeaturePolicy({
        providers: {
          openai: [...TIER_SET.INICIANTE],
          gemini: [...TIER_SET.INICIANTE],
          deepseek: ["standard"],
        },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.INICIANTE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.INICIANTE),
          deepseek: pickModelByTier(DEEPSEEK_MODEL_BY_TIER, ["standard"]),
        },
      }),
      image_generate: createFeaturePolicy({
        providers: { openai: [...TIER_SET.INICIANTE], gemini: [...TIER_SET.INICIANTE] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.INICIANTE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.INICIANTE),
        },
      }),
      image_variation: createFeaturePolicy({
        providers: { openai: [...TIER_SET.INICIANTE], gemini: [...TIER_SET.INICIANTE] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.INICIANTE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.INICIANTE),
        },
      }),
      video_generate: createFeaturePolicy({
        providers: { runway: ["standard"] },
        modelByTier: { runway: pickModelByTier(RUNWAY_VIDEO_MODEL_BY_TIER, ["standard"]) },
      }),
      music_generate: createFeaturePolicy({
        providers: { suno: ["standard"] },
        modelByTier: { suno: pickModelByTier(SUNO_MODEL_BY_TIER, ["standard"]) },
      }),
      voice_generate: createFeaturePolicy({
        providers: { elevenlabs: ["standard"] },
        modelByTier: { elevenlabs: pickModelByTier(ELEVENLABS_MODEL_BY_TIER, ["standard"]) },
      }),
      slides_generate: createFeaturePolicy({
        providers: { openai: ["standard"], gemini: ["standard"] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, ["standard"]),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, ["standard"]),
        },
      }),
    },
  },
  EDITOR_PRO: {
    tiers: [...TIER_SET.EDITOR_PRO],
    byFeature: {
      text_generate: createFeaturePolicy({
        providers: {
          openai: [...TIER_SET.EDITOR_PRO],
          gemini: [...TIER_SET.EDITOR_PRO],
          deepseek: ["standard", "intermediate"],
        },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.EDITOR_PRO),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.EDITOR_PRO),
          deepseek: pickModelByTier(DEEPSEEK_MODEL_BY_TIER, ["standard", "intermediate"]),
        },
      }),
      fact_check: createFeaturePolicy({
        providers: {
          openai: [...TIER_SET.EDITOR_PRO],
          gemini: [...TIER_SET.EDITOR_PRO],
          deepseek: ["standard", "intermediate"],
        },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.EDITOR_PRO),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.EDITOR_PRO),
          deepseek: pickModelByTier(DEEPSEEK_MODEL_BY_TIER, ["standard", "intermediate"]),
        },
      }),
      image_generate: createFeaturePolicy({
        providers: { openai: [...TIER_SET.EDITOR_PRO], gemini: [...TIER_SET.EDITOR_PRO] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.EDITOR_PRO),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.EDITOR_PRO),
        },
      }),
      image_variation: createFeaturePolicy({
        providers: { openai: [...TIER_SET.EDITOR_PRO], gemini: [...TIER_SET.EDITOR_PRO] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.EDITOR_PRO),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.EDITOR_PRO),
        },
      }),
      video_generate: createFeaturePolicy({
        providers: { runway: ["standard", "intermediate"] },
        modelByTier: { runway: pickModelByTier(RUNWAY_VIDEO_MODEL_BY_TIER, ["standard", "intermediate"]) },
      }),
      music_generate: createFeaturePolicy({
        providers: { suno: ["standard", "intermediate"] },
        modelByTier: { suno: pickModelByTier(SUNO_MODEL_BY_TIER, ["standard", "intermediate"]) },
      }),
      voice_generate: createFeaturePolicy({
        providers: { elevenlabs: ["standard", "intermediate"] },
        modelByTier: { elevenlabs: pickModelByTier(ELEVENLABS_MODEL_BY_TIER, ["standard", "intermediate"]) },
      }),
      slides_generate: createFeaturePolicy({
        providers: { openai: ["standard", "intermediate"], gemini: ["standard", "intermediate"] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, ["standard", "intermediate"]),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, ["standard", "intermediate"]),
        },
      }),
    },
  },
  CREATOR_PRO: {
    tiers: [...TIER_SET.CREATOR_PRO],
    byFeature: {
      text_generate: createFeaturePolicy({
        providers: {
          openai: [...TIER_SET.CREATOR_PRO],
          gemini: [...TIER_SET.CREATOR_PRO],
          deepseek: ["standard", "intermediate", "pro"],
        },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.CREATOR_PRO),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.CREATOR_PRO),
          deepseek: pickModelByTier(DEEPSEEK_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
        },
      }),
      fact_check: createFeaturePolicy({
        providers: {
          openai: [...TIER_SET.CREATOR_PRO],
          gemini: [...TIER_SET.CREATOR_PRO],
          deepseek: ["standard", "intermediate", "pro"],
        },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.CREATOR_PRO),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.CREATOR_PRO),
          deepseek: pickModelByTier(DEEPSEEK_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
        },
      }),
      image_generate: createFeaturePolicy({
        providers: { openai: [...TIER_SET.CREATOR_PRO], gemini: [...TIER_SET.CREATOR_PRO] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.CREATOR_PRO),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.CREATOR_PRO),
        },
      }),
      image_variation: createFeaturePolicy({
        providers: { openai: [...TIER_SET.CREATOR_PRO], gemini: [...TIER_SET.CREATOR_PRO] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.CREATOR_PRO),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.CREATOR_PRO),
        },
      }),
      video_generate: createFeaturePolicy({
        providers: { runway: ["standard", "intermediate", "pro"] },
        modelByTier: { runway: pickModelByTier(RUNWAY_VIDEO_MODEL_BY_TIER, ["standard", "intermediate", "pro"]) },
      }),
      music_generate: createFeaturePolicy({
        providers: { suno: ["standard", "intermediate", "pro"] },
        modelByTier: { suno: pickModelByTier(SUNO_MODEL_BY_TIER, ["standard", "intermediate", "pro"]) },
      }),
      voice_generate: createFeaturePolicy({
        providers: { elevenlabs: ["standard", "intermediate", "pro"] },
        modelByTier: { elevenlabs: pickModelByTier(ELEVENLABS_MODEL_BY_TIER, ["standard", "intermediate", "pro"]) },
      }),
      slides_generate: createFeaturePolicy({
        providers: { openai: ["standard", "intermediate", "pro"], gemini: ["standard", "intermediate", "pro"] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
        },
      }),
    },
  },
  EMPRESARIAL: {
    tiers: [...TIER_SET.EMPRESARIAL],
    byFeature: {
      text_generate: createFeaturePolicy({
        providers: {
          openai: [...TIER_SET.EMPRESARIAL],
          gemini: [...TIER_SET.EMPRESARIAL],
          deepseek: ["standard", "intermediate", "pro"],
        },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.EMPRESARIAL),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.EMPRESARIAL),
          deepseek: pickModelByTier(DEEPSEEK_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
        },
      }),
      fact_check: createFeaturePolicy({
        providers: {
          openai: [...TIER_SET.EMPRESARIAL],
          gemini: [...TIER_SET.EMPRESARIAL],
          deepseek: ["standard", "intermediate", "pro"],
        },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.EMPRESARIAL),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.EMPRESARIAL),
          deepseek: pickModelByTier(DEEPSEEK_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
        },
      }),
      image_generate: createFeaturePolicy({
        providers: { openai: [...TIER_SET.EMPRESARIAL], gemini: [...TIER_SET.EMPRESARIAL] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.EMPRESARIAL),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.EMPRESARIAL),
        },
      }),
      image_variation: createFeaturePolicy({
        providers: { openai: [...TIER_SET.EMPRESARIAL], gemini: [...TIER_SET.EMPRESARIAL] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.EMPRESARIAL),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.EMPRESARIAL),
        },
      }),
      video_generate: createFeaturePolicy({
        providers: { runway: ["standard", "intermediate", "pro"] },
        modelByTier: { runway: pickModelByTier(RUNWAY_VIDEO_MODEL_BY_TIER, ["standard", "intermediate", "pro"]) },
      }),
      music_generate: createFeaturePolicy({
        providers: { suno: ["standard", "intermediate", "pro"] },
        modelByTier: { suno: pickModelByTier(SUNO_MODEL_BY_TIER, ["standard", "intermediate", "pro"]) },
      }),
      voice_generate: createFeaturePolicy({
        providers: { elevenlabs: ["standard", "intermediate", "pro"] },
        modelByTier: { elevenlabs: pickModelByTier(ELEVENLABS_MODEL_BY_TIER, ["standard", "intermediate", "pro"]) },
      }),
      slides_generate: createFeaturePolicy({
        providers: { openai: ["standard", "intermediate", "pro"], gemini: ["standard", "intermediate", "pro"] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
        },
      }),
    },
  },
  ENTERPRISE: {
    tiers: [...TIER_SET.ENTERPRISE],
    byFeature: {
      text_generate: createFeaturePolicy({
        providers: {
          openai: [...TIER_SET.ENTERPRISE],
          gemini: [...TIER_SET.ENTERPRISE],
          deepseek: ["standard", "intermediate", "pro"],
        },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.ENTERPRISE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.ENTERPRISE),
          deepseek: pickModelByTier(DEEPSEEK_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
        },
      }),
      fact_check: createFeaturePolicy({
        providers: {
          openai: [...TIER_SET.ENTERPRISE],
          gemini: [...TIER_SET.ENTERPRISE],
          deepseek: ["standard", "intermediate", "pro"],
        },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.ENTERPRISE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.ENTERPRISE),
          deepseek: pickModelByTier(DEEPSEEK_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
        },
      }),
      image_generate: createFeaturePolicy({
        providers: { openai: [...TIER_SET.ENTERPRISE], gemini: [...TIER_SET.ENTERPRISE] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.ENTERPRISE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.ENTERPRISE),
        },
      }),
      image_variation: createFeaturePolicy({
        providers: { openai: [...TIER_SET.ENTERPRISE], gemini: [...TIER_SET.ENTERPRISE] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, TIER_SET.ENTERPRISE),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, TIER_SET.ENTERPRISE),
        },
      }),
      video_generate: createFeaturePolicy({
        providers: { runway: ["standard", "intermediate", "pro"] },
        modelByTier: { runway: pickModelByTier(RUNWAY_VIDEO_MODEL_BY_TIER, ["standard", "intermediate", "pro"]) },
      }),
      music_generate: createFeaturePolicy({
        providers: { suno: ["standard", "intermediate", "pro"] },
        modelByTier: { suno: pickModelByTier(SUNO_MODEL_BY_TIER, ["standard", "intermediate", "pro"]) },
      }),
      voice_generate: createFeaturePolicy({
        providers: { elevenlabs: ["standard", "intermediate", "pro"] },
        modelByTier: { elevenlabs: pickModelByTier(ELEVENLABS_MODEL_BY_TIER, ["standard", "intermediate", "pro"]) },
      }),
      slides_generate: createFeaturePolicy({
        providers: { openai: ["standard", "intermediate", "pro"], gemini: ["standard", "intermediate", "pro"] },
        modelByTier: {
          openai: pickModelByTier(OPENAI_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
          gemini: pickModelByTier(GEMINI_MODEL_BY_TIER, ["standard", "intermediate", "pro"]),
        },
      }),
    },
  },
};

const PLAN_ALIASES = new Map([
  ["FREE", "FREE"],
  ["EDITOR_FREE", "INICIANTE"],
  ["INICIANTE", "INICIANTE"],
  ["STARTER", "INICIANTE"],
  ["EDITOR_PRO", "EDITOR_PRO"],
  ["PRO", "EDITOR_PRO"],
  ["EDITOR_ULTRA", "CREATOR_PRO"],
  ["CREATOR_PRO", "CREATOR_PRO"],
  ["CRIADOR_PRO", "CREATOR_PRO"],
  ["ULTRA", "CREATOR_PRO"],
  ["EMPRESARIAL", "EMPRESARIAL"],
  ["ENTERPRISE", "ENTERPRISE"],
  ["ENTERPRISE_ULTRA", "ENTERPRISE"],
]);

function normalizePlanCode(planCode) {
  const code = String(planCode || FALLBACK_PLAN)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  const normalized = PLAN_ALIASES.get(code) || code;
  return PLAN_POLICIES[normalized] ? normalized : FALLBACK_PLAN;
}

function normalizeFeatureKey(feature) {
  const normalized = String(feature || "").trim().toLowerCase();
  if (normalized.endsWith("_status")) return normalized.replace(/_status$/, "_generate");
  return normalized;
}

function normalizeProvider(provider) {
  return String(provider || "").trim().toLowerCase();
}

function normalizeTierStrict(tier) {
  const raw = String(tier || "").trim().toLowerCase();
  return TIER_LEVEL[raw] ? raw : null;
}

function normalizeTierOrBasic(tier) {
  return normalizeTierStrict(tier) || "basic";
}

function inferTierFromModel(model) {
  const raw = String(model || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "gpt-5.2-pro" || raw === "gemini-3.1-pro-preview" || raw === "deepseek-reasoner" || raw === "v5" || raw === "veo3.1" || raw === "eleven_turbo_v2_5") return "pro";
  if (raw === "gpt-5.2" || raw === "gemini-3-flash-preview" || raw === "gen4_aleph" || raw === "v4_5plus" || raw === "eleven_multilingual_v2") return "intermediate";
  if (raw === "gpt-5-mini" || raw === "gemini-2.5-flash" || raw === "deepseek-chat" || raw === "gen4.5" || raw === "v4" || raw === "eleven_turbo_v2") return "standard";
  if (raw === "gpt-5-nano" || raw === "gemini-2.5-flash-lite") return "basic";
  if (raw.includes("openai-pro") || raw.includes("gemini-pro")) return "pro";
  if (raw.includes("intermediate")) return "intermediate";
  if (raw.includes("standard") || raw.includes("-mini")) return "standard";
  if (raw.includes("basic") || raw.includes("-nano") || raw.includes("flash-lite")) return "basic";
  return null;
}

function extractRequestedTier({ model, tier }) {
  const fromTier = normalizeTierStrict(tier);
  if (fromTier) return fromTier;
  return inferTierFromModel(model);
}

function policyFor(planCode) {
  return PLAN_POLICIES[normalizePlanCode(planCode)] || PLAN_POLICIES[FALLBACK_PLAN];
}

function getFeaturePolicy(planCode, feature) {
  const policy = policyFor(planCode);
  const featureKey = normalizeFeatureKey(feature);
  return policy.byFeature?.[featureKey] || null;
}

function getProviderTiers(featurePolicy, provider) {
  const providerKey = normalizeProvider(provider);
  const list = Array.isArray(featurePolicy?.providers?.[providerKey]) ? featurePolicy.providers[providerKey] : [];
  return list.map((tier) => normalizeTierStrict(tier)).filter(Boolean);
}

function getProviderModelByTier(featurePolicy, provider) {
  const providerKey = normalizeProvider(provider);
  const map = featurePolicy?.model_by_tier?.[providerKey];
  return map && typeof map === "object" ? map : {};
}

function getAllowedModelsForProvider(featurePolicy, provider) {
  const map = getProviderModelByTier(featurePolicy, provider);
  return Object.values(map)
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => String(value));
}

export function getPlanModelPolicy(planCode) {
  const code = normalizePlanCode(planCode);
  const policy = policyFor(code);
  return {
    plan: code,
    tiers: [...(policy.tiers || ["basic"])],
    byFeature: policy.byFeature || {},
  };
}

export function isModelAllowed({ plan, feature, provider, model, tier }) {
  const featurePolicy = getFeaturePolicy(plan, feature);
  if (!featurePolicy) return false;
  if (featurePolicy.mock_only) return false;

  const providerTiers = getProviderTiers(featurePolicy, provider);
  if (providerTiers.length === 0) return false;

  const requestedModel = String(model || "").trim();
  const allowedModels = getAllowedModelsForProvider(featurePolicy, provider);
  if (requestedModel) {
    const requestedLower = requestedModel.toLowerCase();
    const exactAllowed = allowedModels.some((candidate) => candidate.toLowerCase() === requestedLower);
    if (exactAllowed) return true;
    const inferredTier = extractRequestedTier({ model: requestedModel, tier });
    if (!inferredTier) return false;
    const inferredLevel = TIER_LEVEL[inferredTier] || TIER_LEVEL.basic;
    return providerTiers.some((item) => (TIER_LEVEL[item] || 0) >= inferredLevel);
  }

  const requestedTier = extractRequestedTier({ model, tier }) || "basic";
  const requestedLevel = TIER_LEVEL[requestedTier] || TIER_LEVEL.basic;
  return providerTiers.some((item) => (TIER_LEVEL[item] || 0) >= requestedLevel);
}

export function getAllowedProvidersForFeature(plan, feature) {
  const featurePolicy = getFeaturePolicy(plan, feature);
  if (!featurePolicy || featurePolicy.mock_only) return [];
  return Object.keys(featurePolicy.providers || {});
}

export function getBestAllowedTierForProvider(plan, feature, provider, preferredTier = "basic") {
  const featurePolicy = getFeaturePolicy(plan, feature);
  if (!featurePolicy || featurePolicy.mock_only) return null;

  const providerTiers = getProviderTiers(featurePolicy, provider);
  if (providerTiers.length === 0) return null;

  const preferred = normalizeTierOrBasic(preferredTier);
  const preferredLevel = TIER_LEVEL[preferred] || TIER_LEVEL.basic;
  const sorted = [...providerTiers].sort((a, b) => (TIER_LEVEL[a] || 0) - (TIER_LEVEL[b] || 0));
  const candidate = sorted.find((item) => (TIER_LEVEL[item] || 0) >= preferredLevel);
  return candidate || sorted[sorted.length - 1] || "basic";
}

export function getPreferredModelForProvider(plan, feature, provider, preferredTier = "basic") {
  const featurePolicy = getFeaturePolicy(plan, feature);
  if (!featurePolicy || featurePolicy.mock_only) return null;

  const map = getProviderModelByTier(featurePolicy, provider);
  const bestTier = getBestAllowedTierForProvider(plan, feature, provider, preferredTier);
  if (bestTier && map?.[bestTier]) return map[bestTier];

  const tiers = getProviderTiers(featurePolicy, provider).sort((a, b) => (TIER_LEVEL[b] || 0) - (TIER_LEVEL[a] || 0));
  for (const tier of tiers) {
    if (map?.[tier]) return map[tier];
  }
  return null;
}

export function getDefaultTierForMode(mode) {
  const normalized = String(mode || "quality").trim().toLowerCase();
  if (normalized === "economy") return TIER_BY_MODEL_HINT.standard;
  if (normalized === "manual") return TIER_BY_MODEL_HINT.standard;
  return TIER_BY_MODEL_HINT.pro;
}
