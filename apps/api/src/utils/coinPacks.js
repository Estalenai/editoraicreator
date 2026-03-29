import supabaseAdmin from "../config/supabaseAdmin.js";

/**
 * Catálogo de pacotes de Creator Coins.
 *
 * Fonte: tabela `configs` (key = 'coin_packs').
 *
 * Formato esperado em configs.value:
 * {
 *   "currency": "brl",
 *   "free_surcharge_percent": 15,
 *   "packs": [
 *     {"sku":"COMMON_1000","coin_type":"common","coins":1000,"base_unit_amount_cents":15000},
 *     ...
 *   ]
 * }
 */

export async function getCoinPacksConfig() {
  const { data, error } = await supabaseAdmin
    .from("configs")
    .select("value")
    .eq("key", "coin_packs")
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar configs.coin_packs: ${error.message}`);
  }

  const cfg = data?.value;
  const packs = cfg?.packs;

  if (!Array.isArray(packs) || packs.length === 0) {
    throw new Error("Pacotes de coins não configurados (configs.key='coin_packs')");
  }

  const currency = (cfg?.currency || process.env.BILLING_CURRENCY || "brl").toLowerCase();
  const freeSurchargePercent = Number(cfg?.free_surcharge_percent ?? 15);

  return packs.map((p) => ({
    sku: String(p.sku),
    name: p.name ? String(p.name) : undefined,
    coin_type: String(p.coin_type),
    coins: Number(p.coins),
    base_unit_amount_cents: Number(p.base_unit_amount_cents),
    currency: (p.currency || currency).toLowerCase(),
    free_surcharge_percent: Number(p.free_surcharge_percent ?? freeSurchargePercent),
    min_tier: p.min_tier != null ? Number(p.min_tier) : undefined
  }));
}

export function computeCoinPackPriceCents({ pack, planCode }) {
  const base = Number(pack.base_unit_amount_cents);
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error(`Preço base inválido para pack ${pack.sku}`);
  }

  const currency = (pack.currency || process.env.BILLING_CURRENCY || "brl").toLowerCase();
  const isFree = String(planCode || "FREE").toUpperCase() === "FREE";
  const surchargePercent = Number(pack.free_surcharge_percent ?? 15);

  const unitAmountCents = isFree
    ? Math.max(1, Math.round(base * (1 + surchargePercent / 100)))
    : base;

  return { unitAmountCents, currency };
}
