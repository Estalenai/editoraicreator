import { AIProviderError, ProviderNotConfiguredError } from "../ai/providers/providerBase.js";
import { factCheckReal, generateTextReal } from "../ai/providers/realTextProvider.js";
import { geminiGenerateText } from "../ai/providers/geminiProvider.js";
import { logger } from "../utils/logger.js";
import { resolveRealProviderMode } from "../utils/aiProviderConfig.js";
import { generateVideo as runwayGenerateVideo, getVideoStatus as runwayGetVideoStatus } from "../ai/runwayVideoProvider.js";
import { generateMusic as sunoGenerateMusic, getMusicStatus as sunoGetMusicStatus } from "../ai/sunoMusicProvider.js";
import { generateVoice as elevenGenerateVoice, getVoiceStatus as elevenGetVoiceStatus } from "../ai/elevenLabsVoiceProvider.js";

function buildMockTextResult({ prompt }) {
  return {
    output: {
      text: `Mock response: ${String(prompt || "").trim() || "no prompt provided"}`,
    },
    provider: "mock",
    model: "mock-v1",
    meta: {
      usage: {
        input_tokens: Math.max(1, Math.ceil(String(prompt || "").length / 4)),
        output_tokens: 32,
      },
      provider_mode: "mock",
    },
  };
}

function buildMockFactCheckResult({ claim, query }) {
  const claimText = String(claim || "").trim();
  const queryText = String(query || "").trim();
  return {
    output: {
      verdict: "INSUFFICIENT",
      confidence: 65,
      summary: `Mock fact-check for: ${claimText || "no claim"}`,
      citations: [],
      sources: queryText
        ? [{ title: "Mock source", url: "https://example.com/mock", snippet: `Query: ${queryText}`, source: "mock" }]
        : [],
    },
    provider: "mock",
    model: "mock-v1",
    meta: {
      usage: {
        input_tokens: Math.max(1, Math.ceil((claimText.length + queryText.length) / 4)),
        output_tokens: 48,
      },
      search_provider: "mock",
      provider_mode: "mock",
    },
  };
}

function createSlidesJobId() {
  return `sld_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function buildMockSlidesGenerate() {
  return {
    jobId: createSlidesJobId(),
    status: "queued",
    estimated_seconds: 25,
    assets: {
      preview_url: "https://example.com/mock-slides-preview",
    },
    provider: "mock",
    model: "mock-slides-v1",
  };
}

function buildMockSlidesStatus({ jobId }) {
  return {
    jobId: String(jobId || createSlidesJobId()),
    status: "succeeded",
    output: {
      slides_url: "https://example.com/mock-slides-url",
      pdf_url: "https://example.com/mock-slides.pdf",
    },
    provider: "mock",
    model: "mock-slides-v1",
  };
}

function isCircuitOpenError(error) {
  return String(error?.message || "").toLowerCase() === "circuit_open";
}

function isManualRouting(routing) {
  return String(routing?.mode || "").trim().toLowerCase() === "manual";
}

function isProviderUnavailableError(error) {
  if (error instanceof ProviderNotConfiguredError) return true;
  if (error instanceof AIProviderError) {
    const status = Number(error?.details?.status || 0);
    if (status === 401 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500) {
      return true;
    }
  }
  const message = String(error?.message || "").trim().toLowerCase();
  if (!message) return false;
  return (
    message.includes("provider_unavailable") ||
    message.includes("provider not configured") ||
    message.includes("missing_api_key") ||
    message.includes("unauthorized") ||
    message.includes("upstream_http_error") ||
    message.includes("upstream_timeout") ||
    message.includes("upstream_request_failed") ||
    message.includes("api key")
  );
}

function applyProviderUnavailableFallbackRouting(routing, mockModel) {
  if (!routing || typeof routing !== "object") return;
  routing.selected_provider = "mock";
  routing.selected_model = mockModel || "mock";
  routing.fallback_used = true;
  routing.fallback_reason = "provider_unavailable_fallback";
  routing.provider_mode = "mock";
}

async function executeHeavyProviderWithFallback({
  routing,
  feature,
  provider,
  mockModel,
  callProvider,
}) {
  const forceMock = String(routing?.selected_provider || "").toLowerCase() === "mock";
  try {
    return await callProvider(forceMock);
  } catch (error) {
    if (isManualRouting(routing) || !isProviderUnavailableError(error)) {
      throw error;
    }

    logger.warn("ai.heavy.provider_unavailable_fallback_mock", {
      feature,
      provider,
      code: error?.message || "provider_unavailable",
      status: Number(error?.details?.status || 0) || null,
      mode: String(routing?.mode || "quality"),
    });

    applyProviderUnavailableFallbackRouting(routing, mockModel);
    return callProvider(true);
  }
}

async function resolveTextMode() {
  return resolveRealProviderMode({
    feature: "text",
    providerName: "openai",
    apiKeyEnv: "OPENAI_API_KEY",
  });
}

async function resolveGeminiTextMode() {
  return resolveRealProviderMode({
    feature: "text",
    providerName: "gemini",
    apiKeyEnv: "GEMINI_API_KEY",
  });
}

function estimateUsageTokens(text = "") {
  const chars = String(text || "").length;
  return Math.max(1, Math.ceil(chars / 4));
}

async function generateTextByProvider({ provider, input, plan, user }) {
  if (provider === "mock") {
    return buildMockTextResult({ prompt: input?.prompt });
  }

  if (provider === "gemini") {
    const mode = await resolveGeminiTextMode();
    if (!mode.useReal) {
      logger.info("ai.text.mock_mode", {
        feature: "text_generate",
        reason: mode.reason,
        provider: mode.provider,
        plan: plan?.code || null,
        userId: user?.id ? `${String(user.id).slice(0, 6)}...${String(user.id).slice(-4)}` : null,
      });
      return buildMockTextResult({ prompt: input?.prompt });
    }

    try {
      const result = await geminiGenerateText({
        prompt: input?.prompt,
        system: `You are a concise writing assistant. Reply in ${String(input?.language || "pt-BR")}.`,
      });
      return {
        output: { text: String(result?.text || "") },
        provider: "gemini",
        model: String(result?.model || "gemini-1.5-flash"),
        meta: {
          usage: {
            input_tokens: estimateUsageTokens(input?.prompt),
            output_tokens: estimateUsageTokens(result?.text),
          },
        },
      };
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) {
        logger.warn("ai.text.real_provider_missing_key_fallback_mock", {
          feature: "text_generate",
          provider: "gemini",
        });
        return buildMockTextResult({ prompt: input?.prompt });
      }
      if (isCircuitOpenError(error)) {
        logger.warn("ai.text.circuit_open_fallback_mock", {
          feature: "text_generate",
          provider: "gemini",
        });
        return buildMockTextResult({ prompt: input?.prompt });
      }
      throw error;
    }
  }

  const mode = await resolveTextMode();
  if (!mode.useReal) {
    logger.info("ai.text.mock_mode", {
      feature: "text_generate",
      reason: mode.reason,
      provider: mode.provider,
      plan: plan?.code || null,
      userId: user?.id ? `${String(user.id).slice(0, 6)}...${String(user.id).slice(-4)}` : null,
    });
    return buildMockTextResult({ prompt: input?.prompt });
  }

  try {
    return await generateTextReal({
      prompt: input?.prompt,
      language: input?.language,
      maxTokens: input?.maxTokens,
      idempotencyKey: input?.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      logger.warn("ai.text.real_provider_missing_key_fallback_mock", {
        feature: "text_generate",
        provider: "openai",
      });
      return buildMockTextResult({ prompt: input?.prompt });
    }
    if (isCircuitOpenError(error)) {
      logger.warn("ai.text.circuit_open_fallback_mock", {
        feature: "text_generate",
        provider: "openai",
      });
      return buildMockTextResult({ prompt: input?.prompt });
    }
    throw error;
  }
}

export async function generateText({ input, user, plan, routing }) {
  const selectedProvider = String(routing?.selected_provider || "openai").trim().toLowerCase();
  return generateTextByProvider({ provider: selectedProvider, input, user, plan });
}

export async function factCheck({ input, user, plan, routing }) {
  const selectedProvider = String(routing?.selected_provider || "openai").trim().toLowerCase();
  if (selectedProvider !== "openai") {
    // Fact-check remains stabilized on OpenAI path in Beta.
    return buildMockFactCheckResult({ claim: input?.text, query: input?.query });
  }

  const mode = await resolveTextMode();
  if (!mode.useReal) {
    logger.info("ai.text.mock_mode", {
      feature: "fact_check",
      reason: mode.reason,
      provider: mode.provider,
      plan: plan?.code || null,
      userId: user?.id ? `${String(user.id).slice(0, 6)}...${String(user.id).slice(-4)}` : null,
    });
    return buildMockFactCheckResult({ claim: input?.text, query: input?.query });
  }

  try {
    return await factCheckReal({
      text: input?.text,
      query: input?.query,
      language: input?.language,
      idempotencyKey: input?.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      logger.warn("ai.text.real_provider_missing_key_fallback_mock", {
        feature: "fact_check",
        provider: "openai",
      });
      return buildMockFactCheckResult({ claim: input?.text, query: input?.query });
    }
    if (isCircuitOpenError(error)) {
      logger.warn("ai.text.circuit_open_fallback_mock", {
        feature: "fact_check",
        provider: "openai",
      });
      return buildMockFactCheckResult({ claim: input?.text, query: input?.query });
    }
    throw error;
  }
}

export async function runVideoGenerate({ input, idempotencyKey, routing }) {
  return executeHeavyProviderWithFallback({
    routing,
    feature: "video_generate",
    provider: "runway",
    mockModel: "mock-video-v1",
    callProvider: (forceMock) => runwayGenerateVideo({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runVideoStatus({ input, idempotencyKey, routing }) {
  return executeHeavyProviderWithFallback({
    routing,
    feature: "video_status",
    provider: "runway",
    mockModel: "mock-video-v1",
    callProvider: (forceMock) => runwayGetVideoStatus({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runMusicGenerate({ input, idempotencyKey, routing }) {
  return executeHeavyProviderWithFallback({
    routing,
    feature: "music_generate",
    provider: "suno",
    mockModel: "mock-music-v1",
    callProvider: (forceMock) => sunoGenerateMusic({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runMusicStatus({ input, idempotencyKey, routing }) {
  return executeHeavyProviderWithFallback({
    routing,
    feature: "music_status",
    provider: "suno",
    mockModel: "mock-music-v1",
    callProvider: (forceMock) => sunoGetMusicStatus({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runVoiceGenerate({ input, idempotencyKey, routing }) {
  return executeHeavyProviderWithFallback({
    routing,
    feature: "voice_generate",
    provider: "elevenlabs",
    mockModel: "mock-voice-v1",
    callProvider: (forceMock) => elevenGenerateVoice({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runVoiceStatus({ input, idempotencyKey, routing }) {
  return executeHeavyProviderWithFallback({
    routing,
    feature: "voice_status",
    provider: "elevenlabs",
    mockModel: "mock-voice-v1",
    callProvider: (forceMock) => elevenGetVoiceStatus({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runSlidesGenerate({ input, idempotencyKey, routing }) {
  const selectedProvider = String(routing?.selected_provider || "openai").trim().toLowerCase() || "openai";
  return executeHeavyProviderWithFallback({
    routing,
    feature: "slides_generate",
    provider: selectedProvider,
    mockModel: "mock-slides-v1",
    callProvider: async (forceMock) => {
      if (forceMock || selectedProvider === "mock") {
        return buildMockSlidesGenerate();
      }
      throw new ProviderNotConfiguredError(selectedProvider);
    },
  });
}

export async function runSlidesStatus({ input, idempotencyKey, routing }) {
  const selectedProvider = String(routing?.selected_provider || "openai").trim().toLowerCase() || "openai";
  return executeHeavyProviderWithFallback({
    routing,
    feature: "slides_status",
    provider: selectedProvider,
    mockModel: "mock-slides-v1",
    callProvider: async (forceMock) => {
      if (forceMock || selectedProvider === "mock") {
        return buildMockSlidesStatus({ jobId: input?.jobId });
      }
      throw new ProviderNotConfiguredError(selectedProvider);
    },
  });
}
