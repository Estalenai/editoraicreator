"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../lib/api";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
import {
  CREATOR_COINS_PUBLIC_NAME,
  CREATOR_COINS_SHORT_NAME,
  formatCreatorCoinsWalletSummary,
} from "../../lib/creatorCoins";
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
  300: { title: "Pacote inicial", note: "Ideal para testar fluxos e ajustar sua composição de Creator Coins." },
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

function sameBreakdown(left?: Partial<PackageBreakdown> | null, right?: Partial<PackageBreakdown> | null): boolean {
  return PACKAGE_COIN_ORDER.every((coinType) => Number(left?.[coinType] || 0) === Number(right?.[coinType] || 0));
}

type Props = {
  wallet: any | null;
  loading?: boolean;
  latestTransactionId?: string | null;
};

function normalizeWalletSnapshot(wallet: any | null) {
  return {
    common: Number(wallet?.common ?? 0),
    pro: Number(wallet?.pro ?? 0),
    ultra: Number(wallet?.ultra ?? 0),
  };
}

function persistCoinsCheckoutContext(input: {
  quoteId: string;
  wallet: any | null;
  breakdown: PackageBreakdown;
  latestTransactionId?: string | null;
}) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `ea:coins_checkout:${input.quoteId}`,
      JSON.stringify({
        quoteId: input.quoteId,
        walletBefore: normalizeWalletSnapshot(input.wallet),
        expectedBreakdown: normalizeWalletSnapshot(input.breakdown),
        latestTransactionId: String(input.latestTransactionId || ""),
        createdAt: new Date().toISOString(),
      })
    );
  } catch {
    // non-blocking
  }
}

export function CreditsPackagesCard({ wallet, loading = false, latestTransactionId = null }: Props) {
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
  const quoteRequestSequenceRef = useRef(0);
  const autoQuoteTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const liveCustomPackageTotal = useMemo(() => {
    const parsed = Number(customPackageTotalInput);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.trunc(parsed));
  }, [customPackageTotalInput]);
  const activePackageTotal = coinsPackageMode === "custom" ? liveCustomPackageTotal : selectedPackage;
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
  const quoteMatchesSelection =
    Boolean(packageQuote?.quote_id) &&
    Number(packageQuote?.package_total || 0) === activePackageTotal &&
    sameBreakdown(packageQuote?.breakdown, packageBreakdown);
  const canRequestQuote = !loading && !packageLoading && !packageCheckoutLoading && packageMixValid;
  const canOpenCheckout = canRequestQuote && quoteMatchesSelection;
  const hasLiveQuoteTarget = packageMixValid && activePackageTotal > 0;

  const walletSummary = useMemo(
    () => (loading ? "Saldo em sincronização" : formatCreatorCoinsWalletSummary(wallet)),
    [wallet, loading]
  );
  const walletUpdatedAt = useMemo(() => (loading ? "—" : formatDateTime(wallet?.updated_at)), [wallet, loading]);

  useEffect(() => {
    if (!coinsPanelOpen || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setCoinsPanelOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [coinsPanelOpen]);

  function invalidatePackageQuoteState(clearError = true) {
    quoteRequestSequenceRef.current += 1;
    if (autoQuoteTimeoutRef.current) {
      window.clearTimeout(autoQuoteTimeoutRef.current);
      autoQuoteTimeoutRef.current = null;
    }
    setPackageLoading(false);
    setPackageQuote(null);
    if (clearError) {
      setPackageError(null);
    }
  }

  function updatePackageBreakdown(field: keyof PackageBreakdown, rawValue: string) {
    const normalizedValue = normalizeMixInput(rawValue);
    setPackageBreakdown((prev) => ({ ...prev, [field]: normalizedValue }));
    setMixPreset("manual");
    invalidatePackageQuoteState();
  }

  function resetPackageToDefault(total: number) {
    setSelectedPackage(total);
    setPackageBreakdown(defaultMixForPackage(total));
    setMixPreset("equal");
    invalidatePackageQuoteState();
  }

  function updateCustomTotal(rawValue: string) {
    const normalizedInput = normalizeCustomDigits(rawValue);
    if (!normalizedInput) {
      setCustomPackageTotalInput("");
      setCustomPackageTotal(PACKAGE_MIN_TOTAL);
      if (coinsPackageMode === "custom" && mixPreset === "equal") {
        setPackageBreakdown(defaultMixForPackage(PACKAGE_MIN_TOTAL));
      }
      invalidatePackageQuoteState();
      return;
    }
    const parsed = clampCustomTotal(Number(normalizedInput));
    const effective = Math.max(PACKAGE_MIN_TOTAL, parsed);
    setCustomPackageTotalInput(normalizedInput);
    setCustomPackageTotal(effective);
    if (coinsPackageMode === "custom" && mixPreset === "equal") {
      setPackageBreakdown(defaultMixForPackage(effective));
    }
    invalidatePackageQuoteState();
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
    invalidatePackageQuoteState();
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
    invalidatePackageQuoteState();
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
    invalidatePackageQuoteState();
  }

  const requestCoinsPackageQuote = useCallback(
    async (options?: {
      packageTotal?: number;
      breakdown?: PackageBreakdown;
      trigger?: "manual" | "auto" | "checkout";
    }) => {
      const trigger = options?.trigger || "manual";
      const requestedPackageTotal = Number(options?.packageTotal ?? activePackageTotal);
      const requestedBreakdown = options?.breakdown || packageBreakdown;
      const requestId = ++quoteRequestSequenceRef.current;

      setPackageLoading(true);
      if (trigger !== "auto") {
        setPackageError(null);
      }
      try {
        const payload = await api.quoteCoinsPackage({
          package_total: requestedPackageTotal,
          breakdown: requestedBreakdown,
        });
        const quote = payload?.quote as CoinsPackageQuote | undefined;
        if (!quote?.quote_id) {
          throw new Error("quote_invalid_response");
        }
        if (requestId !== quoteRequestSequenceRef.current) {
          return null;
        }
        setPackageQuote(quote);
        return quote;
      } catch (e: any) {
        if (requestId !== quoteRequestSequenceRef.current) {
          return null;
        }
        const message = toUserFacingError(e?.message, `Falha ao gerar cotação de ${CREATOR_COINS_PUBLIC_NAME} avulsas.`);
        setPackageError(message);
        throw e;
      } finally {
        if (requestId === quoteRequestSequenceRef.current) {
          setPackageLoading(false);
        }
      }
    },
    [activePackageTotal, packageBreakdown]
  );

  useEffect(() => {
    if (!coinsPanelOpen) {
      if (autoQuoteTimeoutRef.current) {
        window.clearTimeout(autoQuoteTimeoutRef.current);
        autoQuoteTimeoutRef.current = null;
      }
      setPackageLoading(false);
      return;
    }

    if (!hasLiveQuoteTarget) {
      if (autoQuoteTimeoutRef.current) {
        window.clearTimeout(autoQuoteTimeoutRef.current);
        autoQuoteTimeoutRef.current = null;
      }
      setPackageLoading(false);
      return;
    }

    if (quoteMatchesSelection) {
      if (autoQuoteTimeoutRef.current) {
        window.clearTimeout(autoQuoteTimeoutRef.current);
        autoQuoteTimeoutRef.current = null;
      }
      setPackageLoading(false);
      return;
    }

    if (autoQuoteTimeoutRef.current) {
      window.clearTimeout(autoQuoteTimeoutRef.current);
      autoQuoteTimeoutRef.current = null;
    }

    autoQuoteTimeoutRef.current = window.setTimeout(() => {
      autoQuoteTimeoutRef.current = null;
      requestCoinsPackageQuote({
        packageTotal: activePackageTotal,
        breakdown: packageBreakdown,
        trigger: "auto",
      }).catch(() => null);
    }, 350);

    return () => {
      if (autoQuoteTimeoutRef.current) {
        window.clearTimeout(autoQuoteTimeoutRef.current);
        autoQuoteTimeoutRef.current = null;
      }
    };
  }, [
    coinsPanelOpen,
    hasLiveQuoteTarget,
    quoteMatchesSelection,
    activePackageTotal,
    packageBreakdown.common,
    packageBreakdown.pro,
    packageBreakdown.ultra,
    requestCoinsPackageQuote,
  ]);

  async function onBuyCoinsPackage() {
    if (loading) {
      setPackageError("Saldo e regras de compra ainda estão sincronizando. Aguarde antes de abrir o checkout seguro.");
      return;
    }

    setPackageCheckoutLoading(true);
    setPackageError(null);
    try {
      const activeTotal = coinsPackageMode === "custom" ? commitCustomTotal() : selectedPackage;
      const quote =
        packageQuote && packageQuote.package_total === activeTotal && sameBreakdown(packageQuote.breakdown, packageBreakdown)
          ? packageQuote
          : await requestCoinsPackageQuote({
              packageTotal: activeTotal,
              breakdown: packageBreakdown,
              trigger: "checkout",
            });

      const baseUrl = window.location.origin;
      const response = await api.createCoinsPackageCheckout({
        quote_id: quote.quote_id,
        success_url: `${baseUrl}/credits?coins_package=success&quote_id=${encodeURIComponent(String(quote.quote_id))}`,
        cancel_url: `${baseUrl}/credits?coins_package=cancel`,
      });
      const checkoutUrl = String(response?.checkout?.url || "");
      if (!checkoutUrl) throw new Error("checkout_url_missing");
      persistCoinsCheckoutContext({
        quoteId: quote.quote_id,
        wallet,
        breakdown: quote.breakdown,
        latestTransactionId,
      });
      window.location.href = checkoutUrl;
    } catch (e: any) {
      const message = toUserFacingError(e?.message, `Falha ao criar checkout de ${CREATOR_COINS_PUBLIC_NAME} avulsas.`);
      setPackageError(message);
    } finally {
      setPackageCheckoutLoading(false);
    }
  }

  const purchaseModal =
    coinsPanelOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="credits-modal-backdrop"
            role="presentation"
            onClick={() => setCoinsPanelOpen(false)}
          >
            <div
              className="premium-card credits-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="credits-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="credits-modal-shell">
                <header className="section-head credits-modal-header">
                  <div className="hero-title-stack section-stack-tight">
                    <p className="section-kicker">Compra segura</p>
                    <h3 className="heading-reset" id="credits-modal-title">{CREATOR_COINS_PUBLIC_NAME} avulsas</h3>
                    <p className="section-header-copy credits-modal-copy">
                      Configure o total de {CREATOR_COINS_PUBLIC_NAME}, feche o mix e revise a cotação antes de abrir o checkout seguro da Stripe.
                    </p>
                  </div>
                  <div className="hero-actions-row credits-modal-header-actions">
                    <span className="premium-badge premium-badge-phase">{activePackageTotal} {CREATOR_COINS_SHORT_NAME} selecionadas</span>
                    <button type="button" onClick={() => setCoinsPanelOpen(false)} className="btn-ea btn-ghost btn-sm">
                      Fechar
                    </button>
                  </div>
                </header>

                <div className="credits-modal-body">
                  <div className="credits-modal-main">
                    <section className="purchase-modal-section">
                      <div className="meta-text-ea">Formato da compra</div>
                      <div className="purchase-mode-toggle" role="tablist" aria-label={`Formato da compra de ${CREATOR_COINS_PUBLIC_NAME}`}>
                        {(["packages", "custom"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={coinsPackageMode === mode}
                            className="purchase-mode-toggle-btn"
                            data-active={coinsPackageMode === mode}
                            onClick={() => switchCoinsPackageMode(mode)}
                          >
                            <strong>{mode === "packages" ? "Pacote rápido" : "Total livre"}</strong>
                            <span>
                              {mode === "packages"
                                ? "Escolha uma base pronta e ajuste o mix depois."
                                : "Defina o total primeiro e monte o mix do seu jeito."}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>

                    {coinsPackageMode === "packages" ? (
                      <section className="purchase-modal-section">
                        <div className="meta-text-ea">Pacote base</div>
                        <div className="credits-package-grid">
                          {PACKAGE_OPTIONS.map((total) => (
                            <button
                              key={total}
                              type="button"
                              onClick={() => resetPackageToDefault(total)}
                              className="purchase-option-card"
                              data-active={selectedPackage === total}
                            >
                              <div className="purchase-option-title">{total} {CREATOR_COINS_SHORT_NAME}</div>
                              <div className="helper-text-ea purchase-option-copy">
                                {PACKAGE_OPTION_COPY[total].title} · {PACKAGE_OPTION_COPY[total].note}
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>
                    ) : (
                      <section className="purchase-modal-section">
                        <div className="meta-text-ea">
                          Total personalizado com mínimo de {PACKAGE_MIN_TOTAL} {CREATOR_COINS_SHORT_NAME} e passos de {PACKAGE_STEP}.
                        </div>
                        <label className="field-label-ea">
                          <span>Total da compra</span>
                          <div className="ea-amount-control">
                            <button
                              type="button"
                              className="ea-amount-button"
                              onClick={() => commitCustomTotal(String(Math.max(PACKAGE_MIN_TOTAL, customPackageTotal - PACKAGE_STEP)))}
                              aria-label="Diminuir total personalizado"
                            >
                              -
                            </button>
                            <div className="ea-amount-input-wrap">
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
                                className="ea-amount-input"
                                aria-label={`Total personalizado de ${CREATOR_COINS_PUBLIC_NAME}`}
                              />
                              <span className="ea-amount-suffix">{CREATOR_COINS_SHORT_NAME}</span>
                            </div>
                            <button
                              type="button"
                              className="ea-amount-button"
                              onClick={() => commitCustomTotal(String(customPackageTotal + PACKAGE_STEP))}
                              aria-label="Aumentar total personalizado"
                            >
                              +
                            </button>
                          </div>
                        </label>
                        <div className="helper-text-ea">
                          Use mínimo de {PACKAGE_MIN_TOTAL} {CREATOR_COINS_SHORT_NAME} e valores em múltiplos de {PACKAGE_STEP}.
                        </div>
                      </section>
                    )}

                    <section className="purchase-modal-section">
                      <div className="meta-text-ea">Mix entre Comum, Pro e Ultra</div>
                      <div className="surface-toolbar purchase-preset-row">
                        <button
                          type="button"
                          onClick={() => applyPackageMixPreset("equal")}
                          className={`btn-ea ${mixPreset === "equal" ? "btn-primary" : "btn-ghost"} btn-sm`}
                        >
                          Dividir igualmente
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPackageMixPreset("common")}
                          className={`btn-ea ${mixPreset === "common" ? "btn-primary" : "btn-ghost"} btn-sm`}
                        >
                          Tudo Comum
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPackageMixPreset("pro")}
                          className={`btn-ea ${mixPreset === "pro" ? "btn-primary" : "btn-ghost"} btn-sm`}
                        >
                          Tudo Pro
                        </button>
                        <button
                          type="button"
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
                    </section>
                  </div>

                  <aside className="credits-modal-aside">
                    <div className="trust-grid credits-modal-notes">
                      <div className="premium-card-soft trust-note">
                        <strong>Sem ambiguidade</strong>
                        <span>O resumo financeiro fica visível o tempo todo, mesmo quando você ajusta o mix.</span>
                      </div>
                      <div className="premium-card-soft trust-note trust-note-privacy">
                        <strong>Checkout só no final</strong>
                        <span>Primeiro feche o total e a cotação. Depois siga para o pagamento seguro.</span>
                      </div>
                    </div>

                    <div className="premium-card-soft creator-context-zone purchase-summary-card">
                      <div className="purchase-summary-row">
                        <span>Total selecionado</span>
                        <strong>{activePackageTotal} {CREATOR_COINS_SHORT_NAME}</strong>
                      </div>
                      <div className="purchase-summary-row">
                        <span>Soma atual da composição</span>
                        <strong>{packageSum} {CREATOR_COINS_SHORT_NAME}</strong>
                      </div>
                      {packageMixValid ? (
                        <div className="inline-alert inline-alert-success">Mix fechado corretamente. A cotação é atualizada automaticamente.</div>
                      ) : null}
                      {packageRemaining > 0 ? (
                        <div className="inline-alert inline-alert-warning">
                          Faltam {packageRemaining} {CREATOR_COINS_SHORT_NAME} para completar o total.
                        </div>
                      ) : null}
                      {packageRemaining < 0 ? (
                        <div className="inline-alert inline-alert-error">
                          A composição excedeu em {packageExceededBy} {CREATOR_COINS_SHORT_NAME}.
                        </div>
                      ) : null}
                      {!packageBreakdownStepValid ? (
                        <div className="inline-alert inline-alert-error">
                          Mix inválido. Cada tipo deve usar múltiplos de {PACKAGE_STEP}.
                        </div>
                      ) : null}
                      <div className="metric-chip-row">
                        {PACKAGE_COIN_ORDER.map((coinType) => (
                          <span key={`ratio-${coinType}`} className={`metric-chip metric-chip-${coinType}`}>
                            {coinTypeLabel(coinType)}: {mixPercentByType[coinType]}%
                          </span>
                        ))}
                      </div>
                      {!packageTotalValid ? (
                        <div className="inline-alert inline-alert-error">
                          Total inválido. Use mínimo de {PACKAGE_MIN_TOTAL} {CREATOR_COINS_SHORT_NAME} e múltiplos de {PACKAGE_STEP}.
                        </div>
                      ) : null}
                    </div>

                    {packageQuote ? (
                      <div className="premium-card-soft quote-summary-card">
                        <strong>Cotação pronta para revisão</strong>
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
                              {hasFee ? formatBrl(quoteFee) : "Sem taxa no seu plano"}
                            </strong>
                          </div>
                          <div className="quote-row quote-row-total">
                            <span>Total final ({String(packageQuote.currency || "BRL").toUpperCase()})</span>
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
                    ) : (
                      <div className="premium-card-soft quote-summary-card quote-summary-card-placeholder">
                        <strong>Cotação pendente</strong>
                        <span className="helper-text-ea">
                          Feche o total e o mix. O resumo calcula automaticamente subtotal, taxa e total final assim que a composição ficar válida.
                        </span>
                      </div>
                    )}
                  </aside>
                </div>

                {packageError ? (
                  <div className="state-ea state-ea-error state-ea-spaced">
                    <p className="state-ea-title">Não foi possível preparar a compra</p>
                    <div className="state-ea-text">{packageError}</div>
                  </div>
                ) : null}

                <footer className="purchase-modal-footer">
                  <div className="helper-note-inline credits-modal-live-note">
                    {packageCheckoutLoading
                      ? "Abrindo checkout seguro na Stripe..."
                      : packageLoading
                        ? "Calculando cotação..."
                        : quoteMatchesSelection
                          ? "Cotação pronta. Revise subtotal, taxa e total antes de seguir para o pagamento."
                          : hasLiveQuoteTarget
                            ? "A cotação é atualizada automaticamente conforme você altera total e composição."
                            : "Escolha total e composição para liberar a cotação automática antes do pagamento."}
                  </div>

                  <div className="hero-actions-row purchase-modal-footer-actions">
                    <button
                      type="button"
                      onClick={() =>
                        requestCoinsPackageQuote({
                          packageTotal: activePackageTotal,
                          breakdown: packageBreakdown,
                          trigger: "manual",
                        })
                      }
                      disabled={!canRequestQuote}
                      className="btn-ea btn-secondary"
                    >
                      {packageLoading ? "Calculando..." : packageError ? "Tentar cotação novamente" : "Atualizar cotação"}
                    </button>
                    <button
                      type="button"
                      onClick={onBuyCoinsPackage}
                      disabled={loading || packageLoading || packageCheckoutLoading || !packageMixValid}
                      className="btn-ea btn-primary"
                    >
                      {packageCheckoutLoading
                        ? "Abrindo checkout..."
                        : canOpenCheckout
                          ? "Ir para pagamento seguro"
                          : "Gerar cotação e ir ao pagamento"}
                    </button>
                  </div>
                </footer>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="credits-purchase-card">
        <div className="credits-purchase-head">
          <div className="hero-title-stack credits-purchase-intro">
            <p className="section-kicker">Compra avulsa</p>
            <h3 className="heading-reset">{CREATOR_COINS_PUBLIC_NAME} avulsas</h3>
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
              : `Escolha um pacote pronto ou monte um total livre com a mistura de ${CREATOR_COINS_PUBLIC_NAME} que fizer sentido.`}
          </p>
        </div>
        <div className="trust-grid credits-purchase-notes">
          <div className="trust-note credits-purchase-note">
            <strong>Cotação clara</strong>
            <span>Subtotal, taxa e total aparecem antes de sair para o pagamento.</span>
          </div>
          <div className="trust-note credits-purchase-note trust-note-privacy">
            <strong>Pagamento via Stripe</strong>
            <span>O checkout abre em Stripe e retorna a Créditos para confirmar saldo e histórico do pacote.</span>
          </div>
          <div className="trust-note credits-purchase-note">
            <strong>Mix configurável</strong>
            <span>Distribua o total entre Comum, Pro e Ultra antes de abrir a Stripe.</span>
          </div>
        </div>
        <div className="credits-coin-grid">
          {PACKAGE_COIN_ORDER.map((coinType) => (
            <div
              key={coinType}
              className={`credits-coin-card credits-coin-card-${coinType}`}
            >
              <strong>{PACKAGE_COIN_INFO[coinType].title}</strong>
              <div className="helper-text-ea">{PACKAGE_COIN_INFO[coinType].description}</div>
            </div>
          ))}
        </div>
        <div className="credits-purchase-actions">
          <div className="helper-note-inline credits-purchase-checkout-note">
            {loading
              ? "Aguarde a sincronização do saldo para abrir uma cotação segura."
              : "Pagamento seguro via Stripe com retorno a Créditos para confirmar saldo e histórico."}
          </div>
          <div className="credits-purchase-action-row">
            <a href="/credits#credits-history" className="btn-link-ea btn-ghost btn-sm">
              Ver histórico de consumo
            </a>
            <button
              onClick={() => {
                setPackageError(null);
                setCoinsPanelOpen(true);
              }}
              disabled={loading}
              className="btn-ea btn-primary credits-purchase-cta"
            >
              {loading ? "Sincronizando saldo..." : `Comprar ${CREATOR_COINS_PUBLIC_NAME} avulsas`}
            </button>
          </div>
        </div>
      </div>
      {purchaseModal}
    </>
  );
}
