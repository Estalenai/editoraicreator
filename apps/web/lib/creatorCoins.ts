export const CREATOR_COINS_PUBLIC_NAME = "Creator Coins";
export const CREATOR_COINS_SHORT_NAME = "Coins";

type WalletLike = {
  common?: number | null;
  pro?: number | null;
  ultra?: number | null;
} | null | undefined;

export function formatCreatorCoinsWalletSummary(wallet: WalletLike): string {
  if (!wallet) return "—";
  return `${wallet.common ?? 0} Comum • ${wallet.pro ?? 0} Pro • ${wallet.ultra ?? 0} Ultra`;
}

export function formatCreatorCoinsTotal(amount: number | null | undefined, { short = false } = {}): string {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return `${safeAmount.toLocaleString("pt-BR")} ${short ? CREATOR_COINS_SHORT_NAME : CREATOR_COINS_PUBLIC_NAME}`;
}
