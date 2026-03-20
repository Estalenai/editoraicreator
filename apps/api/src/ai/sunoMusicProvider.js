import { AIProviderError } from "./providers/providerBase.js";
import { generateMusicReal, getMusicStatusReal } from "./providers/realMusicProvider.js";
import { resolveRealProviderMode } from "../utils/aiProviderConfig.js";
import { assertRealProviderMode, rethrowProviderContractError } from "../utils/aiContract.js";
import { logger } from "../utils/logger.js";

const ALLOWED_QUALITIES = new Set(["low", "medium", "high"]);

function createMusicJobId() {
  return `mus_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function buildMockGenerate({ provider = "mock", model = "mock-music-v1" } = {}) {
  return {
    ok: true,
    jobId: createMusicJobId(),
    status: "queued",
    provider,
    model,
    estimated_seconds: 20,
    assets: {
      preview_url: "https://example.com/mock-preview.mp3",
    },
  };
}

function buildMockStatus({ jobId, provider = "mock", model = "mock-music-v1" } = {}) {
  return {
    ok: true,
    jobId,
    status: "succeeded",
    provider,
    model,
    output: {
      audio_url: "https://example.com/mock-output.mp3",
      waveform_url: "https://example.com/mock-waveform.json",
    },
  };
}

function isCircuitOpenError(error) {
  return error instanceof AIProviderError && error.message === "circuit_open";
}

async function resolveMode() {
  return resolveRealProviderMode({
    feature: "music",
    providerName: "suno",
    apiKeyEnv: "SUNO_API_KEY",
  });
}

export async function generateMusic({
  prompt,
  lyrics = "",
  style = "",
  durationSec = 30,
  quality = "medium",
  idempotencyKey,
  forceMock = false,
}) {
  const safePrompt = String(prompt || "").trim();
  const safeLyrics = String(lyrics || "").trim();
  const safeStyle = String(style || "").trim();
  const safeDurationSec = Number(durationSec || 30);
  const safeQuality = String(quality || "medium").trim().toLowerCase();

  if (
    !safePrompt ||
    safePrompt.length > 800 ||
    safeLyrics.length > 3000 ||
    safeStyle.length > 200 ||
    !Number.isFinite(safeDurationSec) ||
    safeDurationSec < 10 ||
    safeDurationSec > 180 ||
    !ALLOWED_QUALITIES.has(safeQuality)
  ) {
    const error = new Error("invalid_music_request");
    error.code = "invalid_music_request";
    throw error;
  }

  if (forceMock === true) {
    logger.info("ai.music.force_mock_mode", { feature: "music_generate" });
    return buildMockGenerate();
  }

  const mode = await resolveMode();
  assertRealProviderMode(mode, { feature: "music_generate", provider: "suno" });

  try {
    return await generateMusicReal({
      prompt: safePrompt,
      lyrics: safeLyrics,
      style: safeStyle,
      durationSec: safeDurationSec,
      quality: safeQuality,
      idempotencyKey,
    });
  } catch (error) {
    if (isCircuitOpenError(error)) {
      logger.warn("ai.music.circuit_open_blocked", {
        feature: "music_generate",
        provider: "suno",
      });
    }
    logger.error("ai.music.real_provider_failed", {
      feature: "music_generate",
      provider: "suno",
      code: error?.message || "provider_failed",
      status: error?.details?.status || null,
    });
    rethrowProviderContractError({ error, feature: "music_generate", provider: "suno" });
  }
}

export async function getMusicStatus({ jobId, idempotencyKey, forceMock = false }) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) {
    const error = new Error("invalid_music_request");
    error.code = "invalid_music_request";
    throw error;
  }

  if (forceMock === true) {
    logger.info("ai.music.force_mock_mode", { feature: "music_status" });
    return buildMockStatus({ jobId: safeJobId });
  }

  const mode = await resolveMode();
  assertRealProviderMode(mode, { feature: "music_status", provider: "suno" });

  try {
    return await getMusicStatusReal({ jobId: safeJobId, idempotencyKey });
  } catch (error) {
    if (isCircuitOpenError(error)) {
      logger.warn("ai.music.circuit_open_blocked", {
        feature: "music_status",
        provider: "suno",
      });
    }
    logger.error("ai.music.real_provider_failed", {
      feature: "music_status",
      provider: "suno",
      code: error?.message || "provider_failed",
      status: error?.details?.status || null,
    });
    rethrowProviderContractError({ error, feature: "music_status", provider: "suno" });
  }
}
