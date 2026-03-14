import {
  getAllowedProvidersForFeature,
  getBestAllowedTierForProvider,
  getDefaultTierForMode,
  getPreferredModelForProvider,
  isModelAllowed,
} from "./aiModelPolicy.js";
import { isProviderRealRuntimeEnabled } from "./aiProviderConfig.js";

const FEATURE_PROVIDER_ORDER = {
  text_generate: {
    quality: ["openai", "gemini"],
    economy: ["gemini", "openai"],
  },
  fact_check: {
    quality: ["openai", "gemini"],
    economy: ["openai", "gemini"],
  },
  image_generate: {
    quality: ["openai", "gemini"],
    economy: ["gemini", "openai"],
  },
  image_variation: {
    quality: ["openai", "gemini"],
    economy: ["gemini", "openai"],
  },
  video_generate: {
    quality: ["runway"],
    economy: ["runway"],
  },
  music_generate: {
    quality: ["suno"],
    economy: ["suno"],
  },
  voice_generate: {
    quality: ["elevenlabs"],
    economy: ["elevenlabs"],
  },
  slides_generate: {
    quality: ["openai", "gemini"],
    economy: ["gemini", "openai"],
  },
};

const MODEL_ALIAS = {
  openai: {
    basic: "openai-basic",
    standard: "openai-standard",
    intermediate: "openai-intermediate",
    pro: "openai-pro",
  },
  gemini: {
    basic: "gemini-basic",
    standard: "gemini-standard",
    intermediate: "gemini-intermediate",
    pro: "gemini-pro",
  },
  runway: {
    basic: "runway-basic",
    standard: "runway-standard",
    intermediate: "runway-intermediate",
    pro: "runway-pro",
  },
  suno: {
    basic: "suno-basic",
    standard: "suno-standard",
    intermediate: "suno-intermediate",
    pro: "suno-pro",
  },
  elevenlabs: {
    basic: "elevenlabs-basic",
    standard: "elevenlabs-standard",
    intermediate: "elevenlabs-intermediate",
    pro: "elevenlabs-pro",
  },
};

const HEAVY_FEATURES = new Set(["video_generate", "music_generate", "voice_generate", "slides_generate"]);

function normalizeFeature(feature) {
  const normalized = String(feature || "").trim().toLowerCase();
  if (normalized.endsWith("_status")) {
    return normalized.replace(/_status$/, "_generate");
  }
  return normalized;
}

function normalizeMode(mode) {
  const normalized = String(mode || "quality").trim().toLowerCase();
  if (normalized === "economy" || normalized === "manual") return normalized;
  return "quality";
}

function normalizeRequested(requested = {}) {
  return {
    provider: String(requested?.provider || "").trim().toLowerCase() || null,
    model: String(requested?.model || "").trim() || null,
    tier: String(requested?.tier || "").trim().toLowerCase() || null,
  };
}

function getOrderedProviders(feature, mode, allowedProviders) {
  const perFeature = FEATURE_PROVIDER_ORDER[feature] || {};
  const preferred = perFeature[mode] || perFeature.quality || [];
  const allowSet = new Set((allowedProviders || []).map((item) => String(item).toLowerCase()));
  const ordered = preferred.filter((provider) => allowSet.has(provider));
  const missing = (allowedProviders || []).filter((provider) => !ordered.includes(provider));
  return [...ordered, ...missing];
}

function resolveModelAlias(provider, tier) {
  const providerKey = String(provider || "").toLowerCase();
  const tierKey = String(tier || "basic").toLowerCase();
  return MODEL_ALIAS?.[providerKey]?.[tierKey] || `${providerKey}-${tierKey}`;
}

function resolveModelForPlan({ plan, feature, provider, tier }) {
  return (
    getPreferredModelForProvider(plan, feature, provider, tier) ||
    resolveModelAlias(provider, tier)
  );
}

function tierRank(tier) {
  const value = String(tier || "").toLowerCase();
  if (value === "pro") return 4;
  if (value === "intermediate") return 3;
  if (value === "standard") return 2;
  return 1;
}

function shouldApplyProviderAvailabilityFallback(feature, mode) {
  return mode !== "manual" && HEAVY_FEATURES.has(feature);
}

export function selectProviderAndModel({ feature, plan, mode, requested, signals = {} }) {
  const featureKey = normalizeFeature(feature);
  const routingMode = normalizeMode(mode);
  const requestedSpec = normalizeRequested(requested);
  const allowedProviders = getAllowedProvidersForFeature(plan, featureKey);
  const riskLevel = String(signals?.risk || "low").toLowerCase();

  if (allowedProviders.length === 0) {
    return {
      mode: routingMode,
      selected_provider: "mock",
      selected_model: "mock",
      fallback_used: true,
      fallback_reason: routingMode === "manual" ? "model_not_allowed" : "policy_downgrade",
      requested: requestedSpec,
      rejected: routingMode === "manual",
      error: routingMode === "manual" ? "model_not_allowed" : undefined,
    };
  }

  if (routingMode === "manual" && requestedSpec.provider) {
    // In manual mode, explicit model takes precedence over tier.
    // If model is provided, tier is ignored to prevent policy bypass.
    const effectiveRequested = requestedSpec.model
      ? { ...requestedSpec, tier: null }
      : requestedSpec;
    const requestedTier = effectiveRequested.model
      ? null
      : (effectiveRequested.tier || getDefaultTierForMode("manual"));
    const requestedModel =
      effectiveRequested.model ||
      resolveModelForPlan({
        plan,
        feature: featureKey,
        provider: effectiveRequested.provider,
        tier: requestedTier,
      });
    if (isModelAllowed({
      plan,
      feature: featureKey,
      provider: effectiveRequested.provider,
      model: requestedModel,
      tier: requestedTier,
    })) {
      return {
        mode: routingMode,
        selected_provider: effectiveRequested.provider,
        selected_model: requestedModel,
        fallback_used: false,
        requested: effectiveRequested,
      };
    }

    return {
      mode: routingMode,
      selected_provider: null,
      selected_model: null,
      fallback_used: false,
      fallback_reason: "model_not_allowed",
      requested: effectiveRequested,
      rejected: true,
      error: "model_not_allowed",
    };
  }

  const orderedProviders = getOrderedProviders(featureKey, routingMode, allowedProviders);
  const fallbackMode = routingMode === "economy" ? "economy" : "quality";
  const preferredTier = routingMode === "manual" ? getDefaultTierForMode("manual") : getDefaultTierForMode(fallbackMode);
  const riskTierHint = riskLevel === "high" ? "basic" : preferredTier;
  const preferredProvider = orderedProviders[0] || null;
  const preferredTierRank = tierRank(preferredTier);
  const applyAvailabilityFallback = shouldApplyProviderAvailabilityFallback(featureKey, routingMode);
  let skippedByProviderAvailability = false;

  for (const provider of orderedProviders) {
    if (applyAvailabilityFallback && !isProviderRealRuntimeEnabled(provider)) {
      skippedByProviderAvailability = true;
      continue;
    }
    const tier = getBestAllowedTierForProvider(plan, featureKey, provider, riskTierHint);
    if (!tier) continue;
    const wasDowngraded =
      skippedByProviderAvailability || provider !== preferredProvider || tierRank(tier) < preferredTierRank;
    const fallbackReason = skippedByProviderAvailability
      ? "provider_unavailable_fallback"
      : wasDowngraded
        ? "policy_downgrade"
        : undefined;
    const selectedModel = resolveModelForPlan({
      plan,
      feature: featureKey,
      provider,
      tier,
    });
    return {
      mode: routingMode,
      selected_provider: provider,
      selected_model: selectedModel,
      fallback_used: wasDowngraded,
      fallback_reason: fallbackReason,
      requested: requestedSpec,
    };
  }

  if (applyAvailabilityFallback && skippedByProviderAvailability) {
    return {
      mode: routingMode,
      selected_provider: "mock",
      selected_model: "mock",
      fallback_used: true,
      fallback_reason: "provider_unavailable_fallback",
      requested: requestedSpec,
    };
  }

  return {
    mode: routingMode,
    selected_provider: "mock",
    selected_model: "mock",
    fallback_used: true,
    fallback_reason: "policy_downgrade",
    requested: requestedSpec,
  };
}
