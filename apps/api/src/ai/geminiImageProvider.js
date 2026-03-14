import { AIProviderError } from "./providers/providerBase.js";
import { generateImageReal, generateVariationReal } from "./providers/realImageProvider.js";
import { resolveRealProviderMode } from "../utils/aiProviderConfig.js";
import { logger } from "../utils/logger.js";

const ALLOWED_ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16"]);
const ALLOWED_QUALITIES = new Set(["low", "medium", "high"]);

function sanitizePrompt(prompt) {
  return String(prompt || "").trim();
}

function buildMockImageUrl(seed) {
  return `https://example.com/mock-image-${seed}.png`;
}

function buildGenerateMockResponse({ prompt, style, aspectRatio, quality, count }) {
  const seedBase = Date.now();
  const images = Array.from({ length: count }).map((_, idx) => ({
    url: buildMockImageUrl(`${seedBase}-${idx + 1}`),
    prompt_hint: prompt.slice(0, 80),
    style: style || "default",
    aspect_ratio: aspectRatio,
    quality,
  }));

  return {
    images,
    provider: "mock",
    model: "mock-gemini-image-v1",
    meta: {
      prompt_chars: prompt.length,
      images_count: images.length,
    },
  };
}

function buildVariationMockResponse({ imageUrl, prompt, strength }) {
  const seed = `${Date.now()}-${Math.floor(strength * 100)}`;
  return {
    images: [
      {
        url: buildMockImageUrl(seed),
        source_image: imageUrl,
        prompt_hint: prompt.slice(0, 80),
        strength,
      },
    ],
    provider: "mock",
    model: "mock-gemini-image-v1",
    meta: {
      images_count: 1,
      strength,
    },
  };
}

function validateGenerateInput({ prompt, aspectRatio, quality, count }) {
  if (!prompt || prompt.length > 500) return false;
  if (!ALLOWED_ASPECT_RATIOS.has(aspectRatio)) return false;
  if (!ALLOWED_QUALITIES.has(quality)) return false;
  if (!Number.isInteger(count) || count <= 0 || count > 3) return false;
  return true;
}

function validateVariationInput({ imageUrl, prompt, strength }) {
  if (!String(imageUrl || "").trim()) return false;
  if (!prompt || prompt.length > 500) return false;
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) return false;
  return true;
}

function isCircuitOpenError(error) {
  return error instanceof AIProviderError && error.message === "circuit_open";
}

async function shouldUseReal() {
  return resolveRealProviderMode({
    feature: "image",
    providerName: "openai",
    apiKeyEnv: "OPENAI_API_KEY",
  });
}

export async function generateImage({
  prompt,
  style = "default",
  aspectRatio = "1:1",
  quality = "medium",
  count = 1,
  idempotencyKey,
  forceMock = false,
}) {
  const normalizedPrompt = sanitizePrompt(prompt);
  const normalizedQuality = String(quality || "medium").trim().toLowerCase();
  const normalizedAspect = String(aspectRatio || "1:1").trim();
  const normalizedCount = Number(count || 1);

  if (
    !validateGenerateInput({
      prompt: normalizedPrompt,
      aspectRatio: normalizedAspect,
      quality: normalizedQuality,
      count: normalizedCount,
    })
  ) {
    const error = new Error("invalid_image_request");
    error.code = "invalid_image_request";
    throw error;
  }

  if (forceMock === true) {
    logger.info("ai.image.force_mock_mode", {
      feature: "image_generate",
    });
    return buildGenerateMockResponse({
      prompt: normalizedPrompt,
      style,
      aspectRatio: normalizedAspect,
      quality: normalizedQuality,
      count: normalizedCount,
    });
  }

  const mode = await shouldUseReal();
  if (!mode.useReal) {
    logger.info("ai.image.mock_mode", {
      feature: "image_generate",
      reason: mode.reason,
      provider: mode.provider,
      flag_key: mode.flagKey,
    });
    return buildGenerateMockResponse({
      prompt: normalizedPrompt,
      style,
      aspectRatio: normalizedAspect,
      quality: normalizedQuality,
      count: normalizedCount,
    });
  }

  try {
    const real = await generateImageReal({
      prompt: normalizedPrompt,
      style,
      aspectRatio: normalizedAspect,
      quality: normalizedQuality,
      count: normalizedCount,
      idempotencyKey,
    });
    return real;
  } catch (error) {
    if (isCircuitOpenError(error)) {
      logger.warn("ai.image.circuit_open_fallback_mock", {
        feature: "image_generate",
        provider: "openai",
      });
      return buildGenerateMockResponse({
        prompt: normalizedPrompt,
        style,
        aspectRatio: normalizedAspect,
        quality: normalizedQuality,
        count: normalizedCount,
      });
    }
    logger.error("ai.image.real_provider_failed", {
      feature: "image_generate",
      provider: "openai",
      code: error?.message || "provider_failed",
      status: error?.details?.status || null,
    });
    throw error;
  }
}

export async function generateVariation({ imageUrl, prompt, strength = 0.35, idempotencyKey, forceMock = false }) {
  const normalizedPrompt = sanitizePrompt(prompt);
  const normalizedImageUrl = String(imageUrl || "").trim();
  const normalizedStrength = Number(strength || 0.35);

  if (!validateVariationInput({ imageUrl: normalizedImageUrl, prompt: normalizedPrompt, strength: normalizedStrength })) {
    const error = new Error("invalid_image_request");
    error.code = "invalid_image_request";
    throw error;
  }

  if (forceMock === true) {
    logger.info("ai.image.force_mock_mode", {
      feature: "image_variation",
    });
    return buildVariationMockResponse({
      imageUrl: normalizedImageUrl,
      prompt: normalizedPrompt,
      strength: normalizedStrength,
    });
  }

  const mode = await shouldUseReal();
  if (!mode.useReal) {
    logger.info("ai.image.mock_mode", {
      feature: "image_variation",
      reason: mode.reason,
      provider: mode.provider,
      flag_key: mode.flagKey,
    });
    return buildVariationMockResponse({
      imageUrl: normalizedImageUrl,
      prompt: normalizedPrompt,
      strength: normalizedStrength,
    });
  }

  try {
    const real = await generateVariationReal({
      imageUrl: normalizedImageUrl,
      prompt: normalizedPrompt,
      strength: normalizedStrength,
      idempotencyKey,
    });
    return real;
  } catch (error) {
    if (isCircuitOpenError(error)) {
      logger.warn("ai.image.circuit_open_fallback_mock", {
        feature: "image_variation",
        provider: "openai",
      });
      return buildVariationMockResponse({
        imageUrl: normalizedImageUrl,
        prompt: normalizedPrompt,
        strength: normalizedStrength,
      });
    }
    logger.error("ai.image.real_provider_failed", {
      feature: "image_variation",
      provider: "openai",
      code: error?.message || "provider_failed",
      status: error?.details?.status || null,
    });
    throw error;
  }
}
