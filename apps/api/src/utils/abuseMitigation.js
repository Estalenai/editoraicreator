import { getConfig } from "./configCache.js";
import { logger } from "./logger.js";
import { metricIncrement } from "./metrics.js";

const COST_WEIGHTS = {
  common: 0.01,
  pro: 0.03,
  ultra: 0.12,
};

const SIGNAL_WINDOW_MS = 10 * 60 * 1000;
const BURST_WINDOW_MS = 60 * 1000;
const REQUEST_EVENTS = new Map();
const STATUS_EVENTS = new Map();
const BUDGET_IDEMPOTENCY = new Map();
const BUDGET_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function normalizeFeatureKey(featureKey) {
  const raw = String(featureKey || "").trim().toLowerCase();
  if (!raw) return "unknown";
  return raw.startsWith("ai_") ? raw : `ai_${raw}`;
}

function getScopeKey(req) {
  const userId = req?.user?.id ? String(req.user.id) : "anonymous";
  const ip = String(req?.ip || req?.headers?.["x-forwarded-for"] || "unknown");
  return req?.user?.id ? `user:${userId}` : `ip:${ip}`;
}

function pruneEvents(map, key, windowMs) {
  const current = map.get(key) || [];
  const cutoff = nowMs() - windowMs;
  const next = current.filter((entry) => Number(entry?.ts || 0) >= cutoff);
  map.set(key, next);
  return next;
}

function rememberRequest(scopeKey, featureKey) {
  const key = `${scopeKey}:${featureKey}:requests`;
  const current = pruneEvents(REQUEST_EVENTS, key, SIGNAL_WINDOW_MS);
  current.push({ ts: nowMs() });
  REQUEST_EVENTS.set(key, current);
}

export function recordRiskOutcome(req, { featureKey, statusCode }) {
  const normalizedFeature = normalizeFeatureKey(featureKey);
  const scopeKey = getScopeKey(req);
  const key = `${scopeKey}:${normalizedFeature}:status`;
  const current = pruneEvents(STATUS_EVENTS, key, SIGNAL_WINDOW_MS);
  current.push({ ts: nowMs(), statusCode: Number(statusCode || 0) });
  STATUS_EVENTS.set(key, current);
}

function classifyRisk(score) {
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function computeRiskScore(req, ctx = {}) {
  const normalizedFeature = normalizeFeatureKey(ctx.featureKey);
  const scopeKey = getScopeKey(req);
  rememberRequest(scopeKey, normalizedFeature);

  const reqKey = `${scopeKey}:${normalizedFeature}:requests`;
  const statusKey = `${scopeKey}:${normalizedFeature}:status`;
  const reqEvents = pruneEvents(REQUEST_EVENTS, reqKey, SIGNAL_WINDOW_MS);
  const statusEvents = pruneEvents(STATUS_EVENTS, statusKey, SIGNAL_WINDOW_MS);

  let score = 0;
  // Heavy features start with a higher baseline risk.
  score += 25;

  const burstCount = reqEvents.filter((entry) => nowMs() - Number(entry.ts || 0) <= BURST_WINDOW_MS).length;
  if (burstCount >= 15) score += 45;
  else if (burstCount >= 8) score += 25;
  else if (burstCount >= 5) score += 10;

  const recent429 = statusEvents.filter((entry) => Number(entry.statusCode || 0) === 429).length;
  const recent409 = statusEvents.filter((entry) => Number(entry.statusCode || 0) === 409).length;
  score += Math.min(30, recent429 * 8);
  score += Math.min(20, recent409 * 5);

  const level = classifyRisk(score);
  return { score, level, scopeKey, featureKey: normalizedFeature, burstCount, recent429, recent409 };
}

export async function getFeatureKillSwitch(featureKey, { providerKey = null } = {}) {
  const normalizedFeature = normalizeFeatureKey(featureKey);
  const normalizedProvider = String(providerKey || "").trim().toLowerCase() || null;

  const [
    rootCfg,
    featureCfg,
    providerCfg,
  ] = await Promise.all([
    getConfig("abuse.kill_switch").catch(() => null),
    getConfig(`abuse.kill_switch.${normalizedFeature}`).catch(() => null),
    normalizedProvider ? getConfig(`abuse.kill_switch.provider.${normalizedProvider}`).catch(() => null) : Promise.resolve(null),
  ]);

  const rootByFeature = Boolean(rootCfg?.features?.[normalizedFeature] === true);
  const rootByProvider = normalizedProvider ? Boolean(rootCfg?.providers?.[normalizedProvider] === true) : false;
  const featureEnabled = typeof featureCfg === "boolean" ? featureCfg : Boolean(featureCfg?.enabled === true);
  const providerEnabled = typeof providerCfg === "boolean" ? providerCfg : Boolean(providerCfg?.enabled === true);

  const enabled = rootByFeature || rootByProvider || featureEnabled || providerEnabled;
  const reason =
    featureCfg?.reason ||
    providerCfg?.reason ||
    rootCfg?.reason ||
    null;
  const retryAfterSeconds =
    Number(featureCfg?.retry_after_seconds || providerCfg?.retry_after_seconds || rootCfg?.retry_after_seconds || 0) || null;

  return {
    enabled,
    feature: normalizedFeature,
    provider: normalizedProvider,
    reason,
    retry_after_seconds: retryAfterSeconds,
  };
}

function computeInternalCostScore(costs = {}) {
  const common = Number(costs.common || 0);
  const pro = Number(costs.pro || 0);
  const ultra = Number(costs.ultra || 0);
  const weighted = common * COST_WEIGHTS.common + pro * COST_WEIGHTS.pro + ultra * COST_WEIGHTS.ultra;
  return Number(weighted.toFixed(4));
}

function budgetIdemKey({ userId, featureKey, idempotencyKey }) {
  return `${String(userId || "anonymous")}:${normalizeFeatureKey(featureKey)}:${String(idempotencyKey || "")}`;
}

function pruneBudgetIdempotency() {
  const cutoff = nowMs() - BUDGET_IDEMPOTENCY_TTL_MS;
  for (const [key, entry] of BUDGET_IDEMPOTENCY.entries()) {
    if (Number(entry?.ts || 0) < cutoff) BUDGET_IDEMPOTENCY.delete(key);
  }
}

async function consumeBudgetScore(db, { scopeType, scopeId, score, limit }) {
  if (!db) return { ok: true, skipped: true };
  if (!Number.isFinite(Number(score)) || Number(score) <= 0) return { ok: true, skipped: true };
  if (!Number.isFinite(Number(limit)) || Number(limit) <= 0) return { ok: true, skipped: true };

  const { data, error } = await db.rpc("usage_budgets_consume_v1", {
    p_scope_type: scopeType,
    p_scope_id: scopeId || null,
    p_score: Number(score),
    p_limit: Number(limit),
  });

  if (error) {
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("usage_budgets_consume_v1") || msg.includes("usage_budgets_daily")) {
      return { ok: true, skipped: true };
    }
    throw error;
  }

  if (data?.allowed === false) {
    return {
      ok: false,
      blocked: true,
      scope: scopeType,
      limit: Number(data?.limit || limit),
      remaining: Number(data?.remaining || 0),
      reset_at: data?.reset_at || null,
      current: Number(data?.current || 0),
    };
  }

  return {
    ok: true,
    scope: scopeType,
    remaining: Number(data?.remaining || 0),
    current: Number(data?.current || 0),
  };
}

async function enforceBudgetLimit(db, { req, featureKey, idempotencyKey, costs }) {
  const userId = req?.user?.id ? String(req.user.id) : null;
  if (!userId) return { ok: true, skipped: true };
  const score = computeInternalCostScore(costs);
  if (score <= 0) return { ok: true, skipped: true };

  const cfg = await getConfig("abuse.budget_limits").catch(() => null);
  const userLimit = Number(
    cfg?.user_daily_internal_cost_score ??
      cfg?.user_daily_score ??
      250
  );
  const globalLimit = Number(
    cfg?.global_daily_internal_cost_score ??
      cfg?.global_daily_score ??
      25000
  );

  const idemKey = budgetIdemKey({ userId, featureKey, idempotencyKey });
  pruneBudgetIdempotency();
  if (idempotencyKey && BUDGET_IDEMPOTENCY.has(idemKey)) {
    return { ok: true, skipped: true };
  }

  const userResult = await consumeBudgetScore(db, {
    scopeType: "user",
    scopeId: userId,
    score,
    limit: userLimit,
  });
  if (userResult.blocked) return userResult;

  const globalResult = await consumeBudgetScore(db, {
    scopeType: "global",
    scopeId: null,
    score,
    limit: globalLimit,
  });
  if (globalResult.blocked) return globalResult;

  if (idempotencyKey) {
    BUDGET_IDEMPOTENCY.set(idemKey, { ts: nowMs() });
  }
  return { ok: true, score };
}

export async function applyHeavyFeatureAbuseGuards({
  req,
  res,
  db,
  featureKey,
  providerKey = null,
  providerMode = "mock_or_real",
  idempotencyKey = "",
  costs = {},
}) {
  const normalizedFeature = normalizeFeatureKey(featureKey);
  const risk = computeRiskScore(req, { featureKey: normalizedFeature });
  res.setHeader("X-Abuse-Risk", risk.level);

  if (risk.level === "high") {
    logger.warn("alert.risk_high", {
      feature: normalizedFeature,
      scope: risk.scopeKey,
      burstCount: risk.burstCount,
      recent429: risk.recent429,
      recent409: risk.recent409,
      userId: req?.user?.id || null,
    });
    metricIncrement("alert.risk_high", {
      feature: normalizedFeature,
      plan: req?.plan?.code || "FREE",
    });
    recordRiskOutcome(req, { featureKey: normalizedFeature, statusCode: 429 });
    return {
      blocked: true,
      status: 429,
      body: {
        error: "risk_throttled",
        feature: normalizedFeature,
        retry_after_seconds: 30,
      },
    };
  }

  const killSwitch = await getFeatureKillSwitch(normalizedFeature, { providerKey });
  if (killSwitch.enabled) {
    logger.warn("ai.kill_switch.triggered", {
      feature: normalizedFeature,
      provider: providerKey || null,
      providerMode,
      userId: req?.user?.id || null,
    });
    logger.warn("alert.kill_switch_active", {
      feature: normalizedFeature,
      provider: providerKey || null,
      providerMode,
      userId: req?.user?.id || null,
    });
    metricIncrement("alert.kill_switch_active", {
      feature: normalizedFeature,
      provider: providerKey || "n/a",
      plan: req?.plan?.code || "FREE",
    });
    return {
      blocked: true,
      status: 503,
      body: {
        error: "feature_temporarily_disabled",
        feature: normalizedFeature,
        ...(killSwitch.reason ? { reason: killSwitch.reason } : {}),
        ...(killSwitch.retry_after_seconds ? { retry_after_seconds: killSwitch.retry_after_seconds } : {}),
      },
    };
  }

  const budget = await enforceBudgetLimit(db, {
    req,
    featureKey: normalizedFeature,
    idempotencyKey,
    costs,
  });
  if (budget.blocked) {
    logger.warn("alert.budget_limit_reached", {
      feature: normalizedFeature,
      scope: budget.scope,
      limit: budget.limit,
      remaining: budget.remaining,
      userId: req?.user?.id || null,
    });
    metricIncrement("alert.budget_limit_reached", {
      feature: normalizedFeature,
      scope: budget.scope || "unknown",
      plan: req?.plan?.code || "FREE",
    });
    recordRiskOutcome(req, { featureKey: normalizedFeature, statusCode: 429 });
    return {
      blocked: true,
      status: 429,
      body: {
        error: "budget_limit_reached",
        scope: budget.scope,
        limit: budget.limit,
        remaining: budget.remaining,
        reset_at: budget.reset_at,
      },
    };
  }

  return { blocked: false, risk };
}
