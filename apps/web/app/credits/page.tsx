"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { CreditsPackagesCard } from "../../components/dashboard/CreditsPackagesCard";
import { PremiumSelect } from "../../components/ui/PremiumSelect";
import { api } from "../../lib/api";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
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
  created_at?: string | null;
};

type CoinType = "common" | "pro" | "ultra";
type NoticeTone = "info" | "warning" | "success";
const ALL_COIN_TYPES: CoinType[] = ["common", "pro", "ultra"];

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
  return "Movimentação de créditos";
}

function waitForCheckoutSync(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export default function CreditsPage() {
  const {
    loading,
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

  const walletSummary = useMemo(
    () => `${wallet?.common ?? 0} Comum • ${wallet?.pro ?? 0} Pro • ${wallet?.ultra ?? 0} Ultra`,
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
  const latestTransactionLabel = latestTransaction
    ? `${txReasonLabel(latestTransaction)} • ${formatDateTime(latestTransaction.created_at)}`
    : "Sem movimentações recentes";

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
      setTxError(e?.message || "Falha ao carregar histórico de créditos.");
      return null;
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !betaBlocked) {
      loadTransactions();
    }
  }, [loading, betaBlocked, loadTransactions]);

  useEffect(() => {
    if (destinationOptions.length === 0) return;
    if (!destinationOptions.includes(conversionTo)) {
      setConversionTo(destinationOptions[0]);
    }
  }, [conversionTo, destinationOptions]);

  useEffect(() => {
    if (loading || betaBlocked || typeof window === "undefined") return;
    const checkoutState = String(new URLSearchParams(window.location.search).get("coins_package") || "").toLowerCase();
    if (checkoutState !== "success" && checkoutState !== "cancel") return;
    if (handledCheckoutState === checkoutState) return;

    setHandledCheckoutState(checkoutState);

    if (checkoutState === "cancel") {
      setCheckoutNotice({
        tone: "warning",
        message: "Checkout cancelado. Nenhuma compra foi concluída e você pode tentar novamente quando quiser.",
      });
      clearCheckoutSearchParams(["coins_package"]);
      return;
    }

    let cancelled = false;
    const baselineLatestTransactionId = String(transactions[0]?.id || "");

    setCheckoutNotice({
      tone: "info",
      message: "Pagamento confirmado na Stripe. Validando saldo e histórico de créditos nesta página...",
    });

    (async () => {
      let transactionChanged = false;
      let syncFailed = false;

      for (const delayMs of [0, 1200, 2400]) {
        if (cancelled) return;
        if (delayMs > 0) {
          await waitForCheckoutSync(delayMs);
        }

        await refresh();
        const items = await loadTransactions();
        if (!Array.isArray(items)) {
          syncFailed = true;
          continue;
        }

        const nextLatestTransactionId = String(items[0]?.id || "");
        if (!baselineLatestTransactionId || (nextLatestTransactionId && nextLatestTransactionId !== baselineLatestTransactionId)) {
          transactionChanged = true;
          break;
        }
      }

      if (cancelled) return;

      if (transactionChanged) {
        setCheckoutNotice({
          tone: "success",
          message: "Pagamento confirmado. Saldo e histórico já foram atualizados nesta tela.",
        });
      } else if (syncFailed) {
        setCheckoutNotice({
          tone: "warning",
          message: "Pagamento confirmado na Stripe, mas não foi possível revalidar saldo e histórico agora. Atualize novamente em alguns instantes.",
        });
      } else {
        setCheckoutNotice({
          tone: "info",
          message: "Pagamento confirmado. O retorno da Stripe foi recebido. Se o novo saldo ainda não apareceu, atualize saldo e histórico em instantes.",
        });
      }

      clearCheckoutSearchParams(["coins_package"]);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, betaBlocked, refresh, loadTransactions, handledCheckoutState, transactions]);

  async function onConvertCredits() {
    setConversionError(null);
    setConversionResult(null);

    if (!conversionEnabled) {
      setConversionError("Seu plano atual não permite conversão de créditos.");
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
        setConversionError("Seu plano atual ainda não permite conversão de créditos.");
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
      <section className="premium-hero credits-hero surface-flow-hero">
        <div className="hero-split">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Transparência de consumo</p>
              <h1 className="heading-reset">Créditos</h1>
              <p className="section-header-copy hero-copy-compact">
                Créditos é a camada operacional do beta pago/controlado: saldo, compra avulsa, conversão e histórico ficam claros sem competir com o núcleo criativo do produto.
              </p>
            </div>
            <div className="hero-meta-row hero-meta-row-compact">
              <span className="premium-badge premium-badge-phase">Plano: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-warning">Histórico confirma o consumo real</span>
            </div>
            <div className="signal-strip credits-hero-signal-strip">
              <div className="signal-chip signal-chip-sober">
                <strong>Saldo por tipo</strong>
                <span>Comum, Pro e Ultra permanecem visíveis no mesmo painel.</span>
              </div>
              <div className="signal-chip signal-chip-sober">
                <strong>Conversão previsível</strong>
                <span>Débito, taxa e destino aparecem antes da confirmação.</span>
              </div>
              <div className="signal-chip signal-chip-sober">
                <strong>Histórico auditável</strong>
                <span>Compras, conversões e consumo entram no registro final.</span>
              </div>
            </div>
          </div>
          <div className="premium-card-soft hero-side-panel credits-hero-panel">
            <span className="plan-card-section-label">Segurança e controle</span>
            <div className="hero-side-list hero-side-list-compact">
              <div className="hero-side-note">
                <strong>Apoio ao núcleo do produto</strong>
                <span>Use esta área para sustentar creators, editor e projetos com leitura rápida de saldo e consumo.</span>
              </div>
              <div className="hero-side-note">
                <strong>Checkout via Stripe</strong>
                <span>Compras avulsas seguem por Stripe e retornam a Créditos com confirmação operacional do saldo e do histórico.</span>
              </div>
              <div className="hero-side-note hero-side-note-trust">
                <strong>Histórico persistido</strong>
                <span>Saldo, movimentos e continuidade da conta ficam persistidos para auditoria operacional e retomada segura.</span>
              </div>
            </div>
            <div className="hero-actions-row">
              <button
                onClick={async () => {
                  await refresh();
                  await loadTransactions();
                }}
                className="btn-ea btn-secondary"
              >
                Atualizar saldos e histórico
              </button>
            </div>
          </div>
        </div>
        <div className="hero-kpi-grid hero-kpi-grid-compact">
          <div className="premium-card-soft hero-kpi">
            <span className="hero-kpi-label">Saldo total</span>
            <strong className="hero-kpi-value">{totalWalletDisplay}</strong>
            <span className="helper-text-ea">{walletSummaryDisplay}</span>
          </div>
          <div className="premium-card-soft hero-kpi">
            <span className="hero-kpi-label">Taxa no plano atual</span>
            <strong className="hero-kpi-value">{conversionFeeDisplay}</strong>
            <span className="helper-text-ea">{conversionFeeHelper}</span>
          </div>
          <div className="premium-card-soft hero-kpi">
            <span className="hero-kpi-label">Última movimentação</span>
            <strong className="hero-kpi-value">{latestTransactionCountDisplay}</strong>
            <span className="helper-text-ea">{latestTransactionDisplay}</span>
          </div>
        </div>
      </section>

      {checkoutNotice ? (
        <div className={`state-ea state-ea-spaced ${checkoutNotice.tone === "success" ? "state-ea-success" : checkoutNotice.tone === "warning" ? "state-ea-warning" : ""}`}>
          <p className="state-ea-title">
            {checkoutNotice.tone === "success"
              ? "Compra confirmada na Stripe"
              : checkoutNotice.tone === "warning"
                ? "Atenção no retorno do checkout"
                : "Sincronizando retorno do checkout"}
          </p>
          <div className="state-ea-text">{checkoutNotice.message}</div>
          <div className="state-ea-actions">
            <button
              onClick={async () => {
                await refresh();
                await loadTransactions();
              }}
              disabled={loading || txLoading}
              className="btn-ea btn-secondary btn-sm"
            >
              {loading || txLoading ? "Atualizando..." : "Atualizar saldo e histórico"}
            </button>
            <Link href="#credits-history" className="btn-link-ea btn-ghost btn-sm">
              Ver histórico
            </Link>
          </div>
        </div>
      ) : null}

      <section className="premium-card credits-guide-section surface-flow-region surface-flow-region-start">
        <div className="section-header-ea">
          <h3 className="heading-reset">Como ler seus créditos</h3>
          <p className="helper-text-ea">Saldo, estimativa e histórico em três sinais fáceis de ler.</p>
        </div>
        <div className="credits-guide-grid">
          {CREDIT_GUIDE.map((item) => (
            <div key={item.coinType} className="premium-card-soft credits-guide-card">
              <div className="dashboard-project-link-title">{item.title}</div>
              <div className="helper-text-ea">{item.description}</div>
            </div>
          ))}
        </div>
        <div className="credits-guide-notes">
          <div className="premium-card-soft credits-guide-note">
            <strong>Estimativa nos Creators:</strong> mostra uma prévia antes de consumir saldo real.
          </div>
          <div className="premium-card-soft credits-guide-note">
            <strong>Histórico de créditos:</strong> confirma consumo, compra e conversão depois do processamento.
          </div>
        </div>
      </section>

      <section className="credits-summary-grid surface-flow-summary surface-flow-region surface-flow-region-middle">
        <div className="premium-card credits-summary-card credits-summary-card-primary">
          <p className="executive-eyebrow">Saldo por tipo</p>
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
        <div className="premium-card credits-summary-card credits-summary-card-action">
          <p className="executive-eyebrow">Conversão no plano atual</p>
          <p className="executive-value">{conversionFeeDisplay}</p>
          <p className="executive-detail">
            {loading
              ? "Sincronizando regras de conversão do seu plano e saldo disponível."
              : conversionEnabled
                ? conversionFeePercent === 0
                  ? "Taxa zero na conversão entre tipos: todo o crédito líquido permanece com você."
                  : "A taxa é aplicada sobre a origem. Planos maiores preservam mais crédito líquido."
                : "Seu plano atual ainda não habilita conversão entre tipos de crédito."}
          </p>
        </div>
        <div className="premium-card credits-summary-card">
          <p className="executive-eyebrow">Última movimentação</p>
          <p className="executive-value metric-value-compact">{latestTransactionCountDisplay}</p>
          <p className="executive-detail">{latestTransactionDisplay}</p>
        </div>
        <div className="premium-card credits-summary-card">
          <p className="executive-eyebrow">Estimativa x consumo real</p>
          <p className="executive-value metric-value-compact">Clareza total</p>
          <p className="executive-detail">
            Creators estimam antes da geração; o histórico confirma o movimento final.
          </p>
        </div>
      </section>

      <section id="credits-packages" className="credits-packages-section surface-flow-region surface-flow-region-middle">
        <CreditsPackagesCard wallet={wallet} loading={loading} />
      </section>

      <section className="premium-card credits-section-card surface-flow-region surface-flow-region-middle">
        <div className="section-head">
          <div className="section-header-ea">
            <h3 className="heading-reset">Conversão de créditos</h3>
            <p className="helper-text-ea">Veja débito, taxa, crédito recebido e saldo estimado antes de confirmar.</p>
          </div>
          <span className={`premium-badge ${conversionEnabled ? "premium-badge-phase" : "premium-badge-warning"}`}>
            {conversionEnabled ? `Taxa atual: ${conversionFeePercent}%` : "Indisponível no plano atual"}
          </span>
        </div>

        {loading ? (
          <div className="state-ea state-ea-spaced">
            <p className="state-ea-title">Carregando saldo, regras de conversão e histórico</p>
            <div className="state-ea-text">
              A conversão fica disponível assim que plano, carteira e histórico forem sincronizados.
            </div>
          </div>
        ) : !conversionEnabled ? (
          <div className="state-ea state-ea-warning state-ea-spaced">
            <p className="state-ea-title">Conversão indisponível neste plano</p>
            <div className="state-ea-text">
              Para converter créditos entre níveis, ative um plano com conversão habilitada.
            </div>
            <div className="state-ea-actions">
              <Link href="/plans" className="btn-link-ea btn-secondary btn-sm">
                Ver planos com conversão
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="trust-grid credits-conversion-notes">
              <div className="premium-card-soft trust-note">
                <strong>Origem e destino claros</strong>
                <span>Escolha qualquer combinação válida entre Comum, Pro e Ultra, exceto origem = destino.</span>
              </div>
              <div className="premium-card-soft trust-note">
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
              Escolha pares válidos entre Comum, Pro e Ultra. A taxa é aplicada na origem e o histórico confirma o resultado final.
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
              Esta é uma estimativa prévia. O saldo final é confirmado depois da conversão.
            </div>

            <div className="credits-conversion-actions">
              <button
                onClick={onConvertCredits}
                disabled={conversionLoading || insufficientForEstimate || !isPairSupported}
                className="btn-ea btn-primary btn-sm"
              >
                {conversionLoading ? "Convertendo..." : "Converter créditos"}
              </button>
              {!isPairSupported ? (
                <div className="inline-alert inline-alert-warning">
                  Este par de conversão não está disponível no momento.
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
          <div className="state-ea state-ea-error state-ea-spaced">
            <p className="state-ea-title">Não foi possível concluir a conversão</p>
            <div className="state-ea-text">{conversionError}</div>
          </div>
        ) : null}

        {conversionResult?.ok ? (
          <div className="state-ea state-ea-success state-ea-spaced">
            <p className="state-ea-title">Conversão concluída com sucesso</p>
            <div className="state-ea-text">
              {coinTypeLabel(conversionResult.conversion?.from || conversionFrom)}: -{conversionResult.conversion?.debited_amount ?? estimatedDebitedAmount} •{" "}
              {coinTypeLabel(conversionResult.conversion?.to || conversionTo)}: +{conversionResult.conversion?.converted_amount ?? estimatedTargetAmount}
            </div>
          </div>
        ) : null}
      </section>

      {loading ? (
        <div className="premium-card section-card">
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "36%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "72%" }} />
          <div className="premium-skeleton premium-skeleton-card" />
        </div>
      ) : null}

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível carregar saldo, histórico e regras de crédito</p>
          <div className="state-ea-text">{toUserFacingError(error, "Atualize os dados e tente novamente.")}</div>
          <div className="state-ea-actions">
            <button
              onClick={async () => {
                await refresh();
                await loadTransactions();
              }}
              className="btn-ea btn-secondary btn-sm"
            >
              Atualizar agora
            </button>
          </div>
        </div>
      ) : null}

      <section id="credits-history" className="premium-card credits-section-card surface-flow-region surface-flow-region-end">
        <div className="section-head">
          <div className="section-header-ea">
            <h3 className="heading-reset">Histórico recente de créditos</h3>
            <p className="helper-text-ea">Fonte de verdade para consumo real, compras aprovadas e conversões processadas.</p>
          </div>
          <button onClick={loadTransactions} disabled={txLoading} className="btn-ea btn-ghost btn-sm">
            {txLoading ? "Atualizando..." : "Atualizar histórico"}
          </button>
        </div>

        {txError ? (
          <div className="state-ea state-ea-error state-ea-spaced">
            <p className="state-ea-title">Histórico indisponível no momento</p>
            <div className="state-ea-text">{toUserFacingError(txError, "Tente atualizar o histórico novamente.")}</div>
            <div className="state-ea-actions">
              <button onClick={loadTransactions} disabled={txLoading} className="btn-ea btn-secondary btn-sm">
                Tentar novamente
              </button>
            </div>
          </div>
        ) : null}

        {txLoading ? (
          <div className="state-ea-spaced" style={{ display: "grid", gap: 8 }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`credit-history-skeleton-${index}`} className="premium-skeleton premium-skeleton-card" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="state-ea state-ea-spaced">
            <p className="state-ea-title">Sem movimentações recentes de créditos</p>
            <div className="state-ea-text">
              Gere conteúdo em Creators para registrar consumo ou compre créditos avulsos para inaugurar o histórico.
            </div>
            <div className="state-ea-actions">
              <Link href="/creators" className="btn-link-ea btn-primary btn-sm">
                Ir para Creators
              </Link>
              <Link href="#credits-packages" className="btn-link-ea btn-ghost btn-sm">
                Ver pacotes
              </Link>
            </div>
          </div>
        ) : (
          <div className="credits-history-list">
            {transactions.map((tx) => {
              const amount = Number(tx.amount || 0);
              const positive = amount > 0;
              const amountLabel = `${positive ? "+" : ""}${amount} ${coinTypeLabel(tx.coin_type)}`;
              const movementLabel = positive ? "Crédito" : "Débito";
              return (
                <div
                  key={tx.id}
                  className="premium-card-soft credits-history-item"
                >
                  <div className="credits-history-head">
                    <div className="credits-history-main">
                      <strong>{txReasonLabel(tx)}</strong>
                      <span className="credits-history-meta">
                        {formatDateTime(tx.created_at)} • {tx.ref_kind ? `Origem: ${tx.ref_kind}` : "Origem não informada"}
                      </span>
                    </div>
                    <div className="credits-history-side">
                      <span className={`premium-badge ${positive ? "premium-badge-phase" : "premium-badge-warning"}`}>{movementLabel}</span>
                      <span className={`credits-history-amount ${positive ? "credits-history-amount-positive" : "credits-history-amount-negative"}`}>{amountLabel}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
