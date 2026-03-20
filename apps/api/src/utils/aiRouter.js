import {
  getAllowedProvidersForFeature,
  getBestAllowedTierForProvider,
  getDefaultTierForMode,
  getPreferredModelForProvider,
  isModelAllowed,
} from "./aiModelPolicy.js";
import { isAIMockForced } from "./aiFlags.js";

const FEATURE_PROVIDER_ORDER = {
  text_generate: {
    quality: ["openai", "gemini"],
    economy: ["gemini", "openai"],
  },
  fact_check: {
    quality: ["openai"],
    economy: ["openai"],
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
    quality: [],
    economy: [],
  },
};

const FEATURE_SUPPORTED_PROVIDERS = {
  text_generate: new Set(["openai", "gemini"]),
  fact_check: new Set(["openai"]),
  image_generate: new Set(["openai", "gemini"]),
  image_variation: new Set(["openai", "gemini"]),
  video_generate: new Set(["runway"]),
  music_generate: new Set(["suno"]),
  voice_generate: new Set(["elevenlabs"]),
  slides_generate: new Set([]),
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

function filterSupportedProviders(feature, providers) {
  const supported = FEATURE_SUPPORTED_PROVIDERS[feature] || new Set();
  return (providers || []).filter((provider) => supported.has(String(provider || "").trim().toLowerCase()));
}

function buildRejectedSelection({
  mode,
  requested,
  error,
  fallbackReason,
  selectedProvider = null,
  selectedModel = null,
}) {
  return {
    mode,
    selected_provider: selectedProvider,
    selected_model: selectedModel,
    provider_mode: selectedProvider === "mock" ? "mock" : selectedProvider ? "real" : null,
    fallback_used: false,
    fallback_reason: fallbackReason,
    requested,
    rejected: true,
    error,
  };
}

export function selectProviderAndModel({ feature, plan, mode, requested, signals = {} }) {
  const featureKey = normalizeFeature(feature);
  const routingMode = normalizeMode(mode);
  const requestedSpec = normalizeRequested(requested);
  const allowedProviders = filterSupportedProviders(featureKey, getAllowedProvidersForFeature(plan, featureKey));
  const riskLevel = String(signals?.risk || "low").toLowerCase();

  if (routingMode === "manual" && requestedSpec.provider === "mock") {
    if (!isAIMockForced()) {
      return buildRejectedSelection({
        mode: routingMode,
        requested: requestedSpec,
        error: "mock_requires_explicit_request",
        fallbackReason: "mock_requires_explicit_request",
      });
    }
    return {
      mode: routingMode,
      selected_provider: "mock",
      selected_model: requestedSpec.model || "mock",
      provider_mode: "mock",
      fallback_used: false,
      fallback_reason: "explicit_beta_mock",
      requested: requestedSpec,
    };
  }

  if (allowedProviders.length === 0) {
    return buildRejectedSelection({
      mode: routingMode,
      requested: requestedSpec,
      error: "provider_not_supported_beta",
      fallbackReason: "provider_not_supported_beta",
    });
  }

  if (routingMode === "manual" && requestedSpec.provider) {
    if (!allowedProviders.includes(requestedSpec.provider)) {
      return buildRejectedSelection({
        mode: routingMode,
        requested: requestedSpec,
        error: "provider_not_supported_beta",
        fallbackReason: "provider_not_supported_beta",
      });
    }

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
        provider_mode: effectiveRequested.provider === "mock" ? "mock" : "real",
        fallback_used: false,
        requested: effectiveRequested,
      };
    }

    return buildRejectedSelection({
      mode: routingMode,
      requested: effectiveRequested,
      error: "model_not_allowed",
      fallbackReason: "model_not_allowed",
    });
  }

  const orderedProviders = getOrderedProviders(featureKey, routingMode, allowedProviders);
  const fallbackMode = routingMode === "economy" ? "economy" : "quality";
  const preferredTier = routingMode === "manual" ? getDefaultTierForMode("manual") : getDefaultTierForMode(fallbackMode);
  const riskTierHint = riskLevel === "high" ? "basic" : preferredTier;
  const preferredProvider = orderedProviders[0] || null;
  const preferredTierRank = tierRank(preferredTier);

  for (const provider of orderedProviders) {
    const tier = getBestAllowedTierForProvider(plan, featureKey, provider, riskTierHint);
    if (!tier) continue;
    const wasDowngraded = provider !== preferredProvider || tierRank(tier) < preferredTierRank;
    const fallbackReason = wasDowngraded ? "policy_downgrade" : undefined;
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
      provider_mode: provider === "mock" ? "mock" : "real",
      fallback_used: wasDowngraded,
      fallback_reason: fallbackReason,
      requested: requestedSpec,
    };
  }

  return buildRejectedSelection({
    mode: routingMode,
    requested: requestedSpec,
    error: "provider_not_supported_beta",
    fallbackReason: "provider_not_supported_beta",
  });
}
