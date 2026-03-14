import { AIProviderError } from "./providers/providerBase.js";
import { generateVideoReal, getVideoStatusReal } from "./providers/realVideoProvider.js";
import { resolveRealProviderMode } from "../utils/aiProviderConfig.js";
import { logger } from "../utils/logger.js";

const ALLOWED_ASPECT_RATIOS = new Set(["16:9", "9:16", "1:1"]);
const ALLOWED_QUALITIES = new Set(["low", "medium", "high"]);

function createJobId() {
  return `vid_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function buildMockGenerate({ provider = "mock", model = "mock-video-v1" } = {}) {
  return {
    ok: true,
    jobId: createJobId(),
    status: "queued",
    provider,
    model,
    estimated_seconds: 30,
    assets: {
      preview_url: "https://example.com/mock-preview.mp4",
    },
  };
}

function buildMockStatus({ jobId, provider = "mock", model = "mock-video-v1" } = {}) {
  return {
    ok: true,
    jobId,
    status: "succeeded",
    provider,
    model,
    output: {
      video_url: "https://example.com/mock-output.mp4",
      thumbnail_url: "https://example.com/mock-thumb.jpg",
    },
  };
}

function isCircuitOpenError(error) {
  return error instanceof AIProviderError && error.message === "circuit_open";
}

async function resolveMode() {
  return resolveRealProviderMode({
    feature: "video",
    providerName: "runway",
    apiKeyEnv: "RUNWAY_API_KEY",
  });
}

export async function generateVideo({
  prompt,
  imageUrl = null,
  durationSec = 8,
  aspectRatio = "16:9",
  quality = "medium",
  idempotencyKey,
  forceMock = false,
}) {
  const safePrompt = String(prompt || "").trim();
  const safeImageUrl = imageUrl ? String(imageUrl).trim() : null;
  const safeDurationSec = Number(durationSec || 8);
  const safeAspect = String(aspectRatio || "16:9").trim();
  const safeQuality = String(quality || "medium").trim().toLowerCase();

  if (
    !safePrompt ||
    safePrompt.length > 800 ||
    !ALLOWED_ASPECT_RATIOS.has(safeAspect) ||
    !ALLOWED_QUALITIES.has(safeQuality) ||
    !Number.isFinite(safeDurationSec) ||
    safeDurationSec < 4 ||
    safeDurationSec > 20
  ) {
    const error = new Error("invalid_video_request");
    error.code = "invalid_video_request";
    throw error;
  }

  if (safeImageUrl) {
    try {
      // Basic URL validation only (no fetch).
      // eslint-disable-next-line no-new
      new URL(safeImageUrl);
    } catch {
      const error = new Error("invalid_video_request");
      error.code = "invalid_video_request";
      throw error;
    }
  }

  if (forceMock === true) {
    logger.info("ai.video.force_mock_mode", { feature: "video_generate" });
    return buildMockGenerate();
  }

  const mode = await resolveMode();
  if (!mode.useReal) {
    logger.info("ai.video.mock_mode", {
      feature: "video_generate",
      reason: mode.reason,
      provider: mode.provider,
      flag_key: mode.flagKey,
    });
    return buildMockGenerate();
  }

  try {
    return await generateVideoReal({
      prompt: safePrompt,
      imageUrl: safeImageUrl,
      durationSec: safeDurationSec,
      aspectRatio: safeAspect,
      quality: safeQuality,
      idempotencyKey,
    });
  } catch (error) {
    if (isCircuitOpenError(error)) {
      logger.warn("ai.video.circuit_open_fallback_mock", {
        feature: "video_generate",
        provider: "runway",
      });
      return buildMockGenerate({ provider: "mock", model: "mock-video-v1" });
    }
    logger.error("ai.video.real_provider_failed", {
      feature: "video_generate",
      provider: "runway",
      code: error?.message || "provider_failed",
      status: error?.details?.status || null,
    });
    throw error;
  }
}

export async function getVideoStatus({ jobId, idempotencyKey, forceMock = false }) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) {
    const error = new Error("invalid_video_request");
    error.code = "invalid_video_request";
    throw error;
  }

  if (forceMock === true) {
    logger.info("ai.video.force_mock_mode", { feature: "video_status" });
    return buildMockStatus({ jobId: safeJobId });
  }

  const mode = await resolveMode();
  if (!mode.useReal) {
    logger.info("ai.video.mock_mode", {
      feature: "video_status",
      reason: mode.reason,
      provider: mode.provider,
      flag_key: mode.flagKey,
    });
    return buildMockStatus({ jobId: safeJobId });
  }

  try {
    return await getVideoStatusReal({ jobId: safeJobId, idempotencyKey });
  } catch (error) {
    if (isCircuitOpenError(error)) {
      logger.warn("ai.video.circuit_open_fallback_mock", {
        feature: "video_status",
        provider: "runway",
      });
      return buildMockStatus({ jobId: safeJobId });
    }
    logger.error("ai.video.real_provider_failed", {
      feature: "video_status",
      provider: "runway",
      code: error?.message || "provider_failed",
      status: error?.details?.status || null,
    });
    throw error;
  }
}
