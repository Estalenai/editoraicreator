import { ProviderNotConfiguredError } from "../ai/providers/providerBase.js";
import { factCheckReal, generateTextReal } from "../ai/providers/realTextProvider.js";
import { geminiGenerateText } from "../ai/providers/geminiProvider.js";
import { logger } from "../utils/logger.js";
import { resolveRealProviderMode } from "../utils/aiProviderConfig.js";
import {
  assertRealProviderMode,
  createProviderNotSupportedBetaError,
  rethrowProviderContractError,
} from "../utils/aiContract.js";
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

async function executeProviderWithoutRuntimeFallback({
  routing,
  feature,
  provider,
  callProvider,
}) {
  const forceMock = String(routing?.selected_provider || "").toLowerCase() === "mock";
  try {
    return await callProvider(forceMock);
  } catch (error) {
    if (isManualRouting(routing) && forceMock) {
      throw error;
    }

    logger.warn("ai.provider.execution_blocked", {
      feature,
      provider,
      code: error?.code || error?.message || "provider_failed",
      status: Number(error?.details?.status || error?.status || 0) || null,
      mode: String(routing?.mode || "quality"),
    });

    rethrowProviderContractError({ error, feature, provider });
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

async function generateTextByProvider({ provider, input }) {
  if (provider === "mock") {
    return buildMockTextResult({ prompt: input?.prompt });
  }

  if (provider === "gemini") {
    const mode = await resolveGeminiTextMode();
    assertRealProviderMode(mode, { feature: "text_generate", provider: "gemini" });

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
      if (error instanceof ProviderNotConfiguredError || isCircuitOpenError(error)) {
        logger.warn("ai.text.contract_blocked", {
          feature: "text_generate",
          provider: "gemini",
          code: error?.message || "provider_failed",
        });
      }
      rethrowProviderContractError({ error, feature: "text_generate", provider: "gemini" });
    }
  }

  if (provider !== "openai") {
    throw createProviderNotSupportedBetaError({ feature: "text_generate", provider });
  }

  const mode = await resolveTextMode();
  assertRealProviderMode(mode, { feature: "text_generate", provider: "openai" });

  try {
    return await generateTextReal({
      prompt: input?.prompt,
      language: input?.language,
      maxTokens: input?.maxTokens,
      idempotencyKey: input?.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError || isCircuitOpenError(error)) {
      logger.warn("ai.text.contract_blocked", {
        feature: "text_generate",
        provider: "openai",
        code: error?.message || "provider_failed",
      });
    }
    rethrowProviderContractError({ error, feature: "text_generate", provider: "openai" });
  }
}

export async function generateText({ input, user, plan, routing }) {
  const selectedProvider = String(routing?.selected_provider || "openai").trim().toLowerCase();
  return generateTextByProvider({ provider: selectedProvider, input, user, plan });
}

export async function factCheck({ input, user, plan, routing }) {
  const selectedProvider = String(routing?.selected_provider || "openai").trim().toLowerCase();
  if (selectedProvider === "mock") {
    return buildMockFactCheckResult({ claim: input?.text, query: input?.query });
  }

  if (selectedProvider !== "openai") {
    throw createProviderNotSupportedBetaError({ feature: "fact_check", provider: selectedProvider || "unknown" });
  }

  const mode = await resolveTextMode();
  assertRealProviderMode(mode, { feature: "fact_check", provider: "openai" });

  try {
    return await factCheckReal({
      text: input?.text,
      query: input?.query,
      language: input?.language,
      idempotencyKey: input?.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError || isCircuitOpenError(error)) {
      logger.warn("ai.fact_check.contract_blocked", {
        feature: "fact_check",
        provider: "openai",
        code: error?.message || "provider_failed",
      });
    }
    rethrowProviderContractError({ error, feature: "fact_check", provider: "openai" });
  }
}

export async function runVideoGenerate({ input, idempotencyKey, routing }) {
  return executeProviderWithoutRuntimeFallback({
    routing,
    feature: "video_generate",
    provider: "runway",
    callProvider: (forceMock) => runwayGenerateVideo({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runVideoStatus({ input, idempotencyKey, routing }) {
  return executeProviderWithoutRuntimeFallback({
    routing,
    feature: "video_status",
    provider: "runway",
    callProvider: (forceMock) => runwayGetVideoStatus({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runMusicGenerate({ input, idempotencyKey, routing }) {
  return executeProviderWithoutRuntimeFallback({
    routing,
    feature: "music_generate",
    provider: "suno",
    callProvider: (forceMock) => sunoGenerateMusic({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runMusicStatus({ input, idempotencyKey, routing }) {
  return executeProviderWithoutRuntimeFallback({
    routing,
    feature: "music_status",
    provider: "suno",
    callProvider: (forceMock) => sunoGetMusicStatus({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runVoiceGenerate({ input, idempotencyKey, routing }) {
  return executeProviderWithoutRuntimeFallback({
    routing,
    feature: "voice_generate",
    provider: "elevenlabs",
    callProvider: (forceMock) => elevenGenerateVoice({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runVoiceStatus({ input, idempotencyKey, routing }) {
  return executeProviderWithoutRuntimeFallback({
    routing,
    feature: "voice_status",
    provider: "elevenlabs",
    callProvider: (forceMock) => elevenGetVoiceStatus({ ...(input || {}), idempotencyKey, forceMock }),
  });
}

export async function runSlidesGenerate({ input, idempotencyKey, routing }) {
  const selectedProvider = String(routing?.selected_provider || "openai").trim().toLowerCase() || "openai";
  return executeProviderWithoutRuntimeFallback({
    routing,
    feature: "slides_generate",
    provider: selectedProvider,
    callProvider: async (forceMock) => {
      if (forceMock || selectedProvider === "mock") {
        return buildMockSlidesGenerate();
      }
      throw createProviderNotSupportedBetaError({ feature: "slides_generate", provider: selectedProvider });
    },
  });
}

export async function runSlidesStatus({ input, idempotencyKey, routing }) {
  const selectedProvider = String(routing?.selected_provider || "openai").trim().toLowerCase() || "openai";
  return executeProviderWithoutRuntimeFallback({
    routing,
    feature: "slides_status",
    provider: selectedProvider,
    callProvider: async (forceMock) => {
      if (forceMock || selectedProvider === "mock") {
        return buildMockSlidesStatus({ jobId: input?.jobId });
      }
      throw createProviderNotSupportedBetaError({ feature: "slides_status", provider: selectedProvider });
    },
  });
}
