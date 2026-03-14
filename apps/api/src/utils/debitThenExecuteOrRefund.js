import { logger } from "./logger.js";

const INTERNAL_COST_WEIGHTS = {
  common: 0.01,
  pro: 0.03,
  ultra: 0.12,
};

function isDuplicateError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("duplicate") || msg.includes("unique") || msg.includes("uq_coins_idempotency");
}

function isInsufficientError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("insufficient") || msg.includes("saldo");
}

async function refundWithCreditV1({ db, userId, feature, idempotencyKey, common, pro, ultra }) {
  return db.rpc("coins_credit_v1", {
    p_user_id: userId,
    p_common: Number(common || 0),
    p_pro: Number(pro || 0),
    p_ultra: Number(ultra || 0),
    p_feature: `${feature}:refund`,
    p_source_event_id: `refund:${idempotencyKey}`,
    p_meta: {
      reason: "provider_failed",
      feature,
      original_idempotency_key: idempotencyKey,
    },
  });
}

async function refundWithLegacyCredit({ db, userId, feature, idempotencyKey, common, pro, ultra }) {
  const entries = [
    { coin: "common", amount: Number(common || 0) },
    { coin: "pro", amount: Number(pro || 0) },
    { coin: "ultra", amount: Number(ultra || 0) },
  ].filter((entry) => entry.amount > 0);

  for (const entry of entries) {
    const { error } = await db.rpc("coins_credit", {
      p_user_id: userId,
      p_coin_type: entry.coin,
      p_amount: entry.amount,
      p_reason: "provider_failed_refund",
      p_feature: `${feature}:refund`,
      p_ref_kind: "refund",
      p_ref_id: idempotencyKey,
      p_idempotency_key: `refund:${idempotencyKey}:${entry.coin}`,
      p_meta: {
        reason: "provider_failed",
        feature,
        original_idempotency_key: idempotencyKey,
      },
    });
    if (error) return { error };
  }

  return { error: null };
}

async function refundDebit({ db, userId, feature, idempotencyKey, common, pro, ultra }) {
  const primary = await refundWithCreditV1({
    db,
    userId,
    feature,
    idempotencyKey,
    common,
    pro,
    ultra,
  });
  if (!primary.error) return { ok: true };

  const msg = String(primary.error.message || "").toLowerCase();
  if (!msg.includes("coins_credit_v1")) {
    return { ok: false, error: primary.error };
  }

  const fallback = await refundWithLegacyCredit({
    db,
    userId,
    feature,
    idempotencyKey,
    common,
    pro,
    ultra,
  });

  if (fallback.error) return { ok: false, error: fallback.error };
  return { ok: true };
}

function computeInternalCostScore({ common, pro, ultra }) {
  const weighted =
    Number(common || 0) * INTERNAL_COST_WEIGHTS.common +
    Number(pro || 0) * INTERNAL_COST_WEIGHTS.pro +
    Number(ultra || 0) * INTERNAL_COST_WEIGHTS.ultra;
  return Number(weighted.toFixed(4));
}

export async function debitThenExecuteOrRefund({
  db,
  userId,
  feature,
  idempotencyKey,
  costCommon = 0,
  costPro = 0,
  costUltra = 0,
  executeFn,
}) {
  const common = Number(costCommon || 0);
  const pro = Number(costPro || 0);
  const ultra = Number(costUltra || 0);
  const internalCostScore = computeInternalCostScore({ common, pro, ultra });

  logger.info("coins_debit_attempt", {
    userId,
    feature,
    status: "attempt",
    idempotencyKeyPrefix: String(idempotencyKey || "").slice(0, 8),
    costCommon: common,
    costPro: pro,
    costUltra: ultra,
    internalCostScore,
  });

  const { error: debitError } = await db.rpc("coins_debit_v1", {
    p_user_id: userId,
    p_common: common,
    p_pro: pro,
    p_ultra: ultra,
    p_feature: feature,
    p_idempotency_key: idempotencyKey,
  });

  if (debitError) {
    if (isDuplicateError(debitError)) {
      const err = new Error("idempotency_replay");
      err.status = 409;
      err.payload = { error: "idempotency_replay" };
      err.code = "idempotency_replay";
      err.isDuplicate = true;
      throw err;
    }

    if (isInsufficientError(debitError)) {
      const err = new Error("insufficient_balance");
      err.status = 400;
      err.payload = { error: "insufficient_balance" };
      throw err;
    }

    const err = new Error("coins_debit_failed");
    err.status = 400;
    err.payload = { error: "coins_debit_failed", details: debitError.message };
    throw err;
  }

  try {
    const result = await executeFn();
    if (result && typeof result === "object" && !Array.isArray(result)) {
      return { ...result, _internal_cost_score: internalCostScore };
    }
    return result;
  } catch (originalError) {
    const refundResult = await refundDebit({
      db,
      userId,
      feature,
      idempotencyKey,
      common,
      pro,
      ultra,
    });

    if (!refundResult.ok) {
      logger.error("coins_refund_failed", {
        userId,
        feature,
        status: "error",
        idempotencyKeyPrefix: String(idempotencyKey || "").slice(0, 8),
        message: refundResult.error?.message || "refund_failed",
      });
    } else {
      logger.warn("coins_refunded_after_provider_failure", {
        userId,
        feature,
        status: "refunded",
        idempotencyKeyPrefix: String(idempotencyKey || "").slice(0, 8),
      });
    }

    throw originalError;
  }
}
