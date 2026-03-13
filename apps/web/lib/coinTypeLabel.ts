export type CoinType = "common" | "pro" | "ultra";

const PT_BR_COIN_TYPE_LABELS: Record<CoinType, string> = {
  common: "Comum",
  pro: "Pro",
  ultra: "Ultra",
};

const EN_US_COIN_TYPE_LABELS: Record<CoinType, string> = {
  common: "Common",
  pro: "Pro",
  ultra: "Ultra",
};

function normalizeCoinType(value: unknown): CoinType | null {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "common" || key === "pro" || key === "ultra") return key;
  return null;
}

export function coinTypeLabel(coinType: unknown, lang: "pt-BR" | "en-US" = "pt-BR"): string {
  const normalized = normalizeCoinType(coinType);
  if (!normalized) return "—";
  const labels = lang === "en-US" ? EN_US_COIN_TYPE_LABELS : PT_BR_COIN_TYPE_LABELS;
  return labels[normalized];
}
