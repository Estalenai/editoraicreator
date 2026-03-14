import { isAIMockForced, isRealAIEnabled } from "./aiFlags.js";
import { getConfig } from "./configCache.js";
import { logger } from "./logger.js";

const FEATURE_FLAG_KEYS = {
  text: "enable_real_text",
  image: "enable_real_image",
  video: "enable_real_video",
  music: "enable_real_music",
  voice: "enable_real_voice",
  slides: "enable_real_slides",
};

const PROVIDER_API_KEY_ENV = {
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  runway: "RUNWAY_API_KEY",
  suno: "SUNO_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
};

function parseBoolLike(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "object" && "enabled" in value) {
    return parseBoolLike(value.enabled, fallback);
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return fallback;
}

export async function resolveRealProviderMode({ feature, providerName, apiKeyEnv }) {
  const globalRealEnabled = isRealAIEnabled();
  const mockForced = isAIMockForced();
  const keyPresent = Boolean(String(process.env[apiKeyEnv] || "").trim());
  const flagKey = FEATURE_FLAG_KEYS[String(feature || "").trim()] || null;

  let featureEnabled = globalRealEnabled;
  let source = "global_default";
  if (flagKey) {
    try {
      const cfgValue = await getConfig(flagKey);
      if (cfgValue != null) {
        featureEnabled = parseBoolLike(cfgValue, globalRealEnabled);
        source = "config";
      }
    } catch (error) {
      logger.warn("ai.provider_flag_lookup_failed", {
        feature,
        provider: providerName,
        flag_key: flagKey,
        message: error?.message || "unknown_error",
      });
      featureEnabled = globalRealEnabled;
      source = "config_fallback_global";
    }
  }

  const useReal = globalRealEnabled && !mockForced && featureEnabled && keyPresent;
  let reason = "real_enabled";
  if (!globalRealEnabled) reason = "global_flag_disabled";
  else if (mockForced) reason = "mock_forced";
  else if (!featureEnabled) reason = "feature_flag_disabled";
  else if (!keyPresent) reason = "missing_api_key";

  return {
    useReal,
    mode: useReal ? "real" : "mock",
    reason,
    flagKey,
    source,
    provider: providerName,
    feature,
    globalRealEnabled,
    mockForced,
    featureEnabled,
    keyPresent,
  };
}

export function providerModeFromName(providerName) {
  return String(providerName || "").toLowerCase() === "mock" ? "mock" : "real";
}

export function isProviderApiKeyConfigured(providerName) {
  const key = PROVIDER_API_KEY_ENV[String(providerName || "").trim().toLowerCase()];
  if (!key) return false;
  return Boolean(String(process.env[key] || "").trim());
}

export function isProviderRealRuntimeEnabled(providerName) {
  const normalized = String(providerName || "").trim().toLowerCase();
  if (!normalized || normalized === "mock") return true;
  return isRealAIEnabled() && !isAIMockForced() && isProviderApiKeyConfigured(normalized);
}
