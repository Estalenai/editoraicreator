import { getConfig } from "./configCache.js";

export const ENTERPRISE_COIN_TYPES = ["common", "pro", "ultra"];

const DEFAULT_ENTERPRISE_CONFIG = Object.freeze({
  enabled: false,
  currency: "BRL",
  min_qty_per_type: 50000,
  qty_step: 1000,
  prices_cents: {
    common: 15,
    pro: 30,
    ultra: 150,
  },
});

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function normalizeBooleanFlag(value) {
  if (value === true || value === false) return value;
  if (value && typeof value === "object" && typeof value.enabled === "boolean") return value.enabled;
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return null;
}

function normalizePriceMap(value, fallback) {
  const base = {
    common: toNonNegativeInt(fallback?.common, 0),
    pro: toNonNegativeInt(fallback?.pro, 0),
    ultra: toNonNegativeInt(fallback?.ultra, 0),
  };
  if (!value || typeof value !== "object") return base;
  return {
    common: toNonNegativeInt(value.common, base.common),
    pro: toNonNegativeInt(value.pro, base.pro),
    ultra: toNonNegativeInt(value.ultra, base.ultra),
  };
}

function normalizeNumericRule(value, fallback) {
  if (typeof value === "number" || typeof value === "string") {
    const parsed = toNonNegativeInt(value, fallback);
    return parsed > 0 ? parsed : fallback;
  }
  if (value && typeof value === "object") {
    const parsed =
      toNonNegativeInt(value.value, 0) ||
      toNonNegativeInt(value.min, 0) ||
      toNonNegativeInt(value.default, 0);
    if (parsed > 0) return parsed;
  }
  return fallback;
}

export function centsToMoney(cents) {
  return Number((toNonNegativeInt(cents, 0) / 100).toFixed(2));
}

export async function getEnterpriseConfig() {
  const [enabledRaw, minQtyRaw, qtyStepRaw, pricesRaw] = await Promise.all([
    getConfig("enterprise.enabled").catch(() => null),
    getConfig("enterprise.min_qty_per_type").catch(() => null),
    getConfig("enterprise.qty_step").catch(() => null),
    getConfig("enterprise.prices_cents").catch(() => null),
  ]);

  const enabled = normalizeBooleanFlag(enabledRaw);
  const minQtyPerType = normalizeNumericRule(minQtyRaw, DEFAULT_ENTERPRISE_CONFIG.min_qty_per_type);
  const qtyStep = normalizeNumericRule(qtyStepRaw, DEFAULT_ENTERPRISE_CONFIG.qty_step);
  const pricesCents = normalizePriceMap(pricesRaw, DEFAULT_ENTERPRISE_CONFIG.prices_cents);

  return {
    enabled: typeof enabled === "boolean" ? enabled : DEFAULT_ENTERPRISE_CONFIG.enabled,
    currency: DEFAULT_ENTERPRISE_CONFIG.currency,
    min_qty_per_type: minQtyPerType,
    qty_step: qtyStep,
    prices_cents: pricesCents,
  };
}

export function normalizeEnterpriseQuantities(input = {}) {
  const out = {
    common_qty: toNonNegativeInt(input.common_qty, 0),
    pro_qty: toNonNegativeInt(input.pro_qty, 0),
    ultra_qty: toNonNegativeInt(input.ultra_qty, 0),
  };
  return out;
}

export function validateEnterpriseQuantities(quantities, cfg) {
  const minQtyPerType = toNonNegativeInt(cfg?.min_qty_per_type, DEFAULT_ENTERPRISE_CONFIG.min_qty_per_type);
  const qtyStep = toNonNegativeInt(cfg?.qty_step, DEFAULT_ENTERPRISE_CONFIG.qty_step);

  const selected = ENTERPRISE_COIN_TYPES.filter((coinType) => Number(quantities?.[`${coinType}_qty`] || 0) > 0);
  if (!selected.length) {
    return {
      ok: false,
      error: "enterprise_qty_required",
      details: { min_qty_per_type: minQtyPerType, qty_step: qtyStep },
    };
  }

  for (const coinType of selected) {
    const qty = toNonNegativeInt(quantities?.[`${coinType}_qty`], 0);
    if (qty < minQtyPerType) {
      return {
        ok: false,
        error: "min_qty_per_type",
        details: {
          coin_type: coinType,
          min_qty_per_type: minQtyPerType,
          qty,
        },
      };
    }
    if (qtyStep > 0 && qty % qtyStep !== 0) {
      return {
        ok: false,
        error: "invalid_qty_step",
        details: {
          coin_type: coinType,
          qty_step: qtyStep,
          qty,
        },
      };
    }
  }

  return {
    ok: true,
    details: { min_qty_per_type: minQtyPerType, qty_step: qtyStep },
  };
}

export function buildEnterpriseBreakdown(quantities, cfg) {
  const rows = {};
  let subtotalCents = 0;

  for (const coinType of ENTERPRISE_COIN_TYPES) {
    const qty = toNonNegativeInt(quantities?.[`${coinType}_qty`], 0);
    const unitPriceCents = toNonNegativeInt(cfg?.prices_cents?.[coinType], 0);
    const subtotal = qty * unitPriceCents;
    subtotalCents += subtotal;

    rows[coinType] = {
      qty,
      unit_price_cents: unitPriceCents,
      unit_price_brl: centsToMoney(unitPriceCents),
      subtotal_cents: subtotal,
      subtotal_brl: centsToMoney(subtotal),
    };
  }

  const feeCents = 0;
  const totalCents = subtotalCents + feeCents;

  return {
    currency: String(cfg?.currency || DEFAULT_ENTERPRISE_CONFIG.currency),
    per_type: rows,
    subtotal_cents: subtotalCents,
    subtotal_brl: centsToMoney(subtotalCents),
    fee_cents: feeCents,
    fee_brl: centsToMoney(feeCents),
    total_cents: totalCents,
    total_brl: centsToMoney(totalCents),
  };
}
