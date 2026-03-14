const PLAN_CODES = ["EDITOR_FREE", "EDITOR_PRO", "EDITOR_ULTRA"];

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
  return {
    // Backward-compatible env aliases: keep checkout working without forcing .env rewrites.
    EDITOR_FREE: {
      plan_code: "EDITOR_FREE",
      price_id: readPriceIdFromEnvKeys([
        "STRIPE_PRICE_EDITOR_FREE",
        "STRIPE_PRICE_INICIANTE",
        "STRIPE_PRICE_EDITOR_STARTER",
        "STRIPE_PRICE_STARTER",
        "STRIPE_PRICE_FREE",
      ]),
      ...defaultBadge,
    },
    EDITOR_PRO: {
      plan_code: "EDITOR_PRO",
      price_id: readPriceIdFromEnvKeys([
        "STRIPE_PRICE_EDITOR_PRO",
        "STRIPE_PRICE_PRO",
        "STRIPE_PRICE_EDITORPRO",
      ]),
      highlight: "most_popular",
      badge_label: { "pt-BR": "Mais popular", "en-US": "Most popular" },
    },
    EDITOR_ULTRA: {
      plan_code: "EDITOR_ULTRA",
      price_id: readPriceIdFromEnvKeys([
        "STRIPE_PRICE_EDITOR_ULTRA",
        "STRIPE_PRICE_ULTRA",
        "STRIPE_PRICE_CREATOR_PRO",
      ]),
      ...defaultBadge,
    },
  };
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
  return {
    EDITOR_FREE: {
      monthly: {
        common: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_FREE_MONTHLY_COMMON, 300),
        pro: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_FREE_MONTHLY_PRO, 120),
        ultra: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_FREE_MONTHLY_ULTRA, 0),
      },
      one_time: {
        common: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_FREE_ONE_TIME_COMMON, 300),
        pro: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_FREE_ONE_TIME_PRO, 120),
        ultra: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_FREE_ONE_TIME_ULTRA, 0),
      },
    },
    EDITOR_PRO: {
      monthly: {
        common: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_PRO_MONTHLY_COMMON, 700),
        pro: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_PRO_MONTHLY_PRO, 350),
        ultra: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_PRO_MONTHLY_ULTRA, 150),
      },
      one_time: {
        common: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_PRO_ONE_TIME_COMMON, 700),
        pro: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_PRO_ONE_TIME_PRO, 350),
        ultra: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_PRO_ONE_TIME_ULTRA, 150),
      },
    },
    EDITOR_ULTRA: {
      monthly: {
        common: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_ULTRA_MONTHLY_COMMON, 2000),
        pro: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_ULTRA_MONTHLY_PRO, 1200),
        ultra: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_ULTRA_MONTHLY_ULTRA, 600),
      },
      one_time: {
        common: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_ULTRA_ONE_TIME_COMMON, 2000),
        pro: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_ULTRA_ONE_TIME_PRO, 1200),
        ultra: toNonNegativeInt(process.env.STRIPE_GRANT_EDITOR_ULTRA_ONE_TIME_ULTRA, 600),
      },
    },
  };
}

export function getGrantForPlan(planCode, kind = "monthly") {
  const code = assertValidPlanCode(planCode);
  const grants = buildGrantCatalog();
  const mode = kind === "one_time" ? "one_time" : "monthly";
  return grants[code]?.[mode] || { common: 0, pro: 0, ultra: 0 };
}
