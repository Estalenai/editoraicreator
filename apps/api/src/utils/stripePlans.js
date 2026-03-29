import { getPlanCreditsIncluded, getPlanSelfServeCodes, getPlanStripeEnvKeys } from "./planLimitsMatrix.js";

const PLAN_CODES = getPlanSelfServeCodes();

function readPriceId(value) {
  const v = String(value || "").trim();
  return v.length > 0 ? v : null;
}

function readPriceIdFromEnvKeys(keys = []) {
  for (const key of keys) {
    const value = readPriceId(process.env[key]);
    if (value) return value;
  }
  return null;
}

function buildCatalog() {
  const defaultBadge = {
    highlight: null,
    badge_label: { "pt-BR": null, "en-US": null },
  };
  return Object.fromEntries(
    PLAN_CODES.map((planCode) => [
      planCode,
      {
        plan_code: planCode,
        price_id: readPriceIdFromEnvKeys(getPlanStripeEnvKeys(planCode)),
        ...(planCode === "EDITOR_PRO"
          ? {
              highlight: "most_popular",
              badge_label: { "pt-BR": "Mais popular", "en-US": "Most popular" },
            }
          : defaultBadge),
      },
    ])
  );
}

function createError(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function toNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

export function getPlanCatalog() {
  return buildCatalog();
}

export function getPriceIdByPlanCode(planCode) {
  const catalog = buildCatalog();
  const key = String(planCode || "").toUpperCase();
  const entry = catalog[key];
  return entry?.price_id || null;
}

export function getPlanCodeByPriceId(priceId) {
  const target = readPriceId(priceId);
  if (!target) return null;
  const catalog = buildCatalog();
  const found = Object.values(catalog).find((row) => row.price_id === target);
  return found?.plan_code || null;
}

export function assertValidPlanCode(planCode) {
  const key = String(planCode || "").toUpperCase();
  if (!PLAN_CODES.includes(key)) {
    throw createError("invalid_plan_code", "Invalid plan_code", { plan_code: planCode || null });
  }
  return key;
}

export function assertValidPriceId(priceId) {
  const v = readPriceId(priceId);
  if (!v) {
    throw createError("invalid_price_id", "Invalid price_id");
  }
  const planCode = getPlanCodeByPriceId(v);
  if (!planCode) {
    throw createError("invalid_price_id", "Unknown price_id");
  }
  return v;
}

function buildGrantCatalog() {
  const envKeyMap = {
    EDITOR_FREE: {
      monthly: {
        common: "STRIPE_GRANT_EDITOR_FREE_MONTHLY_COMMON",
        pro: "STRIPE_GRANT_EDITOR_FREE_MONTHLY_PRO",
        ultra: "STRIPE_GRANT_EDITOR_FREE_MONTHLY_ULTRA",
      },
      one_time: {
        common: "STRIPE_GRANT_EDITOR_FREE_ONE_TIME_COMMON",
        pro: "STRIPE_GRANT_EDITOR_FREE_ONE_TIME_PRO",
        ultra: "STRIPE_GRANT_EDITOR_FREE_ONE_TIME_ULTRA",
      },
    },
    EDITOR_PRO: {
      monthly: {
        common: "STRIPE_GRANT_EDITOR_PRO_MONTHLY_COMMON",
        pro: "STRIPE_GRANT_EDITOR_PRO_MONTHLY_PRO",
        ultra: "STRIPE_GRANT_EDITOR_PRO_MONTHLY_ULTRA",
      },
      one_time: {
        common: "STRIPE_GRANT_EDITOR_PRO_ONE_TIME_COMMON",
        pro: "STRIPE_GRANT_EDITOR_PRO_ONE_TIME_PRO",
        ultra: "STRIPE_GRANT_EDITOR_PRO_ONE_TIME_ULTRA",
      },
    },
    EDITOR_ULTRA: {
      monthly: {
        common: "STRIPE_GRANT_EDITOR_ULTRA_MONTHLY_COMMON",
        pro: "STRIPE_GRANT_EDITOR_ULTRA_MONTHLY_PRO",
        ultra: "STRIPE_GRANT_EDITOR_ULTRA_MONTHLY_ULTRA",
      },
      one_time: {
        common: "STRIPE_GRANT_EDITOR_ULTRA_ONE_TIME_COMMON",
        pro: "STRIPE_GRANT_EDITOR_ULTRA_ONE_TIME_PRO",
        ultra: "STRIPE_GRANT_EDITOR_ULTRA_ONE_TIME_ULTRA",
      },
    },
  };

  return Object.fromEntries(
    PLAN_CODES.map((planCode) => {
      const credits = getPlanCreditsIncluded(planCode) || { common: 0, pro: 0, ultra: 0 };
      const envKeys = envKeyMap[planCode] || { monthly: {}, one_time: {} };
      const resolveGrant = (mode, coinType) =>
        toNonNegativeInt(process.env[envKeys?.[mode]?.[coinType]], credits?.[coinType] ?? 0);

      return [
        planCode,
        {
          monthly: {
            common: resolveGrant("monthly", "common"),
            pro: resolveGrant("monthly", "pro"),
            ultra: resolveGrant("monthly", "ultra"),
          },
          one_time: {
            common: resolveGrant("one_time", "common"),
            pro: resolveGrant("one_time", "pro"),
            ultra: resolveGrant("one_time", "ultra"),
          },
        },
      ];
    })
  );
}

export function getGrantForPlan(planCode, kind = "monthly") {
  const code = assertValidPlanCode(planCode);
  const grants = buildGrantCatalog();
  const mode = kind === "one_time" ? "one_time" : "monthly";
  return grants[code]?.[mode] || { common: 0, pro: 0, ultra: 0 };
}
