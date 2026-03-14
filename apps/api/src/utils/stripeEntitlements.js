function toNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function parseJsonPackMap() {
  const raw = String(process.env.STRIPE_COIN_PACKS || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result = {};
    for (const [priceId, cfg] of Object.entries(parsed)) {
      if (!priceId || typeof cfg !== "object" || !cfg) continue;
      result[priceId] = {
        common: toNonNegativeInt(cfg.common),
        pro: toNonNegativeInt(cfg.pro),
        ultra: toNonNegativeInt(cfg.ultra),
      };
    }
    return result;
  } catch {
    return {};
  }
}

function parseEnvPackMap() {
  const out = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("STRIPE_PRICE_")) continue;
    const raw = String(value || "").trim();
    if (!raw.includes(":")) continue;
    const [priceId, commonRaw, proRaw, ultraRaw] = raw.split(":");
    if (!priceId.startsWith("price_")) continue;
    out[priceId] = {
      common: toNonNegativeInt(commonRaw),
      pro: toNonNegativeInt(proRaw),
      ultra: toNonNegativeInt(ultraRaw),
    };
  }
  return out;
}

export function getStripeCoinPackMap() {
  return {
    ...parseEnvPackMap(),
    ...parseJsonPackMap(),
  };
}

function sumCoins(rows) {
  return rows.reduce(
    (acc, row) => ({
      common: acc.common + toNonNegativeInt(row.common),
      pro: acc.pro + toNonNegativeInt(row.pro),
      ultra: acc.ultra + toNonNegativeInt(row.ultra),
    }),
    { common: 0, pro: 0, ultra: 0 }
  );
}

export function computeCoinsFromStripe({ eventType, session, invoice }) {
  const map = getStripeCoinPackMap();
  const prices = [];

  if (eventType === "checkout.session.completed") {
    const lines = session?.line_items?.data || [];
    for (const line of lines) {
      const priceId = line?.price?.id || null;
      if (priceId) prices.push(priceId);
    }
    if (!prices.length && session?.metadata?.price_id) prices.push(session.metadata.price_id);
  }

  if (eventType === "invoice.paid") {
    const lines = invoice?.lines?.data || [];
    for (const line of lines) {
      const priceId = line?.price?.id || null;
      if (priceId) prices.push(priceId);
    }
    if (!prices.length && invoice?.metadata?.price_id) prices.push(invoice.metadata.price_id);
  }

  const mappedRows = [];
  const missing = [];
  for (const priceId of prices) {
    const row = map[priceId];
    if (!row) {
      missing.push(priceId);
      continue;
    }
    mappedRows.push(row);
  }

  if (!mappedRows.length) {
    return {
      ok: false,
      reason: "unmapped_price",
      sku: prices[0] || null,
      missingPrices: missing.length ? missing : prices,
      coins: { common: 0, pro: 0, ultra: 0 },
    };
  }

  return {
    ok: true,
    reason: "mapped_price",
    sku: prices[0] || null,
    missingPrices: missing,
    coins: sumCoins(mappedRows),
  };
}
