const PLAN_KIND = {
  FREE: "FREE",
  EDITOR_FREE: "EDITOR_FREE",
  EDITOR_PRO: "EDITOR_PRO",
  EDITOR_ULTRA: "EDITOR_ULTRA",
  ENTERPRISE: "ENTERPRISE",
};

const PLAN_ALIASES = new Map([
  ["FREE", PLAN_KIND.FREE],
  ["EDITOR_FREE", PLAN_KIND.EDITOR_FREE],
  ["INICIANTE", PLAN_KIND.EDITOR_FREE],
  ["STARTER", PLAN_KIND.EDITOR_FREE],
  ["EDITOR_STARTER", PLAN_KIND.EDITOR_FREE],
  ["EDITOR_PRO", PLAN_KIND.EDITOR_PRO],
  ["PRO", PLAN_KIND.EDITOR_PRO],
  ["CRIADOR_PRO", PLAN_KIND.EDITOR_ULTRA],
  ["CREATOR_PRO", PLAN_KIND.EDITOR_ULTRA],
  ["EDITOR_ULTRA", PLAN_KIND.EDITOR_ULTRA],
  ["ULTRA", PLAN_KIND.EDITOR_ULTRA],
  ["EMPRESARIAL", PLAN_KIND.ENTERPRISE],
  ["ENTERPRISE", PLAN_KIND.ENTERPRISE],
  ["ENTERPRISE_ULTRA", PLAN_KIND.ENTERPRISE],
]);

const CONVERSION_FEE_PERCENT_BY_PLAN = {
  [PLAN_KIND.FREE]: null,
  [PLAN_KIND.EDITOR_FREE]: 8,
  [PLAN_KIND.EDITOR_PRO]: 4,
  [PLAN_KIND.EDITOR_ULTRA]: 2,
  [PLAN_KIND.ENTERPRISE]: 0,
};

const PURCHASE_FEE_PERCENT_BY_PLAN = {
  [PLAN_KIND.FREE]: 3,
  [PLAN_KIND.EDITOR_FREE]: 0,
  [PLAN_KIND.EDITOR_PRO]: 0,
  [PLAN_KIND.EDITOR_ULTRA]: 0,
  [PLAN_KIND.ENTERPRISE]: 0,
};

const PURCHASE_ALLOWED_BY_PLAN = {
  [PLAN_KIND.FREE]: new Set(["common"]),
  [PLAN_KIND.EDITOR_FREE]: new Set(["common", "pro"]),
  [PLAN_KIND.EDITOR_PRO]: new Set(["common", "pro", "ultra"]),
  [PLAN_KIND.EDITOR_ULTRA]: new Set(["common", "pro", "ultra"]),
  [PLAN_KIND.ENTERPRISE]: new Set(["common", "pro", "ultra"]),
};

const SALE_PRICE_CENTS_BY_COIN = {
  common: 15,
  pro: 45,
  ultra: 150,
};
const SUPPORTED_COIN_TYPES = new Set(["common", "pro", "ultra"]);

export function normalizeProductPlanCode(planCode) {
  const raw = String(planCode || "").trim().toUpperCase();
  return PLAN_ALIASES.get(raw) || PLAN_KIND.FREE;
}

export function getConversionFeePercent(planCode) {
  const normalized = normalizeProductPlanCode(planCode);
  return CONVERSION_FEE_PERCENT_BY_PLAN[normalized];
}

export function getPurchaseFeePercent(planCode) {
  const normalized = normalizeProductPlanCode(planCode);
  return PURCHASE_FEE_PERCENT_BY_PLAN[normalized];
}

export function getSaleUnitPriceCents(coinType) {
  const normalized = String(coinType || "").trim().toLowerCase();
  return SALE_PRICE_CENTS_BY_COIN[normalized] ?? null;
}

export function canPurchaseCoin(planCode, coinType) {
  const normalizedPlan = normalizeProductPlanCode(planCode);
  const normalizedCoin = String(coinType || "").trim().toLowerCase();
  return PURCHASE_ALLOWED_BY_PLAN[normalizedPlan]?.has(normalizedCoin) || false;
}

export function canUseAvatarPreview(planCode) {
  const normalized = normalizeProductPlanCode(planCode);
  return normalized === PLAN_KIND.EDITOR_ULTRA || normalized === PLAN_KIND.ENTERPRISE;
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
