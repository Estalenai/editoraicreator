"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { CreditsPackagesCard } from "../../components/dashboard/CreditsPackagesCard";
import { OperationalState } from "../../components/ui/OperationalState";
import { PremiumSelect } from "../../components/ui/PremiumSelect";
import { api } from "../../lib/api";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
import { CREATOR_COINS_PUBLIC_NAME, formatCreatorCoinsWalletSummary } from "../../lib/creatorCoins";
import { normalizePlanCode } from "../../lib/planLabel";
import { toUserFacingError } from "../../lib/uiFeedback";

type CoinTransaction = {
  id: string;
  coin_type: "common" | "pro" | "ultra";
  amount: number;
  reason?: string | null;
  feature?: string | null;
  ref_kind?: string | null;
  ref_id?: string | null;
  meta?: Record<string, any> | null;
  created_at?: string | null;
};

type CoinType = "common" | "pro" | "ultra";
type NoticeTone = "info" | "warning" | "success";
type FinancialState = "pending" | "settled" | "failed" | "refunded" | "disputed" | "reconciled" | "posted" | "unknown";
const ALL_COIN_TYPES: CoinType[] = ["common", "pro", "ultra"];
const COINS_CHECKOUT_CONTEXT_PREFIX = "ea:coins_checkout:";

type WalletSnapshot = {
  common: number;
  pro: number;
  ultra: number;
};

type StoredCoinsCheckoutContext = {
  quoteId: string;
  walletBefore: WalletSnapshot;
  expectedBreakdown: WalletSnapshot;
  latestTransactionId?: string;
  createdAt?: string;
};

type CoinsPackageStatusResponse = {
  ok?: boolean;
  quote?: {
    quote_id?: string;
    package_total?: number;
    breakdown?: WalletSnapshot;
    source?: string | null;
    expires_at?: string | null;
    used_at?: string | null;
    checkout_session_id?: string | null;
    payment_intent_id?: string | null;
  } | null;
  wallet?: WalletSnapshot | null;
  reconciliation?: {
    ok?: boolean;
    status?: string | null;
    grant?: {
      status?: string | null;
      grantCallPath?: string | null;
    } | null;
  } | null;
};

type ConversionResponse = {
  ok?: boolean;
  conversion?: {
    from?: "common" | "pro" | "ultra";
    to?: "common" | "pro" | "ultra";
    converted_amount?: number;
    fee_amount?: number;
    debited_amount?: number;
    fee_percent?: number;
    plan?: string;
  };
};

const CREDIT_GUIDE = [
  {
    coinType: "common" as const,
    title: "Comum",
    description: "Para tarefas de rotina e alto volume.",
  },
  {
    coinType: "pro" as const,
    title: "Pro",
    description: "Para geração com maior qualidade e contexto.",
  },
  {
    coinType: "ultra" as const,
    title: "Ultra",
    description: "Para fluxos premium e processamento mais pesado.",
  },
];

function getConversionFeePercentByPlan(planCodeRaw: string | null | undefined): number | null {
  const normalized = normalizePlanCode(planCodeRaw);
  if (normalized === "FREE") return null;
  if (normalized === "EDITOR_FREE") return 8;
  if (normalized === "EDITOR_PRO") return 4;
  if (normalized === "EDITOR_ULTRA") return 2;
  if (normalized === "ENTERPRISE") return 0;
  return null;
}

function formatDateTime(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function txReasonLabel(tx: CoinTransaction): string {
  const feature = String(tx.feature || "").trim();
  if (feature) return feature;
  const reason = String(tx.reason || "").trim();
  if (reason) return reason;
  return `Movimentação de ${CREATOR_COINS_PUBLIC_NAME}`;
}

function txSourceLabel(tx: CoinTransaction): string {
  const refKind = String(tx.ref_kind || "").trim();
  if (refKind) return refKind;
  const reason = String(tx.reason || "").trim().toLowerCase();
  if (reason.includes("checkout") || reason.includes("stripe")) return "stripe";
  if (reason.includes("convert")) return "conversion";
  return "ledger";
}

function waitForCheckoutSync(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWalletSnapshot(wallet: any | null | undefined): WalletSnapshot {
  return {
    common: Number(wallet?.common ?? 0),
    pro: Number(wallet?.pro ?? 0),
    ultra: Number(wallet?.ultra ?? 0),
  };
}

function walletChanged(nextWallet: WalletSnapshot | null | undefined, baselineWallet: WalletSnapshot | null | undefined): boolean {
  if (!nextWallet || !baselineWallet) return false;
  return (
    Number(nextWallet.common || 0) !== Number(baselineWallet.common || 0) ||
    Number(nextWallet.pro || 0) !== Number(baselineWallet.pro || 0) ||
    Number(nextWallet.ultra || 0) !== Number(baselineWallet.ultra || 0)
  );
}

function walletReflectsGrantedPackage(
  nextWallet: WalletSnapshot | null | undefined,
  baselineWallet: WalletSnapshot | null | undefined,
  expectedBreakdown: WalletSnapshot | null | undefined
): boolean {
  if (!nextWallet || !baselineWallet || !expectedBreakdown) return false;
  return (
    Number(nextWallet.common || 0) >= Number(baselineWallet.common || 0) + Number(expectedBreakdown.common || 0) &&
    Number(nextWallet.pro || 0) >= Number(baselineWallet.pro || 0) + Number(expectedBreakdown.pro || 0) &&
    Number(nextWallet.ultra || 0) >= Number(baselineWallet.ultra || 0) + Number(expectedBreakdown.ultra || 0)
  );
}

function readCoinsCheckoutContext(quoteId: string): StoredCoinsCheckoutContext | null {
  if (typeof window === "undefined") return null;
  const safeQuoteId = String(quoteId || "").trim();
  if (!safeQuoteId) return null;
  try {
    const raw = window.sessionStorage.getItem(`${COINS_CHECKOUT_CONTEXT_PREFIX}${safeQuoteId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      quoteId: safeQuoteId,
      walletBefore: normalizeWalletSnapshot(parsed?.walletBefore),
      expectedBreakdown: normalizeWalletSnapshot(parsed?.expectedBreakdown),
      latestTransactionId: String(parsed?.latestTransactionId || ""),
      createdAt: String(parsed?.createdAt || ""),
    };
  } catch {
    return null;
  }
}

function clearCoinsCheckoutContext(quoteId: string) {
  if (typeof window === "undefined") return;
  const safeQuoteId = String(quoteId || "").trim();
  if (!safeQuoteId) return;
  try {
    window.sessionStorage.removeItem(`${COINS_CHECKOUT_CONTEXT_PREFIX}${safeQuoteId}`);
  } catch {
    // non-blocking
  }
}

function clearCheckoutSearchParams(keys: string[]) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of keys) {
    if (!url.searchParams.has(key)) continue;
    url.searchParams.delete(key);
    changed = true;
  }
  if (!changed) return;
  const nextSearch = url.searchParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function normalizeFinancialState(rawValue: unknown): FinancialState {
  const text = String(rawValue || "").trim().toLowerCase();
  if (!text) return "unknown";
  if (text.includes("reconc")) return "reconciled";
  if (text.includes("disput")) return "disputed";
  if (text.includes("refund")) return "refunded";
  if (text.includes("fail") || text.includes("cancel") || text.includes("declin")) return "failed";
  if (text.includes("pend") || text.includes("process") || text.includes("await")) return "pending";
  if (text.includes("settl") || text.includes("paid") || text.includes("confirm")) return "settled";
  if (text.includes("post")) return "posted";
  return "unknown";
}

function resolveFinancialState(
  tx: CoinTransaction,
  packageStatus: CoinsPackageStatusResponse | null | undefined
): FinancialState {
  const meta = tx.meta || {};
  const candidates = [
    meta.financial_state,
    meta.settlement_status,
    meta.reconciliation_status,
    meta.processing_state,
    packageStatus?.reconciliation?.status,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeFinancialState(candidate);
    if (normalized !== "unknown") return normalized;
  }
  if (packageStatus?.quote?.used_at && isPackageTransaction(tx)) return "reconciled";
  if (isPackageTransaction(tx) && (meta.stripe_checkout_session_id || meta.stripe_payment_intent_id)) return "settled";
  if (isConversionTransaction(tx)) return "reconciled";
  return tx.amount > 0 ? "posted" : "reconciled";
}

function financialStateLabel(state: FinancialState): string {
  switch (state) {
    case "pending":
      return "Pending";
    case "settled":
      return "Settled";
    case "failed":
      return "Failed";
    case "refunded":
      return "Refunded";
    case "disputed":
      return "Disputed";
    case "reconciled":
      return "Reconciled";
    case "posted":
      return "Posted";
    default:
      return "Sem trilha";
  }
}

function financialStateSummary(state: FinancialState): string {
  switch (state) {
    case "pending":
      return "Aguardando confirmação final do processamento.";
    case "settled":
      return "Pagamento confirmado, aguardando ou recém-fechado no ledger.";
    case "failed":
      return "Falha operacional registrada para revisão.";
    case "refunded":
      return "Valor devolvido e mantido na trilha financeira.";
    case "disputed":
      return "Cobrança em disputa e exigindo revisão.";
    case "reconciled":
      return "Recibo, saldo e ledger alinhados.";
    case "posted":
      return "Evento lançado no ledger com leitura disponível.";
    default:
      return "Sem estado financeiro explícito.";
  }
}

function financialStateOperationalKind(state: FinancialState): "payment-processing" | "reconciliation" | "retry" | "error" | "success" | "empty" {
  switch (state) {
    case "pending":
      return "payment-processing";
    case "settled":
      return "reconciliation";
    case "failed":
      return "error";
    case "refunded":
    case "disputed":
      return "retry";
    case "reconciled":
    case "posted":
      return "success";
    default:
      return "empty";
  }
}

function isPackageTransaction(tx: CoinTransaction): boolean {
  const refKind = String(tx.ref_kind || "").trim().toLowerCase();
  const reason = String(tx.reason || "").trim().toLowerCase();
  const feature = String(tx.feature || "").trim().toLowerCase();
  const meta = tx.meta || {};
  return (
    refKind.includes("package") ||
    reason.includes("compra") ||
    reason.includes("checkout") ||
    reason.includes("stripe") ||
    feature.includes("compra") ||
    String(meta.kind || "").trim().toLowerCase().includes("package")
  );
}

function isConversionTransaction(tx: CoinTransaction): boolean {
  const refKind = String(tx.ref_kind || "").trim().toLowerCase();
  const reason = String(tx.reason || "").trim().toLowerCase();
  const feature = String(tx.feature || "").trim().toLowerCase();
  return refKind.includes("conversion") || reason.includes("convers") || feature.includes("convers");
}

function buildSupportReference(tx: CoinTransaction, packageStatus: CoinsPackageStatusResponse | null | undefined): string {
  const meta = tx.meta || {};
  return String(
    meta.support_ref ||
      meta.quote_id ||
      meta.receipt_id ||
      meta.stripe_payment_intent_id ||
      meta.stripe_checkout_session_id ||
      packageStatus?.quote?.payment_intent_id ||
      packageStatus?.quote?.checkout_session_id ||
      tx.ref_id ||
      tx.id
  ).trim();
}

function receiptReference(tx: CoinTransaction, packageStatus: CoinsPackageStatusResponse | null | undefined): string {
  const meta = tx.meta || {};
  return String(
    meta.receipt_id ||
      meta.quote_id ||
      packageStatus?.quote?.quote_id ||
      tx.ref_id ||
      tx.id
  ).trim();
}

function processingReference(tx: CoinTransaction, packageStatus: CoinsPackageStatusResponse | null | undefined): string {
  const meta = tx.meta || {};
  return String(
    meta.stripe_payment_intent_id ||
      meta.payment_intent_id ||
      packageStatus?.quote?.payment_intent_id ||
      meta.stripe_checkout_session_id ||
      meta.checkout_session_id ||
      packageStatus?.quote?.checkout_session_id ||
      "Sem ID público"
  ).trim();
}

function formatMoneyFromMeta(tx: CoinTransaction): string | null {
  const meta = tx.meta || {};
  const pricing = meta.pricing || {};
  const numeric =
    Number(pricing.total_amount ?? pricing.total_brl ?? meta.total_brl ?? meta.package_total ?? Number.NaN);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 1000 ? formatBrl(numeric / 100) : formatBrl(numeric);
}

function formatBrl(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0;
  return normalized.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CreditsPage() {
  const {
    loading,
    accessReady,
    error,
    email,
    planLabel,
    planCodeRaw,
    wallet,
    betaAccess,
    betaBlocked,
    onLogout,
    refresh,
  } = useDashboardBootstrap({ loadDashboard: true });
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [conversionFrom, setConversionFrom] = useState<CoinType>("common");
  const [conversionTo, setConversionTo] = useState<CoinType>("pro");
  const [conversionAmount, setConversionAmount] = useState<number>(10);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResponse | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [handledCheckoutState, setHandledCheckoutState] = useState("");
  const [latestPackageStatus, setLatestPackageStatus] = useState<CoinsPackageStatusResponse | null>(null);

  const walletSummary = useMemo(
    () => formatCreatorCoinsWalletSummary(wallet),
    [wallet]
  );
  const totalWalletAmount = useMemo(
    () => Number(wallet?.common ?? 0) + Number(wallet?.pro ?? 0) + Number(wallet?.ultra ?? 0),
    [wallet]
  );

  const conversionFeePercent = useMemo(() => getConversionFeePercentByPlan(planCodeRaw), [planCodeRaw]);
  const conversionEnabled = conversionFeePercent != null;
  const destinationOptions = useMemo(
    () => ALL_COIN_TYPES.filter((coinType) => coinType !== conversionFrom),
    [conversionFrom]
  );
  const fromOptions = useMemo(
    () => ALL_COIN_TYPES.map((coinType) => ({
        value: coinType,
        label: coinTypeLabel(coinType),
      })),
    []
  );
  const toOptions = useMemo(
    () =>
      destinationOptions.map((coinType) => ({
        value: coinType,
        label: coinTypeLabel(coinType),
      })),
    [destinationOptions]
  );
  const isPairSupported = useMemo(
    () => destinationOptions.includes(conversionTo),
    [destinationOptions, conversionTo]
  );
  const conversionAmountSafe = Number.isFinite(Number(conversionAmount))
    ? Math.max(1, Math.trunc(Number(conversionAmount)))
    : 1;
  const sourceBalance = Number(wallet?.[conversionFrom] ?? 0);
  const estimatedFeeAmount =
    conversionFeePercent == null ? 0 : Math.ceil((conversionAmountSafe * conversionFeePercent) / 100);
  const estimatedDebitedAmount = conversionAmountSafe + estimatedFeeAmount;
  const estimatedTargetAmount = conversionAmountSafe;
  const insufficientForEstimate = conversionEnabled && sourceBalance < estimatedDebitedAmount;
  const latestTransaction = useMemo(() => transactions[0] || null, [transactions]);
  const decoratedTransactions = useMemo(
    () =>
      transactions.map((tx) => {
        const state = resolveFinancialState(tx, latestPackageStatus);
        return {
          tx,
          state,
          stateLabel: financialStateLabel(state),
          stateSummary: financialStateSummary(state),
          supportRef: buildSupportReference(tx, latestPackageStatus),
          receiptRef: receiptReference(tx, latestPackageStatus),
          processingRef: processingReference(tx, latestPackageStatus),
          receiptAmount: formatMoneyFromMeta(tx),
        };
      }),
    [transactions, latestPackageStatus]
  );
  const latestPackageEvent = useMemo(
    () => decoratedTransactions.find(({ tx }) => isPackageTransaction(tx)) || null,
    [decoratedTransactions]
  );
  const latestReconciledEvent = useMemo(
    () => decoratedTransactions.find(({ state }) => state === "reconciled" || state === "settled") || null,
    [decoratedTransactions]
  );
  const ledgerAttentionCount = useMemo(
    () =>
      decoratedTransactions.filter(({ state }) =>
        state === "pending" || state === "failed" || state === "refunded" || state === "disputed"
      ).length,
    [decoratedTransactions]
  );
  const ledgerProofCount = useMemo(
    () =>
      decoratedTransactions.filter(({ receiptRef, processingRef }) =>
        Boolean(receiptRef && receiptRef !== "Sem ID público") || Boolean(processingRef && processingRef !== "Sem ID público")
      ).length,
    [decoratedTransactions]
  );
  const latestTransactionLabel = latestTransaction
    ? `${txReasonLabel(latestTransaction)} • ${formatDateTime(latestTransaction.created_at)}`
    : "Sem movimentações recentes";
  const currentFinancialState = latestPackageEvent?.state || (latestTransaction ? resolveFinancialState(latestTransaction, latestPackageStatus) : "unknown");
  const currentFinancialStateLabel = financialStateLabel(currentFinancialState);
  const financialConfidenceTitle = txError
    ? "Ledger indisponível"
    : checkoutNotice?.tone === "success"
      ? "Compra conciliada"
      : checkoutNotice?.tone === "warning"
        ? "Reconciliação em atenção"
        : currentFinancialState === "pending"
          ? "Pagamento em processamento"
          : currentFinancialState === "failed"
            ? "Falha financeira registrada"
            : currentFinancialState === "refunded"
              ? "Pagamento devolvido"
              : currentFinancialState === "disputed"
                ? "Pagamento em disputa"
          : txLoading || loading
            ? "Revalidando saldo"
            : latestTransaction
            ? `Ledger ${currentFinancialStateLabel.toLowerCase()}`
            : "Ledger aguardando primeiro evento";
  const financialConfidenceDescription = txError
    ? "O histórico financeiro não respondeu com segurança suficiente para leitura confiável."
    : checkoutNotice?.message
      ? checkoutNotice.message
      : latestPackageEvent
        ? `${latestPackageEvent.stateSummary} Recibo, processamento e suporte podem ser lidos nesta trilha.`
      : latestTransaction
        ? `Último evento confirmado em ${formatDateTime(latestTransaction.created_at)} com trilha de saldo e histórico disponíveis nesta conta.`
        : `Ainda não há compra, conversão ou consumo registrado para ${CREATOR_COINS_PUBLIC_NAME}.`;
  const financialConfidenceKind =
    checkoutNotice?.tone === "success"
      ? "reconciliation"
      : checkoutNotice?.tone === "warning"
        ? "retry"
        : txError
          ? "error"
          : txLoading || loading
            ? "loading"
            : latestTransaction
              ? financialStateOperationalKind(currentFinancialState)
              : "empty";

  function updateConversionAmount(nextValue: number) {
    setConversionAmount(Math.max(1, Math.trunc(nextValue)));
  }

  const planLabelDisplay = loading ? "Plano em sincronização" : planLabel ?? "—";
  const walletSummaryDisplay = loading ? "Saldo em sincronização" : walletSummary;
  const totalWalletDisplay = loading ? "..." : totalWalletAmount.toLocaleString("pt-BR");
  const conversionFeeDisplay = loading ? "..." : conversionEnabled ? `${conversionFeePercent}%` : "—";
  const conversionFeeHelper = loading
    ? "Regras de conversão do plano em sincronização."
    : conversionEnabled
      ? conversionFeePercent === 0
        ? "Seu plano converte com taxa zero entre tipos."
        : "Aplicada na origem durante a conversão entre tipos."
      : "Seu plano atual não habilita conversão.";

  const latestTransactionCountDisplay = loading ? "..." : transactions.length.toLocaleString("pt-BR");
  const latestTransactionDisplay = loading ? "Histórico em sincronização." : latestTransactionLabel;

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    setTxError(null);
    try {
      const payload = await api.getCoinsTransactions(30);
      const items = Array.isArray(payload?.transactions) ? payload.transactions : [];
      setTransactions(items as CoinTransaction[]);
      return items as CoinTransaction[];
    } catch (e: any) {
      setTransactions([]);
      setTxError(e?.message || `Falha ao carregar histórico de ${CREATOR_COINS_PUBLIC_NAME}.`);
      return null;
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessReady) {
      loadTransactions();
    }
  }, [accessReady, loadTransactions]);

  useEffect(() => {
    if (destinationOptions.length === 0) return;
    if (!destinationOptions.includes(conversionTo)) {
      setConversionTo(destinationOptions[0]);
    }
  }, [conversionTo, destinationOptions]);

  useEffect(() => {
    if (loading || betaBlocked || typeof window === "undefined") return;
    const currentUrl = new URL(window.location.href);
    const checkoutState = String(currentUrl.searchParams.get("coins_package") || "").toLowerCase();
    const checkoutQuoteId = String(currentUrl.searchParams.get("quote_id") || "").trim();
    if (checkoutState !== "success" && checkoutState !== "cancel") return;
    const checkoutHandleKey = `${checkoutState}:${checkoutQuoteId || "none"}`;
    if (handledCheckoutState === checkoutHandleKey) return;

    setHandledCheckoutState(checkoutHandleKey);

    if (checkoutState === "cancel") {
      setCheckoutNotice({
        tone: "warning",
        message: "Checkout cancelado. Nenhuma compra foi concluída e você pode tentar novamente quando quiser.",
      });
      clearCoinsCheckoutContext(checkoutQuoteId);
      clearCheckoutSearchParams(["coins_package", "quote_id"]);
      return;
    }

    let cancelled = false;
    const checkoutContext = readCoinsCheckoutContext(checkoutQuoteId);
    const baselineLatestTransactionId = String(checkoutContext?.latestTransactionId || "");
    const baselineWallet = checkoutContext?.walletBefore || null;

      setCheckoutNotice({
        tone: "info",
        message: checkoutQuoteId
          ? "Pagamento confirmado na Stripe. Validando o pacote comprado, o saldo e o histórico diretamente nesta conta..."
          : `Pagamento confirmado na Stripe. Validando saldo e histórico de ${CREATOR_COINS_PUBLIC_NAME} nesta página...`,
      });
      setLatestPackageStatus(null);

    (async () => {
      let checkoutStatus: CoinsPackageStatusResponse | null = null;
      let grantConfirmed = false;
      let transactionChanged = false;
      let walletConfirmed = false;
      let syncFailed = false;
      let statusError: any = null;

      for (const delayMs of [0, 1200, 2400, 4200, 6400]) {
        if (cancelled) return;
        if (delayMs > 0) {
          await waitForCheckoutSync(delayMs);
        }

        try {
          checkoutStatus = checkoutQuoteId ? ((await api.getCoinsPackageStatus(checkoutQuoteId)) as CoinsPackageStatusResponse) : null;
          setLatestPackageStatus(checkoutStatus);
          statusError = null;
        } catch (statusLoadError: any) {
          statusError = statusLoadError;
          checkoutStatus = null;
        }

        const expectedBreakdown = normalizeWalletSnapshot(
          checkoutStatus?.quote?.breakdown || checkoutContext?.expectedBreakdown || null
        );
        const statusWallet = normalizeWalletSnapshot(checkoutStatus?.wallet || null);
        const hasStatusWallet = Boolean(checkoutStatus?.wallet);
        const walletAlreadyUpdated =
          hasStatusWallet &&
          (
            walletReflectsGrantedPackage(statusWallet, baselineWallet, expectedBreakdown) ||
            walletChanged(statusWallet, baselineWallet)
          );

        if (checkoutQuoteId && !checkoutStatus?.quote?.used_at && !walletAlreadyUpdated) {
          continue;
        }

        grantConfirmed = !checkoutQuoteId || Boolean(checkoutStatus?.quote?.used_at) || walletAlreadyUpdated;

        try {
          await refresh();
          const items = await loadTransactions();
          if (!Array.isArray(items)) {
            syncFailed = true;
            continue;
          }

          const nextLatestTransactionId = String(items[0]?.id || "");
          transactionChanged = Boolean(
            nextLatestTransactionId &&
            (!baselineLatestTransactionId || nextLatestTransactionId !== baselineLatestTransactionId)
          );
          const nextWallet = statusWallet;
          walletConfirmed =
            walletReflectsGrantedPackage(nextWallet, baselineWallet, expectedBreakdown) ||
            walletChanged(nextWallet, baselineWallet) ||
            (!baselineWallet && grantConfirmed);
          if (grantConfirmed && (walletConfirmed || transactionChanged || !checkoutQuoteId)) {
            break;
          }
        } catch (syncError: any) {
          syncFailed = true;
          statusError = syncError;
        }
      }

      if (cancelled) return;

      if (grantConfirmed && (walletConfirmed || transactionChanged || !checkoutQuoteId)) {
        setCheckoutNotice({
          tone: "success",
          message: "Pagamento confirmado. O pacote foi conciliado com a conta e saldo/histórico já foram revalidados nesta tela.",
        });
        clearCoinsCheckoutContext(checkoutQuoteId);
      } else if (grantConfirmed) {
        setCheckoutNotice({
          tone: "warning",
          message: "Pagamento confirmado e grant concluído, mas a tela ainda não conseguiu refletir o novo estado com segurança. Atualize novamente em instantes.",
        });
      } else if (syncFailed || statusError) {
        setCheckoutNotice({
          tone: "warning",
          message: toUserFacingError(
            statusError?.message,
            "Pagamento confirmado na Stripe, mas não foi possível validar o pacote, o saldo e o histórico agora. Atualize novamente em alguns instantes."
          ),
        });
      } else {
        setCheckoutNotice({
          tone: "warning",
          message: "O retorno da Stripe foi recebido, mas o pacote ainda não terminou de ser conciliado nesta conta. Aguarde alguns instantes e atualize saldo e histórico novamente.",
        });
      }

      clearCheckoutSearchParams(["coins_package", "quote_id"]);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, betaBlocked, refresh, loadTransactions, handledCheckoutState]);

  async function onConvertCredits() {
    setConversionError(null);
    setConversionResult(null);

    if (!conversionEnabled) {
      setConversionError(`Seu plano atual não permite conversão de ${CREATOR_COINS_PUBLIC_NAME}.`);
      return;
    }
    if (conversionFrom === conversionTo) {
      setConversionError("Origem e destino não podem ser iguais.");
      return;
    }
    if (!isPairSupported) {
      setConversionError("Este par de conversão não está disponível.");
      return;
    }

    setConversionLoading(true);
    try {
      const payload = (await api.convertCoins({
        from: conversionFrom,
        to: conversionTo,
        amount: conversionAmountSafe,
        idempotency_key: `conv:${Date.now()}:${conversionFrom}:${conversionTo}:${conversionAmountSafe}`,
      })) as ConversionResponse;

      setConversionResult(payload);
      await refresh();
      await loadTransactions();
    } catch (convertError: any) {
      const message = String(convertError?.message || "");
      if (message.includes("insufficient_balance")) {
        setConversionError("Saldo insuficiente para converter esse volume.");
      } else if (message.includes("subscription_inactive")) {
        setConversionError("Assinatura inativa. Ative um plano para usar conversão.");
      } else if (message.includes("plan_not_allowed_for_conversion")) {
        setConversionError(`Seu plano atual ainda não permite conversão de ${CREATOR_COINS_PUBLIC_NAME}.`);
      } else if (message.includes("coins_convert_with_fee_unavailable")) {
        setConversionError("Conversão indisponível no momento. Tente novamente em instantes.");
      } else if (message.includes("unsupported_conversion_pair")) {
        setConversionError("Par de conversão não suportado.");
      } else {
        setConversionError(toUserFacingError(message, "Não foi possível concluir a conversão agora."));
      }
    } finally {
      setConversionLoading(false);
    }
  }

  if (betaBlocked) {
    return (
      <BetaAccessBlockedView
        email={email}
        status={betaAccess?.status}
        onLogout={onLogout}
      />
    );
  }

  return (
    <div className="page-shell credits-page">
      <div className="credits-page-canvas">
        <section className="credits-hero credits-page-hero-region">
          <div className="credits-hero-intro">
            <div className="hero-copy">
              <div className="hero-title-stack">
              <p className="section-kicker">Transparência de consumo</p>
              <h1 className="heading-reset">{CREATOR_COINS_PUBLIC_NAME}</h1>
              <p className="section-header-copy hero-copy-compact">
                  {CREATOR_COINS_PUBLIC_NAME} reúne saldo, compra, conversão e histórico.
              </p>
              </div>
              <div className="hero-meta-row hero-meta-row-compact credits-hero-meta">
                <span className="premium-badge premium-badge-phase">Plano: {planLabelDisplay}</span>
                <span className="premium-badge premium-badge-warning">Histórico confirma o consumo real</span>
                <button
                  onClick={async () => {
                    await refresh();
                    await loadTransactions();
                  }}
                  className="btn-link-ea btn-ghost btn-sm credits-hero-refresh"
                >
                  Atualizar leitura
                </button>
              </div>
            </div>
            <div className="credits-hero-signals" aria-label={`Pontos-chave da operação de ${CREATOR_COINS_PUBLIC_NAME}`}>
                <div className="credits-hero-signal">
                  <strong>Saldo por tipo</strong>
                  <span>Comum, Pro e Ultra visíveis sem painéis extras.</span>
                </div>
                <div className="credits-hero-signal">
                  <strong>Conversão e histórico</strong>
                  <span>Taxa, débito e movimento final na mesma trilha.</span>
                </div>
              </div>
          </div>
          <div className="credits-hero-glance" aria-label="Resumo rápido de saldo, taxa e histórico">
            <div className="credits-hero-glance-item">
              <span className="credits-hero-glance-label">Saldo total</span>
              <strong className="credits-hero-glance-value">{totalWalletDisplay}</strong>
              <span className="helper-text-ea">{walletSummaryDisplay}</span>
            </div>
            <div className="credits-hero-glance-item">
              <span className="credits-hero-glance-label">Taxa no plano atual</span>
              <strong className="credits-hero-glance-value">{conversionFeeDisplay}</strong>
              <span className="helper-text-ea">{conversionFeeHelper}</span>
            </div>
            <div className="credits-hero-glance-item">
              <span className="credits-hero-glance-label">Última movimentação</span>
              <strong className="credits-hero-glance-value">{latestTransactionCountDisplay}</strong>
              <span className="helper-text-ea">{latestTransactionDisplay}</span>
            </div>
          </div>
        </section>

        <div className="credits-page-layout">
          <section className="credits-main-region" aria-label={`Operação principal de ${CREATOR_COINS_PUBLIC_NAME}`}>
            <section className="credits-main-section credits-summary-region">
              <div className="section-head credits-region-head">
                <div className="section-header-ea credits-region-heading">
                  <h3 className="heading-reset">Saldo, compra e conversão na mesma trilha</h3>
                  <p className="helper-text-ea">O essencial para alterar saldo e confirmar consumo.</p>
                </div>
              </div>
              <div className="credits-summary-grid">
                <div className="credits-summary-card credits-summary-card-primary">
                  <p className="executive-eyebrow">Saldo de {CREATOR_COINS_PUBLIC_NAME}</p>
                  <p className="executive-value metric-value-compact">{walletSummaryDisplay}</p>
                  <div className="credits-balance-list">
                    {CREDIT_GUIDE.map((item) => (
                      <div key={item.coinType} className="credits-balance-row">
                        <span>{item.title} • {item.description}</span>
                        <strong>{loading ? "…" : Number(wallet?.[item.coinType] ?? 0)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="credits-summary-card credits-summary-card-action">
                  <p className="executive-eyebrow">Conversão de {CREATOR_COINS_PUBLIC_NAME}</p>
                  <p className="executive-value">{conversionFeeDisplay}</p>
                  <p className="executive-detail">
                    {loading
                      ? "Sincronizando regras de conversão e saldo."
                      : conversionEnabled
                        ? conversionFeePercent === 0
                          ? "Taxa zero na conversão entre tipos."
                          : "A taxa é aplicada na origem."
                        : `Seu plano atual não habilita conversão entre tipos de ${CREATOR_COINS_PUBLIC_NAME}.`}
                  </p>
                </div>
                <div className="credits-summary-card">
                  <p className="executive-eyebrow">Última movimentação</p>
                  <p className="executive-value metric-value-compact">{latestTransactionCountDisplay}</p>
                  <p className="executive-detail">{latestTransactionDisplay}</p>
                </div>
              </div>
            </section>

            <section className="credits-main-section credits-operations-region">
              <div className="section-head credits-region-head">
                <div className="section-header-ea">
                  <h3 className="heading-reset">Comprar, converter e confirmar na mesma operação</h3>
                  <p className="helper-text-ea">Compra, conversão e confirmação final do ledger na mesma região.</p>
                </div>
                <div className="hero-actions-row">
                  <Link href="#credits-history" className="btn-link-ea btn-ghost btn-sm">
                    Ver ledger
                  </Link>
                </div>
              </div>
              <div className="credits-operations-grid">
                <div id="credits-packages" className="credits-operation-panel credits-operation-panel-purchase">
                  <CreditsPackagesCard wallet={wallet} loading={loading} latestTransactionId={latestTransaction?.id || null} />
                </div>

                <section className="credits-operation-panel credits-conversion-region">
                  <div className="section-head credits-region-head">
                    <div className="section-header-ea">
                      <h3 className="heading-reset">Conversão de {CREATOR_COINS_PUBLIC_NAME}</h3>
                      <p className="helper-text-ea">Veja débito, taxa e saldo estimado antes de confirmar.</p>
                    </div>
                  </div>

                  {loading ? (
                    <OperationalState
                      kind="loading"
                      title={`Carregando saldo, regras e histórico de ${CREATOR_COINS_PUBLIC_NAME}`}
                      description="A conversão fica disponível assim que plano, carteira e histórico forem sincronizados."
                      meta={[
                        { label: "Saldo", value: "Sincronizando" },
                        { label: "Conversão", value: "Regras do plano" },
                        { label: "Histórico", value: "Conciliando" },
                      ]}
                      compact
                    />
                  ) : !conversionEnabled ? (
                    <OperationalState
                      kind="retry"
                      title="Conversão indisponível neste plano"
                      description={`Para converter ${CREATOR_COINS_PUBLIC_NAME} entre níveis, ative um plano com conversão habilitada.`}
                      meta={[
                        { label: "Estado", value: "Conversão bloqueada" },
                        { label: "Próximo passo", value: "Ativar plano compatível" },
                      ]}
                      actions={
                        <Link href="/plans" className="btn-link-ea btn-secondary btn-sm">
                          Ver planos com conversão
                        </Link>
                      }
                      compact
                    />
                  ) : (
                    <>
                      <div className="trust-grid credits-conversion-notes">
                        <div className="trust-note">
                          <strong>Origem e destino claros</strong>
                          <span>Escolha uma combinação válida entre Comum, Pro e Ultra.</span>
                        </div>
                        <div className="trust-note">
                          <strong>Débito previsível</strong>
                          <span>Taxa, total debitado e saldo estimado aparecem antes da confirmação.</span>
                        </div>
                      </div>

                      <div className="form-grid-2 credits-conversion-form">
                        <label className="field-label-ea">
                          <span>Origem</span>
                          <PremiumSelect
                            value={conversionFrom}
                            onChange={(next) => setConversionFrom(next as CoinType)}
                            options={fromOptions}
                            ariaLabel="Origem da conversão"
                          />
                        </label>

                        <label className="field-label-ea">
                          <span>Destino</span>
                          <PremiumSelect
                            value={conversionTo}
                            onChange={(next) => setConversionTo(next as CoinType)}
                            options={toOptions}
                            ariaLabel="Destino da conversão"
                          />
                        </label>

                        <label className="field-label-ea credits-conversion-amount-field">
                          <span>Quantidade a converter</span>
                          <div className="ea-amount-control">
                            <button
                              type="button"
                              className="ea-amount-button"
                              onClick={() => updateConversionAmount(conversionAmountSafe - 1)}
                              aria-label="Diminuir quantidade a converter"
                            >
                              -
                            </button>
                            <div className="ea-amount-input-wrap">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={conversionAmountSafe}
                                onChange={(e) => updateConversionAmount(Number(e.target.value || 0))}
                                className="ea-amount-input"
                                aria-label="Quantidade a converter"
                              />
                              <span className="ea-amount-suffix">{coinTypeLabel(conversionFrom)}</span>
                            </div>
                            <button
                              type="button"
                              className="ea-amount-button"
                              onClick={() => updateConversionAmount(conversionAmountSafe + 1)}
                              aria-label="Aumentar quantidade a converter"
                            >
                              +
                            </button>
                          </div>
                        </label>
                      </div>

                      <div className="helper-text-ea">
                        A taxa é aplicada na origem. O histórico confirma o resultado final.
                      </div>
                      <div className="conversion-metrics-grid credits-conversion-metrics">
                        <div className="conversion-metric-card">
                          <span className="helper-text-ea">Saldo disponível em {coinTypeLabel(conversionFrom)}</span>
                          <strong>{sourceBalance}</strong>
                        </div>
                        <div className="conversion-metric-card">
                          <span className="helper-text-ea">Total debitado ({coinTypeLabel(conversionFrom)})</span>
                          <strong>{estimatedDebitedAmount}</strong>
                        </div>
                        <div className="conversion-metric-card">
                          <span className="helper-text-ea">Crédito recebido ({coinTypeLabel(conversionTo)})</span>
                          <strong>{estimatedTargetAmount}</strong>
                        </div>
                        <div className="conversion-metric-card">
                          <span className="helper-text-ea">Taxa aplicada</span>
                          <strong>{estimatedFeeAmount}</strong>
                        </div>
                        <div className="conversion-metric-card">
                          <span className="helper-text-ea">Saldo final estimado ({coinTypeLabel(conversionTo)})</span>
                          <strong>{Number(wallet?.[conversionTo] ?? 0) + estimatedTargetAmount}</strong>
                        </div>
                      </div>
                      <div className="helper-text-ea">
                        Esta é uma estimativa. O saldo final é confirmado depois da conversão.
                      </div>

                      <div className="credits-conversion-actions">
                        <button
                          onClick={onConvertCredits}
                          disabled={conversionLoading || insufficientForEstimate || !isPairSupported}
                          className="btn-ea btn-primary btn-sm"
                        >
                          {conversionLoading ? "Convertendo..." : `Converter ${CREATOR_COINS_PUBLIC_NAME}`}
                        </button>
                        {!isPairSupported ? (
                          <div className="inline-alert inline-alert-warning">
                            Este par de conversão de {CREATOR_COINS_PUBLIC_NAME} não está disponível no momento.
                          </div>
                        ) : null}
                        {insufficientForEstimate ? (
                          <div className="inline-alert inline-alert-error">
                            Saldo insuficiente para converter esse volume.
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}

                  {conversionError ? (
                    <OperationalState
                      kind="error"
                      title="Não foi possível concluir a conversão"
                      description={conversionError}
                      meta={[
                        { label: "Origem", value: coinTypeLabel(conversionFrom) },
                        { label: "Destino", value: coinTypeLabel(conversionTo) },
                        { label: "Quantidade", value: conversionAmountSafe },
                      ]}
                      compact
                    />
                  ) : null}

                  {conversionResult?.ok ? (
                    <OperationalState
                      kind="success"
                      title="Conversão concluída com sucesso"
                      description={`${coinTypeLabel(conversionResult.conversion?.from || conversionFrom)}: -${conversionResult.conversion?.debited_amount ?? estimatedDebitedAmount} • ${coinTypeLabel(conversionResult.conversion?.to || conversionTo)}: +${conversionResult.conversion?.converted_amount ?? estimatedTargetAmount}`}
                      meta={[
                        { label: "Taxa", value: conversionResult.conversion?.fee_amount ?? estimatedFeeAmount },
                        {
                          label: "Plano",
                          value: conversionResult.conversion?.plan || planLabel || "Plano atual",
                        },
                      ]}
                      footer="O histórico recente confirma a conversão processada e o novo saldo conciliado."
                      compact
                    />
                  ) : null}
                </section>
              </div>
            </section>

            <section id="credits-history" className="credits-main-section credits-history-region">
              <div className="section-head credits-region-head">
                <div className="section-header-ea">
                  <h3 className="heading-reset">Ledger recente de {CREATOR_COINS_PUBLIC_NAME}</h3>
                  <p className="helper-text-ea">Fonte de verdade para consumo, compra, reconciliação e conversão.</p>
                </div>
                <div className="hero-actions-row">
                  <button onClick={loadTransactions} disabled={txLoading} className="btn-ea btn-ghost btn-sm">
                    {txLoading ? "Atualizando..." : "Atualizar histórico"}
                  </button>
                </div>
              </div>
              {!txLoading && !txError ? (
                <div className="credits-ledger-summary">
                  <div className="credits-ledger-summary-item">
                    <span>Último evento conciliado</span>
                    <strong>
                      {latestReconciledEvent
                        ? `${txReasonLabel(latestReconciledEvent.tx)} • ${formatDateTime(latestReconciledEvent.tx.created_at)}`
                        : "Sem conciliação recente"}
                    </strong>
                  </div>
                  <div className="credits-ledger-summary-item">
                    <span>Eventos em atenção</span>
                    <strong>
                      {ledgerAttentionCount > 0
                        ? `${ledgerAttentionCount} item(ns) exigem leitura`
                        : "Sem pendência financeira aberta"}
                    </strong>
                  </div>
                  <div className="credits-ledger-summary-item">
                    <span>Provas rastreáveis</span>
                    <strong>{ledgerProofCount > 0 ? `${ledgerProofCount} item(ns) com recibo ou ID` : "Sem recibo público ainda"}</strong>
                  </div>
                </div>
              ) : null}
              <div>
                {txError ? (
                  <OperationalState
                    kind="error"
                    title="Histórico indisponível no momento"
                    description={toUserFacingError(txError, "Tente atualizar o histórico novamente.")}
                    meta={[
                      { label: "Ledger", value: "Sem resposta" },
                      { label: "Ação", value: "Nova tentativa necessária" },
                    ]}
                    actions={
                      <button onClick={loadTransactions} disabled={txLoading} className="btn-ea btn-secondary btn-sm">
                        Tentar novamente
                      </button>
                    }
                  />
                ) : null}

                {txLoading ? (
                  <div className="state-ea-spaced" style={{ display: "grid", gap: 8 }}>
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={`credit-history-skeleton-${index}`} className="premium-skeleton premium-skeleton-card" />
                    ))}
                  </div>
                ) : transactions.length === 0 ? (
                  <OperationalState
                    kind="empty"
                    title={`Sem movimentações recentes de ${CREATOR_COINS_PUBLIC_NAME}`}
                    description={`Gere conteúdo em Creators ou compre ${CREATOR_COINS_PUBLIC_NAME} para inaugurar o histórico.`}
                    meta={[
                      { label: "Ledger", value: "Ainda sem eventos" },
                      { label: "Próximo marco", value: "Consumo, compra ou conversão" },
                    ]}
                    actions={
                      <>
                        <Link href="/creators" className="btn-link-ea btn-primary btn-sm">
                          Ir para Creators
                        </Link>
                        <Link href="#credits-packages" className="btn-link-ea btn-ghost btn-sm">
                          Ver pacotes
                        </Link>
                      </>
                    }
                  />
                ) : (
                  <div className="credits-history-list">
                    {decoratedTransactions.map(({ tx, state, stateLabel, stateSummary, supportRef, receiptRef, processingRef, receiptAmount }) => {
                      const amount = Number(tx.amount || 0);
                      const positive = amount > 0;
                      const amountLabel = `${positive ? "+" : ""}${amount} ${coinTypeLabel(tx.coin_type)}`;
                      const movementLabel = positive ? "Crédito" : "Débito";
                      const proofItems = [
                        { label: "Estado", value: stateLabel },
                        { label: "Recibo", value: receiptRef || "Sem recibo público" },
                        { label: "Processamento", value: processingRef || "Sem ID público" },
                        { label: "Suporte", value: supportRef || tx.id },
                        receiptAmount ? { label: "Valor", value: receiptAmount } : null,
                      ].filter(Boolean) as Array<{ label: string; value: string }>;
                      return (
                        <div
                          key={tx.id}
                          className="credits-history-item"
                        >
                          <div className="credits-history-head">
                            <div className="credits-history-main">
                              <strong>{txReasonLabel(tx)}</strong>
                              <span className="credits-history-meta">
                                {formatDateTime(tx.created_at)} • Origem: {txSourceLabel(tx)}{tx.ref_id ? ` • Ref: ${tx.ref_id}` : ""}
                              </span>
                              <span className="credits-history-meta">{stateSummary}</span>
                            </div>
                            <div className="credits-history-side">
                              <div className="credits-history-badge-row">
                                <span className={`premium-badge ${positive ? "premium-badge-phase" : "premium-badge-warning"}`}>{movementLabel}</span>
                                <span className="credits-financial-state" data-state={state}>{stateLabel}</span>
                              </div>
                              <span className={`credits-history-amount ${positive ? "credits-history-amount-positive" : "credits-history-amount-negative"}`}>{amountLabel}</span>
                            </div>
                          </div>
                          <div className="credits-history-proof-grid">
                            {proofItems.map((item) => (
                              <div key={`${tx.id}-${item.label}`} className="credits-history-proof-chip">
                                <span>{item.label}</span>
                                <strong>{item.value}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </section>

        <aside className="credits-support-rail" aria-label={`Apoio contextual de ${CREATOR_COINS_PUBLIC_NAME}`}>
          <OperationalState
            kind={financialConfidenceKind}
            title={financialConfidenceTitle}
            description={financialConfidenceDescription}
            meta={[
              {
                label: "Processamento",
                value: currentFinancialStateLabel,
                tone:
                  currentFinancialState === "failed"
                    ? "danger"
                    : currentFinancialState === "pending" || currentFinancialState === "disputed"
                      ? "warning"
                      : "success",
              },
              {
                label: "Recibo",
                value: latestPackageEvent ? latestPackageEvent.receiptRef : "Sem compra recente",
              },
              {
                label: "Suporte",
                value: latestPackageEvent ? latestPackageEvent.supportRef : "Aguardando primeiro evento",
              },
              {
                label: "Última reconciliação",
                value: latestReconciledEvent ? formatDateTime(latestReconciledEvent.tx.created_at) : "Aguardando primeiro evento",
              },
            ]}
            actions={
              <>
                <button
                  onClick={async () => {
                    await refresh();
                    await loadTransactions();
                  }}
                  disabled={loading || txLoading}
                  className="btn-ea btn-secondary btn-sm"
                >
                  {loading || txLoading ? "Atualizando..." : "Revalidar saldo e histórico"}
                </button>
                <Link href="#credits-history" className="btn-link-ea btn-ghost btn-sm">
                  Ver ledger
                </Link>
              </>
            }
            footer={
              latestPackageEvent
                ? `Processamento: ${latestPackageEvent.processingRef} • Ledger: ${latestPackageEvent.stateLabel}`
                : "Sem compra confirmada recentemente."
            }
            className="credits-support-state"
            compact
          />

          <section className="credits-support-section credits-context-section credits-support-overview">
            <div className="section-header-ea">
              <h3 className="heading-reset">Recibo e conciliação</h3>
              <p className="helper-text-ea">Recibo, processamento, extrato e referência de suporte na mesma leitura.</p>
            </div>
            <div className="credits-context-list">
              <div className="credits-context-item">
                <strong>Fonte de verdade</strong>
                <span>O ledger recente é a leitura final para compra, conversão, reembolso e disputa.</span>
              </div>
              <div className="credits-context-item">
                <strong>Recibo rastreável</strong>
                <span>{latestPackageEvent ? `Recibo ${latestPackageEvent.receiptRef} com processamento ${latestPackageEvent.processingRef}.` : "A próxima compra exibirá recibo, processamento e referência de suporte."}</span>
              </div>
              <div className="credits-context-item">
                <strong>Reconciliação visível</strong>
                <span>{latestPackageEvent ? `${latestPackageEvent.stateLabel}: ${latestPackageEvent.stateSummary}` : "Stripe confirma o pagamento; o ledger fecha a leitura final nesta conta."}</span>
              </div>
            </div>
            <div className="credits-guide-grid">
              {CREDIT_GUIDE.map((item) => (
                <div key={item.coinType} className="credits-guide-card">
                  <div className="dashboard-project-link-title">{item.title}</div>
                  <div className="helper-text-ea">{item.description}</div>
                </div>
              ))}
            </div>
            <div className="credits-guide-notes">
              <div className="credits-guide-note">
                <strong>Extrato recente:</strong> cada item preserva estado, recibo, processamento e referência útil para suporte.
              </div>
              <div className="credits-guide-note">
                <strong>Estimativa e confirmação:</strong> creators estimam antes; o ledger confirma compra, conversão, saldo e qualquer exceção financeira.
              </div>
            </div>
          </section>

          {error ? (
            <OperationalState
              kind="error"
              title={`Não foi possível carregar saldo, histórico e regras de ${CREATOR_COINS_PUBLIC_NAME}`}
              description={toUserFacingError(error, "Atualize os dados e tente novamente.")}
              meta={[
                { label: "Saldo", value: "Indisponível" },
                { label: "Histórico", value: "Indisponível" },
                { label: "Impacto", value: "Sem leitura confiável do financeiro" },
              ]}
              actions={
                <button
                  onClick={async () => {
                    await refresh();
                    await loadTransactions();
                  }}
                  className="btn-ea btn-secondary btn-sm"
                >
                  Atualizar agora
                </button>
              }
              className="credits-support-state"
              compact
            />
          ) : null}
        </aside>
      </div>

      </div>
    </div>
  );
}
