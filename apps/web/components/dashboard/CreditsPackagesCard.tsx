"use client";

import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
import { toUserFacingError } from "../../lib/uiFeedback";

type PackageBreakdown = {
  common: number;
  pro: number;
  ultra: number;
};

type PackageCoinKey = keyof PackageBreakdown;
type CoinsPackageMode = "packages" | "custom";
type MixPreset = "equal" | "common" | "pro" | "ultra" | "manual";

type CoinsPackageQuote = {
  quote_id: string;
  package_total: number;
  breakdown: PackageBreakdown;
  line_items: Array<{
    coin_type: "common" | "pro" | "ultra";
    quantity: number;
    unit_price_cents: number;
    subtotal_cents: number;
  }>;
  subtotal_brl: number;
  fee_percent: number;
  fee_brl: number;
  total_brl: number;
  currency: string;
};

const PACKAGE_OPTIONS = [300, 1200, 3000] as const;
const PACKAGE_MIN_TOTAL = 100;
const PACKAGE_STEP = 10;
const PACKAGE_COIN_ORDER: PackageCoinKey[] = ["common", "pro", "ultra"];

const PACKAGE_COIN_INFO: Record<PackageCoinKey, { title: string; description: string; accent: string }> = {
  common: {
    title: "Comum",
    description: "Tarefas básicas e econômicas para volume do dia a dia.",
    accent: "#6be28e",
  },
  pro: {
    title: "Pro",
    description: "Qualidade mais alta para conteúdos estratégicos e avançados.",
    accent: "#55c3ff",
  },
  ultra: {
    title: "Ultra",
    description: "Recursos premium para cenários mais pesados e complexos.",
    accent: "#f8b44b",
  },
};

const PACKAGE_OPTION_COPY: Record<number, { title: string; note: string }> = {
  300: { title: "Pacote inicial", note: "Ideal para testar fluxos e ajustar seu mix." },
  1200: { title: "Pacote produtividade", note: "Bom equilíbrio para rotina semanal intensa." },
  3000: { title: "Pacote escala", note: "Melhor para equipes e produção em volume." },
};

function toStepValue(value: number, step = PACKAGE_STEP): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value / step) * step);
}

function formatBrl(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0;
  return normalized.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function clampCustomTotal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function normalizeCustomDigits(rawValue: string): string {
  const digitsOnly = String(rawValue || "").replace(/\D+/g, "");
  if (!digitsOnly) return "";
  return digitsOnly.replace(/^0+(?=\d)/, "");
}

function normalizeCustomTotalForCommit(value: number): number {
  if (!Number.isFinite(value)) return PACKAGE_MIN_TOTAL;
  let normalized = Math.max(PACKAGE_MIN_TOTAL, Math.trunc(value));
  if (normalized % PACKAGE_STEP !== 0) {
    normalized = Math.max(PACKAGE_MIN_TOTAL, Math.floor(normalized / PACKAGE_STEP) * PACKAGE_STEP);
  }
  return normalized;
}

function defaultMixForPackage(total: number): PackageBreakdown {
  const safeTotal = Math.max(PACKAGE_STEP, toStepValue(total, PACKAGE_STEP));
  const units = safeTotal / PACKAGE_STEP;
  const baseUnits = Math.floor(units / 3);
  const remainderUnits = units - baseUnits * 3;
  return {
    common: (baseUnits + remainderUnits) * PACKAGE_STEP,
    pro: baseUnits * PACKAGE_STEP,
    ultra: baseUnits * PACKAGE_STEP,
  };
}

function buildMixPreset(total: number, preset: "equal" | "common" | "pro" | "ultra"): PackageBreakdown {
  const safeTotal = Math.max(PACKAGE_STEP, toStepValue(total, PACKAGE_STEP));
  if (preset === "common") return { common: safeTotal, pro: 0, ultra: 0 };
  if (preset === "pro") return { common: 0, pro: safeTotal, ultra: 0 };
  if (preset === "ultra") return { common: 0, pro: 0, ultra: safeTotal };
  return defaultMixForPackage(safeTotal);
}

function normalizeMixInput(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

type Props = {
  wallet: any | null;
  loading?: boolean;
};

export function CreditsPackagesCard({ wallet, loading = false }: Props) {
  const [coinsPanelOpen, setCoinsPanelOpen] = useState(false);
  const [coinsPackageMode, setCoinsPackageMode] = useState<CoinsPackageMode>("packages");
  const [selectedPackage, setSelectedPackage] = useState<number>(300);
  const [customPackageTotal, setCustomPackageTotal] = useState<number>(300);
  const [customPackageTotalInput, setCustomPackageTotalInput] = useState<string>("300");
  const [packageBreakdown, setPackageBreakdown] = useState<PackageBreakdown>(() => defaultMixForPackage(300));
  const [packageQuote, setPackageQuote] = useState<CoinsPackageQuote | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageCheckoutLoading, setPackageCheckoutLoading] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [mixPreset, setMixPreset] = useState<MixPreset>("equal");

  const activePackageTotal = coinsPackageMode === "custom" ? customPackageTotal : selectedPackage;
  const customTotalInputNumeric = Number(customPackageTotalInput);
  const customTotalInputValid =
    customPackageTotalInput !== "" &&
    Number.isInteger(customTotalInputNumeric) &&
    customTotalInputNumeric >= PACKAGE_MIN_TOTAL &&
    customTotalInputNumeric % PACKAGE_STEP === 0;
  const packageSum =
    Number(packageBreakdown.common || 0) +
    Number(packageBreakdown.pro || 0) +
    Number(packageBreakdown.ultra || 0);
  const packageRemaining = activePackageTotal - packageSum;
  const packageTotalValid =
    coinsPackageMode === "custom"
      ? customTotalInputValid
      : Number.isInteger(activePackageTotal) &&
        activePackageTotal >= PACKAGE_MIN_TOTAL &&
        activePackageTotal % PACKAGE_STEP === 0;
  const packageBreakdownStepValid = [packageBreakdown.common, packageBreakdown.pro, packageBreakdown.ultra].every(
    (value) => Number.isInteger(value) && value >= 0 && value % PACKAGE_STEP === 0
  );
  const hasPackageAmount = [packageBreakdown.common, packageBreakdown.pro, packageBreakdown.ultra].some((value) => value > 0);
  const packageMixValid = packageTotalValid && packageBreakdownStepValid && hasPackageAmount && packageSum === activePackageTotal;
  const packageExceededBy = packageRemaining < 0 ? Math.abs(packageRemaining) : 0;
  const mixPercentByType = PACKAGE_COIN_ORDER.reduce<Record<PackageCoinKey, number>>(
    (acc, coinType) => {
      acc[coinType] = packageSum > 0 ? Math.round((packageBreakdown[coinType] / packageSum) * 100) : 0;
      return acc;
    },
    { common: 0, pro: 0, ultra: 0 }
  );
  const quoteSubtotal = Number(packageQuote?.subtotal_brl || 0);
  const quoteFee = Number(packageQuote?.fee_brl || 0);
  const quoteTotal = Number(packageQuote?.total_brl || 0);
  const quoteFeePercent = Number(packageQuote?.fee_percent || 0);
  const hasFee = quoteFee > 0 && quoteFeePercent > 0;

  const walletSummary = useMemo(
    () => (loading ? "Saldo em atualização" : `${wallet?.common ?? 0} Comum • ${wallet?.pro ?? 0} Pro • ${wallet?.ultra ?? 0} Ultra`),
    [wallet, loading]
  );
  const walletUpdatedAt = useMemo(() => (loading ? "—" : formatDateTime(wallet?.updated_at)), [wallet, loading]);

  function updatePackageBreakdown(field: keyof PackageBreakdown, rawValue: string) {
    const normalizedValue = normalizeMixInput(rawValue);
    setPackageBreakdown((prev) => ({ ...prev, [field]: normalizedValue }));
    setMixPreset("manual");
    setPackageQuote(null);
    setPackageError(null);
  }

  function resetPackageToDefault(total: number) {
    setSelectedPackage(total);
    setPackageBreakdown(defaultMixForPackage(total));
    setMixPreset("equal");
    setPackageQuote(null);
    setPackageError(null);
  }

  function updateCustomTotal(rawValue: string) {
    const normalizedInput = normalizeCustomDigits(rawValue);
    if (!normalizedInput) {
      setCustomPackageTotalInput("");
      setCustomPackageTotal(PACKAGE_MIN_TOTAL);
      if (coinsPackageMode === "custom" && mixPreset === "equal") {
        setPackageBreakdown(defaultMixForPackage(PACKAGE_MIN_TOTAL));
      }
      setPackageQuote(null);
      setPackageError(null);
      return;
    }
    const parsed = clampCustomTotal(Number(normalizedInput));
    const effective = Math.max(PACKAGE_MIN_TOTAL, parsed);
    setCustomPackageTotalInput(normalizedInput);
    setCustomPackageTotal(effective);
    if (coinsPackageMode === "custom" && mixPreset === "equal") {
      setPackageBreakdown(defaultMixForPackage(effective));
    }
    setPackageQuote(null);
    setPackageError(null);
  }

  function commitCustomTotal(rawValue = customPackageTotalInput): number {
    const normalizedInput = normalizeCustomDigits(rawValue);
    const committed = normalizeCustomTotalForCommit(
      normalizedInput ? Number(normalizedInput) : PACKAGE_MIN_TOTAL
    );
    setCustomPackageTotal(committed);
    setCustomPackageTotalInput(String(committed));
    if (coinsPackageMode === "custom" && mixPreset === "equal") {
      setPackageBreakdown(defaultMixForPackage(committed));
    }
    setPackageQuote(null);
    setPackageError(null);
    return committed;
  }

  function applyPackageMixPreset(preset: "equal" | "common" | "pro" | "ultra") {
    const activeTotal = coinsPackageMode === "custom" ? normalizeCustomTotalForCommit(customPackageTotal) : selectedPackage;
    if (coinsPackageMode === "custom") {
      setCustomPackageTotal(activeTotal);
      setCustomPackageTotalInput(String(activeTotal));
    }
    setPackageBreakdown(buildMixPreset(activeTotal, preset));
    setMixPreset(preset);
    setPackageQuote(null);
    setPackageError(null);
  }

  function switchCoinsPackageMode(mode: CoinsPackageMode) {
    if (mode === coinsPackageMode) return;

    if (mode === "custom") {
      const committed = normalizeCustomTotalForCommit(customPackageTotal);
      setCustomPackageTotal(committed);
      setCustomPackageTotalInput(String(committed));
      setPackageBreakdown(defaultMixForPackage(committed));
      setMixPreset("equal");
    }

    setCoinsPackageMode(mode);
    setPackageQuote(null);
    setPackageError(null);
  }

  async function requestCoinsPackageQuote() {
    setPackageLoading(true);
    setPackageError(null);
    try {
      const activeTotal = coinsPackageMode === "custom" ? commitCustomTotal() : selectedPackage;
      const payload = await api.quoteCoinsPackage({
        package_total: activeTotal,
        breakdown: packageBreakdown,
      });
      const quote = payload?.quote as CoinsPackageQuote | undefined;
      if (!quote?.quote_id) {
        throw new Error("quote_invalid_response");
      }
      setPackageQuote(quote);
      return quote;
    } catch (e: any) {
      const message = toUserFacingError(e?.message, "Falha ao gerar cotação de créditos avulsos.");
      setPackageError(message);
      throw e;
    } finally {
      setPackageLoading(false);
    }
  }

  async function onBuyCoinsPackage() {
    setPackageCheckoutLoading(true);
    setPackageError(null);
    try {
      const activeTotal = coinsPackageMode === "custom" ? commitCustomTotal() : selectedPackage;
      const quote =
        packageQuote && packageQuote.package_total === activeTotal
          ? packageQuote
          : await requestCoinsPackageQuote();

      const baseUrl = window.location.origin;
      const response = await api.createCoinsPackageCheckout({
        quote_id: quote.quote_id,
        success_url: `${baseUrl}/dashboard?coins_package=success`,
        cancel_url: `${baseUrl}/dashboard?coins_package=cancel`,
      });
      const checkoutUrl = String(response?.checkout?.url || "");
      if (!checkoutUrl) throw new Error("checkout_url_missing");
      window.location.href = checkoutUrl;
    } catch (e: any) {
      const message = toUserFacingError(e?.message, "Falha ao criar checkout de créditos avulsos.");
      setPackageError(message);
    } finally {
      setPackageCheckoutLoading(false);
    }
  }

  return (
    <div className="premium-card credits-purchase-card">
      <div className="hero-title-stack credits-purchase-intro">
        <p className="section-kicker">Compra avulsa</p>
        <h3 className="heading-reset">Créditos avulsos</h3>
        <div className="meta-text-ea">Saldo atual: {walletSummary}</div>
      </div>
      {walletUpdatedAt !== "—" ? (
        <div className="helper-text-ea">
          Última atualização do saldo: {walletUpdatedAt}
        </div>
      ) : null}
      <p className="section-header-copy">
        {loading
          ? "Saldo e regras de compra estão sendo sincronizados antes da cotação."
          : "Escolha um pacote ou defina o total livre com mix por tipo."}
      </p>
      <div className="trust-grid credits-purchase-notes">
        <div className="premium-card-soft trust-note">
          <strong>Cotação clara</strong>
          <span>Subtotal, taxa e total aparecem antes de sair para o pagamento.</span>
        </div>
        <div className="premium-card-soft trust-note trust-note-privacy">
          <strong>Pagamento via Stripe</strong>
          <span>O checkout abre em Stripe e retorna ao produto para confirmar saldo e histórico do pacote.</span>
        </div>
        <div className="premium-card-soft trust-note">
          <strong>Mix configurável</strong>
          <span>Distribua o total entre Comum, Pro e Ultra antes de abrir a Stripe.</span>
        </div>
      </div>
      <div className="helper-note-inline credits-purchase-checkout-note">
        {loading
          ? "Aguarde a sincronização do saldo para abrir uma cotação segura."
          : "Pagamento externo via Stripe com retorno ao dashboard para confirmação."}
      </div>
      <a href="/credits#credits-history" className="btn-link-ea btn-ghost btn-sm state-ea-spaced">
        Ver histórico de consumo
      </a>
      <div className="credits-coin-grid">
        {PACKAGE_COIN_ORDER.map((coinType) => (
          <div
            key={coinType}
            className={`premium-card-soft credits-coin-card credits-coin-card-${coinType}`}
          >
            <strong>{PACKAGE_COIN_INFO[coinType].title}</strong>
            <div className="helper-text-ea">{PACKAGE_COIN_INFO[coinType].description}</div>
          </div>
        ))}
      </div>
      <button onClick={() => setCoinsPanelOpen(true)} disabled={loading} className="btn-ea btn-primary credits-purchase-cta">
        {loading ? "Carregando saldo..." : "Comprar créditos avulsos"}
      </button>

      {coinsPanelOpen ? (
        <div className="credits-modal-backdrop" onClick={() => setCoinsPanelOpen(false)}>
          <div className="premium-card credits-modal" role="dialog" aria-modal="true" aria-labelledby="credits-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="section-head credits-modal-head">
              <div className="hero-title-stack section-stack-tight">
                <p className="section-kicker">Compra segura</p>
                <h3 className="heading-reset" id="credits-modal-title">Créditos avulsos</h3>
              </div>
              <button onClick={() => setCoinsPanelOpen(false)} className="btn-ea btn-ghost btn-sm">
                Fechar
              </button>
            </div>
            <p className="section-header-copy">
              Confirme subtotal, taxa e total antes de abrir o checkout seguro da Stripe.
            </p>
            <div className="trust-grid credits-modal-notes">
              <div className="premium-card-soft trust-note">
                <strong>Pacotes ou total livre</strong>
                <span>Escolha uma base rápida ou personalize o total dentro das regras do produto.</span>
              </div>
              <div className="premium-card-soft trust-note">
                <strong>Resumo financeiro claro</strong>
                <span>A cotação mostra subtotal, taxa e total final antes do pagamento externo.</span>
              </div>
              <div className="premium-card-soft trust-note trust-note-privacy">
                <strong>Retorno sincronizado</strong>
                <span>Depois do Stripe, o produto confirma saldo e histórico no dashboard antes da próxima ação.</span>
              </div>
            </div>

            <div className="purchase-modal-section">
              <div className="surface-toolbar">
                {(["packages", "custom"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => switchCoinsPackageMode(mode)}
                    className={`btn-ea ${coinsPackageMode === mode ? "btn-primary" : "btn-ghost"} btn-sm`}
                  >
                    {mode === "packages" ? "Pacotes" : "Personalizado"}
                  </button>
                ))}
              </div>
            </div>

            {coinsPackageMode === "packages" ? (
              <div className="purchase-modal-section">
                <div className="meta-text-ea">Escolha um pacote</div>
                <div className="credits-package-grid">
                {PACKAGE_OPTIONS.map((total) => (
                  <button
                    key={total}
                    onClick={() => resetPackageToDefault(total)}
                    className={`btn-ea ${selectedPackage === total ? "btn-primary" : "btn-ghost"} btn-sm purchase-option-card`}
                  >
                      <div className="purchase-option-title">{total} créditos</div>
                      <div className="helper-text-ea purchase-option-copy">
                        {PACKAGE_OPTION_COPY[total].title} · {PACKAGE_OPTION_COPY[total].note}
                      </div>
                  </button>
                ))}
                </div>
              </div>
            ) : (
              <div className="purchase-modal-section">
                <div className="meta-text-ea">
                  Digite a quantidade total que deseja comprar e personalize livremente o mix entre Comum, Pro e Ultra.
                </div>
                <label className="field-label-ea">
                  <span>
                    Total personalizado (mínimo {PACKAGE_MIN_TOTAL}, múltiplos de {PACKAGE_STEP})
                  </span>
                  <input
                    type="number"
                    min={PACKAGE_MIN_TOTAL}
                    step={PACKAGE_STEP}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={customPackageTotalInput}
                    onChange={(event) => updateCustomTotal(event.target.value)}
                    onBlur={(event) => commitCustomTotal(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      commitCustomTotal((event.currentTarget as HTMLInputElement).value);
                    }}
                    className="field-ea"
                  />
                </label>
                <div className="helper-text-ea">
                  Use mínimo de {PACKAGE_MIN_TOTAL} créditos e valores em múltiplos de {PACKAGE_STEP}.
                </div>
              </div>
            )}

            <div className="purchase-modal-section">
              <div className="meta-text-ea">Mix (passos de {PACKAGE_STEP})</div>
              <div className="surface-toolbar">
                <button
                  onClick={() => applyPackageMixPreset("equal")}
                  className={`btn-ea ${mixPreset === "equal" ? "btn-primary" : "btn-ghost"} btn-sm`}
                >
                  Dividir igualmente
                </button>
                <button
                  onClick={() => applyPackageMixPreset("common")}
                  className={`btn-ea ${mixPreset === "common" ? "btn-primary" : "btn-ghost"} btn-sm`}
                >
                  Tudo Comum
                </button>
                <button
                  onClick={() => applyPackageMixPreset("pro")}
                  className={`btn-ea ${mixPreset === "pro" ? "btn-primary" : "btn-ghost"} btn-sm`}
                >
                  Tudo Pro
                </button>
                <button
                  onClick={() => applyPackageMixPreset("ultra")}
                  className={`btn-ea ${mixPreset === "ultra" ? "btn-primary" : "btn-ghost"} btn-sm`}
                >
                  Tudo Ultra
                </button>
              </div>

              <div className="credits-mix-grid">
                {PACKAGE_COIN_ORDER.map((coinType) => (
                  <label key={coinType} className="field-label-ea">
                    <span>{coinTypeLabel(coinType)}</span>
                    <input
                      type="number"
                      min={0}
                      step={PACKAGE_STEP}
                      value={packageBreakdown[coinType]}
                      onChange={(event) => updatePackageBreakdown(coinType, event.target.value)}
                      className="field-ea"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="creator-context-zone purchase-summary-card">
              <div className="purchase-summary-row">
                <span>Total selecionado</span>
                <strong>{activePackageTotal} créditos</strong>
              </div>
              <div className="purchase-summary-row">
                <span>Soma atual do mix</span>
                <strong>{packageSum} créditos</strong>
              </div>
              {packageMixValid ? (
                <div className="inline-alert inline-alert-success">Mix fechado corretamente. Pronto para cotação.</div>
              ) : null}
              {packageRemaining > 0 ? (
                <div className="inline-alert inline-alert-warning">
                  Faltam {packageRemaining} créditos para completar o total.
                </div>
              ) : null}
              {packageRemaining < 0 ? (
                <div className="inline-alert inline-alert-error">
                  O mix excedeu em {packageExceededBy} créditos.
                </div>
              ) : null}
              {!packageBreakdownStepValid ? (
                <div className="inline-alert inline-alert-error">
                  Mix inválido. Cada tipo deve usar múltiplos de {PACKAGE_STEP}.
                </div>
              ) : null}
              <div className="metric-chip-row">
                {PACKAGE_COIN_ORDER.map((coinType) => (
                  <span
                    key={`ratio-${coinType}`}
                    className={`metric-chip metric-chip-${coinType}`}
                  >
                    {coinTypeLabel(coinType)}: {mixPercentByType[coinType]}%
                  </span>
                ))}
              </div>
              {!packageTotalValid ? (
                <div className="inline-alert inline-alert-error">
                  Total inválido. Use mínimo de {PACKAGE_MIN_TOTAL} e múltiplos de {PACKAGE_STEP}.
                </div>
              ) : null}
            </div>

            {packageError ? (
              <div className="state-ea state-ea-error state-ea-spaced">
                <p className="state-ea-title">Falha no fluxo de compra</p>
                <div className="state-ea-text">{packageError}</div>
              </div>
            ) : null}

            {(packageLoading || packageCheckoutLoading || packageQuote) ? (
              <div className="helper-note-inline credits-modal-live-note">
                {packageCheckoutLoading
                  ? "Abrindo checkout seguro..."
                  : packageLoading
                    ? "Atualizando cotação..."
                    : "Cotação pronta. Revise o resumo antes de seguir para o pagamento."}
              </div>
            ) : null}

            <div className="hero-actions-row credits-modal-actions">
              <button
                onClick={requestCoinsPackageQuote}
                disabled={packageLoading || packageCheckoutLoading || !packageMixValid}
                className="btn-ea btn-secondary"
              >
                {packageLoading ? "Atualizando cotação..." : "Atualizar cotação"}
              </button>
              <button
                onClick={onBuyCoinsPackage}
                disabled={packageLoading || packageCheckoutLoading || !packageMixValid}
                className="btn-ea btn-primary"
              >
                {packageCheckoutLoading ? "Abrindo checkout..." : "Ir para pagamento seguro"}
              </button>
            </div>

            <div className="helper-text-ea">
              Depois do pagamento, você volta ao dashboard com confirmação do checkout.
            </div>

            {packageQuote ? (
              <div className="premium-card-soft quote-summary-card">
                <strong>Cotação pronta</strong>
                <div className="quote-breakdown-grid state-ea-spaced">
                  <div className="quote-row">
                    <span className="quote-row-label">Subtotal</span>
                    <strong>{formatBrl(quoteSubtotal)}</strong>
                  </div>
                  <div className="quote-row">
                    <span className="quote-row-label">
                      Taxa de compra {hasFee ? `(${quoteFeePercent}%)` : ""}
                    </span>
                    <strong className={hasFee ? "" : "quote-row-success"}>
                      {hasFee ? formatBrl(quoteFee) : "Grátis no seu plano"}
                    </strong>
                  </div>
                  <div className="quote-row quote-row-total">
                    <span>
                      Total final ({String(packageQuote.currency || "BRL").toUpperCase()})
                    </span>
                    <strong>{formatBrl(quoteTotal)}</strong>
                  </div>
                </div>
                <div className="helper-note-inline">ID da cotação: {packageQuote.quote_id}</div>
                <ul className="list-soft">
                  {Array.isArray(packageQuote.line_items)
                    ? packageQuote.line_items.map((line, idx) => (
                        <li key={`${line.coin_type}-${idx}`}>
                          {coinTypeLabel(line.coin_type)}: {line.quantity} x {formatBrl(Number(line.unit_price_cents || 0) / 100)} ={" "}
                          {formatBrl(Number(line.subtotal_cents || 0) / 100)}
                        </li>
                      ))
                    : null}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
