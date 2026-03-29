// apps/api/src/routes/aiRoutes.js
import express from "express";
import { ipKeyGenerator } from "express-rate-limit";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { attachPlan } from "../middlewares/planMiddleware.js";
import { featureRateLimit } from "../middlewares/featureRateLimit.js";
import { requireFeature } from "../middlewares/featureMiddleware.js";
import { adminOnly, isAdminUser } from "../utils/adminAuth.js";
import { getConfig } from "../utils/configCache.js";
import { logger } from "../utils/logger.js";
import { debitThenExecuteOrRefund } from "../utils/debitThenExecuteOrRefund.js";
import { buildRequestHash as buildRequestHashUtil, trackUsage } from "../utils/usageTracking.js";
import { isAIDisabled } from "../utils/aiFlags.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";
import { ensureCreditsOrAutoConvert } from "../services/autoConvertService.js";
import { canUseAvatarPreview } from "../utils/coinsProductRules.js";
import { resolveLang, t } from "../utils/i18n.js";
import { buildAiContractErrorPayload, getAiContractErrorCode, getAiContractErrorStatus } from "../utils/aiContract.js";
import { applyHeavyFeatureAbuseGuards, recordRiskOutcome } from "../utils/abuseMitigation.js";
import { selectProviderAndModel } from "../utils/aiRouter.js";
import { getPlanAvatarPreviewLimits, validatePlanFeatureRequest } from "../utils/planRuntimeGuards.js";
import { metricIncrement, metricTiming, recordUsageMetric } from "../utils/metrics.js";
import { extractRoutingInput, normalizeRoutingMode } from "../utils/aiRoutingInput.js";
import {
  factCheck as runFactCheck,
  generateText as runGenerateText,
  runVideoGenerate,
  runVideoStatus,
  runMusicGenerate,
  runMusicStatus,
  runVoiceGenerate,
  runVoiceStatus,
  runSlidesGenerate,
  runSlidesStatus,
} from "../aiProviders/index.js";
import { generateImage as runGenerateImage, generateVariation as runGenerateVariation } from "../ai/geminiImageProvider.js";

const router = express.Router();
const IDEM_MEM_TTL_MS = 10 * 60 * 1000;
const aiIdemMemCache = new Map();
const IS_DEV = process.env.NODE_ENV === "development";
const AI_PER_MINUTE_LIMIT = 30;
const aiQuotaWindowMs = 60_000;
const aiQuotaMap = new Map();
const AVATAR_IDS = new Set(["ava_01", "ava_02", "ava_03"]);
const AI_ROUTE_COST_SCORE = {
  text_generate: 1,
  fact_check: 1.2,
  image_generate: 1.5,
  image_variation: 1.3,
  video_generate: 6,
  video_status: 1,
  music_generate: 5,
  music_status: 1,
  voice_generate: 4,
  voice_status: 1,
  slides_generate: 4,
  slides_status: 1,
  avatar_start: 2,
  avatar_message: 1,
  avatar_end: 0.5,
};

const MAX_TOKENS_BY_TIER = {
  common: 500,
  pro: 1500,
  ultra: 3000,
};

router.use((req, res, next) => {
  if (!req.aiRouting || typeof req.aiRouting !== "object") {
    req.aiRouting = { mode: "quality", fallback_used: false };
  }
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    const routingMode = String(req.aiRouting?.mode || "quality").toLowerCase();
    res.setHeader("X-AI-Routing-Mode", routingMode);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return originalJson(payload);
    }
    const provider = String(payload?.provider || "").trim().toLowerCase();
    const existingRouting = payload?.routing && typeof payload.routing === "object" ? payload.routing : null;
    const isErrorPayload = Boolean(payload?.error);
    const providerFromPayload = String(payload?.provider || "").trim().toLowerCase();
    const selectedProviderRaw = req.aiRouting?.selected_provider;
    const selectedProvider =
      (selectedProviderRaw == null ? "" : String(selectedProviderRaw).trim().toLowerCase()) ||
      providerFromPayload ||
      null;
    const providerHeaderValue = provider || String(selectedProvider || "").trim().toLowerCase();
    if (providerHeaderValue) {
      res.setHeader("X-AI-Provider-Mode", providerHeaderValue === "mock" ? "mock" : "real");
    } else {
      res.setHeader("X-AI-Provider-Mode", "n/a");
    }
    let fallbackUsed = Boolean(req.aiRouting?.fallback_used || false);
    let fallbackReason = req.aiRouting?.fallback_reason ? String(req.aiRouting.fallback_reason) : null;
    if (providerFromPayload === "mock" && selectedProvider && selectedProvider !== "mock" && !fallbackUsed) {
      fallbackUsed = true;
      fallbackReason = fallbackReason || "provider_runtime_fallback";
    }
    const selectedModelRaw = req.aiRouting?.selected_model;
    const selectedModel =
      selectedModelRaw == null
        ? (req.aiRouting?.rejected === true || isErrorPayload ? null : String(payload?.model || "").trim() || null)
        : selectedModelRaw;
    const computedRouting = {
      mode: routingMode,
      selected_provider: selectedProvider,
      selected_model: selectedModel,
      fallback_used: fallbackUsed,
    };
    if (req.aiRouting?.requested && typeof req.aiRouting.requested === "object") {
      computedRouting.requested = req.aiRouting.requested;
    }
    if (fallbackReason) {
      computedRouting.fallback_reason = fallbackReason;
    }
    const withRouting = existingRouting
      ? { ...payload, routing: { ...computedRouting, ...existingRouting } }
      : { ...payload, routing: computedRouting };
    req.aiMetricPayload = withRouting;
    return originalJson(withRouting);
  };
  next();
});

function resolveHeavyRiskFeatureFromPath(pathname) {
  const path = String(pathname || "");
  if (path.startsWith("/video-")) return "ai_video_generate";
  if (path.startsWith("/music-")) return "ai_music_generate";
  if (path.startsWith("/voice-")) return "ai_voice_generate";
  if (path.startsWith("/slides-")) return "ai_slides_generate";
  return null;
}

router.use((req, res, next) => {
  res.on("finish", () => {
    const status = Number(res.statusCode || 0);
    if (status !== 409 && status !== 429) return;
    const featureKey = resolveHeavyRiskFeatureFromPath(req.path);
    if (!featureKey) return;
    recordRiskOutcome(req, { featureKey, statusCode: status });
  });
  next();
});

function resolveMetricFeatureFromPath(pathname) {
  const path = String(pathname || "").trim().toLowerCase();
  if (path === "/text-generate") return "text_generate";
  if (path === "/fact-check") return "fact_check";
  if (path === "/image-generate") return "image_generate";
  if (path === "/image-variation") return "image_variation";
  if (path === "/video-generate") return "video_generate";
  if (path === "/video-status") return "video_status";
  if (path === "/music-generate") return "music_generate";
  if (path === "/music-status") return "music_status";
  if (path === "/voice-generate") return "voice_generate";
  if (path === "/voice-status") return "voice_status";
  if (path === "/slides-generate") return "slides_generate";
  if (path === "/slides-status") return "slides_status";
  if (path === "/avatar/start") return "avatar_start";
  if (path === "/avatar/message") return "avatar_message";
  if (path === "/avatar/end") return "avatar_end";
  return null;
}

function estimateCostScoreForMetric(feature, statusCode, errorCode) {
  if (Number(statusCode || 0) >= 400 || String(errorCode || "") === "insufficient_balance") return 0;
  return Number(AI_ROUTE_COST_SCORE[feature] || 0);
}

router.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const feature = resolveMetricFeatureFromPath(req.path);
    if (!feature) return;

    const statusCode = Number(res.statusCode || 0);
    const payload = req.aiMetricPayload && typeof req.aiMetricPayload === "object" ? req.aiMetricPayload : null;
    const routing = payload?.routing && typeof payload.routing === "object" ? payload.routing : req.aiRouting || {};
    const plan = String(req?.plan?.code || "FREE");
    const mode = String(routing?.mode || "quality").toLowerCase();
    const provider = String(payload?.provider || routing?.selected_provider || "n/a").toLowerCase();
    const errorCode = payload?.error ? String(payload.error) : statusCode >= 400 ? `http_${statusCode}` : null;
    const latencyMs = Date.now() - startedAt;
    const totalCostScore = estimateCostScoreForMetric(feature, statusCode, errorCode);

    metricIncrement("ai.feature.call", {
      feature,
      plan,
      mode,
      provider,
      status: String(statusCode),
    });
    metricTiming("ai.feature.latency_ms", latencyMs, {
      feature,
      plan,
      mode,
      provider,
    });
    if (errorCode) {
      metricIncrement("ai.feature.error", {
        feature,
        plan,
        mode,
        provider,
        error: errorCode,
      });
    }

    recordUsageMetric({
      userId: req?.user?.id || null,
      feature,
      plan,
      mode,
      provider,
      statusCode,
      errorCode,
      totalCostScore,
    });
  });
  next();
});

/**
 * PASSO 10 — Integração real de IA (Autocrie.ai)
 * - Multi-provedor (OpenAI/Gemini/Anthropic) via ENV
 * - Logs em ai_usage (service role)
 * - Cobrança em Creator Coins com compensação (refund idempotente em falha do provider)
 */

function getFinancialDbOrThrow() {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    const err = new Error("supabase_admin_unavailable_for_financial_rpc");
    err.status = 503;
    err.payload = { error: "supabase_admin_unavailable_for_financial_rpc" };
    throw err;
  }
  return supabaseAdmin;
}

function getIdempotencyDb(req) {
  if (isSupabaseAdminEnabled() && supabaseAdmin) return supabaseAdmin;
  logger.error("ai.idem.supabaseAdmin_missing", {
    endpoint: req?.originalUrl || "unknown",
    user_id_mask: maskId(req?.user?.id),
  });
  if (IS_DEV && req?.access_token) {
    logger.warn("ai.idem.cache_write_fallback_client", {
      endpoint: req?.originalUrl || "unknown",
      user_id_mask: maskId(req?.user?.id),
    });
    return createAuthedSupabaseClient(req.access_token);
  }
  return null;
}

function ensureIdempotencyStorageConfigured(req, res, idemDb) {
  if (idemDb || IS_DEV) return true;
  logger.error("ai.idem.storage_unavailable", {
    endpoint: req?.originalUrl || "unknown",
    user_id_mask: maskId(req?.user?.id),
  });
  res.status(503).json({ error: "server_not_configured" });
  return false;
}

function getAiQuotaKey(req, feature) {
  const scope = req?.user?.id ? String(req.user.id) : ipKeyGenerator(req);
  return `${feature}:${scope}`;
}

function resolvePlanBucket(plan) {
  const tier = Number(plan?.tier || 0);
  if (tier >= 2) return "ultra";
  if (tier >= 1) return "pro";
  return "common";
}

function resolveMaxAllowedTokens(plan) {
  const bucket = resolvePlanBucket(plan);
  return MAX_TOKENS_BY_TIER[bucket] || MAX_TOKENS_BY_TIER.common;
}

function resolveRequestRiskSignal(req) {
  const risk = String(req?.headers?.["x-abuse-risk"] || "").trim().toLowerCase();
  if (risk === "medium" || risk === "high") return risk;
  return "low";
}

function normalizeTestPlanCode(rawPlanCode) {
  const normalized = String(rawPlanCode || "").trim().toUpperCase();
  if (normalized === "FREE") return "FREE";
  if (normalized === "EDITOR_FREE" || normalized === "INICIANTE" || normalized === "STARTER" || normalized === "EDITOR_STARTER") {
    return "EDITOR_FREE";
  }
  if (normalized === "EDITOR_PRO" || normalized === "PRO") return "EDITOR_PRO";
  if (normalized === "EDITOR_ULTRA" || normalized === "CREATOR_PRO" || normalized === "CRIADOR_PRO" || normalized === "ULTRA") {
    return "EDITOR_ULTRA";
  }
  if (normalized === "ENTERPRISE" || normalized === "EMPRESARIAL" || normalized === "ENTERPRISE_ULTRA") {
    return "ENTERPRISE";
  }
  return null;
}

async function resolveRoutingPlanCode(req) {
  const basePlan = req?.plan?.code || "FREE";
  const candidate = normalizeTestPlanCode(req?.query?.__test_plan);
  if (!candidate) return basePlan;
  if (process.env.NODE_ENV === "production") return basePlan;
  if (isAdminUser(req?.user)) return candidate;

  const cfg = await getConfig("ai.mult_ai.test_plan_override").catch(() => null);
  const enabled = cfg == null ? true : cfg === true || cfg?.enabled === true;
  return enabled ? candidate : basePlan;
}

async function applyRoutingContext(req, { feature, body }) {
  const incoming = extractRoutingInput(body || {});
  const routingPlanCode = await resolveRoutingPlanCode(req);
  const selected = selectProviderAndModel({
    feature,
    plan: routingPlanCode,
    mode: incoming.mode,
    requested: incoming.requested,
    signals: { risk: resolveRequestRiskSignal(req) },
  });
  req.aiRouting = selected;
  req.aiRouting.plan = routingPlanCode;
  return selected;
}

function rejectDisallowedManualRouting(req, res) {
  if (req?.aiRouting?.rejected !== true) return false;
  const lang = resolveLang(req);
  const errorCode = String(req.aiRouting?.error || "provider_failed").trim().toLowerCase();
  const routingPayload = {
    mode: String(req.aiRouting?.mode || "quality").trim().toLowerCase() || "quality",
    requested: req.aiRouting?.requested || {},
    selected_provider: req.aiRouting?.selected_provider ?? null,
    selected_model: req.aiRouting?.selected_model ?? null,
    fallback_used: false,
    fallback_reason: req.aiRouting?.fallback_reason || errorCode,
  };

  if (errorCode === "model_not_allowed") {
    return res.status(403).json(
      buildAiContractErrorPayload(errorCode, {
        message: t(lang, "model_not_allowed"),
        detail: req.aiRouting?.fallback_reason || errorCode,
        routing: routingPayload,
      })
    );
  }

  return res.status(getAiContractErrorStatus(errorCode, 503)).json(
    buildAiContractErrorPayload(errorCode, {
      detail: req.aiRouting?.fallback_reason || errorCode,
      routing: routingPayload,
    })
  );
}

function getAvatarPlanLimits(planCode) {
  const limits = getPlanAvatarPreviewLimits(planCode);
  return {
    enabled: Boolean(limits?.enabled),
    sessionsPerDay: Number(limits?.sessions_per_day || 0),
    secondsPerSession: Number(limits?.seconds_per_session || 0),
  };
}

function rejectPlanFeatureViolation(req, res, violation) {
  if (!violation || violation.ok !== false) return false;
  return res.status(Number(violation.status || 403)).json({
    error: violation.error || "plan_limit_violation",
    message: violation.message || "A requisicao excede o limite deste plano.",
    plan: violation.plan || req.plan?.code || "FREE",
    feature: violation.feature || null,
    details: violation.details || null,
  });
}

function resolveProviderKeyForGuards(defaultProviderKey, req) {
  const selected = String(req?.aiRouting?.selected_provider || "").trim().toLowerCase();
  if (selected && selected !== "mock") return selected;
  return defaultProviderKey;
}

function getHeavyRouteRoutingContext(req) {
  const selectedProviderRaw = req?.aiRouting?.selected_provider;
  const selectedModelRaw = req?.aiRouting?.selected_model;
  const providerModeRaw = req?.aiRouting?.provider_mode ?? req?.aiRouting?.providerMode ?? null;
  return {
    selectedProvider: selectedProviderRaw == null ? null : String(selectedProviderRaw).trim().toLowerCase() || null,
    selectedModel: selectedModelRaw == null ? null : String(selectedModelRaw).trim() || null,
    providerMode: providerModeRaw == null ? null : String(providerModeRaw).trim().toLowerCase() || null,
  };
}

function normalizeProviderMode(rawMode, selectedProvider = null) {
  const mode = String(rawMode || "").trim().toLowerCase();
  if (mode === "mock" || mode === "real") return mode;
  const provider = String(selectedProvider || "").trim().toLowerCase();
  if (!provider) return "n/a";
  return provider === "mock" ? "mock" : "real";
}

function normalizeProviderResult(raw, routingCtx) {
  const selectedProvider = routingCtx?.selectedProvider || null;
  const selectedModel = routingCtx?.selectedModel || null;

  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      provider: selectedProvider,
      model: selectedModel,
      providerMode: "n/a",
      error: "provider_unavailable",
      detail: null,
    };
  }

  const provider = String(raw?.provider || selectedProvider || "").trim().toLowerCase() || null;
  const model = String(raw?.model || selectedModel || "").trim() || null;
  const providerMode = normalizeProviderMode(raw?.providerMode ?? raw?.mode ?? routingCtx?.providerMode ?? "n/a", provider);

  return {
    ...raw,
    ok: true,
    provider,
    model,
    providerMode,
    error: null,
    detail: null,
  };
}

function setHeavyRouteProviderModeHeader(res, providerMode) {
  const headerValue = normalizeProviderMode(providerMode, null);
  res.setHeader("X-AI-Provider-Mode", headerValue);
  return headerValue;
}

function getSafeErrorDetail(error, fallback = "erro") {
  const lowerMessage = String(error?.message || "").trim().toLowerCase();
  if (
    lowerMessage.includes("cannot read properties of undefined") &&
    lowerMessage.includes("provider")
  ) {
    return "provider_unavailable";
  }
  const errorCode = String(error?.code || "").trim().toLowerCase();
  if (errorCode === "provider_unavailable" || lowerMessage.includes("provider_response_empty")) {
    return "provider_unavailable";
  }
  const fromMessage = typeof error?.message === "string" ? error.message.trim() : "";
  if (fromMessage) return fromMessage;
  const fromString = typeof error === "string" ? error.trim() : "";
  if (
    fromString.toLowerCase().includes("cannot read properties of undefined") &&
    fromString.toLowerCase().includes("provider")
  ) {
    return "provider_unavailable";
  }
  if (fromString) return fromString;
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== "{}" ? serialized : fallback;
  } catch {
    return fallback;
  }
}

function buildProviderRouteErrorPayload(req, errorMessage, error) {
  const detail = getSafeErrorDetail(error, "erro");
  const routing = req?.aiRouting && typeof req.aiRouting === "object" ? req.aiRouting : null;
  const errorCode = getAiContractErrorCode(error) || (detail === "provider_unavailable" ? "provider_unavailable" : null);

  if (errorCode === "mock_requires_explicit_request" || errorCode === "provider_unavailable" || errorCode === "provider_not_supported_beta" || errorCode === "model_not_allowed") {
    return buildAiContractErrorPayload(errorCode === getAiContractErrorCode(error) ? error : errorCode, {
      detail,
      routing,
    });
  }

  const payload = {
    error: "provider_failed",
    message: errorMessage,
    detail,
    routing,
  };
  if (typeof error?.hint === "string" && error.hint.trim()) {
    payload.hint = error.hint.trim();
  }
  return payload;
}

function buildHeavyRouteProviderErrorPayload(req, errorMessage, error) {
  return buildProviderRouteErrorPayload(req, errorMessage, error);
}

function assertAiQuota(req, res, feature) {
  const now = Date.now();
  const quotaKey = getAiQuotaKey(req, feature);
  const current = aiQuotaMap.get(quotaKey);
  if (!current || current.expiresAt <= now) {
    aiQuotaMap.set(quotaKey, { count: 1, expiresAt: now + aiQuotaWindowMs });
    return true;
  }

  if (current.count >= AI_PER_MINUTE_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((current.expiresAt - now) / 1000));
    return res.status(429).json({
      error: "ai_quota_exceeded",
      message: t(resolveLang(req), "rate_limit_exceeded"),
      retry_after_seconds: retryAfter,
    });
  }

  current.count += 1;
  aiQuotaMap.set(quotaKey, current);
  return true;
}

function getUsageDb(req) {
  if (isSupabaseAdminEnabled() && supabaseAdmin) return supabaseAdmin;
  if (req?.access_token) return createAuthedSupabaseClient(req.access_token);
  return null;
}

async function trackAIUsage(req, payload) {
  const db = getUsageDb(req);
  if (!db || !req?.user?.id) return;
  const normalizedFeature = String(payload.feature || "")
    .trim()
    .startsWith("ai_")
    ? String(payload.feature || "").trim()
    : `ai_${String(payload.feature || "").trim()}`;
  try {
    await trackUsage({
      db,
      userId: req.user.id,
      feature: normalizedFeature,
      action: payload.action,
      idempotencyKey: payload.idempotencyKey,
      requestHash: payload.requestHash || null,
      costs: payload.costs || {},
      status: payload.status || "success",
      meta: payload.meta || {},
    });
  } catch (error) {
    logger.warn("ai.usage_track_failed", {
      feature: payload.feature,
      action: payload.action,
      status: payload.status,
      message: error?.message || "unknown_error",
      user_id_mask: maskId(req?.user?.id),
    });
  }
}

async function resolveFeatureCoins(feature, baseCoins) {
  const pricing = await getConfig(`pricing.${feature}`).catch(() => null);
  const apiCostHigh = await getConfig("flags.api_cost_high").catch(() => null);

  const baseCommon = Number(baseCoins?.common ?? 0);
  const basePro = Number(baseCoins?.pro ?? 0);
  const baseUltra = Number(baseCoins?.ultra ?? 0);

  const cfgCommon = pricing?.common != null ? Number(pricing.common) : baseCommon;
  const cfgPro = pricing?.pro != null ? Number(pricing.pro) : basePro;
  const cfgUltra = pricing?.ultra != null ? Number(pricing.ultra) : baseUltra;

  let common = cfgCommon;
  let pro = cfgPro;
  let ultra = cfgUltra;

  const multiplier =
    apiCostHigh && pricing?.multiplier_when_high_cost != null ? Number(pricing.multiplier_when_high_cost) : 1;

  if (multiplier && multiplier !== 1) {
    common = Math.ceil(common * multiplier);
    pro = Math.ceil(pro * multiplier);
    ultra = Math.ceil(ultra * multiplier);
  }

  return { common, pro, ultra };
}

function mapFinancialError(error) {
  if (error?.payload) return { status: error.status || 400, body: error.payload };
  return {
    status: 400,
    body: {
      error: "coins_debit_failed",
      details: error?.message || "coins_debit_failed",
    },
  };
}

function stableJsonStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJsonStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requireIdempotencyKey(req, res) {
  const header = req.headers["idempotency-key"];
  if (typeof header !== "string" || header.trim().length < 8) {
    res.status(400).json({
      error: "idempotency_key_required",
      message: "Header Idempotency-Key é obrigatório e deve ter pelo menos 8 caracteres.",
    });
    return null;
  }

  return header.trim();
}

function buildRequestHash({ userId, endpoint, body }) {
  const canonicalBody = stableJsonStringify(body || {});
  return buildRequestHashUtil({
    user_id: userId || "anonymous",
    endpoint,
    body: canonicalBody,
  });
}

function getCanonicalIdempotencyContext(req, res, endpoint) {
  const key = requireIdempotencyKey(req, res);
  if (!key) return null;
  return {
    endpoint,
    key,
    requestHash: buildRequestHash({ userId: req.user?.id, endpoint, body: req.body }),
  };
}

async function applyHeavyGuardsOrRespond(req, res, params) {
  const guard = await applyHeavyFeatureAbuseGuards({ req, res, ...params });
  if (guard.blocked) {
    return res.status(guard.status).json(guard.body);
  }
  return null;
}

function withReplayFlag(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.replay === true) return payload;
  return { ...payload, replay: true };
}

function maskKey(value) {
  const raw = String(value || "");
  if (!raw) return null;
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function normalizeSupabaseError(error) {
  return {
    code: error?.code || null,
    message: error?.message || "unknown_error",
    details: error?.details || null,
    hint: error?.hint || null,
    status: error?.status || null,
  };
}

function buildMemCacheKey(userId, endpoint, key) {
  return `${String(userId || "")}:${String(endpoint || "")}:${String(key || "")}`;
}

function cleanupExpiredMemCache() {
  const now = Date.now();
  for (const [key, entry] of aiIdemMemCache.entries()) {
    if (!entry?.expires_at || entry.expires_at <= now) aiIdemMemCache.delete(key);
  }
}

function readMemReplay({ userId, endpoint, key }) {
  cleanupExpiredMemCache();
  const cacheKey = buildMemCacheKey(userId, endpoint, key);
  const entry = aiIdemMemCache.get(cacheKey) || null;
  if (!entry) return null;
  return entry;
}

function writeMemReplay({ userId, endpoint, key, requestHash, response }) {
  cleanupExpiredMemCache();
  const cacheKey = buildMemCacheKey(userId, endpoint, key);
  aiIdemMemCache.set(cacheKey, {
    request_hash: requestHash || null,
    response,
    created_at: new Date().toISOString(),
    expires_at: Date.now() + IDEM_MEM_TTL_MS,
  });
}

function maskId(value) {
  const raw = String(value || "");
  if (!raw) return null;
  if (raw.length <= 10) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function hasNonEmptyResponse(payload) {
  if (!payload || typeof payload !== "object") return false;
  return Object.keys(payload).length > 0;
}

function isMissingIdempotencySchema(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("request_idempotency") && (msg.includes("does not exist") || msg.includes("relation"));
}

function isUniqueError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("duplicate") || msg.includes("unique");
}

function isMissingColumnError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("column") && msg.includes("request_idempotency");
}

function isOnConflictTargetMissing(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("on conflict") && msg.includes("no unique or exclusion constraint");
}

function isIdempotencyReplayError(error) {
  const code = String(error?.code || "").toLowerCase();
  const payloadError = String(error?.payload?.error || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "idempotency_replay" || payloadError === "idempotency_replay" || message === "idempotency_replay";
}

async function readAIReplayRecord(db, { userId, endpoint, key }) {
  if (!db) return null;
  const { data, error } = await db
    .from("request_idempotency")
    .select("response,status,request_hash,endpoint,key")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .eq("key", key)
    .maybeSingle();

  if (error) {
    if (isMissingIdempotencySchema(error)) return null;
    const enriched = new Error(`failed_to_load_idempotency_cache: ${error.message}`);
    enriched.code = error.code || null;
    enriched.details = error.details || null;
    enriched.hint = error.hint || null;
    enriched.status = error.status || null;
    throw enriched;
  }

  return data || null;
}

async function saveIdempotentResponse(db, { userId, endpoint, key, requestHash, response, status = "processed" }) {
  if (!db) {
    logger.error("ai.idem.cache_write_failed", {
      endpoint,
      key: maskKey(key),
      user_id_mask: maskId(userId),
      ...normalizeSupabaseError({ message: "idempotency_db_unavailable" }),
    });
    writeMemReplay({ userId, endpoint, key, requestHash, response });
    return { payload: response, writeOk: true, cacheFallback: "memory" };
  }
  const nowIso = new Date().toISOString();
  const payload = {
    user_id: userId,
    endpoint,
    key,
    request_hash: requestHash,
    response,
    status,
    updated_at: nowIso,
  };

  let result = { error: null };
  let writePath = "rpc";
  const isAdminDb = isSupabaseAdminEnabled() && db === supabaseAdmin;
  if (isAdminDb) {
    const rpc = await db.rpc("request_idempotency_upsert_v1", {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_key: key,
      p_request_hash: requestHash,
      p_response: response,
      p_status: status,
    });
    result.error = rpc.error || null;
  }

  if (result.error || !isAdminDb) {
    writePath = "upsert";
    result = await db.from("request_idempotency").upsert(payload, { onConflict: "user_id,endpoint,key" });
    if (result.error && isMissingColumnError(result.error)) {
      writePath = "upsert_fallback";
      const fallbackPayload = {
        user_id: userId,
        endpoint,
        key,
        response,
        created_at: nowIso,
      };
      result = await db.from("request_idempotency").upsert(fallbackPayload, { onConflict: "user_id,endpoint,key" });
    }
    if (result.error && isOnConflictTargetMissing(result.error)) {
      writePath = "insert";
      result = await db.from("request_idempotency").insert({
        user_id: userId,
        endpoint,
        key,
        request_hash: requestHash,
        response,
        status,
      });
    }
  }

  if (result.error) {
    logger.error("ai.idem.cache_write_failed", {
      endpoint,
      key: maskKey(key),
      user_id_mask: maskId(userId),
      write_path: writePath,
      cacheWriteOk: false,
      ...normalizeSupabaseError(result.error),
    });
    writeMemReplay({ userId, endpoint, key, requestHash, response });
    return { payload: response, writeOk: true, cacheFallback: "memory" };
  }

  logger.info("ai.idem.cache_write_ok", {
    endpoint,
    key: maskKey(key),
    user_id_mask: maskId(userId),
    cacheWriteOk: true,
    write_path: writePath,
  });

  const { data: readBack, error: readBackError } = await db
    .from("request_idempotency")
    .select("response,status")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .eq("key", key)
    .maybeSingle();

  if (readBackError) {
    logger.error("ai.idem.cache_readback_missing", {
      endpoint,
      key: maskKey(key),
      user_id_mask: maskId(userId),
      cacheReadBackOk: false,
      ...normalizeSupabaseError(readBackError),
    });
    writeMemReplay({ userId, endpoint, key, requestHash, response });
    return { payload: response, writeOk: true, cacheFallback: "memory" };
  }

  const cacheReadBackOk = readBack?.status === "processed" && hasNonEmptyResponse(readBack?.response);
  if (!cacheReadBackOk) {
    logger.error("ai.idem.cache_readback_missing", {
      endpoint,
      key: maskKey(key),
      user_id_mask: maskId(userId),
      cacheReadBackOk: false,
      message: "cache_readback_empty",
    });
    writeMemReplay({ userId, endpoint, key, requestHash, response });
    return { payload: response, writeOk: true, cacheFallback: "memory" };
  }

  logger.info("ai.idem.cache_readback_ok", {
    endpoint,
    key: maskKey(key),
    user_id_mask: maskId(userId),
    cacheReadBackOk: true,
  });
  return { payload: readBack.response, writeOk: true };
}

async function saveIdempotentFailure(db, { userId, endpoint, key, requestHash, errorCode, message }) {
  if (!db) return;
  try {
    await saveIdempotentResponse(db, {
      userId,
      endpoint,
      key,
      requestHash,
      status: "failed",
      response: {
        ok: false,
        error: errorCode || "request_failed",
        message: message || "request_failed",
      },
    });
  } catch (error) {
    logger.error("ai.idem.cache_write_failed", {
      endpoint,
      key: maskKey(key),
      user_id_mask: maskId(userId),
      cacheWriteOk: false,
      code: error?.code || null,
      details: error?.message || "unknown_error",
    });
  }
}

async function readReplayOrConflict(db, { userId, endpoint, key, requestHash }) {
  let row = null;
  if (db) {
    try {
      row = await readAIReplayRecord(db, { userId, endpoint, key });
    } catch (error) {
      logger.error("ai.idem.cache_read_failed", {
        endpoint,
        key: maskKey(key),
        user_id_mask: maskId(userId),
        ...normalizeSupabaseError(error),
      });
      row = null;
    }
  }
  if (row?.request_hash && requestHash && row.request_hash !== requestHash) {
    return { kind: "conflict" };
  }
  if (row?.status === "processed" && hasNonEmptyResponse(row.response)) {
    logger.info("ai_replay_cache_hit", {
      endpoint,
      key: maskKey(key),
      cache_source: "db",
      cacheHit: true,
    });
    return { kind: "replay", payload: withReplayFlag(row.response) };
  }

  const mem = readMemReplay({ userId, endpoint, key });
  if (mem?.request_hash && requestHash && mem.request_hash !== requestHash) {
    return { kind: "conflict" };
  }
  if (mem && hasNonEmptyResponse(mem.response)) {
    logger.info("ai_replay_cache_hit", {
      endpoint,
      key: maskKey(key),
      cache_source: "mem",
      cacheHit: true,
    });
    return { kind: "replay", payload: withReplayFlag(mem.response) };
  }

  logger.info("ai_replay_cache_miss", {
    endpoint,
    key: maskKey(key),
    cache_source: "none",
    cacheHit: false,
  });
  return { kind: "none" };
}

router.get("/_debug/idempotency", authMiddleware, adminOnly, async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({ error: "not_found" });
  }

  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    return res.status(503).json({ error: "idempotency_db_unavailable" });
  }
  const db = supabaseAdmin;

  const { data, error } = await db
    .from("request_idempotency")
    .select("user_id,endpoint,key,created_at,response")
    .in("endpoint", ["ai_text_generate", "ai_fact_check"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return res.status(400).json({ error: "idempotency_debug_failed", details: error.message });
  }

  const items = (data || []).map((row) => ({
    user_id: maskId(row.user_id),
    endpoint: row.endpoint,
    key: row.key,
    created_at: row.created_at,
    response_empty: !hasNonEmptyResponse(row.response),
  }));

  return res.json({ ok: true, items });
});

router.use((req, res, next) => {
  if (!isAIDisabled()) return next();
  return res.status(503).json({ error: "AI temporarily disabled" });
});

function parseImageGenerateInput(body) {
  const prompt = String(body?.prompt || "").trim();
  const style = String(body?.style || "default").trim() || "default";
  const aspectRatio = String(body?.aspectRatio || "1:1").trim();
  const quality = String(body?.quality || "medium").trim().toLowerCase();
  const count = Number(body?.count ?? 1);

  const validAspect = aspectRatio === "1:1" || aspectRatio === "16:9" || aspectRatio === "9:16";
  const validQuality = quality === "low" || quality === "medium" || quality === "high";
  if (!prompt || prompt.length > 500 || !validAspect || !validQuality || !Number.isInteger(count) || count <= 0) {
    return { error: true };
  }

  if (quality === "high" && count > 3) return { error: true };
  if (quality !== "high" && count > 1) return { error: true };

  return { prompt, style, aspectRatio, quality, count };
}

function parseImageVariationInput(body) {
  const imageUrl = String(body?.imageUrl || "").trim();
  const prompt = String(body?.prompt || "").trim();
  const strength = Number(body?.strength ?? 0.35);

  if (!imageUrl || !prompt || prompt.length > 500 || !Number.isFinite(strength) || strength < 0 || strength > 1) {
    return { error: true };
  }

  return { imageUrl, prompt, strength };
}

function parseVideoGenerateInput(body) {
  const prompt = String(body?.prompt || "").trim();
  const imageUrlRaw = body?.imageUrl != null ? String(body.imageUrl).trim() : "";
  const durationSec = Number(body?.durationSec ?? 8);
  const aspectRatio = String(body?.aspectRatio || "16:9").trim();
  const quality = String(body?.quality || "medium").trim().toLowerCase();

  const validAspect = aspectRatio === "16:9" || aspectRatio === "9:16" || aspectRatio === "1:1";
  const validQuality = quality === "low" || quality === "medium" || quality === "high";
  if (!prompt || prompt.length > 800 || !validAspect || !validQuality) return { error: true };
  if (!Number.isFinite(durationSec) || durationSec < 4 || durationSec > 20) return { error: true };

  let imageUrl = null;
  if (imageUrlRaw) {
    try {
      // eslint-disable-next-line no-new
      new URL(imageUrlRaw);
      imageUrl = imageUrlRaw;
    } catch {
      return { error: true };
    }
  }

  return { prompt, imageUrl, durationSec, aspectRatio, quality };
}

function parseVideoStatusInput(body) {
  const jobId = String(body?.jobId || "").trim();
  if (!jobId) return { error: true };
  return { jobId };
}

function parseMusicGenerateInput(body) {
  const prompt = String(body?.prompt || "").trim();
  const lyrics = String(body?.lyrics || "").trim();
  const style = String(body?.style || "").trim();
  const durationSec = Number(body?.durationSec ?? 30);
  const quality = String(body?.quality || "medium").trim().toLowerCase();
  const validQuality = quality === "low" || quality === "medium" || quality === "high";

  if (!prompt || prompt.length > 800) return { error: true };
  if (lyrics.length > 3000 || style.length > 200) return { error: true };
  if (!Number.isFinite(durationSec) || durationSec < 10 || durationSec > 180) return { error: true };
  if (!validQuality) return { error: true };

  return { prompt, lyrics, style, durationSec, quality };
}

function parseMusicStatusInput(body) {
  const jobId = String(body?.jobId || "").trim();
  if (!jobId) return { error: true };
  return { jobId };
}

function parseVoiceGenerateInput(body) {
  const text = String(body?.text || "").trim();
  const language = String(body?.language || "pt-BR").trim() || "pt-BR";
  const voiceId = String(body?.voiceId || "default").trim() || "default";
  const stability = Number(body?.stability ?? 0.5);
  const similarityBoost = Number(body?.similarityBoost ?? 0.75);
  const style = Number(body?.style ?? 0.2);
  const format = String(body?.format || "mp3").trim().toLowerCase();
  const quality = String(body?.quality || "medium").trim().toLowerCase();

  const validFormat = format === "mp3" || format === "wav";
  const validQuality = quality === "low" || quality === "medium" || quality === "high";
  if (!text || text.length > 2000) return { error: true };
  if (!Number.isFinite(stability) || stability < 0 || stability > 1) return { error: true };
  if (!Number.isFinite(similarityBoost) || similarityBoost < 0 || similarityBoost > 1) return { error: true };
  if (!Number.isFinite(style) || style < 0 || style > 1) return { error: true };
  if (!validFormat || !validQuality) return { error: true };

  return { text, language, voiceId, stability, similarityBoost, style, format, quality };
}

function parseVoiceStatusInput(body) {
  const jobId = String(body?.jobId || "").trim();
  if (!jobId) return { error: true };
  return { jobId };
}

function idemConflictMessage(req) {
  return t(resolveLang(req), "idempotency_conflict");
}

function idemAlreadyProcessedMessage(req) {
  return t(resolveLang(req), "idempotency_already_processed");
}

function parseSlidesGenerateInput(body) {
  const title = String(body?.title || "").trim();
  const outline = String(body?.outline || "").trim();
  const theme = String(body?.theme || "default").trim() || "default";
  const language = String(body?.language || "pt-BR").trim() || "pt-BR";
  const slideCount = Number(body?.slideCount ?? 10);
  const quality = String(body?.quality || "medium").trim().toLowerCase();
  const validQuality = quality === "low" || quality === "medium" || quality === "high";

  if (!title || !Number.isInteger(slideCount) || slideCount <= 0 || slideCount > 30 || !validQuality) return { error: true };

  return { title, outline, theme, language, slideCount, quality };
}

function parseSlidesStatusInput(body) {
  const jobId = String(body?.jobId || "").trim();
  if (!jobId) return { error: true };
  return { jobId };
}

function parseAvatarStartInput(body) {
  const avatarId = String(body?.avatar_id || body?.avatarId || "").trim();
  const voiceEnabled = body?.voice_enabled === true || body?.voiceEnabled === true;
  if (!AVATAR_IDS.has(avatarId)) return { error: true };
  return { avatarId, voiceEnabled };
}

function parseAvatarMessageInput(body) {
  const sessionId = String(body?.session_id || body?.sessionId || "").trim();
  const message = String(body?.message || "").trim();
  const secondsIncrement = Number(body?.seconds_increment ?? body?.secondsIncrement ?? 15);
  const state = body?.state && typeof body.state === "object" ? body.state : null;

  if (!sessionId || !message || message.length > 2000) return { error: true };
  if (!Number.isFinite(secondsIncrement) || secondsIncrement <= 0 || secondsIncrement > 30) return { error: true };

  return { sessionId, message, secondsIncrement, state };
}

function parseAvatarEndInput(body) {
  const sessionId = String(body?.session_id || body?.sessionId || "").trim();
  const finalState = body?.final_state && typeof body.final_state === "object"
    ? body.final_state
    : body?.finalState && typeof body.finalState === "object"
      ? body.finalState
      : null;

  if (!sessionId) return { error: true };
  return { sessionId, finalState };
}

function getUtcDayStartIso(reference = new Date()) {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), 0, 0, 0, 0));
  return start.toISOString();
}

async function getAvatarSession(db, userId, sessionId) {
  const { data, error } = await db
    .from("avatar_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "avatar_session_lookup_failed");
  }

  return data || null;
}

async function countAvatarSessionsToday(db, userId) {
  const startIso = getUtcDayStartIso();
  const { count, error } = await db
    .from("avatar_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("started_at", startIso);

  if (error) throw new Error(error.message || "avatar_session_daily_count_failed");
  return Number(count || 0);
}

function buildAvatarStateFromSession(sessionRow, nextMessage, explicitState) {
  const baseState = sessionRow?.last_state_json && typeof sessionRow.last_state_json === "object"
    ? sessionRow.last_state_json
    : {};

  if (explicitState) {
    return {
      ...baseState,
      ...explicitState,
      updated_at: new Date().toISOString(),
    };
  }

  const previousMessages = Array.isArray(baseState.messages) ? baseState.messages : [];
  const nextMessages = [...previousMessages, { role: "user", text: nextMessage, ts: new Date().toISOString() }];
  return {
    ...baseState,
    messages: nextMessages.slice(-20),
    last_message: nextMessage,
    updated_at: new Date().toISOString(),
  };
}

router.post(
  "/avatar/start",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res) => {
    const parsed = parseAvatarStartInput(req.body || {});
    if (parsed.error) {
      return res.status(400).json({
        error: "invalid_avatar_start_request",
        allowed_avatar_ids: Array.from(AVATAR_IDS),
      });
    }

    const endpoint = "ai_avatar_start";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const avatarLimits = getAvatarPlanLimits(req.plan?.code);

    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    if (!canUseAvatarPreview(req.plan?.code) || !avatarLimits.enabled) {
      return res.status(403).json({
        error: "avatar_preview_not_available_for_plan",
        plan: req.plan?.code || "FREE",
      });
    }

    let db = null;
    let coinsCharge = { common: 0, pro: 0, ultra: 0, feature: "avatar_start" };
    try {
      db = getFinancialDbOrThrow();
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemConflictMessage(req),
        });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "avatar_start",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: { replay: true, avatar_id: parsed.avatarId, voice_enabled: parsed.voiceEnabled },
        });
        return res.json(replay.payload);
      }

      const sessionsToday = await countAvatarSessionsToday(db, req.user.id);
      if (avatarLimits.sessionsPerDay > 0 && sessionsToday >= avatarLimits.sessionsPerDay) {
        return res.status(429).json({
          error: "avatar_daily_limit_reached",
          limit: avatarLimits.sessionsPerDay,
        });
      }

      coinsCharge = {
        ...(await resolveFeatureCoins("avatar_start", parsed.voiceEnabled ? { pro: 2 } : { pro: 1 })),
        feature: "avatar_start",
      };

      const providerResult = await debitThenExecuteOrRefund({
        db,
        userId: req.user.id,
        feature: "avatar_start",
        idempotencyKey,
        costCommon: coinsCharge.common,
        costPro: coinsCharge.pro,
        costUltra: coinsCharge.ultra,
        executeFn: async () => {
          const nowIso = new Date().toISOString();
          const { data: sessionRow, error: insertError } = await db
            .from("avatar_sessions")
            .insert({
              user_id: req.user.id,
              avatar_id: parsed.avatarId,
              voice_enabled: parsed.voiceEnabled,
              seconds_limit: avatarLimits.secondsPerSession,
              seconds_used: 0,
              status: "active",
              idempotency_key_start: idempotencyKey,
              started_at: nowIso,
              last_state_json: {
                avatar_id: parsed.avatarId,
                voice_enabled: parsed.voiceEnabled,
                messages: [],
                updated_at: nowIso,
              },
            })
            .select("*")
            .maybeSingle();

          if (insertError) throw new Error(insertError.message || "avatar_session_create_failed");
          return { session: sessionRow, provider: "mock", model: "avatar-preview-v1" };
        },
      });

      const session = providerResult?.session || {};
      const responsePayload = {
        ok: true,
        session: {
          id: session.id,
          avatar_id: session.avatar_id || parsed.avatarId,
          voice_enabled: Boolean(session.voice_enabled),
          status: session.status || "active",
          seconds_limit: Number(session.seconds_limit || avatarLimits.secondsPerSession),
          seconds_used: Number(session.seconds_used || 0),
          remaining_seconds: Math.max(
            0,
            Number(session.seconds_limit || avatarLimits.secondsPerSession) - Number(session.seconds_used || 0)
          ),
          started_at: session.started_at || new Date().toISOString(),
          last_state_json: session.last_state_json || {},
        },
        provider: "mock",
        model: "avatar-preview-v1",
      };

      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "avatar_start",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          replay: false,
          avatar_id: parsed.avatarId,
          voice_enabled: parsed.voiceEnabled,
          session_seconds_limit: avatarLimits.secondsPerSession,
          provider: "mock",
          model: "avatar-preview-v1",
        },
      });

      return res.json(saveResult.payload);
    } catch (error) {
      if (isIdempotencyReplayError(error)) {
        const replay = await readReplayOrConflict(idemDb || db, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
        });
        if (replay.kind === "replay") return res.json(replay.payload);
        if (replay.kind === "conflict") {
          return res.status(409).json({
            error: "idempotency_conflict",
            message: idemConflictMessage(req),
          });
        }
        return res.status(409).json({
          error: "idempotency_conflict",
          message: "Essa requisicao ja foi processada. Gere uma nova Idempotency-Key.",
        });
      }

      if (error?.payload) {
        const mapped = mapFinancialError(error);
        await saveIdempotentFailure(idemDb || db, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
          errorCode: mapped.body?.error || "coins_debit_failed",
          message: mapped.body?.details || mapped.body?.message || mapped.body?.error || "coins_debit_failed",
        });
        return res.status(mapped.status).json(mapped.body);
      }

      await saveIdempotentFailure(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "avatar_start_failed",
        message: error?.message || "avatar_start_failed",
      });
      await trackAIUsage(req, {
        feature: "avatar_start",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: { replay: false, error: error?.message || "avatar_start_failed" },
      });

      return res.status(502).json({
        error: "avatar_start_failed",
        details: error?.message || "avatar_start_failed",
      });
    }
  }
);

router.post(
  "/avatar/message",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 20 }),
  async (req, res) => {
    const parsed = parseAvatarMessageInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_avatar_message_request" });

    const endpoint = "ai_avatar_message";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const avatarLimits = getAvatarPlanLimits(req.plan?.code);

    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;
    if (!canUseAvatarPreview(req.plan?.code) || !avatarLimits.enabled) {
      return res.status(403).json({
        error: "avatar_preview_not_available_for_plan",
        plan: req.plan?.code || "FREE",
      });
    }

    try {
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemConflictMessage(req),
        });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "avatar_message",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: { replay: true, session_id: parsed.sessionId },
        });
        return res.json(replay.payload);
      }

      const db = getFinancialDbOrThrow();
      const session = await getAvatarSession(db, req.user.id, parsed.sessionId);
      if (!session) return res.status(404).json({ error: "avatar_session_not_found" });

      const currentUsed = Number(session.seconds_used || 0);
      const secondsLimit = Number(session.seconds_limit || avatarLimits.secondsPerSession);
      const nextUsed = Math.min(secondsLimit, currentUsed + parsed.secondsIncrement);
      const limitReached = nextUsed >= secondsLimit;
      const nextStatus = limitReached ? "expired" : "active";
      const nextState = buildAvatarStateFromSession(session, parsed.message, parsed.state);

      const { data: updatedRow, error: updateError } = await db
        .from("avatar_sessions")
        .update({
          seconds_used: nextUsed,
          status: nextStatus,
          last_state_json: nextState,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .eq("user_id", req.user.id)
        .select("*")
        .maybeSingle();

      if (updateError) return res.status(400).json({ error: "avatar_session_update_failed", details: updateError.message });

      const responsePayload = {
        ok: true,
        session: {
          id: updatedRow.id,
          avatar_id: updatedRow.avatar_id,
          voice_enabled: Boolean(updatedRow.voice_enabled),
          status: updatedRow.status,
          seconds_limit: Number(updatedRow.seconds_limit || avatarLimits.secondsPerSession),
          seconds_used: Number(updatedRow.seconds_used || 0),
          remaining_seconds: Math.max(
            0,
            Number(updatedRow.seconds_limit || avatarLimits.secondsPerSession) - Number(updatedRow.seconds_used || 0)
          ),
          started_at: updatedRow.started_at,
          last_state_json: updatedRow.last_state_json || {},
        },
        snapshot: updatedRow.last_state_json || {},
        limit_reached: limitReached,
      };

      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });

      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "avatar_message",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          replay: false,
          session_id: parsed.sessionId,
          seconds_increment: parsed.secondsIncrement,
          limit_reached: limitReached,
        },
      });

      return res.json(saveResult.payload);
    } catch (error) {
      await saveIdempotentFailure(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "avatar_message_failed",
        message: error?.message || "avatar_message_failed",
      });
      await trackAIUsage(req, {
        feature: "avatar_message",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: { replay: false, error: error?.message || "avatar_message_failed" },
      });
      return res.status(502).json({ error: "avatar_message_failed", details: error?.message || "avatar_message_failed" });
    }
  }
);

router.post(
  "/avatar/end",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res) => {
    const parsed = parseAvatarEndInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_avatar_end_request" });

    const endpoint = "ai_avatar_end";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const avatarLimits = getAvatarPlanLimits(req.plan?.code);

    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;
    if (!canUseAvatarPreview(req.plan?.code) || !avatarLimits.enabled) {
      return res.status(403).json({
        error: "avatar_preview_not_available_for_plan",
        plan: req.plan?.code || "FREE",
      });
    }

    try {
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemConflictMessage(req),
        });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "avatar_end",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: { replay: true, session_id: parsed.sessionId },
        });
        return res.json(replay.payload);
      }

      const db = getFinancialDbOrThrow();
      const session = await getAvatarSession(db, req.user.id, parsed.sessionId);
      if (!session) return res.status(404).json({ error: "avatar_session_not_found" });

      const nextState = parsed.finalState
        ? buildAvatarStateFromSession(session, session.last_state_json?.last_message || "", parsed.finalState)
        : session.last_state_json || {};

      const { data: updatedRow, error: updateError } = await db
        .from("avatar_sessions")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
          last_state_json: nextState,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .eq("user_id", req.user.id)
        .select("*")
        .maybeSingle();

      if (updateError) return res.status(400).json({ error: "avatar_session_end_failed", details: updateError.message });

      const responsePayload = {
        ok: true,
        session: {
          id: updatedRow.id,
          avatar_id: updatedRow.avatar_id,
          status: updatedRow.status,
          voice_enabled: Boolean(updatedRow.voice_enabled),
          seconds_limit: Number(updatedRow.seconds_limit || avatarLimits.secondsPerSession),
          seconds_used: Number(updatedRow.seconds_used || 0),
          started_at: updatedRow.started_at,
          ended_at: updatedRow.ended_at,
          last_state_json: updatedRow.last_state_json || {},
        },
      };

      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });

      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "avatar_end",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: { replay: false, session_id: parsed.sessionId, status: "ended" },
      });

      return res.json(saveResult.payload);
    } catch (error) {
      await saveIdempotentFailure(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "avatar_end_failed",
        message: error?.message || "avatar_end_failed",
      });
      await trackAIUsage(req, {
        feature: "avatar_end",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: { replay: false, error: error?.message || "avatar_end_failed" },
      });
      return res.status(502).json({ error: "avatar_end_failed", details: error?.message || "avatar_end_failed" });
    }
  }
);

router.post(
  "/image-generate",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 20 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "image_generate", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const parsed = parseImageGenerateInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_image_request" });
    const imagePlanGuard = validatePlanFeatureRequest({
      planCode: req.plan?.code,
      feature: "image_generate",
      body: req.body || {},
      parsedInput: parsed,
      mode: req.aiRouting?.mode,
    });
    if (rejectPlanFeatureViolation(req, res, imagePlanGuard)) return;

    const endpoint = "ai_image_generate";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;

    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    const quality = parsed.quality;
    const coinsCharge =
      quality === "high"
        ? { common: 0, pro: 1, ultra: 0, feature: "image_generate" }
        : { common: 1, pro: 0, ultra: 0, feature: "image_generate" };

    let db = null;
    try {
      db = getFinancialDbOrThrow();
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res
          .status(409)
          .json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "image_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: {
            provider: replay.payload?.provider || "mock",
            model: replay.payload?.model || "mock",
            replay: true,
            credit_type: quality === "high" ? "pro" : "common",
            images_count: Array.isArray(replay.payload?.images) ? replay.payload.images.length : 0,
          },
        });
        return res.json(replay.payload);
      }

      const providerResult = await debitThenExecuteOrRefund({
        db,
        userId: req.user.id,
        feature: "image_generate",
        idempotencyKey,
        costCommon: coinsCharge.common,
        costPro: coinsCharge.pro,
        costUltra: coinsCharge.ultra,
        executeFn: async () => {
          if (process.env.NODE_ENV === "development" && req.body?.debug_force_provider_error === true) {
            throw new Error("debug_forced_provider_error");
          }
          return runGenerateImage({
            ...parsed,
            idempotencyKey,
            forceMock: String(req.aiRouting?.selected_provider || "").trim().toLowerCase() === "mock",
          });
        },
      });

      const responsePayload = {
        ok: true,
        images: providerResult.images || [],
        provider: providerResult.provider || "mock",
        model: providerResult.model || "mock-gemini-image-v1",
      };

      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "image_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          credit_type: coinsCharge.pro > 0 ? "pro" : "common",
          images_count: responsePayload.images.length,
          quality,
          aspect_ratio: parsed.aspectRatio,
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (String(e?.code || "").toLowerCase() === "invalid_image_request") {
        return res.status(400).json({ error: "invalid_image_request" });
      }

      if (isIdempotencyReplayError(e)) {
        const replayDb = db || getFinancialDbOrThrow();
        const replay = await readReplayOrConflict(idemDb || replayDb, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
        });
        if (replay.kind === "replay") return res.json(replay.payload);
        if (replay.kind === "conflict") {
          return res
            .status(409)
            .json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
        }
        const reconstructed = await buildFallbackReplayFromCoinsTx(replayDb, {
          userId: req.user.id,
          idempotencyKey,
          feature: "image_generate",
          endpoint,
        });
        if (reconstructed) return res.json(reconstructed);
        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemAlreadyProcessedMessage(req),
        });
      }

      if (e?.payload) {
        const mapped = mapFinancialError(e);
        if (idemDb || db) {
          await saveIdempotentFailure(idemDb || db, {
            userId: req.user.id,
            endpoint,
            key: idempotencyKey,
            requestHash,
            errorCode: mapped.body?.error || "coins_debit_failed",
            message: mapped.body?.details || mapped.body?.error || "coins_debit_failed",
          });
        }
        await trackAIUsage(req, {
          feature: "image_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "error",
          costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
          meta: { provider: "error", model: "error", replay: false, error: mapped.body?.error || "coins_debit_failed" },
        });
        return res.status(mapped.status).json(mapped.body);
      }

      if (idemDb || db) {
        await saveIdempotentFailure(idemDb || db, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
          errorCode: "provider_failed",
          message: e?.message || "provider_failed",
        });
      }
      await trackAIUsage(req, {
        feature: "image_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: { provider: "error", model: "error", replay: false, error: e?.message || "provider_failed" },
      });
      return res.status(502).json({ error: "Falha ao gerar imagem", detail: e?.message || "erro" });
    }
  }
);

router.post(
  "/image-variation",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 20 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "image_variation", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const parsed = parseImageVariationInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_image_request" });

    const endpoint = "ai_image_variation";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;

    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    const coinsCharge = { common: 0, pro: 1, ultra: 0, feature: "image_variation" };
    let db = null;
    try {
      db = getFinancialDbOrThrow();
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res
          .status(409)
          .json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "image_variation",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: {
            provider: replay.payload?.provider || "mock",
            model: replay.payload?.model || "mock",
            replay: true,
            credit_type: "pro",
            images_count: Array.isArray(replay.payload?.images) ? replay.payload.images.length : 0,
          },
        });
        return res.json(replay.payload);
      }

      const providerResult = await debitThenExecuteOrRefund({
        db,
        userId: req.user.id,
        feature: "image_variation",
        idempotencyKey,
        costCommon: coinsCharge.common,
        costPro: coinsCharge.pro,
        costUltra: coinsCharge.ultra,
        executeFn: async () => {
          if (process.env.NODE_ENV === "development" && req.body?.debug_force_provider_error === true) {
            throw new Error("debug_forced_provider_error");
          }
          return runGenerateVariation({
            ...parsed,
            idempotencyKey,
            forceMock: String(req.aiRouting?.selected_provider || "").trim().toLowerCase() === "mock",
          });
        },
      });

      const responsePayload = {
        ok: true,
        images: providerResult.images || [],
        provider: providerResult.provider || "mock",
        model: providerResult.model || "mock-gemini-image-v1",
      };

      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "image_variation",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: 0, pro: 1, ultra: 0 },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          credit_type: "pro",
          images_count: responsePayload.images.length,
          strength: parsed.strength,
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (String(e?.code || "").toLowerCase() === "invalid_image_request") {
        return res.status(400).json({ error: "invalid_image_request" });
      }

      if (isIdempotencyReplayError(e)) {
        const replayDb = db || getFinancialDbOrThrow();
        const replay = await readReplayOrConflict(idemDb || replayDb, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
        });
        if (replay.kind === "replay") return res.json(replay.payload);
        if (replay.kind === "conflict") {
          return res
            .status(409)
            .json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
        }
        const reconstructed = await buildFallbackReplayFromCoinsTx(replayDb, {
          userId: req.user.id,
          idempotencyKey,
          feature: "image_variation",
          endpoint,
        });
        if (reconstructed) return res.json(reconstructed);
        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemAlreadyProcessedMessage(req),
        });
      }

      if (e?.payload) {
        const mapped = mapFinancialError(e);
        if (idemDb || db) {
          await saveIdempotentFailure(idemDb || db, {
            userId: req.user.id,
            endpoint,
            key: idempotencyKey,
            requestHash,
            errorCode: mapped.body?.error || "coins_debit_failed",
            message: mapped.body?.details || mapped.body?.error || "coins_debit_failed",
          });
        }
        await trackAIUsage(req, {
          feature: "image_variation",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "error",
          costs: { common: 0, pro: 1, ultra: 0 },
          meta: { provider: "error", model: "error", replay: false, error: mapped.body?.error || "coins_debit_failed" },
        });
        return res.status(mapped.status).json(mapped.body);
      }

      if (idemDb || db) {
        await saveIdempotentFailure(idemDb || db, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
          errorCode: "provider_failed",
          message: e?.message || "provider_failed",
        });
      }
      await trackAIUsage(req, {
        feature: "image_variation",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: 0, pro: 1, ultra: 0 },
        meta: { provider: "error", model: "error", replay: false, error: e?.message || "provider_failed" },
      });
      return res.status(502).json({ error: "Falha ao gerar variação de imagem", detail: e?.message || "erro" });
    }
  }
);

function normalizeWallet(row) {
  return {
    common: Number(row?.common ?? row?.common_balance ?? 0),
    pro: Number(row?.pro ?? row?.pro_balance ?? 0),
    ultra: Number(row?.ultra ?? row?.ultra_balance ?? 0),
  };
}

async function getWallet(db, userId) {
  const modern = await db.from("creator_coins_wallet").select("common,pro,ultra").eq("user_id", userId).maybeSingle();
  if (!modern.error) return normalizeWallet(modern.data);

  const legacy = await db
    .from("creator_coins_wallet")
    .select("common_balance,pro_balance,ultra_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (legacy.error) return null;
  return normalizeWallet(legacy.data);
}

async function buildFallbackReplayFromCoinsTx(db, { userId, idempotencyKey, feature, endpoint }) {
  const { data } = await db
    .from("coins_transactions")
    .select("id,created_at")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .eq("feature", feature)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.id) return null;

  const balance = await getWallet(db, userId);
  return {
    ok: true,
    replay: true,
    reconstructed: true,
    endpoint,
    idempotency_key: idempotencyKey,
    created_at: data.created_at,
    balance,
  };
}

router.post(
  "/video-generate",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "video_generate", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const parsed = parseVideoGenerateInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_video_request" });
    const videoPlanGuard = validatePlanFeatureRequest({
      planCode: req.plan?.code,
      feature: "video_generate",
      body: req.body || {},
      parsedInput: parsed,
      mode: req.aiRouting?.mode,
    });
    if (rejectPlanFeatureViolation(req, res, videoPlanGuard)) return;
    const routingCtx = getHeavyRouteRoutingContext(req);

    const endpoint = "ai_video_generate";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    const baseCoins =
      parsed.quality === "high"
        ? { common: 0, pro: 0, ultra: 2 }
        : parsed.quality === "medium"
          ? { common: 0, pro: 3, ultra: 0 }
          : { common: 0, pro: 2, ultra: 0 };

    let coinsCharge = { ...baseCoins, feature: "video_generate" };
    let db = null;

    try {
      db = getFinancialDbOrThrow();
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "ai_video_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: {
            provider: replay.payload?.provider || "mock",
            model: replay.payload?.model || "mock-video-v1",
            replay: true,
            credit_type: parsed.quality === "high" ? "ultra" : "pro",
            durationSec: parsed.durationSec,
            quality: parsed.quality,
            aspectRatio: parsed.aspectRatio,
          },
        });
        return res.json(replay.payload);
      }

      coinsCharge = {
        ...(await resolveFeatureCoins("video_generate", baseCoins)),
        feature: "video_generate",
      };

      const guardResponse = await applyHeavyGuardsOrRespond(req, res, {
        db,
        featureKey: "ai_video_generate",
        providerKey: resolveProviderKeyForGuards("runway", req),
        providerMode: "mock_or_real",
        idempotencyKey,
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
      });
      if (guardResponse) return;

      const rawProviderResult = await debitThenExecuteOrRefund({
        db,
        userId: req.user.id,
        feature: "video_generate",
        idempotencyKey,
        costCommon: coinsCharge.common,
        costPro: coinsCharge.pro,
        costUltra: coinsCharge.ultra,
        executeFn: async () => {
          if (process.env.NODE_ENV === "development" && req.body?.debug_force_provider_error === true) {
            throw new Error("debug_forced_provider_error");
          }
          return runVideoGenerate({ input: parsed, idempotencyKey, routing: req.aiRouting });
        },
      });
      const result = normalizeProviderResult(rawProviderResult, routingCtx);
      setHeavyRouteProviderModeHeader(res, result.providerMode);
      if (!result.ok) {
        const providerError = new Error(result.error || "provider_unavailable");
        providerError.code = result.error || "provider_unavailable";
        throw providerError;
      }

      const responsePayload = {
        ok: true,
        jobId: result.jobId,
        status: result.status,
        provider: result.provider,
        model: result.model,
        estimated_seconds: result.estimated_seconds,
        assets: result.assets || {},
      };

      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "ai_video_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          credit_type: coinsCharge.ultra > 0 ? "ultra" : "pro",
          durationSec: parsed.durationSec,
          quality: parsed.quality,
          aspectRatio: parsed.aspectRatio,
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (String(e?.code || "").toLowerCase() === "invalid_video_request") {
        return res.status(400).json({ error: "invalid_video_request" });
      }

      if (isIdempotencyReplayError(e)) {
        const replayDb = db || getFinancialDbOrThrow();
        const replay = await readReplayOrConflict(idemDb || replayDb, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
        });
        if (replay.kind === "replay") return res.json(replay.payload);
        if (replay.kind === "conflict") {
          return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
        }

        const reconstructed = await buildFallbackReplayFromCoinsTx(replayDb, {
          userId: req.user.id,
          idempotencyKey,
          feature: "video_generate",
          endpoint,
        });
        if (reconstructed) return res.json(reconstructed);

        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemAlreadyProcessedMessage(req),
        });
      }

      if (e?.payload) {
        const mapped = mapFinancialError(e);
        if (idemDb || db) await saveIdempotentFailure(idemDb || db, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
          errorCode: mapped.body?.error || "coins_debit_failed",
          message: mapped.body?.details || mapped.body?.message || mapped.body?.error || "coins_debit_failed",
        });
        await trackAIUsage(req, {
          feature: "ai_video_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "error",
          costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
          meta: {
            provider: "error",
            model: "error",
            replay: false,
            error: mapped.body?.error || "coins_debit_failed",
            quality: parsed.quality,
            aspectRatio: parsed.aspectRatio,
          },
        });
        return res.status(mapped.status).json(mapped.body);
      }

      if (idemDb || db) await saveIdempotentFailure(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "provider_failed",
        message: e?.message || "provider_failed",
      });
      await trackAIUsage(req, {
        feature: "ai_video_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: "error",
          model: "error",
          replay: false,
          error: e?.message || "provider_failed",
          quality: parsed.quality,
          aspectRatio: parsed.aspectRatio,
        },
      });
      setHeavyRouteProviderModeHeader(res, normalizeProviderMode(routingCtx?.providerMode, routingCtx?.selectedProvider));
      return res.status(getAiContractErrorStatus(e, 502)).json(buildHeavyRouteProviderErrorPayload(req, "Falha ao gerar video", e));
    }
  }
);

router.post(
  "/video-status",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "video_status", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const parsed = parseVideoStatusInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_video_request" });
    const routingCtx = getHeavyRouteRoutingContext(req);

    const endpoint = "ai_video_status";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    try {
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "ai_video_status",
          action: "status",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: {
            provider: replay.payload?.provider || "mock",
            model: replay.payload?.model || "mock-video-v1",
            replay: true,
            credit_type: "none",
          },
        });
        return res.json(replay.payload);
      }

      const guardResponse = await applyHeavyGuardsOrRespond(req, res, {
        db: null,
        featureKey: "ai_video_status",
        providerKey: resolveProviderKeyForGuards("runway", req),
        providerMode: "mock_or_real",
        idempotencyKey,
        costs: { common: 0, pro: 0, ultra: 0 },
      });
      if (guardResponse) return;

      const rawProviderResult = await runVideoStatus({ input: parsed, idempotencyKey, routing: req.aiRouting });
      const result = normalizeProviderResult(rawProviderResult, routingCtx);
      setHeavyRouteProviderModeHeader(res, result.providerMode);
      if (!result.ok) {
        const providerError = new Error(result.error || "provider_unavailable");
        providerError.code = result.error || "provider_unavailable";
        throw providerError;
      }
      const responsePayload = {
        ok: true,
        jobId: result.jobId,
        status: result.status,
        provider: result.provider,
        model: result.model,
        output: result.output || {},
      };

      const saveResult = await saveIdempotentResponse(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "ai_video_status",
        action: "status",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          credit_type: "none",
          jobIdPrefix: String(parsed.jobId).slice(0, 12),
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (String(e?.code || "").toLowerCase() === "invalid_video_request") {
        return res.status(400).json({ error: "invalid_video_request" });
      }

      if (idemDb) await saveIdempotentFailure(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "provider_failed",
        message: e?.message || "provider_failed",
      });
      await trackAIUsage(req, {
        feature: "ai_video_status",
        action: "status",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          provider: "error",
          model: "error",
          replay: false,
          error: e?.message || "provider_failed",
        },
      });
      setHeavyRouteProviderModeHeader(res, normalizeProviderMode(routingCtx?.providerMode, routingCtx?.selectedProvider));
      return res.status(getAiContractErrorStatus(e, 502)).json(buildHeavyRouteProviderErrorPayload(req, "Falha ao consultar status do video", e));
    }
  }
);

router.post(
  "/music-generate",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "music_generate", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const parsed = parseMusicGenerateInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_music_request" });
    const musicPlanGuard = validatePlanFeatureRequest({
      planCode: req.plan?.code,
      feature: "music_generate",
      body: req.body || {},
      parsedInput: parsed,
      mode: req.aiRouting?.mode,
    });
    if (rejectPlanFeatureViolation(req, res, musicPlanGuard)) return;
    const routingCtx = getHeavyRouteRoutingContext(req);

    const endpoint = "ai_music_generate";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    const baseCoins =
      parsed.quality === "high"
        ? { common: 0, pro: 0, ultra: 1 }
        : parsed.quality === "medium"
          ? { common: 0, pro: 2, ultra: 0 }
          : { common: 0, pro: 1, ultra: 0 };

    let coinsCharge = { ...baseCoins, feature: "music_generate" };
    let db = null;

    try {
      db = getFinancialDbOrThrow();
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "ai_music_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: {
            provider: replay.payload?.provider || "mock",
            model: replay.payload?.model || "mock-music-v1",
            replay: true,
            credit_type: parsed.quality === "high" ? "ultra" : "pro",
            durationSec: parsed.durationSec,
            quality: parsed.quality,
          },
        });
        return res.json(replay.payload);
      }

      coinsCharge = {
        ...(await resolveFeatureCoins("music_generate", baseCoins)),
        feature: "music_generate",
      };

      const guardResponse = await applyHeavyGuardsOrRespond(req, res, {
        db,
        featureKey: "ai_music_generate",
        providerKey: resolveProviderKeyForGuards("suno", req),
        providerMode: "mock_or_real",
        idempotencyKey,
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
      });
      if (guardResponse) return;

      const rawProviderResult = await debitThenExecuteOrRefund({
        db,
        userId: req.user.id,
        feature: "music_generate",
        idempotencyKey,
        costCommon: coinsCharge.common,
        costPro: coinsCharge.pro,
        costUltra: coinsCharge.ultra,
        executeFn: async () => {
          if (process.env.NODE_ENV === "development" && req.body?.debug_force_provider_error === true) {
            throw new Error("debug_forced_provider_error");
          }
          return runMusicGenerate({ input: parsed, idempotencyKey, routing: req.aiRouting });
        },
      });
      const result = normalizeProviderResult(rawProviderResult, routingCtx);
      setHeavyRouteProviderModeHeader(res, result.providerMode);
      if (!result.ok) {
        const providerError = new Error(result.error || "provider_unavailable");
        providerError.code = result.error || "provider_unavailable";
        throw providerError;
      }

      const responsePayload = {
        ok: true,
        jobId: result.jobId,
        status: result.status,
        provider: result.provider,
        model: result.model,
        estimated_seconds: result.estimated_seconds,
        assets: result.assets || {},
      };

      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "ai_music_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          credit_type: coinsCharge.ultra > 0 ? "ultra" : "pro",
          durationSec: parsed.durationSec,
          quality: parsed.quality,
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (String(e?.code || "").toLowerCase() === "invalid_music_request") {
        return res.status(400).json({ error: "invalid_music_request" });
      }

      if (isIdempotencyReplayError(e)) {
        const replayDb = db || getFinancialDbOrThrow();
        const replay = await readReplayOrConflict(idemDb || replayDb, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
        });
        if (replay.kind === "replay") return res.json(replay.payload);
        if (replay.kind === "conflict") {
          return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
        }
        const reconstructed = await buildFallbackReplayFromCoinsTx(replayDb, {
          userId: req.user.id,
          idempotencyKey,
          feature: "music_generate",
          endpoint,
        });
        if (reconstructed) return res.json(reconstructed);
        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemAlreadyProcessedMessage(req),
        });
      }

      if (e?.payload) {
        const mapped = mapFinancialError(e);
        if (idemDb || db) await saveIdempotentFailure(idemDb || db, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
          errorCode: mapped.body?.error || "coins_debit_failed",
          message: mapped.body?.details || mapped.body?.message || mapped.body?.error || "coins_debit_failed",
        });
        await trackAIUsage(req, {
          feature: "ai_music_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "error",
          costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
          meta: {
            provider: "error",
            model: "error",
            replay: false,
            error: mapped.body?.error || "coins_debit_failed",
            quality: parsed.quality,
          },
        });
        return res.status(mapped.status).json(mapped.body);
      }

      if (idemDb || db) await saveIdempotentFailure(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "provider_failed",
        message: e?.message || "provider_failed",
      });
      await trackAIUsage(req, {
        feature: "ai_music_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: "error",
          model: "error",
          replay: false,
          error: e?.message || "provider_failed",
          quality: parsed.quality,
        },
      });
      setHeavyRouteProviderModeHeader(res, normalizeProviderMode(routingCtx?.providerMode, routingCtx?.selectedProvider));
      return res.status(getAiContractErrorStatus(e, 502)).json(buildHeavyRouteProviderErrorPayload(req, "Falha ao gerar musica", e));
    }
  }
);

router.post(
  "/music-status",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "music_status", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const parsed = parseMusicStatusInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_music_request" });
    const routingCtx = getHeavyRouteRoutingContext(req);

    const endpoint = "ai_music_status";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    try {
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "ai_music_status",
          action: "status",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: {
            provider: replay.payload?.provider || "mock",
            model: replay.payload?.model || "mock-music-v1",
            replay: true,
            credit_type: "none",
          },
        });
        return res.json(replay.payload);
      }

      const guardResponse = await applyHeavyGuardsOrRespond(req, res, {
        db: null,
        featureKey: "ai_music_status",
        providerKey: resolveProviderKeyForGuards("suno", req),
        providerMode: "mock_or_real",
        idempotencyKey,
        costs: { common: 0, pro: 0, ultra: 0 },
      });
      if (guardResponse) return;

      const rawProviderResult = await runMusicStatus({ input: parsed, idempotencyKey, routing: req.aiRouting });
      const result = normalizeProviderResult(rawProviderResult, routingCtx);
      setHeavyRouteProviderModeHeader(res, result.providerMode);
      if (!result.ok) {
        const providerError = new Error(result.error || "provider_unavailable");
        providerError.code = result.error || "provider_unavailable";
        throw providerError;
      }
      const responsePayload = {
        ok: true,
        jobId: result.jobId,
        status: result.status,
        provider: result.provider,
        model: result.model,
        output: result.output || {},
      };

      const saveResult = await saveIdempotentResponse(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "ai_music_status",
        action: "status",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          credit_type: "none",
          jobIdPrefix: String(parsed.jobId).slice(0, 12),
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (String(e?.code || "").toLowerCase() === "invalid_music_request") {
        return res.status(400).json({ error: "invalid_music_request" });
      }

      if (idemDb) await saveIdempotentFailure(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "provider_failed",
        message: e?.message || "provider_failed",
      });
      await trackAIUsage(req, {
        feature: "ai_music_status",
        action: "status",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          provider: "error",
          model: "error",
          replay: false,
          error: e?.message || "provider_failed",
        },
      });
      setHeavyRouteProviderModeHeader(res, normalizeProviderMode(routingCtx?.providerMode, routingCtx?.selectedProvider));
      return res.status(getAiContractErrorStatus(e, 502)).json(buildHeavyRouteProviderErrorPayload(req, "Falha ao consultar status da musica", e));
    }
  }
);

router.post(
  "/voice-generate",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 15 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "voice_generate", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const parsed = parseVoiceGenerateInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_voice_request" });
    const voicePlanGuard = validatePlanFeatureRequest({
      planCode: req.plan?.code,
      feature: "voice_generate",
      body: req.body || {},
      parsedInput: parsed,
      mode: req.aiRouting?.mode,
    });
    if (rejectPlanFeatureViolation(req, res, voicePlanGuard)) return;
    const routingCtx = getHeavyRouteRoutingContext(req);

    const endpoint = "ai_voice_generate";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    const baseCoins =
      parsed.quality === "high"
        ? { common: 0, pro: 0, ultra: 1 }
        : parsed.quality === "medium"
          ? { common: 0, pro: 1, ultra: 0 }
          : { common: 1, pro: 0, ultra: 0 };

    let coinsCharge = { ...baseCoins, feature: "voice_generate" };
    let db = null;

    try {
      db = getFinancialDbOrThrow();
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "ai_voice_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: {
            provider: replay.payload?.provider || "mock",
            model: replay.payload?.model || "mock-voice-v1",
            replay: true,
            credit_type: parsed.quality === "high" ? "ultra" : parsed.quality === "medium" ? "pro" : "common",
            quality: parsed.quality,
            format: parsed.format,
          },
        });
        return res.json(replay.payload);
      }

      coinsCharge = {
        ...(await resolveFeatureCoins("voice_generate", baseCoins)),
        feature: "voice_generate",
      };

      const guardResponse = await applyHeavyGuardsOrRespond(req, res, {
        db,
        featureKey: "ai_voice_generate",
        providerKey: resolveProviderKeyForGuards("elevenlabs", req),
        providerMode: "mock_or_real",
        idempotencyKey,
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
      });
      if (guardResponse) return;

      const rawProviderResult = await debitThenExecuteOrRefund({
        db,
        userId: req.user.id,
        feature: "voice_generate",
        idempotencyKey,
        costCommon: coinsCharge.common,
        costPro: coinsCharge.pro,
        costUltra: coinsCharge.ultra,
        executeFn: async () => {
          if (process.env.NODE_ENV === "development" && req.body?.debug_force_provider_error === true) {
            throw new Error("debug_forced_provider_error");
          }
          return runVoiceGenerate({ input: parsed, idempotencyKey, routing: req.aiRouting });
        },
      });
      const result = normalizeProviderResult(rawProviderResult, routingCtx);
      setHeavyRouteProviderModeHeader(res, result.providerMode);
      if (!result.ok) {
        const providerError = new Error(result.error || "provider_unavailable");
        providerError.code = result.error || "provider_unavailable";
        throw providerError;
      }

      const responsePayload = {
        ok: true,
        jobId: result.jobId,
        status: result.status,
        provider: result.provider,
        model: result.model,
        estimated_seconds: result.estimated_seconds,
        assets: result.assets || {},
      };

      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "ai_voice_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          credit_type: coinsCharge.ultra > 0 ? "ultra" : coinsCharge.pro > 0 ? "pro" : "common",
          quality: parsed.quality,
          format: parsed.format,
          language: parsed.language,
          voiceId: parsed.voiceId,
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (String(e?.code || "").toLowerCase() === "invalid_voice_request") {
        return res.status(400).json({ error: "invalid_voice_request" });
      }

      if (isIdempotencyReplayError(e)) {
        const replayDb = db || getFinancialDbOrThrow();
        const replay = await readReplayOrConflict(idemDb || replayDb, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
        });
        if (replay.kind === "replay") return res.json(replay.payload);
        if (replay.kind === "conflict") {
          return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
        }
        const reconstructed = await buildFallbackReplayFromCoinsTx(replayDb, {
          userId: req.user.id,
          idempotencyKey,
          feature: "voice_generate",
          endpoint,
        });
        if (reconstructed) return res.json(reconstructed);
        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemAlreadyProcessedMessage(req),
        });
      }

      if (e?.payload) {
        const mapped = mapFinancialError(e);
        if (idemDb || db) await saveIdempotentFailure(idemDb || db, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
          errorCode: mapped.body?.error || "coins_debit_failed",
          message: mapped.body?.details || mapped.body?.message || mapped.body?.error || "coins_debit_failed",
        });
        await trackAIUsage(req, {
          feature: "ai_voice_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "error",
          costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
          meta: {
            provider: "error",
            model: "error",
            replay: false,
            error: mapped.body?.error || "coins_debit_failed",
            quality: parsed.quality,
            format: parsed.format,
          },
        });
        return res.status(mapped.status).json(mapped.body);
      }

      if (idemDb || db) await saveIdempotentFailure(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "provider_failed",
        message: e?.message || "provider_failed",
      });
      await trackAIUsage(req, {
        feature: "ai_voice_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: "error",
          model: "error",
          replay: false,
          error: e?.message || "provider_failed",
          quality: parsed.quality,
          format: parsed.format,
        },
      });
      setHeavyRouteProviderModeHeader(res, normalizeProviderMode(routingCtx?.providerMode, routingCtx?.selectedProvider));
      return res.status(getAiContractErrorStatus(e, 502)).json(buildHeavyRouteProviderErrorPayload(req, "Falha ao gerar voz", e));
    }
  }
);

router.post(
  "/voice-status",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 15 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "voice_status", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const parsed = parseVoiceStatusInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_voice_request" });
    const routingCtx = getHeavyRouteRoutingContext(req);

    const endpoint = "ai_voice_status";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    try {
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "ai_voice_status",
          action: "status",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: {
            provider: replay.payload?.provider || "mock",
            model: replay.payload?.model || "mock-voice-v1",
            replay: true,
            credit_type: "none",
          },
        });
        return res.json(replay.payload);
      }

      const guardResponse = await applyHeavyGuardsOrRespond(req, res, {
        db: null,
        featureKey: "ai_voice_status",
        providerKey: resolveProviderKeyForGuards("elevenlabs", req),
        providerMode: "mock_or_real",
        idempotencyKey,
        costs: { common: 0, pro: 0, ultra: 0 },
      });
      if (guardResponse) return;

      const rawProviderResult = await runVoiceStatus({ input: parsed, idempotencyKey, routing: req.aiRouting });
      const result = normalizeProviderResult(rawProviderResult, routingCtx);
      setHeavyRouteProviderModeHeader(res, result.providerMode);
      if (!result.ok) {
        const providerError = new Error(result.error || "provider_unavailable");
        providerError.code = result.error || "provider_unavailable";
        throw providerError;
      }
      const responsePayload = {
        ok: true,
        jobId: result.jobId,
        status: result.status,
        provider: result.provider,
        model: result.model,
        output: result.output || {},
      };

      const saveResult = await saveIdempotentResponse(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "ai_voice_status",
        action: "status",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          credit_type: "none",
          jobIdPrefix: String(parsed.jobId).slice(0, 12),
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (String(e?.code || "").toLowerCase() === "invalid_voice_request") {
        return res.status(400).json({ error: "invalid_voice_request" });
      }

      if (idemDb) await saveIdempotentFailure(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "provider_failed",
        message: e?.message || "provider_failed",
      });
      await trackAIUsage(req, {
        feature: "ai_voice_status",
        action: "status",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          provider: "error",
          model: "error",
          replay: false,
          error: e?.message || "provider_failed",
        },
      });
      setHeavyRouteProviderModeHeader(res, normalizeProviderMode(routingCtx?.providerMode, routingCtx?.selectedProvider));
      return res.status(getAiContractErrorStatus(e, 502)).json(buildHeavyRouteProviderErrorPayload(req, "Falha ao consultar status da voz", e));
    }
  }
);

router.post(
  "/slides-generate",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "slides_generate", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const parsed = parseSlidesGenerateInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_slides_request" });
    const slidesPlanGuard = validatePlanFeatureRequest({
      planCode: req.plan?.code,
      feature: "slides_generate",
      body: req.body || {},
      parsedInput: parsed,
      mode: req.aiRouting?.mode,
    });
    if (rejectPlanFeatureViolation(req, res, slidesPlanGuard)) return;
    const routingCtx = getHeavyRouteRoutingContext(req);

    const endpoint = "ai_slides_generate";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    const baseCoins =
      parsed.quality === "high"
        ? { common: 0, pro: 0, ultra: 1 }
        : parsed.quality === "medium"
          ? { common: 0, pro: 1, ultra: 0 }
          : { common: 1, pro: 0, ultra: 0 };

    let coinsCharge = { ...baseCoins, feature: "slides_generate" };
    let db = null;

    try {
      db = getFinancialDbOrThrow();
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "slides_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: {
            provider: replay.payload?.provider || "mock",
            model: replay.payload?.model || "mock-slides-v1",
            replay: true,
            quality: parsed.quality,
            slideCount: parsed.slideCount,
          },
        });
        return res.json(replay.payload);
      }

      coinsCharge = {
        ...(await resolveFeatureCoins("slides_generate", baseCoins)),
        feature: "slides_generate",
      };

      const guardResponse = await applyHeavyGuardsOrRespond(req, res, {
        db,
        featureKey: "ai_slides_generate",
        providerKey: resolveProviderKeyForGuards("openai", req),
        providerMode: "mock_or_real",
        idempotencyKey,
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
      });
      if (guardResponse) return;

      const rawProviderResult = await debitThenExecuteOrRefund({
        db,
        userId: req.user.id,
        feature: "slides_generate",
        idempotencyKey,
        costCommon: coinsCharge.common,
        costPro: coinsCharge.pro,
        costUltra: coinsCharge.ultra,
        executeFn: async () => {
          if (process.env.NODE_ENV === "development" && req.body?.debug_force_provider_error === true) {
            throw new Error("debug_forced_provider_error");
          }
          return runSlidesGenerate({ input: parsed, idempotencyKey, routing: req.aiRouting });
        },
      });
      const result = normalizeProviderResult(rawProviderResult, routingCtx);
      setHeavyRouteProviderModeHeader(res, result.providerMode);
      if (!result.ok) {
        const providerError = new Error(result.error || "provider_unavailable");
        providerError.code = result.error || "provider_unavailable";
        throw providerError;
      }

      const responsePayload = {
        ok: true,
        jobId: result.jobId,
        status: result.status,
        estimated_seconds: result.estimated_seconds,
        assets: result.assets || {},
        provider: result.provider,
        model: result.model,
      };

      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "slides_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          quality: parsed.quality,
          slideCount: parsed.slideCount,
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (String(e?.code || "").toLowerCase() === "invalid_slides_request") {
        return res.status(400).json({ error: "invalid_slides_request" });
      }

      if (isIdempotencyReplayError(e)) {
        const replayDb = db || getFinancialDbOrThrow();
        const replay = await readReplayOrConflict(idemDb || replayDb, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
        });
        if (replay.kind === "replay") return res.json(replay.payload);
        if (replay.kind === "conflict") {
          return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
        }
        const reconstructed = await buildFallbackReplayFromCoinsTx(replayDb, {
          userId: req.user.id,
          idempotencyKey,
          feature: "slides_generate",
          endpoint,
        });
        if (reconstructed) return res.json(reconstructed);
        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemAlreadyProcessedMessage(req),
        });
      }

      if (e?.payload) {
        const mapped = mapFinancialError(e);
        if (idemDb || db) await saveIdempotentFailure(idemDb || db, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
          errorCode: mapped.body?.error || "coins_debit_failed",
          message: mapped.body?.details || mapped.body?.message || mapped.body?.error || "coins_debit_failed",
        });
        await trackAIUsage(req, {
          feature: "slides_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "error",
          costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
          meta: {
            provider: "error",
            model: "error",
            replay: false,
            error: mapped.body?.error || "coins_debit_failed",
            quality: parsed.quality,
            slideCount: parsed.slideCount,
          },
        });
        return res.status(mapped.status).json(mapped.body);
      }

      if (idemDb || db) await saveIdempotentFailure(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "provider_failed",
        message: e?.message || "provider_failed",
      });
      await trackAIUsage(req, {
        feature: "slides_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: "error",
          model: "error",
          replay: false,
          error: e?.message || "provider_failed",
          quality: parsed.quality,
          slideCount: parsed.slideCount,
        },
      });
      setHeavyRouteProviderModeHeader(res, normalizeProviderMode(routingCtx?.providerMode, routingCtx?.selectedProvider));
      return res.status(getAiContractErrorStatus(e, 502)).json(buildHeavyRouteProviderErrorPayload(req, "Falha ao gerar slides", e));
    }
  }
);

router.post(
  "/slides-status",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 20 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "slides_status", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const parsed = parseSlidesStatusInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: "invalid_slides_request" });
    const routingCtx = getHeavyRouteRoutingContext(req);

    const endpoint = "ai_slides_status";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    try {
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "storage_failed") {
        logger.warn("ai.idem.cache_read_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      if (replay.kind === "conflict") {
        return res.status(409).json({ error: "idempotency_conflict", message: idemConflictMessage(req) });
      }
      if (replay.kind === "replay") {
        await trackAIUsage(req, {
          feature: "slides_status",
          action: "status",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: {
            provider: replay.payload?.provider || "mock",
            model: replay.payload?.model || "mock-slides-v1",
            replay: true,
          },
        });
        return res.json(replay.payload);
      }

      const guardResponse = await applyHeavyGuardsOrRespond(req, res, {
        db: null,
        featureKey: "ai_slides_status",
        providerKey: resolveProviderKeyForGuards("openai", req),
        providerMode: "mock_or_real",
        idempotencyKey,
        costs: { common: 0, pro: 0, ultra: 0 },
      });
      if (guardResponse) return;

      const rawProviderResult = await runSlidesStatus({ input: parsed, idempotencyKey, routing: req.aiRouting });
      const result = normalizeProviderResult(rawProviderResult, routingCtx);
      setHeavyRouteProviderModeHeader(res, result.providerMode);
      if (!result.ok) {
        const providerError = new Error(result.error || "provider_unavailable");
        providerError.code = result.error || "provider_unavailable";
        throw providerError;
      }
      const responsePayload = {
        ok: true,
        jobId: result.jobId,
        status: result.status,
        output: result.output || {},
        provider: result.provider,
        model: result.model,
      };

      const saveResult = await saveIdempotentResponse(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (saveResult.cacheFallback === "memory") {
        logger.warn("ai.idem.cache_mem_used", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "slides_status",
        action: "status",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          jobIdPrefix: String(parsed.jobId).slice(0, 12),
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (String(e?.code || "").toLowerCase() === "invalid_slides_request") {
        return res.status(400).json({ error: "invalid_slides_request" });
      }

      if (idemDb) await saveIdempotentFailure(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        errorCode: "provider_failed",
        message: e?.message || "provider_failed",
      });
      await trackAIUsage(req, {
        feature: "slides_status",
        action: "status",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          provider: "error",
          model: "error",
          replay: false,
          error: e?.message || "provider_failed",
        },
      });
      setHeavyRouteProviderModeHeader(res, normalizeProviderMode(routingCtx?.providerMode, routingCtx?.selectedProvider));
      return res.status(getAiContractErrorStatus(e, 502)).json(buildHeavyRouteProviderErrorPayload(req, "Falha ao consultar status dos slides", e));
    }
  }
);

/**
 * POST /api/ai/text-generate
 * body: { prompt: string }
 */
router.post(
  "/text-generate",
  authMiddleware,
  attachPlan,
  featureRateLimit({ windowMs: 60_000, max: 30 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "text_generate", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const prompt = String(req.body?.prompt || "").trim();
    const language = String(req.body?.language || "pt-BR").trim() || "pt-BR";
    const requestedMaxTokens = Number(req.body?.max_tokens ?? req.body?.maxTokens ?? MAX_TOKENS_BY_TIER.common);
    if (!Number.isFinite(requestedMaxTokens) || requestedMaxTokens <= 0) {
      return res.status(400).json({ error: "invalid_max_tokens" });
    }

    const maxAllowedTokens = resolveMaxAllowedTokens(req.plan);
    if (requestedMaxTokens > maxAllowedTokens) {
      return res.status(400).json({
        error: "token_limit_exceeded",
        max_allowed: maxAllowedTokens,
      });
    }
    if (!prompt) return res.status(400).json({ error: "prompt é obrigatório" });

    let coinsCharge = { common: 0, pro: 0, ultra: 0, feature: "text_generate" };
    const endpoint = "ai_text_generate";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    let db = null;
    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    try {
      db = getFinancialDbOrThrow();
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "conflict") {
        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemConflictMessage(req),
        });
      }
      if (replay.kind === "replay") {
        const replayPayload = { ...(replay.payload || {}), replay: true };
        await trackAIUsage(req, {
          feature: "text_generate",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: { provider: replay.payload?.provider || "mock", model: replay.payload?.model || "mock", replay: true },
        });
        return res.json(replayPayload);
      }

      try {
        await ensureCreditsOrAutoConvert({
          userId: req.user.id,
          requiredTier: "common",
          requiredAmount: 1,
          planCode: req.plan?.code,
        });
      } catch (creditsError) {
        const status = Number(creditsError?.status || 400);
        const payload = creditsError?.payload || { error: creditsError?.code || "ensure_credits_failed" };
        logger.warn("ai_text_generate_blocked", {
          userId: req.user?.id,
          feature: "text_generate",
          status: payload?.error || "ensure_credits_failed",
          idempotencyKeyPrefix: String(idempotencyKey).slice(0, 8),
        });
        return res.status(status).json(payload);
      }

      coinsCharge = {
        ...(await resolveFeatureCoins(
          "text_generate",
          requestedMaxTokens > MAX_TOKENS_BY_TIER.common ? { pro: 1 } : { common: 1 }
        )),
        feature: "text_generate",
      };

      const r = await debitThenExecuteOrRefund({
        db,
        userId: req.user.id,
        feature: "text_generate",
        idempotencyKey,
        costCommon: coinsCharge.common,
        costPro: coinsCharge.pro,
        costUltra: coinsCharge.ultra,
        executeFn: async () => {
          if (process.env.NODE_ENV === "development" && req.body?.debug_force_provider_error === true) {
            throw new Error("debug_forced_provider_error");
          }
          return runGenerateText({
            input: { prompt, language, maxTokens: requestedMaxTokens, idempotencyKey },
            user: req.user,
            plan: req.plan,
            routing: req.aiRouting,
          });
        },
      });

      await safeLogUsage(req, {
        provider: r.provider,
        model: r.model,
        feature: "text_generate",
        meta: {
          plan: req.plan?.code,
          path: req.originalUrl,
          usage: r.meta?.usage || null,
          coins: coinsCharge,
        },
      });

      const responsePayload = {
        ok: true,
        text: r.output?.text || "",
        provider: r.provider,
        model: r.model,
        usage: r.meta?.usage || null,
      };
      const tokensUsed = Number(responsePayload?.usage?.input_tokens || 0) + Number(responsePayload?.usage?.output_tokens || 0);

      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (!saveResult.writeOk) {
        logger.warn("ai.idem.cache_write_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }

      await trackAIUsage(req, {
        feature: "text_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          tokens_used: tokensUsed,
          credit_type: coinsCharge.pro > 0 ? "pro" : "common",
          max_tokens: requestedMaxTokens,
          language,
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (isIdempotencyReplayError(e)) {
        const replayDb = db || getFinancialDbOrThrow();
        const replay = await readReplayOrConflict(idemDb || replayDb, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
        });
        if (replay.kind === "replay") {
          const replayPayload = { ...(replay.payload || {}), replay: true };
          await trackAIUsage(req, {
            feature: "text_generate",
            action: "generate",
            idempotencyKey,
            requestHash,
            status: "replay",
            costs: { common: 0, pro: 0, ultra: 0 },
            meta: { provider: replay.payload?.provider || "mock", model: replay.payload?.model || "mock", replay: true },
          });
          return res.json(replayPayload);
        }
        if (replay.kind === "conflict") {
          return res.status(409).json({
            error: "idempotency_conflict",
            message: idemConflictMessage(req),
          });
        }

        const reconstructed = await buildFallbackReplayFromCoinsTx(replayDb, {
          userId: req.user.id,
          idempotencyKey,
          feature: "text_generate",
          endpoint,
        });
        if (reconstructed) {
          const reconstructedPayload = { ...(reconstructed || {}), replay: true, reconstructed: true };
          await trackAIUsage(req, {
            feature: "text_generate",
            action: "generate",
            idempotencyKey,
            requestHash,
            status: "replay",
            costs: { common: 0, pro: 0, ultra: 0 },
            meta: { replay: true, reconstructed: true },
          });
          return res.json(reconstructedPayload);
        }

        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemAlreadyProcessedMessage(req),
        });
      }

      if (e?.payload) {
        const mapped = mapFinancialError(e);
        if (idemDb || db)
          await saveIdempotentFailure(idemDb || db, {
            userId: req.user.id,
            endpoint,
            key: idempotencyKey,
            requestHash,
            errorCode: mapped.body?.error || "coins_debit_failed",
            message: mapped.body?.details || mapped.body?.message || mapped.body?.error || "coins_debit_failed",
          });
        logger.warn("ai_text_generate_blocked", {
          userId: req.user?.id,
          feature: "text_generate",
          status: mapped.body?.error || "blocked",
          idempotencyKeyPrefix: String(idempotencyKey).slice(0, 8),
        });
        return res.status(mapped.status).json(mapped.body);
      }

      await safeLogUsage(req, {
        provider: "error",
        model: "error",
        feature: "text_generate",
        meta: { message: e?.message || "error", coins: coinsCharge },
      });
      if (idemDb || db)
        await saveIdempotentFailure(idemDb || db, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
          errorCode: "provider_failed",
          message: e?.message || "provider_failed",
        });
      await trackAIUsage(req, {
        feature: "text_generate",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: "error",
          model: "error",
          replay: false,
          error: e?.message || "provider_failed",
          max_tokens: requestedMaxTokens,
          language,
        },
      });

      return res.status(getAiContractErrorStatus(e, 502)).json(
        buildProviderRouteErrorPayload(req, "Falha ao gerar texto", e)
      );
    }
  }
);

/**
 * POST /api/ai/fact-check
 * body: { claim: string, query?: string }
 */
router.post(
  "/fact-check",
  authMiddleware,
  attachPlan,
  requireFeature("internet_search", { minTierFallback: 1 }),
  featureRateLimit({ windowMs: 60_000, max: 15 }),
  async (req, res) => {
    await applyRoutingContext(req, { feature: "fact_check", body: req.body });
    if (rejectDisallowedManualRouting(req, res)) return;
    const claim = String(req.body?.claim || "").trim();
    const query = String(req.body?.query || "").trim();
    const language = String(req.body?.language || "pt-BR").trim() || "pt-BR";

    if (!claim) return res.status(400).json({ error: "claim é obrigatório" });

    let coinsCharge = { common: 0, pro: 0, ultra: 0, feature: "fact_check" };
    const endpoint = "ai_fact_check";
    const idem = getCanonicalIdempotencyContext(req, res, endpoint);
    if (!idem) return;
    const idempotencyKey = idem.key;
    const requestHash = idem.requestHash;
    let db = null;
    const idemDb = getIdempotencyDb(req);
    if (!ensureIdempotencyStorageConfigured(req, res, idemDb)) return;

    try {
      db = getFinancialDbOrThrow();
      const quotaResult = assertAiQuota(req, res, endpoint);
      if (quotaResult !== true) return;

      const replay = await readReplayOrConflict(idemDb, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
      });
      if (replay.kind === "conflict") {
        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemConflictMessage(req),
        });
      }
      if (replay.kind === "replay") {
        const replayPayload = { ...(replay.payload || {}), replay: true };
        await trackAIUsage(req, {
          feature: "fact_check",
          action: "generate",
          idempotencyKey,
          requestHash,
          status: "replay",
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: { provider: replay.payload?.provider || "mock", model: replay.payload?.model || "mock", replay: true },
        });
        return res.json(replayPayload);
      }

      coinsCharge = {
        ...(await resolveFeatureCoins("fact_check", { common: 1 })),
        feature: "fact_check",
      };

      const fcCfg = await getConfig("fact_check").catch(() => null);
      const sources_limit = Number(fcCfg?.sources_limit || 6);
      const disallow_domains = Array.isArray(fcCfg?.disallow_domains) ? fcCfg.disallow_domains : [];

      const r = await debitThenExecuteOrRefund({
        db,
        userId: req.user.id,
        feature: "fact_check",
        idempotencyKey,
        costCommon: coinsCharge.common,
        costPro: coinsCharge.pro,
        costUltra: coinsCharge.ultra,
        executeFn: async () => {
          if (process.env.NODE_ENV === "development" && req.body?.debug_force_provider_error === true) {
            throw new Error("debug_forced_provider_error");
          }
          return runFactCheck({
            input: {
              text: claim,
              query: query || undefined,
              language,
              sources_limit,
              disallow_domains,
              idempotencyKey,
            },
            user: req.user,
            plan: req.plan,
            routing: req.aiRouting,
          });
        },
      });

      let factCheckId = null;
      if (isSupabaseAdminEnabled()) {
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("fact_checks")
          .insert({
            user_id: req.user.id,
            claim,
            query: query || null,
            verdict: r.output?.verdict || "INSUFFICIENT",
            confidence: Number(r.output?.confidence || 0) / 100,
            summary: r.output?.summary || "",
            provider: r.provider,
            model: r.model,
            search_provider: r.meta?.search_provider || process.env.SEARCH_PROVIDER || null,
            citations: r.output?.citations || [],
            meta: {
              plan: req.plan?.code,
              coins: coinsCharge,
              sources_limit,
            },
          })
          .select("id")
          .maybeSingle();

        factCheckId = inserted?.id || null;

        if (!insErr && factCheckId && Array.isArray(r.output?.sources)) {
          const sources = r.output.sources.slice(0, 20).map((s, idx) => ({
            fact_check_id: factCheckId,
            rank: idx + 1,
            title: s.title || null,
            url: s.url,
            snippet: s.snippet || null,
            source_name: s.source || null,
          }));

          if (sources.length) {
            await supabaseAdmin.from("fact_check_sources").insert(sources);
          }
        }
      }

      await safeLogUsage(req, {
        provider: r.provider,
        model: r.model,
        feature: "fact_check",
        meta: {
          plan: req.plan?.code,
          path: req.originalUrl,
          verdict: r.output?.verdict,
          confidence: r.output?.confidence,
          citations: r.output?.citations || [],
          usage: r.meta?.usage || null,
          search_provider: r.meta?.search_provider,
          coins: coinsCharge,
          saved: Boolean(factCheckId),
        },
      });

      const responsePayload = { ok: true, id: factCheckId, ...r.output, provider: r.provider, model: r.model };
      const saveResult = await saveIdempotentResponse(idemDb || db, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: responsePayload,
      });
      if (!saveResult.writeOk) {
        logger.warn("ai.idem.cache_write_bypassed", {
          endpoint,
          key: maskKey(idempotencyKey),
          user_id_mask: maskId(req.user.id),
        });
      }
      await trackAIUsage(req, {
        feature: "fact_check",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "success",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: responsePayload.provider,
          model: responsePayload.model,
          replay: false,
          tokens_used: Number(r?.meta?.usage?.input_tokens || 0) + Number(r?.meta?.usage?.output_tokens || 0),
          credit_type: "common",
          language,
        },
      });

      return res.json(saveResult.payload);
    } catch (e) {
      if (isIdempotencyReplayError(e)) {
        const replayDb = db || getFinancialDbOrThrow();
        const replay = await readReplayOrConflict(idemDb || replayDb, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
        });
        if (replay.kind === "replay") {
          const replayPayload = { ...(replay.payload || {}), replay: true };
          await trackAIUsage(req, {
            feature: "fact_check",
            action: "generate",
            idempotencyKey,
            requestHash,
            status: "replay",
            costs: { common: 0, pro: 0, ultra: 0 },
            meta: { provider: replay.payload?.provider || "mock", model: replay.payload?.model || "mock", replay: true },
          });
          return res.json(replayPayload);
        }
        if (replay.kind === "conflict") {
          return res.status(409).json({
            error: "idempotency_conflict",
            message: idemConflictMessage(req),
          });
        }

        const reconstructed = await buildFallbackReplayFromCoinsTx(replayDb, {
          userId: req.user.id,
          idempotencyKey,
          feature: "fact_check",
          endpoint,
        });
        if (reconstructed) {
          const reconstructedPayload = { ...(reconstructed || {}), replay: true, reconstructed: true };
          await trackAIUsage(req, {
            feature: "fact_check",
            action: "generate",
            idempotencyKey,
            requestHash,
            status: "replay",
            costs: { common: 0, pro: 0, ultra: 0 },
            meta: { replay: true, reconstructed: true },
          });
          return res.json(reconstructedPayload);
        }

        return res.status(409).json({
          error: "idempotency_conflict",
          message: idemAlreadyProcessedMessage(req),
        });
      }

      if (e?.payload) {
        const mapped = mapFinancialError(e);
        if (idemDb || db)
          await saveIdempotentFailure(idemDb || db, {
            userId: req.user.id,
            endpoint,
            key: idempotencyKey,
            requestHash,
            errorCode: mapped.body?.error || "coins_debit_failed",
            message: mapped.body?.details || mapped.body?.message || mapped.body?.error || "coins_debit_failed",
          });
        logger.warn("ai_fact_check_blocked", {
          userId: req.user?.id,
          feature: "fact_check",
          status: mapped.body?.error || "blocked",
          idempotencyKeyPrefix: String(idempotencyKey).slice(0, 8),
        });
        return res.status(mapped.status).json(mapped.body);
      }

      await safeLogUsage(req, {
        provider: "error",
        model: "error",
        feature: "fact_check",
        meta: { message: e?.message || "error", coins: coinsCharge },
      });
      if (idemDb || db)
        await saveIdempotentFailure(idemDb || db, {
          userId: req.user.id,
          endpoint,
          key: idempotencyKey,
          requestHash,
          errorCode: "provider_failed",
          message: e?.message || "provider_failed",
        });
      await trackAIUsage(req, {
        feature: "fact_check",
        action: "generate",
        idempotencyKey,
        requestHash,
        status: "error",
        costs: { common: coinsCharge.common, pro: coinsCharge.pro, ultra: coinsCharge.ultra },
        meta: {
          provider: "error",
          model: "error",
          replay: false,
          error: e?.message || "provider_failed",
          language,
        },
      });

      return res.status(getAiContractErrorStatus(e, 502)).json(
        buildProviderRouteErrorPayload(req, "Falha ao checar a afirmação", e)
      );
    }
  }
);

async function safeLogUsage(req, { provider, model, feature, meta }) {
  if (!isSupabaseAdminEnabled()) return;

  try {
    await supabaseAdmin.from("ai_usage").insert({
      user_id: req.user.id,
      provider: provider || "unknown",
      model: model || "unknown",
      feature,
      coins_type: null,
      coins_amount: 0,
      meta: meta || {},
    });
  } catch {
    // não bloquear resposta por falha de log
  }
}

export default router;

