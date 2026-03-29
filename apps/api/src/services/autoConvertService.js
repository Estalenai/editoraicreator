import supabaseAdmin from "../config/supabaseAdmin.js";
import { normalizeProductPlanCode } from "../utils/coinsProductRules.js";

const AUTO_CONVERT_KEY = "auto_convert";

/**
 * Config: limites mensais por plano
 */
const CONVERSION_LIMITS = {
  EDITOR_FREE: 1,
  EDITOR_PRO: 3,
  EDITOR_ULTRA: 6,
  ENTERPRISE: 999999,
  FREE: 0,
};

const TIERS = ["common", "pro", "ultra"];
let _configsHasUserId = null;

function makeError(code, status, payload) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  err.payload = payload;
  return err;
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
    if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  }
  if (typeof value === "number") return value > 0;
  return false;
}

async function queryConfigByUserId(userId, key) {
  if (_configsHasUserId === false) return { data: null, error: null };

  const { data, error } = await supabaseAdmin
    .from("configs")
    .select("value,updated_at")
    .eq("user_id", userId)
    .eq("key", key)
    .maybeSingle();

  if (error && /user_id/i.test(error.message)) {
    _configsHasUserId = false;
    return { data: null, error: null };
  }

  if (!error) _configsHasUserId = true;
  return { data, error };
}

async function queryConfigByLegacyKey(userId, key) {
  const legacyKey = `${key}.${userId}`;
  return supabaseAdmin.from("configs").select("value,updated_at").eq("key", legacyKey).maybeSingle();
}

async function getUserConfigValue(userId, key) {
  const { data, error } = await queryConfigByUserId(userId, key);
  if (error) throw new Error(`Failed to load config ${key}: ${error.message}`);
  if (data) return data.value ?? null;

  const { data: legacyData, error: legacyError } = await queryConfigByLegacyKey(userId, key);
  if (legacyError) throw new Error(`Failed to load config ${key}: ${legacyError.message}`);
  return legacyData?.value ?? null;
}

async function upsertUserConfigValue(userId, key, value) {
  if (_configsHasUserId !== false) {
    const { data: existing, error: lookupError } = await queryConfigByUserId(userId, key);
    if (lookupError) throw new Error(`Failed to load config ${key}: ${lookupError.message}`);

    if (_configsHasUserId !== false) {
      if (existing) {
        const { data, error } = await supabaseAdmin
          .from("configs")
          .update({ value })
          .eq("user_id", userId)
          .eq("key", key)
          .select("key,value,updated_at")
          .maybeSingle();
        if (error) throw new Error(`Failed to update config ${key}: ${error.message}`);
        return data;
      }

      const { data, error } = await supabaseAdmin
        .from("configs")
        .insert({ user_id: userId, key, value })
        .select("key,value,updated_at")
        .maybeSingle();
      if (error) throw new Error(`Failed to insert config ${key}: ${error.message}`);
      return data;
    }
  }

  const legacyKey = `${key}.${userId}`;
  const { data: legacyExisting, error: legacyLookupError } = await supabaseAdmin
    .from("configs")
    .select("key")
    .eq("key", legacyKey)
    .maybeSingle();
  if (legacyLookupError) throw new Error(`Failed to load config ${key}: ${legacyLookupError.message}`);

  if (legacyExisting) {
    const { data, error } = await supabaseAdmin
      .from("configs")
      .update({ value })
      .eq("key", legacyKey)
      .select("key,value,updated_at")
      .maybeSingle();
    if (error) throw new Error(`Failed to update config ${key}: ${error.message}`);
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("configs")
    .insert({ key: legacyKey, value })
    .select("key,value,updated_at")
    .maybeSingle();
  if (error) throw new Error(`Failed to insert config ${key}: ${error.message}`);
  return data;
}

export async function getWallet(userId) {
  const { data, error } = await supabaseAdmin
    .from("creator_coins_wallet")
    .select("user_id, common, pro, ultra, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load wallet: ${error.message}`);

  return (
    data || {
      user_id: userId,
      common: 0,
      pro: 0,
      ultra: 0,
      updated_at: null,
    }
  );
}

export async function getPlan(userId) {
  const { data: sub, error } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_code,status,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load subscription: ${error.message}`);
  if (!sub) return { planCode: "FREE", status: "inactive" };
  return { planCode: sub.plan_code || "FREE", status: sub.status || "inactive" };
}

async function conversionsUsedThisMonth(userId) {
  try {
    const { data, error } = await supabaseAdmin.rpc("conversions_used_this_month", {
      p_user_id: userId,
    });
    if (!error && typeof data === "number") return data;
  } catch {}

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from("coins_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("ref_kind", "convert")
    .lt("amount", 0)
    .gte("created_at", start.toISOString());

  if (error) throw new Error(`Failed to load conversions: ${error.message}`);
  return count || 0;
}

export async function getAutoConvertEnabled(userId) {
  const value = await getUserConfigValue(userId, AUTO_CONVERT_KEY);
  return normalizeBoolean(value);
}

export async function setAutoConvertEnabled(userId, enabled) {
  const payload = Boolean(enabled);
  await upsertUserConfigValue(userId, AUTO_CONVERT_KEY, payload);
  return payload;
}

function pickSourceTier(wallet, requiredTier) {
  const candidates = TIERS.filter((tier) => tier !== requiredTier)
    .map((tier) => ({ tier, balance: Number(wallet?.[tier] ?? 0) }))
    .filter((c) => c.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  return candidates[0]?.tier || null;
}

export async function ensureCreditsOrAutoConvert({
  userId,
  requiredTier,
  requiredAmount,
  planCode,
}) {
  const tier = String(requiredTier || "").toLowerCase();
  if (!TIERS.includes(tier)) {
    throw makeError("invalid_required_tier", 400, { error: "invalid_required_tier", tier });
  }

  const amount = Number(requiredAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw makeError("invalid_required_amount", 400, { error: "invalid_required_amount", amount });
  }

  const wallet = await getWallet(userId);
  const balance = Number(wallet?.[tier] ?? 0);

  if (balance >= amount) {
    return { ok: true, converted: false, wallet };
  }

  const autoEnabled = await getAutoConvertEnabled(userId);
  if (!autoEnabled) {
    throw makeError("insufficient_credits", 403, {
      error: "insufficient_credits",
      required: { tier, amount },
      wallet: { common: wallet.common, pro: wallet.pro, ultra: wallet.ultra },
      suggestion: "Ative auto-convert ou compre Creator Coins antes de continuar.",
    });
  }

  const plan = await getPlan(userId);
  const effectivePlan = normalizeProductPlanCode(planCode || plan.planCode || "FREE");
  const status = plan.status || "inactive";
  const allowedStatuses =
    process.env.NODE_ENV === "production" ? ["active"] : ["active", "pending"];

  if (!allowedStatuses.includes(status)) {
    throw makeError("subscription_inactive", 403, {
      error: "subscription_inactive",
      plan: effectivePlan,
      status,
    });
  }

  const limit = CONVERSION_LIMITS[effectivePlan] ?? 0;
  if (limit <= 0) {
    throw makeError("plan_not_allowed_for_conversion", 403, {
      error: "plan_not_allowed_for_conversion",
      plan: effectivePlan,
    });
  }

  const used = await conversionsUsedThisMonth(userId);
  if (used >= limit) {
    throw makeError("conversion_limit_reached", 403, {
      error: "conversion_limit_reached",
      plan: effectivePlan,
      used,
      limit,
    });
  }

  const sourceTier = pickSourceTier(wallet, tier);
  if (!sourceTier) {
    throw makeError("insufficient_credits", 403, {
      error: "insufficient_credits",
      required: { tier, amount },
      wallet: { common: wallet.common, pro: wallet.pro, ultra: wallet.ultra },
      suggestion: "Ative auto-convert ou compre Creator Coins antes de continuar.",
    });
  }

  const deficit = amount - balance;
  const idempotencyKey = `auto:${userId}:${tier}:${Date.now()}`;

  const { data, error } = await supabaseAdmin.rpc("coins_convert", {
    p_user_id: userId,
    p_from: sourceTier,
    p_to: tier,
    p_amount: deficit,
    p_plan_code: effectivePlan,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    throw makeError("auto_convert_failed", 400, {
      error: "auto_convert_failed",
      details: error.message,
    });
  }

  const refreshed = await getWallet(userId);
  const newBalance = Number(refreshed?.[tier] ?? 0);
  if (newBalance < amount) {
    throw makeError("insufficient_credits", 403, {
      error: "insufficient_credits",
      required: { tier, amount },
      wallet: { common: refreshed.common, pro: refreshed.pro, ultra: refreshed.ultra },
      suggestion: "Saldo insuficiente após auto-convert. Tente novamente ou compre Creator Coins.",
    });
  }

  return {
    ok: true,
    converted: true,
    from: sourceTier,
    to: tier,
    amount: deficit,
    plan: effectivePlan,
    result: data ?? null,
    wallet: refreshed,
  };
}
