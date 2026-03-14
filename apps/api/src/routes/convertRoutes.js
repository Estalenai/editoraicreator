import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import supabaseAdmin from "../config/supabaseAdmin.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { generateLimiter } from "../middlewares/rateLimit.js";
import { logger } from "../utils/logger.js";
import { resolveLang, t } from "../utils/i18n.js";
import {
  getConversionFeePercent,
  isSupportedConversionPair,
  normalizeProductPlanCode,
} from "../utils/coinsProductRules.js";

const router = Router();
router.use(authMiddleware);

const BodyConvert = z.object({
  from: z.enum(["common", "pro", "ultra"]),
  to: z.enum(["common", "pro", "ultra"]),
  amount: z.number().int().positive().max(1_000_000),
  rate: z.number().positive().optional(),
  idempotency_key: z.string().min(8).optional(),
});

const IDEM_ENDPOINT = "coins_convert";

function stableJsonStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildRequestHash({ userId, endpoint, body }) {
  const canonical = stableJsonStringify(body || {});
  return crypto.createHash("sha256").update(`${userId}:${endpoint}:${canonical}`).digest("hex");
}

function normalizeWallet(row, userId) {
  return {
    user_id: row?.user_id || userId,
    common: Number(row?.common ?? row?.common_balance ?? 0),
    pro: Number(row?.pro ?? row?.pro_balance ?? 0),
    ultra: Number(row?.ultra ?? row?.ultra_balance ?? 0),
  };
}

function idemPrefix(key) {
  return String(key || "").slice(0, 8);
}

function resolveClientIdempotencyKey(req, bodyIdempotencyKey) {
  const header = req.headers["idempotency-key"];
  if (typeof header === "string" && header.trim().length >= 8) return header.trim();
  if (typeof bodyIdempotencyKey === "string" && bodyIdempotencyKey.trim().length >= 8) return bodyIdempotencyKey.trim();

  const fallback = `${req.user?.id || "anonymous"}:${IDEM_ENDPOINT}:${stableJsonStringify(req.body || {})}`;
  return crypto.createHash("sha256").update(fallback).digest("hex");
}

function mapConvertError(errorMessage) {
  const message = String(errorMessage || "").toLowerCase();
  if (message.includes("insufficient") || message.includes("saldo")) return "insufficient_balance";
  if (message.includes("unsupported_conversion_pair")) return "unsupported_conversion_pair";
  if (message.includes("coins_convert_with_fee_v1")) return "coins_convert_with_fee_unavailable";
  return "convert_failed";
}

async function getActivePlanCode(userId) {
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_code,status,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) return { planCode: "FREE", status: "inactive" };
  return { planCode: sub.plan_code || "FREE", status: sub.status || "inactive" };
}

async function getWalletSnapshot(userId) {
  const modern = await supabaseAdmin
    .from("creator_coins_wallet")
    .select("user_id, common, pro, ultra")
    .eq("user_id", userId)
    .maybeSingle();
  if (!modern.error) return normalizeWallet(modern.data, userId);

  const legacy = await supabaseAdmin
    .from("creator_coins_wallet")
    .select("user_id, common_balance, pro_balance, ultra_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (legacy.error) throw new Error(legacy.error.message);
  return normalizeWallet(legacy.data, userId);
}

async function readIdempotencyReplay(db, { userId, key, requestHash }) {
  const { data, error } = await db
    .from("request_idempotency")
    .select("response,status,request_hash")
    .eq("user_id", userId)
    .eq("endpoint", IDEM_ENDPOINT)
    .eq("key", key)
    .maybeSingle();

  if (error) return { kind: "none" };
  if (!data) return { kind: "none" };
  if (data.request_hash && requestHash && data.request_hash !== requestHash) return { kind: "conflict" };
  if (data.status === "processed" && data.response && Object.keys(data.response).length > 0) {
    return { kind: "replay", payload: { ...data.response, replay: true } };
  }
  return { kind: "none" };
}

async function saveIdempotencyResponse(db, { userId, key, requestHash, response, status = "processed" }) {
  const { error } = await db.from("request_idempotency").upsert(
    {
      user_id: userId,
      endpoint: IDEM_ENDPOINT,
      key,
      request_hash: requestHash,
      response,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint,key" }
  );

  if (error) {
    logger.warn("coins_convert_idempotency_write_failed", {
      userId,
      idempotencyKeyPrefix: idemPrefix(key),
      message: error.message,
    });
  }
}

router.post("/convert", generateLimiter, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: "supabase_admin_unavailable" });

    const parsed = BodyConvert.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

    const { from, to, amount, idempotency_key } = parsed.data;
    const clientIdempotencyKey = resolveClientIdempotencyKey(req, idempotency_key);
    const rpcIdempotencyKey = `coins_convert:${clientIdempotencyKey}`;
    const requestHash = buildRequestHash({ userId: req.user.id, endpoint: IDEM_ENDPOINT, body: parsed.data });

    const replay = await readIdempotencyReplay(supabaseAdmin, {
      userId: req.user.id,
      key: clientIdempotencyKey,
      requestHash,
    });
    if (replay.kind === "conflict") {
      const lang = resolveLang(req);
      return res.status(409).json({
        error: "idempotency_conflict",
        message: t(lang, "idempotency_conflict"),
      });
    }
    if (replay.kind === "replay") return res.json(replay.payload);

    if (!isSupportedConversionPair(from, to)) {
      return res.status(400).json({ error: "unsupported_conversion_pair", from, to });
    }

    const { planCode, status } = await getActivePlanCode(req.user.id);
    const normalizedPlan = normalizeProductPlanCode(planCode);
    const allowedStatuses = process.env.NODE_ENV === "production" ? ["active"] : ["active", "pending", "trialing"];

    if (!allowedStatuses.includes(status)) {
      const lang = resolveLang(req);
      return res.status(403).json({
        error: "subscription_inactive",
        message: t(lang, "plan_insufficient"),
        plan: planCode,
        status,
      });
    }

    const feePercent = getConversionFeePercent(normalizedPlan);
    if (feePercent == null) {
      const lang = resolveLang(req);
      return res.status(403).json({
        error: "plan_not_allowed_for_conversion",
        message: t(lang, "feature_not_available_for_plan"),
        plan: planCode,
        normalized_plan: normalizedPlan,
      });
    }

    const before = await getWalletSnapshot(req.user.id);
    const { data, error } = await supabaseAdmin.rpc("coins_convert_with_fee_v1", {
      p_user_id: req.user.id,
      p_from: from,
      p_to: to,
      p_amount: amount,
      p_fee_percent: feePercent,
      p_idempotency_key: rpcIdempotencyKey,
      p_feature: "coins_convert",
    });

    if (error) {
      logger.warn("coins_convert_failed", {
        userId: req.user.id,
        feature: "coins_convert",
        status: "error",
        idempotencyKeyPrefix: idemPrefix(clientIdempotencyKey),
        message: error.message,
      });
      return res.status(error.message?.includes("coins_convert_with_fee_v1") ? 503 : 400).json({
        error: mapConvertError(error.message),
        details: error.message,
      });
    }

    const after = await getWalletSnapshot(req.user.id);
    const delta = {
      common: after.common - before.common,
      pro: after.pro - before.pro,
      ultra: after.ultra - before.ultra,
    };

    const convertedAmount = Number(data?.converted_amount ?? amount);
    const feeAmount = Number(data?.fee_amount ?? Math.ceil((amount * feePercent) / 100));
    const debitedAmount = Number(data?.debited_amount ?? convertedAmount + feeAmount);
    const txId = data?.tx_id || data?.txId || rpcIdempotencyKey;

    const responsePayload = {
      ok: true,
      before: { common: before.common, pro: before.pro, ultra: before.ultra },
      after: { common: after.common, pro: after.pro, ultra: after.ultra },
      delta,
      txId,
      conversion: {
        from,
        to,
        converted_amount: convertedAmount,
        fee_amount: feeAmount,
        debited_amount: debitedAmount,
        fee_percent: feePercent,
        plan: normalizedPlan,
      },
    };

    await saveIdempotencyResponse(supabaseAdmin, {
      userId: req.user.id,
      key: clientIdempotencyKey,
      requestHash,
      response: responsePayload,
    });

    logger.info("coins_convert_success", {
      userId: req.user.id,
      feature: "coins_convert",
      status: "success",
      idempotencyKeyPrefix: idemPrefix(clientIdempotencyKey),
      from,
      to,
      convertedAmount,
      feeAmount,
    });

    return res.json(responsePayload);
  } catch (error) {
    logger.error("coins_convert_failed", {
      userId: req.user?.id,
      feature: "coins_convert",
      status: "error",
      message: error?.message || String(error),
    });
    return res.status(500).json({ error: "server_error", message: error?.message || String(error) });
  }
});

export default router;
