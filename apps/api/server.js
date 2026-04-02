import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import healthRoutes from "./src/routes/healthRoutes.js";

import authRoutes from "./src/routes/authRoutes.js";
import protectedRoutes from "./src/routes/protectedRoutes.js";

import projectsRoutes from "./src/routes/projectsRoutes.js";
import textsRoutes from "./src/routes/textsRoutes.js";
import promptsRoutes from "./src/routes/promptsRoutes.js";

import planRoutes from "./src/routes/planRoutes.js";
import billingRoutes from "./src/routes/billingRoutes.js";

import coinsRoutes from "./src/routes/coinsRoutes.js";
import convertRoutes from "./src/routes/convertRoutes.js";
import usageRoutes from "./src/routes/usageRoutes.js";
import aiRoutes from "./src/routes/aiRoutes.js";
import factChecksRoutes from "./src/routes/factChecksRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import subscriptionsRoutes from "./src/routes/subscriptionsRoutes.js";
import preferencesRoutes from "./src/routes/preferencesRoutes.js";
import creatorPostRoutes from "./src/routes/creatorPostRoutes.js";
import creatorMusicRoutes from "./src/routes/creatorMusicRoutes.js";
import noCodeRoutes from "./src/routes/noCodeRoutes.js";
import supportRoutes from "./src/routes/supportRoutes.js";
import liveCutsRoutes from "./src/routes/liveCutsRoutes.js";
import socialRoutes from "./src/routes/socialRoutes.js";
import stripeRoutes from "./src/routes/stripeRoutes.js";
import githubRoutes from "./src/routes/githubRoutes.js";
import vercelRoutes from "./src/routes/vercelRoutes.js";
import vercelWebhookRoutes from "./src/routes/vercelWebhookRoutes.js";
import docsRoutes from "./src/routes/docsRoutes.js";
import plansCatalogRoutes from "./src/routes/plansCatalogRoutes.js";
import enterpriseRoutes from "./src/routes/enterpriseRoutes.js";
import launchRoutes from "./src/routes/launchRoutes.js";
import betaAccessRoutes from "./src/routes/betaAccessRoutes.js";
import supabaseAdmin, { isSupabaseAdminEnabled } from "./src/config/supabaseAdmin.js";

import { notFound } from "./src/middlewares/notFound.js";
import { errorHandler } from "./src/middlewares/errorHandler.js";
import { globalLimiter } from "./src/middlewares/rateLimit.js";
import { logger } from "./src/utils/logger.js";
import { authMiddleware } from "./src/middlewares/authMiddleware.js";
import { adminOnly } from "./src/utils/adminAuth.js";

const app = express();

function getAllowedOrigins() {
  const raw = [
    process.env.WEB_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_WEB_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .filter(Boolean)
    .join(",");

  return raw
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = getAllowedOrigins();

app.set("trust proxy", isProduction ? 1 : 0);

app.use(helmet());
app.use(
  cors({
    // Dev remains permissive; production enforces explicit origin allowlist.
    origin: isProduction
      ? (origin, callback) => {
          if (!origin) return callback(null, true);
          const normalized = String(origin).replace(/\/+$/, "");
          if (allowedOrigins.includes(normalized)) return callback(null, true);
          return callback(new Error("cors_not_allowed"));
        }
      : true,
    credentials: !isProduction,
  })
);
app.use(morgan("dev"));
app.use(globalLimiter);

// Stripe webhook uses raw body and must be mounted before global JSON parser.
app.use("/api/stripe", stripeRoutes);
app.use("/api/vercel/webhooks", vercelWebhookRoutes);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

// Ensure every JSON response is explicitly utf-8 without affecting HTML/docs responses.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    const contentType = String(res.getHeader("Content-Type") || "").toLowerCase();
    if (!contentType || contentType.startsWith("application/json")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    return originalJson(payload);
  };
  next();
});

app.get("/", (req, res) => res.json({ ok: true, name: "Editor AI Creator API" }));

app.use("/health", healthRoutes);
app.use("/api/health", healthRoutes);

app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);
app.use("/protected", protectedRoutes);
app.use("/api/beta-access", betaAccessRoutes);

app.use("/api/projects", projectsRoutes);
app.use("/api/texts", textsRoutes);
app.use("/api/prompts", promptsRoutes);

app.use("/api/plan", planRoutes);
app.use("/api/billing", billingRoutes);

app.use("/api/coins", coinsRoutes);
app.use("/api/coins", convertRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/fact-checks", factChecksRoutes);
app.use("/api/subscriptions", subscriptionsRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/creator-post", creatorPostRoutes);
app.use("/api/creator-music", creatorMusicRoutes);
app.use("/api/no-code", noCodeRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/live-cuts", liveCutsRoutes);
app.use("/api/social", socialRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/vercel", vercelRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", launchRoutes);
app.use("/api", docsRoutes);
app.use("/api", plansCatalogRoutes);
app.use("/api/enterprise", enterpriseRoutes);

app.get("/api/_debug/env", authMiddleware, adminOnly, (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({ error: "not_found" });
  }

  return res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    supabase: {
      hasUrl: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    stripe: {
      hasSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      keyLast4: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.slice(-4) : null,
    },
  });
});

app.get("/api/_debug/deps", authMiddleware, adminOnly, async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({ error: "not_found" });
  }

  const deps = {
    db: false,
    supabaseAdmin: isSupabaseAdminEnabled() && Boolean(supabaseAdmin),
    rpc_request_idempotency_upsert_v1: false,
  };

  if (!deps.supabaseAdmin) {
    return res.status(503).json({ ok: false, deps });
  }

  const dbProbe = await supabaseAdmin.from("plans").select("code").limit(1);
  deps.db = !dbProbe.error;
  if (!deps.db) {
    return res.status(503).json({ ok: false, deps });
  }

  const probeResult = await supabaseAdmin.rpc("request_idempotency_upsert_v1", {
    p_user_id: req.user.id,
    p_endpoint: "debug_deps_probe",
    p_key: `deps:${Date.now()}`,
    p_request_hash: `deps:${Date.now()}`,
    p_response: { ok: true, probe: true },
    p_status: "processed",
  });
  deps.rpc_request_idempotency_upsert_v1 = !probeResult.error;

  return res.status(deps.rpc_request_idempotency_upsert_v1 ? 200 : 503).json({
    ok: deps.rpc_request_idempotency_upsert_v1,
    deps,
  });
});

app.get("/api/_debug/ai-idem/check", authMiddleware, adminOnly, async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({ error: "not_found" });
  }
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    return res.status(503).json({ error: "supabase_admin_unavailable" });
  }

  const endpoint = String(req.query.endpoint || "").trim();
  const key = String(req.query.key || "").trim();
  if (!endpoint || !key) {
    return res.status(400).json({ error: "invalid_query", message: "endpoint e key sao obrigatorios" });
  }

  const { data, error } = await supabaseAdmin
    .from("request_idempotency")
    .select("endpoint,key,created_at,status")
    .eq("endpoint", endpoint)
    .eq("key", key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(400).json({ error: "debug_check_failed", details: error.message });
  }

  const probeKey = `probe:${Date.now()}`;
  const probeEndpoint = endpoint || "ai_text_generate";
  const probePayload = {
    user_id: req.user.id,
    endpoint: probeEndpoint,
    key: probeKey,
    request_hash: `probe:${Date.now()}`,
    status: "processed",
    response: { ok: true, probe: true },
  };

  const probeWrite = await supabaseAdmin.from("request_idempotency").upsert(probePayload, {
    onConflict: "user_id,endpoint,key",
  });
  const write_ok = !probeWrite.error;

  let read_ok = false;
  let probe_error = null;
  if (probeWrite.error) {
    probe_error = probeWrite.error.message || "probe_write_failed";
  } else {
    const probeRead = await supabaseAdmin
      .from("request_idempotency")
      .select("endpoint,key,status,created_at")
      .eq("user_id", req.user.id)
      .eq("endpoint", probeEndpoint)
      .eq("key", probeKey)
      .maybeSingle();
    read_ok = !probeRead.error && Boolean(probeRead.data);
    if (probeRead.error) probe_error = probeRead.error.message || "probe_read_failed";
  }

  return res.json({
    found: Boolean(data),
    endpoint,
    key,
    created_at: data?.created_at || null,
    status: data?.status || null,
    write_ok,
    read_ok,
    error: probe_error,
  });
});

app.use(notFound);
app.use(errorHandler);

const BASE_PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = isProduction;

function startServer(port) {
  const server = app.listen(port, () => {
    logger.info("api_started", { port });
  });

  server.on("error", (err) => {
    if (!IS_PRODUCTION && err?.code === "EADDRINUSE") {
      const nextPort = port === 3000 ? 3100 : port + 1;
      logger.warn("port_in_use_retry", { port, nextPort });
      startServer(nextPort);
      return;
    }

    logger.error("api_start_failed", { message: err?.message || String(err) });
    process.exit(1);
  });
}

startServer(BASE_PORT);

