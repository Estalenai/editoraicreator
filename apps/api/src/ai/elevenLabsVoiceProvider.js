import { AIProviderError } from "./providers/providerBase.js";
import { generateVoiceReal, getVoiceStatusReal } from "./providers/realVoiceProvider.js";
import { resolveRealProviderMode } from "../utils/aiProviderConfig.js";
import { logger } from "../utils/logger.js";

const ALLOWED_FORMATS = new Set(["mp3", "wav"]);
const ALLOWED_QUALITIES = new Set(["low", "medium", "high"]);

function createVoiceJobId() {
  return `vce_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function buildMockGenerate({ provider = "mock", model = "mock-voice-v1" } = {}) {
  return {
    ok: true,
    jobId: createVoiceJobId(),
    status: "queued",
    provider,
    model,
    estimated_seconds: 5,
    assets: {
      preview_url: "https://example.com/mock-preview.mp3",
    },
  };
}

function buildMockStatus({ jobId, text = "", provider = "mock", model = "mock-voice-v1" } = {}) {
  return {
    ok: true,
    jobId,
    status: "succeeded",
    provider,
    model,
    output: {
      audio_url: "https://example.com/mock-voice.mp3",
      transcript: text ? `${text.slice(0, 120)}...` : "mock transcript",
    },
  };
}

function isCircuitOpenError(error) {
  return error instanceof AIProviderError && error.message === "circuit_open";
}

async function resolveMode() {
  return resolveRealProviderMode({
    feature: "voice",
    providerName: "elevenlabs",
    apiKeyEnv: "ELEVENLABS_API_KEY",
  });
}

export async function generateVoice({
  text,
  language = "pt-BR",
  voiceId = "default",
  stability = 0.5,
  similarityBoost = 0.75,
  style = 0.2,
  format = "mp3",
  quality = "medium",
  idempotencyKey,
  forceMock = false,
}) {
  const safeText = String(text || "").trim();
  const safeLanguage = String(language || "pt-BR").trim() || "pt-BR";
  const safeVoiceId = String(voiceId || "default").trim() || "default";
  const safeStability = Number(stability);
  const safeSimilarityBoost = Number(similarityBoost);
  const safeStyle = Number(style);
  const safeFormat = String(format || "mp3").trim().toLowerCase();
  const safeQuality = String(quality || "medium").trim().toLowerCase();

  if (!safeText || safeText.length > 2000) {
    const error = new Error("invalid_voice_request");
    error.code = "invalid_voice_request";
    throw error;
  }
  if (!Number.isFinite(safeStability) || safeStability < 0 || safeStability > 1) {
    const error = new Error("invalid_voice_request");
    error.code = "invalid_voice_request";
    throw error;
  }
  if (!Number.isFinite(safeSimilarityBoost) || safeSimilarityBoost < 0 || safeSimilarityBoost > 1) {
    const error = new Error("invalid_voice_request");
    error.code = "invalid_voice_request";
    throw error;
  }
  if (!Number.isFinite(safeStyle) || safeStyle < 0 || safeStyle > 1) {
    const error = new Error("invalid_voice_request");
    error.code = "invalid_voice_request";
    throw error;
  }
  if (!ALLOWED_FORMATS.has(safeFormat) || !ALLOWED_QUALITIES.has(safeQuality)) {
    const error = new Error("invalid_voice_request");
    error.code = "invalid_voice_request";
    throw error;
  }

  if (forceMock === true) {
    logger.info("ai.voice.force_mock_mode", { feature: "voice_generate" });
    return buildMockGenerate();
  }

  const mode = await resolveMode();
  if (!mode.useReal) {
    logger.info("ai.voice.mock_mode", {
      feature: "voice_generate",
      reason: mode.reason,
      provider: mode.provider,
      flag_key: mode.flagKey,
    });
    return buildMockGenerate();
  }

  try {
    return await generateVoiceReal({
      text: safeText,
      language: safeLanguage,
      voiceId: safeVoiceId,
      stability: safeStability,
      similarityBoost: safeSimilarityBoost,
      style: safeStyle,
      format: safeFormat,
      quality: safeQuality,
      idempotencyKey,
    });
  } catch (error) {
    if (isCircuitOpenError(error)) {
      logger.warn("ai.voice.circuit_open_fallback_mock", {
        feature: "voice_generate",
        provider: "elevenlabs",
      });
      return buildMockGenerate();
    }
    logger.error("ai.voice.real_provider_failed", {
      feature: "voice_generate",
      provider: "elevenlabs",
      code: error?.message || "provider_failed",
      status: error?.details?.status || null,
    });
    throw error;
  }
}

export async function getVoiceStatus({ jobId, text = "", idempotencyKey, forceMock = false }) {
  const safeJobId = String(jobId || "").trim();
  const safeText = String(text || "").trim();
  if (!safeJobId) {
    const error = new Error("invalid_voice_request");
    error.code = "invalid_voice_request";
    throw error;
  }

  if (forceMock === true) {
    logger.info("ai.voice.force_mock_mode", { feature: "voice_status" });
    return buildMockStatus({ jobId: safeJobId, text: safeText });
  }

  const mode = await resolveMode();
  if (!mode.useReal) {
    logger.info("ai.voice.mock_mode", {
      feature: "voice_status",
      reason: mode.reason,
      provider: mode.provider,
      flag_key: mode.flagKey,
    });
    return buildMockStatus({ jobId: safeJobId, text: safeText });
  }

  try {
    return await getVoiceStatusReal({ jobId: safeJobId, idempotencyKey });
  } catch (error) {
    if (isCircuitOpenError(error)) {
      logger.warn("ai.voice.circuit_open_fallback_mock", {
        feature: "voice_status",
        provider: "elevenlabs",
      });
      return buildMockStatus({ jobId: safeJobId, text: safeText });
    }
    logger.error("ai.voice.real_provider_failed", {
      feature: "voice_status",
      provider: "elevenlabs",
      code: error?.message || "provider_failed",
      status: error?.details?.status || null,
    });
    throw error;
  }
}
