import { getPlanLimitMatrix, normalizePlanMatrixCode } from "./planLimitsMatrix.js";

const FALLBACK_PLAN = "FREE";
const TIER_LEVEL = { basic: 1, standard: 2, intermediate: 3, pro: 4 };
const TIER_BY_MODEL_HINT = {
  basic: "basic",
  standard: "standard",
  intermediate: "intermediate",
  pro: "pro",
};
const TIER_SEQUENCE = ["basic", "standard", "intermediate", "pro"];
const FEATURE_KEYS = [
  "text_generate",
  "fact_check",
  "image_generate",
  "image_variation",
  "video_generate",
  "music_generate",
  "voice_generate",
  "slides_generate",
];

const FEATURE_TO_MATRIX_KEY = {
  text_generate: "text",
  fact_check: "text",
  image_generate: "image",
  image_variation: "image",
  video_generate: "video",
  music_generate: "music",
  voice_generate: "voice",
  slides_generate: "slides",
};

const IMPLEMENTED_PROVIDERS_BY_FEATURE = {
  text_generate: new Set(["openai", "gemini"]),
  fact_check: new Set(["openai"]),
  image_generate: new Set(["openai", "gemini"]),
  image_variation: new Set(["openai", "gemini"]),
  video_generate: new Set(["runway"]),
  music_generate: new Set(["suno"]),
  voice_generate: new Set(["elevenlabs"]),
  slides_generate: new Set([]),
};

const MODEL_BY_PROVIDER_BY_TIER = {
  openai: {
    basic: "gpt-5-nano",
    standard: "gpt-5-mini",
    intermediate: "gpt-5.2",
    pro: "gpt-5.2-pro",
  },
  gemini: {
    basic: "gemini-2.5-flash-lite",
    standard: "gemini-2.5-flash",
    intermediate: "gemini-3-flash-preview",
    pro: "gemini-3.1-pro-preview",
  },
  deepseek: {
    standard: "deepseek-chat",
    intermediate: "deepseek-chat",
    pro: "deepseek-reasoner",
  },
  runway: {
    standard: "gen4.5",
    intermediate: "gen4_aleph",
    pro: "veo3.1",
  },
  suno: {
    standard: "V4",
    intermediate: "V4_5PLUS",
    pro: "V5",
  },
  elevenlabs: {
    standard: "eleven_turbo_v2",
    intermediate: "eleven_multilingual_v2",
    pro: "eleven_turbo_v2_5",
  },
};

const POLICY_CACHE = new Map();

function cloneValue(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizePlanCode(planCode) {
  return normalizePlanMatrixCode(planCode, "usage") || FALLBACK_PLAN;
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

function tiersUpTo(maxTier) {
  const normalizedMaxTier = normalizeTierStrict(maxTier) || "basic";
  const maxLevel = TIER_LEVEL[normalizedMaxTier] || TIER_LEVEL.basic;
  return TIER_SEQUENCE.filter((tier) => (TIER_LEVEL[tier] || 0) <= maxLevel);
}

function createFeaturePolicy({ providers = {}, modelByTier = {}, mockOnly = false } = {}) {
  return {
    ...(mockOnly ? { mock_only: true } : {}),
    providers: providers || {},
    model_by_tier: modelByTier || {},
  };
}

function getPlanMatrix(planCode) {
  return getPlanLimitMatrix(planCode, { domain: "usage" });
}

function buildFeaturePolicy(planCode, feature) {
  const planMatrix = getPlanMatrix(planCode);
  const featureKey = normalizeFeatureKey(feature);
  const matrixKey = FEATURE_TO_MATRIX_KEY[featureKey];
  const featureRule = matrixKey ? planMatrix?.providers?.[matrixKey] : null;
  if (!featureRule) return null;
  if (featureRule.mock_only === true || featureRule.availability === "mock_only") {
    return createFeaturePolicy({ mockOnly: true });
  }

  const implementedProviders = IMPLEMENTED_PROVIDERS_BY_FEATURE[featureKey] || new Set();
  const allowedProviders = [...new Set((featureRule.providers || []).map(normalizeProvider))]
    .filter((provider) => provider && implementedProviders.has(provider));
  if (allowedProviders.length === 0) {
    return createFeaturePolicy();
  }

  const maxTier = normalizeTierStrict(featureRule.model_tier_max || planMatrix?.model_tier_max || planMatrix?.quality_tier) || "basic";
  const providers = {};
  const modelByTier = {};

  for (const provider of allowedProviders) {
    const allowedTiers = tiersUpTo(maxTier).filter((tier) => MODEL_BY_PROVIDER_BY_TIER?.[provider]?.[tier]);
    if (allowedTiers.length === 0) continue;
    providers[provider] = allowedTiers;
    modelByTier[provider] = Object.fromEntries(
      allowedTiers.map((tier) => [tier, MODEL_BY_PROVIDER_BY_TIER[provider][tier]])
    );
  }

  return createFeaturePolicy({ providers, modelByTier });
}

function buildPlanPolicy(planCode) {
  const normalizedPlan = normalizePlanCode(planCode);
  const planMatrix = getPlanMatrix(normalizedPlan);
  const byFeature = {};

  for (const feature of FEATURE_KEYS) {
    const featurePolicy = buildFeaturePolicy(normalizedPlan, feature);
    if (featurePolicy) byFeature[feature] = featurePolicy;
  }

  return {
    plan: normalizedPlan,
    tiers: tiersUpTo(planMatrix?.model_tier_max || planMatrix?.quality_tier || "basic"),
    byFeature,
  };
}

function policyFor(planCode) {
  const normalizedPlan = normalizePlanCode(planCode);
  if (!POLICY_CACHE.has(normalizedPlan)) {
    POLICY_CACHE.set(normalizedPlan, buildPlanPolicy(normalizedPlan));
  }
  return POLICY_CACHE.get(normalizedPlan) || buildPlanPolicy(FALLBACK_PLAN);
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
  return cloneValue(policyFor(planCode));
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
