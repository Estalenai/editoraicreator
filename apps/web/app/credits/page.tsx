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

function normalizePlanForConversion(planCodeRaw: string | null | undefined): string {
  const canonical = normalizePlanCode(planCodeRaw);
  if (canonical === "EDITOR_FREE") return "INICIANTE";
  if (canonical === "EDITOR_PRO") return "EDITOR_PRO";
  if (canonical === "EDITOR_ULTRA") return "CREATOR_PRO";
  if (canonical === "EMPRESARIAL" || canonical === "ENTERPRISE") return canonical;
  if (canonical === "FREE") return "FREE";
  return canonical;
}

function getConversionFeePercentByPlan(planCodeRaw: string | null | undefined): number | null {
  const normalized = normalizePlanForConversion(planCodeRaw);
  if (normalized === "FREE") return null;
  if (normalized === "INICIANTE") return 8;
  if (normalized === "EDITOR_PRO") return 4;
  if (normalized === "CREATOR_PRO") return 2;
  if (normalized === "EMPRESARIAL" || normalized === "ENTERPRISE") return 0;
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
  const planLabelDisplay = loading ? "Sincronizando plano" : planLabel ?? "—";
  const walletSummaryDisplay = loading ? "Saldo em atualização" : walletSummary;
  const totalWalletDisplay = loading ? "..." : totalWalletAmount.toLocaleString("pt-BR");
  const conversionFeeDisplay = loading ? "..." : conversionEnabled ? `${conversionFeePercent}%` : "—";
  const conversionFeeHelper = loading
    ? "Regras do plano em sincronização."
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
    } catch (e: any) {
      setTransactions([]);
      setTxError(e?.message || "Falha ao carregar histórico de créditos.");
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
      <section className="premium-hero credits-hero">
        <div className="hero-split">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Transparência de consumo</p>
              <h1 className="heading-reset">Créditos</h1>
              <p className="section-header-copy hero-copy-compact">
                Saldo, conversão e histórico organizados para decidir compra ou uso em segundos.
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
                <strong>Saldo por tipo</strong>
                <span>Comum, Pro e Ultra seguem separados para facilitar uso, compra e conversão.</span>
              </div>
              <div className="hero-side-note">
                <strong>Checkout e histórico previsíveis</strong>
                <span>Compras, débitos e conversões aparecem primeiro na operação e depois no histórico real.</span>
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

      <section className="premium-card credits-guide-section">
        <div className="section-header-ea">
          <h3 className="heading-reset">Como ler seus créditos</h3>
          <p className="helper-text-ea">Saldo, estimativa e histórico em três sinais.</p>
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
            <strong>Estimativa nos Creators:</strong> prévia antes de gastar saldo.
          </div>
          <div className="premium-card-soft credits-guide-note">
            <strong>Histórico de créditos:</strong> consumo e compra confirmados após processamento.
          </div>
        </div>
      </section>

      <section className="credits-summary-grid">
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
              ? "Sincronizando regras de conversão do seu plano."
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

      <section className="premium-card credits-section-card">
        <div className="section-head">
          <div className="section-header-ea">
            <h3 className="heading-reset">Conversão de créditos</h3>
            <p className="helper-text-ea">Veja débito, taxa e saldo estimado antes de confirmar.</p>
          </div>
          <span className={`premium-badge ${conversionEnabled ? "premium-badge-phase" : "premium-badge-warning"}`}>
            {conversionEnabled ? `Taxa atual: ${conversionFeePercent}%` : "Indisponível no plano atual"}
          </span>
        </div>

        {loading ? (
          <div className="state-ea state-ea-spaced">
            <p className="state-ea-title">Carregando saldo e regras do plano</p>
            <div className="state-ea-text">
              A conversão fica disponível assim que plano, carteira e histórico forem sincronizados.
            </div>
          </div>
        ) : !conversionEnabled ? (
          <div className="state-ea state-ea-warning state-ea-spaced">
            <p className="state-ea-title">Conversão bloqueada para este plano</p>
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

              <label className="field-label-ea">
                <span>Quantidade a converter</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={conversionAmountSafe}
                  onChange={(e) => setConversionAmount(Math.max(1, Math.trunc(Number(e.target.value || 0))))}
                  className="field-ea"
                />
              </label>
            </div>

            <div className="helper-text-ea">
              Pares válidos entre Comum, Pro e Ultra. A taxa é aplicada na origem e o histórico confirma o movimento final.
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
              Estimativa prévia. O saldo final é confirmado após a conversão.
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
                  Par indisponível para conversão no momento.
                </div>
              ) : null}
              {insufficientForEstimate ? (
                <div className="inline-alert inline-alert-error">
                  Saldo insuficiente para esta conversão.
                </div>
              ) : null}
            </div>
          </>
        )}

        {conversionError ? (
          <div className="state-ea state-ea-error state-ea-spaced">
            <p className="state-ea-title">Falha na conversão</p>
            <div className="state-ea-text">{conversionError}</div>
          </div>
        ) : null}

        {conversionResult?.ok ? (
          <div className="state-ea state-ea-success state-ea-spaced">
            <p className="state-ea-title">Conversão concluída</p>
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
          <p className="state-ea-title">Não foi possível carregar os dados de créditos</p>
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

      <section id="credits-packages">
        <CreditsPackagesCard wallet={wallet} loading={loading} />
      </section>

      <section id="credits-history" className="premium-card credits-section-card">
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
              Gere conteúdo em Creators para registrar consumo, ou compre créditos avulsos para aparecer no histórico.
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
