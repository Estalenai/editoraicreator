import express from "express";
import crypto from "crypto";
import { z } from "zod";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { attachPlan } from "../middlewares/planMiddleware.js";
import { AutocrieBrain } from "../autocrie/core/brain.js";
import { buildRequestHash, trackUsage } from "../utils/usageTracking.js";
import { getUserPlanCode } from "../utils/planResolver.js";
import { assertWithinQuota, QuotaExceededError } from "../utils/quotaEnforcer.js";
import { generateLimiter, promptLimiter } from "../middlewares/rateLimit.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

router.use(authMiddleware);
router.use(attachPlan);

const IDEMPOTENCY_ACTION = "creator_post_generate";
const FEATURE_NAME = "creator_post_generate";
const DEFAULT_POST_CHECKLIST = [
  "Comece com um gancho claro na primeira linha.",
  "Mantenha o texto objetivo para leitura mobile.",
  "Finalize com CTA direto para a próxima ação.",
];

const PLATFORM_CHECKLISTS = {
  instagram: [
    "Legenda com limite de caracteres adequado (ideal <= 2200).",
    "Hashtags no final da legenda.",
    "Primeira linha com gancho forte.",
  ],
  tiktok: [
    "Comece com hook direto nos primeiros 2 segundos.",
    "Texto curto e objetivo.",
    "Hashtags focadas em nicho e tendencia.",
  ],
  youtube: [
    "Titulo curto e chamativo.",
    "Descricao curta com CTA.",
    "Hashtags no final da descricao.",
  ],
  x: ["Texto enxuto e direto.", "Hashtags moderadas (1-3).", "CTA com pergunta para engajamento."],
  linkedin: [
    "Quebras de linha para leitura.",
    "Storytelling com valor pratico.",
    "CTA convidando comentarios.",
  ],
};

function idemPrefix(key) {
  return String(key || "").slice(0, 8);
}

const PromptCanonicalSchema = z.object({
  platform: z.string().min(2),
  type: z.string().min(2),
  goal: z.string().min(2),
  tone: z.string().min(2),
  language: z.string().min(2),
  brief: z.string().min(1),
  variants: z.coerce.number().int().min(1).max(5).default(1),
});

const PromptFrontendSchema = z.object({
  platform: z.string().min(2),
  contentType: z.string().min(2),
  objective: z.string().min(2),
  tone: z.string().min(2),
  language: z.string().min(2),
  theme: z.string().min(1),
  variants: z.coerce.number().int().min(1).max(5).default(1).optional(),
});

const PromptSchema = z.union([PromptCanonicalSchema, PromptFrontendSchema]);

const GenerateCanonicalSchema = PromptCanonicalSchema.extend({
  prompt: z.string().min(2).optional(),
  hashtags: z.boolean().optional(),
  cta: z.boolean().optional(),
});

const GenerateFrontendSchema = PromptFrontendSchema.extend({
  prompt: z.string().min(2).optional(),
  hashtags: z.boolean().optional(),
  cta: z.boolean().optional(),
});

const GenerateSchema = z.union([GenerateCanonicalSchema, GenerateFrontendSchema]);

function normalizeCreatorPostInput(body) {
  const variants = Number(body?.variants || 1);
  return {
    platform: String(body?.platform || "").trim(),
    type: String(body?.type || body?.contentType || "").trim(),
    goal: String(body?.goal || body?.objective || "").trim(),
    tone: String(body?.tone || "").trim(),
    language: String(body?.language || "").trim(),
    brief: String(body?.brief || body?.theme || "").trim(),
    variants: Math.min(Math.max(Number.isFinite(variants) ? variants : 1, 1), 5),
    prompt: typeof body?.prompt === "string" ? body.prompt : undefined,
    hashtags: typeof body?.hashtags === "boolean" ? body.hashtags : false,
    cta: typeof body?.cta === "boolean" ? body.cta : false,
  };
}

const NormalizedSchema = z.object({
  platform: z.string().min(2),
  type: z.string().min(2),
  goal: z.string().min(2),
  tone: z.string().min(2),
  language: z.string().min(2),
  brief: z.string().min(1),
  variants: z.coerce.number().int().min(1).max(5),
  prompt: z.string().min(2).optional(),
  hashtags: z.boolean().optional(),
  cta: z.boolean().optional(),
});

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

  const normalized = normalizeCreatorPostInput(parsed.data);
  const normalizedParsed = NormalizedSchema.safeParse(normalized);
  if (!normalizedParsed.success) {
    res.status(400).json({ error: "invalid_body", details: normalizedParsed.error.flatten() });
    return null;
  }

  return normalizedParsed.data;
}

function isMockEnabled() {
  const v = String(process.env.AI_MOCK || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function computePostCostCommon({ brief, variants, hashtags = false, cta = false }) {
  const base = 2;
  const briefUnits = Math.max(1, Math.ceil(String(brief || "").trim().length / 200));
  const briefCost = briefUnits * 4;
  const variantCost = Math.max(0, (Number(variants || 1) - 1) * 3);
  const extras = (hashtags ? 1 : 0) + (cta ? 1 : 0);
  const toneUnits = 1;
  const costCommon = Math.max(5, base + briefCost + variantCost + extras + toneUnits);

  return {
    costCommon,
    breakdown: {
      base,
      briefUnits,
      briefCost,
      variantCost,
      extras,
      toneUnits,
    },
  };
}

function buildPrompt(body) {
  return `Crie um ${body.type} para ${body.platform}, objetivo ${body.goal}, tom ${body.tone}, idioma ${body.language}. Brief: ${body.brief}. Gere ${body.variants} variacao(oes).`;
}

function safeJsonParse(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    const fenceMatch = raw.match(/```json([\s\S]*?)```/i);
    const payload = fenceMatch ? fenceMatch[1].trim() : raw;
    return JSON.parse(payload);
  } catch {
    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return null;
    }
  }
}

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeTextArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const candidates = value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
    return candidates;
  }
  return [];
}

function normalizeHashtags(value) {
  const tags = normalizeTextArray(value)
    .map((item) => item.replace(/^#+/, "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((item) => `#${item.replace(/\s+/g, "")}`);
  return tags;
}

function resolvePlatformChecklist(platform) {
  const normalized = String(platform || "").toLowerCase();
  if (normalized.includes("instagram")) return PLATFORM_CHECKLISTS.instagram;
  if (normalized.includes("tiktok")) return PLATFORM_CHECKLISTS.tiktok;
  if (normalized.includes("youtube")) return PLATFORM_CHECKLISTS.youtube;
  if (normalized.includes("twitter") || normalized === "x" || normalized.includes("x ")) return PLATFORM_CHECKLISTS.x;
  if (normalized.includes("linkedin")) return PLATFORM_CHECKLISTS.linkedin;
  return DEFAULT_POST_CHECKLIST;
}

function normalizeLegacyVariants(parsed) {
  if (!Array.isArray(parsed?.variants)) return [];
  return parsed.variants
    .map((variant) => {
      if (typeof variant === "string") return variant.trim();
      if (variant && typeof variant === "object" && typeof variant.text === "string") {
        return variant.text.trim();
      }
      return "";
    })
    .filter(Boolean);
}

function buildCreatorPostResultFromOutput(body, rawOutput) {
  const parsed = safeJsonParse(rawOutput);
  const caption = pickFirstString(parsed?.caption, parsed?.text, parsed?.legenda, rawOutput, body.brief);
  const hashtags = normalizeHashtags(parsed?.hashtags);
  const cta = pickFirstString(
    parsed?.cta,
    parsed?.callToAction,
    parsed?.call_to_action,
    "Comente sua opiniao e compartilhe com quem precisa ver este post."
  );
  const mediaSuggestion = pickFirstString(
    parsed?.mediaSuggestion,
    parsed?.media,
    parsed?.media_suggestion,
    "Use imagem ou video alinhado ao tema principal do post."
  );

  const parsedVariations = normalizeTextArray(parsed?.variations);
  const legacyVariations = normalizeLegacyVariants(parsed);
  const variationsBase = parsedVariations.length > 0 ? parsedVariations : legacyVariations;
  const variations =
    variationsBase.length > 0
      ? variationsBase.slice(0, 4)
      : [`${caption}`, `${caption} (variação alternativa)`];

  const parsedChecklist = normalizeTextArray(parsed?.platformChecklist || parsed?.checklist);
  const platformChecklist = parsedChecklist.length > 0 ? parsedChecklist : resolvePlatformChecklist(body.platform);

  return {
    platform: body.platform,
    type: body.type,
    caption,
    hashtags,
    cta,
    mediaSuggestion,
    variations,
    platformChecklist,
    // Compatibilidade para consumidores legados da API.
    variants: variations.map((text) => ({ text })),
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
  if (normalized.includes("provider_unavailable")) {
    return {
      status: 502,
      payload: {
        error: "provider_unavailable",
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

function getIdempotencyKey(req, body) {
  const header = req.headers["idempotency-key"];
  if (typeof header === "string" && header.trim().length >= 8) {
    return `creator_post_generate:${header.trim()}`;
  }

  const stableBody = {
    platform: body.platform,
    type: body.type,
    goal: body.goal,
    tone: body.tone,
    language: body.language,
    brief: body.brief,
    variants: body.variants,
    prompt: body.prompt || null,
    hashtags: Boolean(body.hashtags),
    cta: Boolean(body.cta),
  };

  const raw = `${req.user?.id || "anonymous"}:${IDEMPOTENCY_ACTION}:${JSON.stringify(stableBody)}`;
  return `creator_post_generate:auto:${crypto.createHash("sha256").update(raw).digest("hex")}`;
}

function getPromptIdempotencyKey(req, body) {
  const header = req.headers["idempotency-key"];
  if (typeof header === "string" && header.trim().length >= 8) {
    return `creator_post_prompt:${header.trim()}`;
  }
  return buildRequestHash({
    action: "creator_post_prompt",
    userId: req.user?.id,
    platform: body.platform,
    type: body.type,
    goal: body.goal,
    tone: body.tone,
    language: body.language,
    brief: body.brief,
    variants: body.variants,
  });
}

function getRequestHash(body) {
  return buildRequestHash({
    action: IDEMPOTENCY_ACTION,
    platform: body.platform,
    type: body.type,
    goal: body.goal,
    tone: body.tone,
    language: body.language,
    brief: body.brief,
    variants: body.variants,
    prompt: body.prompt || null,
    hashtags: Boolean(body.hashtags),
    cta: Boolean(body.cta),
  });
}

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

  if (legacy.error) throw new Error(`failed_to_load_wallet: ${legacy.error.message}`);
  return normalizeWallet(legacy.data);
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

async function saveIdempotentResponse(db, userId, idempotencyKey, requestHash, responsePayload) {
  const { error } = await db.from("request_idempotency").upsert(
    {
      user_id: userId,
      action: IDEMPOTENCY_ACTION,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      response: responsePayload,
      status: "completed",
    },
    { onConflict: "user_id,action,idempotency_key" }
  );

  if (!error) return responsePayload;

  const msg = String(error.message || "").toLowerCase();
  if (msg.includes("on conflict") && msg.includes("no unique or exclusion constraint")) {
    // Ambiente sem constraint esperada: nao bloqueia resposta de geracao.
    logger.warn("creator_post_idempotency_constraint_missing", {
      userId,
      feature: FEATURE_NAME,
      idempotencyKeyPrefix: idemPrefix(idempotencyKey),
    });
    return responsePayload;
  }
  if (msg.includes("duplicate") || msg.includes("unique")) {
    const existing = await readIdempotentResponse(db, userId, idempotencyKey);
    if (existing) return existing;
  }
  if (msg.includes("request_idempotency") && (msg.includes("does not exist") || msg.includes("relation"))) {
    return responsePayload;
  }
  throw new Error(`failed_to_save_idempotency: ${error.message}`);
}

function buildMockResult(body) {
  const hashtagSeed = body.hashtags ? ["#autocrie", "#creatorpost", "#editexai"] : [];
  const variationCount = Math.max(2, Number(body.variants || 1));
  const caption = `${body.brief} - conteúdo otimizado para ${body.platform}.`;
  const cta = body.cta ? "Comente sua opiniao e compartilhe." : "Salve este post para consultar depois.";
  const variations = Array.from({ length: variationCount }).map(
    (_, idx) => `Variacao ${idx + 1}: ${caption}`
  );

  return {
    platform: body.platform,
    type: body.type,
    caption,
    hashtags: hashtagSeed,
    cta,
    mediaSuggestion: "Imagem ou video curto alinhado ao tema do post.",
    variations,
    platformChecklist: resolvePlatformChecklist(body.platform),
    variants: variations.map((text) => ({ text })),
    created_at: new Date().toISOString(),
  };
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

async function buildFallbackReplay({ db, userId, idempotencyKey, body, usedPrompt, costData }) {
  const createdAt = await getTxCreatedAt(db, userId, idempotencyKey);
  if (!createdAt) return null;

  const balance = await getWallet(db, userId);
  const result = buildMockResult(body);
  result.created_at = createdAt;

  return {
    ok: true,
    result,
    used_prompt: usedPrompt,
    cost: { common: costData.costCommon, breakdown: costData.breakdown },
    debit: { common: costData.costCommon },
    balance,
    replay: true,
  };
}

function mapDebitError(error, commonCost, currentCommon) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("duplicate") || message.includes("unique") || message.includes("uq_coins_idempotency")) {
    return { status: 409, payload: { error: "idempotency_replay" } };
  }
  if (message.includes("insufficient") || message.includes("saldo")) {
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
    payload: {
      error: "coins_debit_failed",
      details: error?.message || "unknown_error",
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
        platform: body.platform,
        type: body.type,
        goal: body.goal,
        tone: body.tone,
        language: body.language,
        brief_len: String(body.brief || "").trim().length,
        variants: body.variants,
      }),
      costs: { common: 0, pro: 0, ultra: 0 },
      meta: {
        platform: body.platform,
        type: body.type,
        goal: body.goal,
        tone: body.tone,
        language: body.language,
        variants: body.variants,
      },
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
        meta: { error: "creator_post_prompt_failed", details: error?.message || "unknown_error" },
        status: "error",
      });
    }
    const mapped = mapRouteError(error, "creator_post_prompt_failed");
    return res.status(mapped.status).json(mapped.payload);
  }
});

router.post("/generate", generateLimiter, async (req, res) => {
  const body = parseWithSchema(GenerateSchema, req, res);
  if (!body) return;

  let db = null;
  const userId = req.user.id;
  const requestHash = getRequestHash(body);
  const idempotencyKey = getIdempotencyKey(req, body);
  const usedPrompt = body.prompt || buildPrompt(body);
  const costData = computePostCostCommon(body);
  const commonCost = costData.costCommon;

  try {
    db = getDbClient(req);
    const cachedResponse = await readIdempotentResponse(db, userId, idempotencyKey);
    if (cachedResponse) {
      logger.info("creator_post_generate_replay", {
        userId,
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

    const walletBefore = await getWallet(db, userId);
    if (walletBefore.common < commonCost) {
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
          current_common: walletBefore.common,
          breakdown: costData.breakdown,
        },
        status: "error",
      });
      return res.status(400).json({
        error: "insufficient_balance",
        needed: commonCost,
        required_common: commonCost,
        current_common: walletBefore.common,
      });
    }

    const { error: debitError } = await db.rpc("coins_debit_v1", {
      p_user_id: userId,
      p_common: commonCost,
      p_pro: 0,
      p_ultra: 0,
      p_feature: FEATURE_NAME,
      p_idempotency_key: idempotencyKey,
    });

    if (debitError) {
      const mapped = mapDebitError(debitError, commonCost, walletBefore.common);
      if (mapped.payload?.error === "idempotency_replay") {
        const replayCache = await readIdempotentResponse(db, userId, idempotencyKey);
        if (replayCache) {
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
          return res.json(replayCache);
        }

        const replayFallback = await buildFallbackReplay({
          db,
          userId,
          idempotencyKey,
          body,
          usedPrompt,
          costData,
        });
        if (replayFallback) {
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
          return res.json(replayFallback);
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

      await trackUsage({
        db,
        userId,
        feature: FEATURE_NAME,
        action: "generate",
        idempotencyKey,
        requestHash,
        costs: { common: 0, pro: 0, ultra: 0 },
        meta: { error: mapped.payload?.error || "coins_debit_failed", details: mapped.payload?.details || null },
        status: "error",
      });
      return res.status(mapped.status).json(mapped.payload);
    }

    let result = buildMockResult(body);
    if (!isMockEnabled()) {
      const ai = await AutocrieBrain.execute({
        feature: "text_generate",
        input: { prompt: usedPrompt },
        user: req.user,
        plan: req.plan,
      });
      const aiText = String(ai?.output?.text || "").trim();
      const normalizedResult = buildCreatorPostResultFromOutput(body, aiText || body.brief);
      result = {
        ...normalizedResult,
      };
    }

    const createdAt = (await getTxCreatedAt(db, userId, idempotencyKey)) || new Date().toISOString();
    result.created_at = createdAt;
    const balance = await getWallet(db, userId);

    const responsePayload = {
      ok: true,
      result,
      used_prompt: usedPrompt,
      cost: { common: commonCost, breakdown: costData.breakdown },
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
        platform: body.platform,
        type: body.type,
        goal: body.goal,
        tone: body.tone,
        language: body.language,
        variants: body.variants,
        hashtags: Boolean(body.hashtags),
        cta: Boolean(body.cta),
        breakdown: costData.breakdown,
      },
      status: "success",
    });

    logger.info("creator_post_generate_success", {
      userId,
      feature: FEATURE_NAME,
      status: "success",
      cost: commonCost,
      idempotencyKeyPrefix: idemPrefix(idempotencyKey),
    });

    return res.json(finalPayload);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      logger.warn("creator_post_generate_quota_exceeded", {
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
          error: "creator_post_generate_failed",
          details: error?.message || "unknown_error",
        },
        status: "error",
      });
    }
    logger.error("creator_post_generate_failed", {
      userId,
      feature: FEATURE_NAME,
      status: "error",
      idempotencyKeyPrefix: idemPrefix(idempotencyKey),
      message: error?.message || "unknown_error",
    });
    const mapped = mapRouteError(error, "creator_post_generate_failed");
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
  "platform":"Instagram",
  "type":"Post",
  "goal":"Engajamento",
  "tone":"Profissional",
  "language":"pt-BR",
  "brief":"Lancamento de um produto para criadores de conteudo",
  "variants":2,
  "hashtags":true,
  "cta":true
}
'@ | Set-Content .\post-generate.json

curl.exe -s -X POST "$apiBase/api/creator-post/prompt" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  --data-binary "@post-generate.json"

@'
{
  "platform":"Instagram",
  "contentType":"Post",
  "objective":"Engajamento",
  "tone":"Profissional",
  "language":"pt-BR",
  "theme":"Lancamento de um produto para criadores de conteudo",
  "variants":2,
  "hashtags":true,
  "cta":true
}
'@ | Set-Content .\post-generate-frontend.json

curl.exe -s -X POST "$apiBase/api/creator-post/prompt" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  --data-binary "@post-generate-frontend.json"

$key = "creator-post-replay-001"
curl.exe -s -X POST "$apiBase/api/creator-post/generate" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -H "Idempotency-Key: $key" `
  --data-binary "@post-generate.json"

curl.exe -s -X POST "$apiBase/api/creator-post/generate" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -H "Idempotency-Key: $key" `
  --data-binary "@post-generate.json"

$key2 = "creator-post-replay-002"
curl.exe -s -X POST "$apiBase/api/creator-post/generate" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -H "Idempotency-Key: $key2" `
  --data-binary "@post-generate-frontend.json"

curl.exe -s -X POST "$apiBase/api/creator-post/generate" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -H "Idempotency-Key: $key2" `
  --data-binary "@post-generate-frontend.json"

curl.exe -s "$apiBase/api/usage/me" -H "Authorization: Bearer $token"
curl.exe -s "$apiBase/api/usage/limits" -H "Authorization: Bearer $token"
curl.exe -s "$apiBase/api/usage/summary" -H "Authorization: Bearer $token"
*/

export default router;
