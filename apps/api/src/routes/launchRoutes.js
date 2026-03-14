import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { attachPlan } from "../middlewares/planMiddleware.js";
import { adminOnly } from "../utils/adminAuth.js";
import { resolveLang } from "../utils/i18n.js";
import { getPlansCatalog } from "../utils/plansCatalog.js";
import { getFeatureKillSwitch } from "../utils/abuseMitigation.js";
import { getConfig } from "../utils/configCache.js";
import {
  getDashboardErrors,
  getDashboardRouting,
  getDashboardUsage,
  getInternalCostTotals,
  getMetricSnapshot,
} from "../utils/metrics.js";
import { getRecentProductEvents, recordProductEvent } from "../utils/eventsStore.js";

const router = express.Router();
const planSnapshotByUser = new Map();

const FEATURE_KILL_SWITCH_KEYS = ["ai_video", "ai_music", "ai_voice", "ai_slides"];
const PROVIDER_KEYS = ["runway", "suno", "elevenlabs", "openai", "gemini"];

function clampLimit(rawValue, fallback = 20) {
  const parsed = Number(rawValue || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
}

function getLocalizedOnboarding(lang) {
  const locale = String(lang || "").toLowerCase().startsWith("en") ? "en-US" : "pt-BR";
  if (locale === "en-US") {
    return {
      version: "v1-beta",
      steps: [
        {
          step: 1,
          title: "Check platform status",
          description: "Call /api/status and verify uptime, plan limits, and guardrails.",
          sample_request: { method: "GET", path: "/api/status" },
          sample_response: { ok: true, uptime_seconds: 120, routing_defaults: { default_mode: "quality" } },
        },
        {
          step: 2,
          title: "Select plan",
          description: "Inspect /api/plans/catalog and choose the plan that fits your workload.",
          sample_request: { method: "GET", path: "/api/plans/catalog?lang=en-US" },
          sample_response: { ok: true, lang: "en-US", plans: [{ code: "FREE" }, { code: "EDITOR_PRO" }] },
        },
        {
          step: 3,
          title: "Select language",
          description: "Persist language preference for onboarding and UI hints.",
          sample_request: { method: "PATCH", path: "/api/preferences", body: { language: "en-US" } },
          sample_response: { prefs: { language: "en-US" } },
        },
        {
          step: 4,
          title: "Test text generation",
          description: "Run /api/ai/text-generate with Idempotency-Key and inspect routing/provider headers.",
          sample_request: { method: "POST", path: "/api/ai/text-generate", headers: { "Idempotency-Key": "onboarding-text-001" } },
          sample_response: { ok: true, provider: "mock", routing: { mode: "quality" } },
        },
        {
          step: 5,
          title: "Test image generation",
          description: "Run /api/ai/image-generate with routing mode quality or economy.",
          sample_request: { method: "POST", path: "/api/ai/image-generate", headers: { "Idempotency-Key": "onboarding-image-001" } },
          sample_response: { ok: true, images: ["https://example.com/mock.png"], routing: { mode: "quality" } },
        },
        {
          step: 6,
          title: "Inspect metrics and dashboards",
          description: "Use usage summary, dashboard endpoints, and recent events for launch readiness.",
          sample_request: { method: "GET", path: "/api/dashboard/usage" },
          sample_response: { ok: true, usage: { last24h: { total: 3 } } },
        },
      ],
    };
  }

  return {
    version: "v1-beta",
    steps: [
      {
        step: 1,
        title: "Verificar status da plataforma",
        description: "Chame /api/status e valide uptime, limites do plano e guardrails.",
        sample_request: { method: "GET", path: "/api/status" },
        sample_response: { ok: true, uptime_seconds: 120, routing_defaults: { default_mode: "quality" } },
      },
      {
        step: 2,
        title: "Configurar plano",
        description: "Consulte /api/plans/catalog e escolha o plano ideal para seu uso.",
        sample_request: { method: "GET", path: "/api/plans/catalog?lang=pt-BR" },
        sample_response: { ok: true, lang: "pt-BR", plans: [{ code: "FREE" }, { code: "EDITOR_PRO" }] },
      },
      {
        step: 3,
        title: "Selecionar idioma",
        description: "Salve a preferencia de idioma para onboarding e dicas da interface.",
        sample_request: { method: "PATCH", path: "/api/preferences", body: { language: "pt-BR" } },
        sample_response: { prefs: { language: "pt-BR" } },
      },
      {
        step: 4,
        title: "Testar text-generate",
        description: "Execute /api/ai/text-generate com Idempotency-Key e confira headers de routing/provider.",
        sample_request: { method: "POST", path: "/api/ai/text-generate", headers: { "Idempotency-Key": "onboarding-texto-001" } },
        sample_response: { ok: true, provider: "mock", routing: { mode: "quality" } },
      },
      {
        step: 5,
        title: "Testar image-generate",
        description: "Execute /api/ai/image-generate em quality ou economy.",
        sample_request: { method: "POST", path: "/api/ai/image-generate", headers: { "Idempotency-Key": "onboarding-image-001" } },
        sample_response: { ok: true, images: ["https://example.com/mock.png"], routing: { mode: "quality" } },
      },
      {
        step: 6,
        title: "Visualizar metricas",
        description: "Use usage summary, dashboards e eventos recentes para validar o lancamento.",
        sample_request: { method: "GET", path: "/api/dashboard/usage" },
        sample_response: { ok: true, usage: { last24h: { total: 3 } } },
      },
    ],
  };
}

async function getKillSwitchSnapshot() {
  const byFeature = {};
  for (const feature of FEATURE_KILL_SWITCH_KEYS) {
    const state = await getFeatureKillSwitch(feature);
    byFeature[feature] = Boolean(state.enabled);
  }

  const byProvider = {};
  for (const provider of PROVIDER_KEYS) {
    const state = await getFeatureKillSwitch("ai_video", { providerKey: provider });
    byProvider[provider] = Boolean(state.enabled);
  }

  return { by_feature: byFeature, by_provider: byProvider };
}

async function getRoutingDefaults() {
  const configuredDefault = await getConfig("ai.mult_ai.default_mode").catch(() => null);
  const normalizedDefault =
    String(configuredDefault || "quality").trim().toLowerCase() === "economy"
      ? "economy"
      : "quality";
  return {
    mult_ai_enabled: true,
    default_mode: normalizedDefault,
    available_modes: ["quality", "economy", "manual"],
    recommended_mode: "quality",
  };
}

async function getBudgetLimitsSummary() {
  const cfg = await getConfig("abuse.budget_limits").catch(() => null);
  if (!cfg || typeof cfg !== "object") {
    return {
      user_daily_internal_cost_score: null,
      global_daily_internal_cost_score: null,
    };
  }
  const userLimit = Number(
    cfg?.user_daily_internal_cost_score ??
      cfg?.user_daily_score ??
      null
  );
  const globalLimit = Number(
    cfg?.global_daily_internal_cost_score ??
      cfg?.global_daily_score ??
      null
  );
  return {
    user_daily_internal_cost_score: Number.isFinite(userLimit) ? userLimit : null,
    global_daily_internal_cost_score: Number.isFinite(globalLimit) ? globalLimit : null,
  };
}

async function isEventsTestEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  const cfg = await getConfig("launch.events_test").catch(() => null);
  if (cfg === true) return true;
  if (cfg && typeof cfg === "object" && cfg.enabled === true) return true;
  return false;
}

function maybeTrackPlanChange(req) {
  const userId = req?.user?.id ? String(req.user.id) : null;
  const currentPlan = String(req?.plan?.code || "FREE");
  if (!userId) return;
  const previous = planSnapshotByUser.get(userId);
  if (previous && previous !== currentPlan) {
    recordProductEvent({
      event: "user.plan_change",
      userId,
      plan: currentPlan,
      additional: { from: previous, to: currentPlan, source: "status_probe" },
    });
  }
  planSnapshotByUser.set(userId, currentPlan);
}

router.get("/healthz", (req, res) => res.status(200).end());

router.get("/status", authMiddleware, adminOnly, attachPlan, async (req, res) => {
  const lang = resolveLang(req);
  const plansCatalog = getPlansCatalog(lang);
  const currentPlanCode = String(req.plan?.code || "FREE");
  const currentPlanCatalog =
    plansCatalog.plans.find((plan) => String(plan.code || "").toUpperCase() === currentPlanCode.toUpperCase()) ||
    plansCatalog.plans.find((plan) => String(plan.code || "").toUpperCase() === "FREE") ||
    null;

  maybeTrackPlanChange(req);

  const [killSwitchStatus, routingDefaults, budgetLimits] = await Promise.all([
    getKillSwitchSnapshot(),
    getRoutingDefaults(),
    getBudgetLimitsSummary(),
  ]);

  const userCostTotals = getInternalCostTotals({ userId: req.user.id });
  const globalCostTotals = getInternalCostTotals({});

  return res.json({
    ok: true,
    uptime_seconds: Number(process.uptime().toFixed(2)),
    plan: {
      code: currentPlanCode,
      tier: Number(req.plan?.tier || 0),
      limits: currentPlanCatalog?.limits || {},
      credits: currentPlanCatalog?.credits || {},
      addons: currentPlanCatalog?.addons || {},
    },
    internal_cost_totals: {
      user: userCostTotals,
      global: globalCostTotals,
    },
    abuse_guards: {
      kill_switch: killSwitchStatus,
      budget_limits: budgetLimits,
    },
    routing_defaults: routingDefaults,
    metrics_snapshot: getMetricSnapshot(),
  });
});

router.get("/events/recent", authMiddleware, adminOnly, (req, res) => {
  const limit = clampLimit(req.query.limit, 20);
  const userIdFilter = req.query.user_id ? String(req.query.user_id) : null;
  const items = getRecentProductEvents({ limit, userId: userIdFilter });
  return res.json({ ok: true, items });
});

router.post("/events/test", authMiddleware, adminOnly, express.json({ limit: "64kb" }), async (req, res) => {
  const enabled = await isEventsTestEnabled();
  if (!enabled) {
    return res.status(404).json({ error: "not_found" });
  }
  const eventName = String(req.body?.event || "user.login");
  const allowed = new Set(["user.signup", "user.login", "user.language_select", "user.plan_change"]);
  const safeEvent = allowed.has(eventName) ? eventName : "user.login";
  const created = recordProductEvent({
    event: safeEvent,
    userId: req.user.id,
    plan: req.body?.plan || req.query?.plan || null,
    additional: { source: "events.test" },
  });
  return res.json({ ok: true, event: created });
});

router.get("/dashboard/usage", authMiddleware, adminOnly, (req, res) => {
  return res.json({
    ok: true,
    usage: getDashboardUsage({}),
  });
});

router.get("/dashboard/errors", authMiddleware, adminOnly, (req, res) => {
  return res.json({
    ok: true,
    errors: getDashboardErrors({}),
  });
});

router.get("/dashboard/routing", authMiddleware, adminOnly, (req, res) => {
  return res.json({
    ok: true,
    routing: getDashboardRouting({}),
  });
});

router.get("/onboarding/schema", (req, res) => {
  const lang = resolveLang(req);
  return res.json({
    ok: true,
    lang,
    onboarding: getLocalizedOnboarding(lang),
  });
});

export default router;
