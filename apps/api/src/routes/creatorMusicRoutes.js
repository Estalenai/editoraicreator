import express from "express";
import crypto from "crypto";
import { z } from "zod";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { buildRequestHash, trackUsage } from "../utils/usageTracking.js";
import { getUserPlanCode } from "../utils/planResolver.js";
import { assertWithinQuota, QuotaExceededError } from "../utils/quotaEnforcer.js";
import { generateLimiter, promptLimiter } from "../middlewares/rateLimit.js";
import { logger } from "../utils/logger.js";
import { buildAiContractErrorPayload, getAiContractErrorStatus } from "../utils/aiContract.js";
import { runMusicGenerate } from "../aiProviders/index.js";
import { debitThenExecuteOrRefund } from "../utils/debitThenExecuteOrRefund.js";
import { selectProviderAndModel } from "../utils/aiRouter.js";
import { extractRoutingInput } from "../utils/aiRoutingInput.js";

const router = express.Router();
router.use(authMiddleware);

const PromptSchema = z.object({
  theme: z.string().min(1),
  mood: z.string().min(1),
  bpm: z.coerce.number().int().positive(),
  duration: z.coerce.number().int().positive(),
  language: z.string().min(1),
});

const GenerateSchema = PromptSchema.extend({
  prompt: z.string().min(1).optional(),
  complexity: z.enum(["low", "medium", "high"]).optional(),
  lyrics: z.union([z.boolean(), z.string()]).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const IDEMPOTENCY_ACTION = "creator_music_generate";
const FEATURE_NAME = "creator_music_generate";

function idemPrefix(key) {
  return String(key || "").slice(0, 8);
}

function getDbClient(req) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    throw new Error("supabase_admin_unavailable_for_financial_rpc");
  }
  return supabaseAdmin;
}

function parseWithSchema(schema, req, res) {
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}

function normalizeIdemHeader(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v.length < 8) return null;
  return v;
}

function getGenerateIdempotencyKey(req) {
  const h = normalizeIdemHeader(req.headers["idempotency-key"]);
  if (h) return h;

  const stableBody = {
    theme: req.body?.theme ?? null,
    mood: req.body?.mood ?? null,
    bpm: req.body?.bpm ?? null,
    duration: req.body?.duration ?? null,
    language: req.body?.language ?? null,
    prompt: req.body?.prompt ?? null,
    complexity: req.body?.complexity ?? null,
    lyrics: req.body?.lyrics ?? null,
    tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
  };

  const raw = `${req.user?.id || "anonymous"}:${IDEMPOTENCY_ACTION}:${JSON.stringify(stableBody)}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function getPromptIdempotencyKey(req, body) {
  const h = normalizeIdemHeader(req.headers["idempotency-key"]);
  if (h) return `${IDEMPOTENCY_ACTION}:prompt:${h}`;
  return buildRequestHash({
    action: `${IDEMPOTENCY_ACTION}:prompt`,
    userId: req.user?.id,
    theme: body?.theme,
    mood: body?.mood,
    bpm: body?.bpm,
    duration: body?.duration,
    language: body?.language,
  });
}

function computeRequestHash(userId, body, idempotencyKey) {
  return buildRequestHash({
    userId,
    action: IDEMPOTENCY_ACTION,
    idempotencyKey,
    theme: body?.theme ?? null,
    mood: body?.mood ?? null,
    bpm: body?.bpm ?? null,
    duration: body?.duration ?? null,
    language: body?.language ?? null,
    prompt: body?.prompt ?? null,
    complexity: body?.complexity ?? null,
    lyrics: body?.lyrics ?? null,
    tags: Array.isArray(body?.tags) ? body.tags : [],
  });
}

function computeMusicCostCommon({ theme = "", bpm, duration, tags = [], lyrics = false }) {
  const base = 2;
  const durationUnits = Math.max(1, Math.ceil(Number(duration) / 15));
  const durationCost = durationUnits * 4;
  const bpmUnits = Number(bpm) >= 170 ? 2 : Number(bpm) >= 140 ? 1 : 0;
  const complexityUnits = Math.max(1, Math.ceil(String(theme).trim().length / 120));
  const hasLyrics = lyrics === true || (typeof lyrics === "string" && lyrics.trim().length > 0);
  const extras = (Array.isArray(tags) && tags.length > 0 ? 1 : 0) + (hasLyrics ? 1 : 0);
  const costCommon = Math.max(5, base + durationCost + bpmUnits + complexityUnits + extras);

  return {
    costCommon,
    breakdown: {
      base,
      durationUnits,
      bpmUnits,
      complexityUnits,
      extras,
    },
  };
}

function buildPrompt({ theme, mood, bpm, duration, language, complexity = "medium" }) {
  return `Crie uma musica no estilo ${theme}, humor ${mood}, ${bpm} BPM, duracao de ${duration} segundos em ${language}, complexidade ${complexity}.`;
}

function normalizeWallet(row) {
  return {
    common: Number(row?.common ?? row?.common_balance ?? 0),
    pro: Number(row?.pro ?? row?.pro_balance ?? 0),
    ultra: Number(row?.ultra ?? row?.ultra_balance ?? 0),
  };
}

async function getWallet(db, userId) {
  const modern = await db
    .from("creator_coins_wallet")
    .select("common,pro,ultra")
    .eq("user_id", userId)
    .maybeSingle();

  if (!modern.error) return normalizeWallet(modern.data);

  const legacy = await db
    .from("creator_coins_wallet")
    .select("common_balance,pro_balance,ultra_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (legacy.error) throw new Error(`failed_to_load_wallet: ${legacy.error.message}`);
  return normalizeWallet(legacy.data);
}

async function getTxCreatedAt(db, userId, idempotencyKey) {
  const { data } = await db
    .from("coins_transactions")
    .select("created_at")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .eq("feature", FEATURE_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.created_at || null;
}

async function readIdempotentResponse(db, userId, idempotencyKey) {
  const { data, error } = await db
    .from("request_idempotency")
    .select("response,created_at")
    .eq("user_id", userId)
    .eq("action", IDEMPOTENCY_ACTION)
    .eq("idempotency_key", idempotencyKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("request_idempotency") && (msg.includes("does not exist") || msg.includes("relation"))) {
      return null;
    }
    if (msg.includes("on conflict") && msg.includes("no unique or exclusion constraint")) {
      return null;
    }
    throw new Error(`failed_to_load_idempotency: ${error.message}`);
  }

  return data?.response ?? null;
}

function isDuplicateError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("duplicate") || msg.includes("unique") || msg.includes("violates unique constraint");
}

async function saveIdempotentResponse(db, userId, idempotencyKey, requestHash, responsePayload) {
  const row = {
    user_id: userId,
    action: IDEMPOTENCY_ACTION,
    idempotency_key: idempotencyKey,
    request_hash: requestHash,
    response: responsePayload,
    status: "success",
  };

  const { error } = await db
    .from("request_idempotency")
    .upsert(row, { onConflict: "user_id,action,idempotency_key" });

  if (!error) return responsePayload;

  if (isDuplicateError(error)) {
    const existing = await readIdempotentResponse(db, userId, idempotencyKey);
    if (existing) return existing;
  }

  const msg = String(error.message || "").toLowerCase();
  if (msg.includes("on conflict") && msg.includes("no unique or exclusion constraint")) {
    logger.warn("creator_music_idempotency_constraint_missing", {
      userId,
      feature: FEATURE_NAME,
      idempotencyKeyPrefix: idemPrefix(idempotencyKey),
    });
    return responsePayload;
  }
  if (msg.includes("request_idempotency") && (msg.includes("does not exist") || msg.includes("relation"))) {
    return responsePayload;
  }

  throw new Error(`failed_to_save_idempotency: ${error.message}`);
}

async function buildReplayFromTransactions({ db, userId, idempotencyKey, body, complexity, costData, usedPrompt }) {
  const createdAt = await getTxCreatedAt(db, userId, idempotencyKey);
  if (!createdAt) return null;

  const balance = await getWallet(db, userId);

  return {
    ok: true,
    result: {
      title: `${body.theme} (${body.mood})`,
      provider: "replay",
      status: "processing",
      bpm: body.bpm,
      duration: body.duration,
      audio_url: null,
      preview_url: null,
      created_at: createdAt,
      complexity,
    },
    message: "Geracao ja enviada anteriormente. Atualize o status para recuperar o audio final.",
    used_prompt: usedPrompt,
    cost: {
      common: costData.costCommon,
      breakdown: costData.breakdown,
    },
    debit: { common: costData.costCommon },
    balance,
    replay: true,
  };
}

function mapDebitError(error, commonCost, currentCommon) {
  const msg = String(error?.message || "").toLowerCase();

  if (msg.includes("uq_coins_idempotency") || msg.includes("duplicate") || msg.includes("unique")) {
    return { status: 409, payload: { error: "idempotency_replay" } };
  }

  if (msg.includes("insufficient") || msg.includes("saldo")) {
    return {
      status: 400,
      payload: {
        error: "insufficient_balance",
        needed: commonCost,
        required_common: commonCost,
        current_common: currentCommon,
      },
    };
  }

  return {
    status: 400,
    payload: { error: "coins_debit_failed", details: error?.message || "unknown_error" },
  };
}

function mapRouteError(error, defaultErrorCode) {
  const message = String(error?.message || "").trim();
  const normalized = message.toLowerCase();
  if (normalized.includes("supabase_admin_unavailable_for_financial_rpc")) {
    return {
      status: 503,
      payload: {
        error: "supabase_admin_unavailable_for_financial_rpc",
      },
    };
  }
  if (normalized.includes("mock_requires_explicit_request")) {
    return {
      status: 503,
      payload: buildAiContractErrorPayload("mock_requires_explicit_request"),
    };
  }
  if (normalized.includes("provider_not_supported_beta")) {
    return {
      status: 503,
      payload: buildAiContractErrorPayload("provider_not_supported_beta"),
    };
  }
  if (normalized.includes("provider_unavailable")) {
    return {
      status: 502,
      payload: buildAiContractErrorPayload("provider_unavailable"),
    };
  }
  if (normalized.includes("failed_to_load_idempotency") || normalized.includes("failed_to_save_idempotency")) {
    return {
      status: 503,
      payload: {
        error: "idempotency_storage_failed",
      },
    };
  }
  if (normalized.includes("failed_to_load_wallet")) {
    return {
      status: 503,
      payload: {
        error: "wallet_unavailable",
      },
    };
  }

  return {
    status: 500,
    payload: {
      error: defaultErrorCode,
      details: message || "unknown_error",
    },
  };
}

router.post("/prompt", promptLimiter, async (req, res) => {
  const body = parseWithSchema(PromptSchema, req, res);
  if (!body) return;

  const idempotencyKey = getPromptIdempotencyKey(req, body);
  let db = null;

  try {
    db = getDbClient(req);
    const prompt = buildPrompt(body);

    await trackUsage({
      db,
      userId: req.user.id,
      feature: FEATURE_NAME,
      action: "prompt",
      idempotencyKey,
      requestHash: buildRequestHash({
        theme: body.theme,
        mood: body.mood,
        bpm: body.bpm,
        duration: body.duration,
        language: body.language,
      }),
      costs: { common: 0, pro: 0, ultra: 0 },
      meta: { bpm: body.bpm, duration: body.duration, language: body.language },
      status: "success",
    });

    return res.json({ prompt });
  } catch (error) {
    if (db) {
      await trackUsage({
        db,
        userId: req.user.id,
        feature: FEATURE_NAME,
        action: "prompt",
        idempotencyKey,
        requestHash: null,
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: { error: "creator_music_prompt_failed", details: error?.message || "unknown_error" },
        status: "error",
      });
    }
    const mapped = mapRouteError(error, "creator_music_prompt_failed");
    return res.status(mapped.status).json(mapped.payload);
  }
});

router.post("/generate", generateLimiter, async (req, res) => {
  const body = parseWithSchema(GenerateSchema, req, res);
  if (!body) return;

  let db = null;
  const userId = req.user.id;
  const complexity = body.complexity || "medium";
  const costData = computeMusicCostCommon({
    theme: body.theme,
    duration: body.duration,
    bpm: body.bpm,
    lyrics: body.lyrics,
    tags: body.tags || [],
  });
  const commonCost = costData.costCommon;
  const idempotencyKey = getGenerateIdempotencyKey(req);
  const requestHash = computeRequestHash(userId, body, idempotencyKey);
  const usedPrompt = body.prompt || buildPrompt({ ...body, complexity });

  try {
    db = getDbClient(req);
    const cachedResponse = await readIdempotentResponse(db, userId, idempotencyKey).catch(() => null);
    if (cachedResponse) {
      logger.info("creator_music_generate_replay", {
        userId: req.user.id,
        feature: FEATURE_NAME,
        status: "replay",
        idempotencyKeyPrefix: idemPrefix(idempotencyKey),
      });
      await trackUsage({
        db,
        userId,
        feature: FEATURE_NAME,
        action: "generate",
        idempotencyKey,
        requestHash,
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: { replay: true, source: "request_idempotency" },
        status: "replay",
      });
      return res.json(cachedResponse);
    }

    const planCode = await getUserPlanCode(db, userId);
    await assertWithinQuota({
      db,
      userId,
      planCode,
      feature: FEATURE_NAME,
      idempotencyKey,
      idempotencyAction: IDEMPOTENCY_ACTION,
      action: "generate",
    });

    const beforeWallet = await getWallet(db, userId);
    if (beforeWallet.common < commonCost) {
      await trackUsage({
        db,
        userId,
        feature: FEATURE_NAME,
        action: "generate",
        idempotencyKey,
        requestHash,
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          error: "insufficient_balance",
          needed_common: commonCost,
          current_common: beforeWallet.common,
          breakdown: costData.breakdown,
        },
        status: "error",
      });
      return res.status(400).json({
        error: "insufficient_balance",
        needed: commonCost,
        required_common: commonCost,
        current_common: beforeWallet.common,
      });
    }

    const routingInput = extractRoutingInput(req.body || {});
    const routing = selectProviderAndModel({
      feature: "music_generate",
      plan: planCode,
      mode: routingInput.mode,
      requested: routingInput.requested,
      signals: { risk: "low" },
    });
    if (routing?.rejected === true) {
      const payload = buildAiContractErrorPayload(routing.error, {
        detail: routing.fallback_reason || routing.error,
        routing,
      });
      await trackUsage({
        db,
        userId,
        feature: FEATURE_NAME,
        action: "generate",
        idempotencyKey,
        requestHash,
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: { error: routing.error || "provider_contract_blocked" },
        status: "error",
      });
      return res.status(getAiContractErrorStatus(routing.error, 503)).json(payload);
    }

    let providerResult = null;
    try {
      providerResult = await debitThenExecuteOrRefund({
        db,
        userId,
        feature: FEATURE_NAME,
        idempotencyKey,
        costCommon: commonCost,
        executeFn: async () =>
          runMusicGenerate({
            input: {
              prompt: usedPrompt,
              lyrics: typeof body.lyrics === "string" ? body.lyrics : "",
              style: body.theme,
              durationSec: body.duration,
              quality: complexity,
            },
            idempotencyKey,
            routing,
          }),
      });
    } catch (providerError) {
      const errorCode = String(providerError?.code || providerError?.payload?.error || providerError?.message || "").toLowerCase();
      if (errorCode === "idempotency_replay") {
        const replay = await readIdempotentResponse(db, userId, idempotencyKey).catch(() => null);
        if (replay) {
          await trackUsage({
            db,
            userId,
            feature: FEATURE_NAME,
            action: "generate",
            idempotencyKey,
            requestHash,
            costs: { common: 0, pro: 0, ultra: 0 },
            meta: { replay: true, source: "duplicate_rpc" },
            status: "replay",
          });
          return res.json(replay);
        }

        const fallbackReplay = await buildReplayFromTransactions({
          db,
          userId,
          idempotencyKey,
          body,
          complexity,
          costData,
          usedPrompt,
        });
        if (fallbackReplay) {
          await trackUsage({
            db,
            userId,
            feature: FEATURE_NAME,
            action: "generate",
            idempotencyKey,
            requestHash,
            costs: { common: 0, pro: 0, ultra: 0 },
            meta: { replay: true, source: "coins_transactions" },
            status: "replay",
          });
          return res.json(fallbackReplay);
        }

        await trackUsage({
          db,
          userId,
          feature: FEATURE_NAME,
          action: "generate",
          idempotencyKey,
          requestHash,
          costs: { common: 0, pro: 0, ultra: 0 },
          meta: { error: "idempotency_conflict" },
          status: "error",
        });
        return res.status(409).json({
          error: "idempotency_conflict",
          message: "Essa requisicao ja foi processada. Gere uma nova Idempotency-Key.",
        });
      }

      const mapped = providerError?.payload
        ? { status: Number(providerError.status || 400), payload: providerError.payload }
        : mapRouteError(providerError, "creator_music_generate_failed");

      await trackUsage({
        db,
        userId,
        feature: FEATURE_NAME,
        action: "generate",
        idempotencyKey,
        requestHash,
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: { error: mapped.payload?.error || "creator_music_generate_failed", details: providerError?.message || null },
        status: "error",
      });
      return res.status(mapped.status).json(mapped.payload);
    }

    const createdAt = (await getTxCreatedAt(db, userId, idempotencyKey)) || new Date().toISOString();
    const balance = await getWallet(db, userId);

    const responsePayload = {
      ok: true,
      result: {
        title: `${body.theme} (${body.mood})`,
        provider: providerResult?.provider || "mock",
        model: providerResult?.model || null,
        status: providerResult?.status || "queued",
        job_id: providerResult?.jobId || null,
        preview_url: providerResult?.assets?.preview_url || null,
        audio_url: providerResult?.output?.audio_url || null,
        bpm: body.bpm,
        duration: body.duration,
        created_at: createdAt,
        complexity,
        tags: Array.isArray(body.tags) ? body.tags : [],
        lyrics: typeof body.lyrics === "string" ? body.lyrics : undefined,
      },
      used_prompt: usedPrompt,
      routing,
      cost: {
        common: commonCost,
        breakdown: costData.breakdown,
      },
      debit: { common: commonCost },
      balance,
    };

    const finalPayload = await saveIdempotentResponse(db, userId, idempotencyKey, requestHash, responsePayload);

    await trackUsage({
      db,
      userId,
      feature: FEATURE_NAME,
      action: "generate",
      idempotencyKey,
      requestHash,
      costs: { common: commonCost, pro: 0, ultra: 0 },
      meta: {
        breakdown: costData.breakdown,
        duration: body.duration,
        bpm: body.bpm,
        complexity,
        routing_mode: routing.mode || "quality",
        routing_provider: routing.selected_provider || null,
        routing_model: routing.selected_model || null,
        tags_count: Array.isArray(body.tags) ? body.tags.length : 0,
      },
      status: "success",
    });

    logger.info("creator_music_generate_success", {
      userId,
      feature: FEATURE_NAME,
      status: "success",
      cost: commonCost,
      idempotencyKeyPrefix: idemPrefix(idempotencyKey),
    });

    return res.json(finalPayload);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      logger.warn("creator_music_generate_quota_exceeded", {
        userId,
        feature: FEATURE_NAME,
        status: "quota_exceeded",
        idempotencyKeyPrefix: idemPrefix(idempotencyKey),
      });
      await trackUsage({
        db,
        userId,
        feature: FEATURE_NAME,
        action: "generate",
        idempotencyKey,
        requestHash,
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          error: "quota_exceeded",
          details: error.payload,
        },
        status: "error",
      });
      return res.status(error.status).json(error.payload);
    }

    if (db) {
      await trackUsage({
        db,
        userId,
        feature: FEATURE_NAME,
        action: "generate",
        idempotencyKey,
        requestHash,
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: {
          error: "creator_music_generate_failed",
          details: error?.message || "unknown_error",
        },
        status: "error",
      });
    }
    logger.error("creator_music_generate_failed", {
      userId,
      feature: FEATURE_NAME,
      status: "error",
      idempotencyKeyPrefix: idemPrefix(idempotencyKey),
      message: error?.message || "unknown_error",
    });
    const mapped = mapRouteError(error, "creator_music_generate_failed");
    return res.status(mapped.status).json(mapped.payload);
  }
});

/*
PowerShell quick tests:

$token = "SEU_ACCESS_TOKEN"
$apiBase = "http://127.0.0.1:3000"

curl.exe -s "$apiBase/api/coins/balance" -H "Authorization: Bearer $token"

@'
{
  "theme":"trap motivacional",
  "mood":"energetico",
  "bpm":145,
  "duration":45,
  "language":"pt-BR",
  "tags":["trap"],
  "lyrics":true
}
'@ | Set-Content .\music-generate.json

curl.exe -s -X POST "$apiBase/api/creator-music/prompt" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  --data-binary "@music-generate.json"

$idem = "music-generate-" + (Get-Date -Format "yyyyMMddHHmmss")
curl.exe -s -X POST "$apiBase/api/creator-music/generate" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -H "Idempotency-Key: $idem" `
  --data-binary "@music-generate.json"

curl.exe -s -X POST "$apiBase/api/creator-music/generate" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -H "Idempotency-Key: $idem" `
  --data-binary "@music-generate.json"

curl.exe -s "$apiBase/api/usage/me" -H "Authorization: Bearer $token"
curl.exe -s "$apiBase/api/usage/limits" -H "Authorization: Bearer $token"
curl.exe -s "$apiBase/api/usage/summary" -H "Authorization: Bearer $token"
*/

export default router;
