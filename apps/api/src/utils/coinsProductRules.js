import { getPlanCommerceConfig, getPlanLimitMatrix, normalizePlanMatrixCode } from "./planLimitsMatrix.js";

const PLAN_KIND = {
  FREE: "FREE",
  EDITOR_FREE: "EDITOR_FREE",
  EDITOR_PRO: "EDITOR_PRO",
  EDITOR_ULTRA: "EDITOR_ULTRA",
  ENTERPRISE: "ENTERPRISE",
};

const SALE_PRICE_CENTS_BY_COIN = {
  common: 15,
  pro: 45,
  ultra: 150,
};
const SUPPORTED_COIN_TYPES = new Set(["common", "pro", "ultra"]);

export function normalizeProductPlanCode(planCode) {
  const normalized = normalizePlanMatrixCode(planCode, "commerce");
  return PLAN_KIND[normalized] ? normalized : PLAN_KIND.FREE;
}

export function getConversionFeePercent(planCode) {
  return getPlanCommerceConfig(planCode, { domain: "commerce" }).conversion_fee_percent ?? null;
}

export function getPurchaseFeePercent(planCode) {
  return Number(getPlanCommerceConfig(planCode, { domain: "commerce" }).purchase_fee_percent ?? 0);
}

export function getSaleUnitPriceCents(coinType) {
  const normalized = String(coinType || "").trim().toLowerCase();
  return SALE_PRICE_CENTS_BY_COIN[normalized] ?? null;
}

export function canPurchaseCoin(planCode, coinType) {
  const normalizedPlan = normalizeProductPlanCode(planCode);
  const normalizedCoin = String(coinType || "").trim().toLowerCase();
  const allowedCoinTypes = getPlanCommerceConfig(normalizedPlan, { domain: "commerce" }).allowed_coin_types || [];
  return new Set(allowedCoinTypes).has(normalizedCoin);
}

export function canUseAvatarPreview(planCode) {
  const normalized = normalizeProductPlanCode(planCode);
  return Boolean(getPlanLimitMatrix(normalized, { domain: "usage" }).providers?.avatar_preview?.enabled);
}

export function getMinimumPurchaseCreditsPerType(planCode, coinType = null) {
  const minimums = getPlanCommerceConfig(planCode, { domain: "commerce" }).minimum_purchase_credits_per_type || null;
  if (!minimums || typeof minimums !== "object") return coinType == null ? null : 0;
  if (coinType == null) return minimums;
  const normalizedCoin = String(coinType || "").trim().toLowerCase();
  return Number(minimums?.[normalizedCoin] || 0);
}

export function isSupportedConversionPair(from, to) {
  const source = String(from || "").trim().toLowerCase();
  const target = String(to || "").trim().toLowerCase();
  if (!SUPPORTED_COIN_TYPES.has(source) || !SUPPORTED_COIN_TYPES.has(target)) return false;
  return source !== target;
}

export function toMoneyCents(value) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.round(Number(value)));
}

export function centsToBrl(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}
