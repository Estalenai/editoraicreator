"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, apiFetch } from "../../lib/api";
import { normalizePlanCode } from "../../lib/planLabel";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { toUserFacingError } from "../../lib/uiFeedback";

type CatalogPlan = {
  code: string;
  name?: string;
  visible?: boolean;
  coming_soon?: boolean;
  purchasable?: boolean;
  highlight?: string | null;
  badge_label?: string | { "pt-BR"?: string; "en-US"?: string } | null;
  credits?: { common?: number; pro?: number; ultra?: number } | null;
  features?: Array<{ key?: string; label?: string; enabled?: boolean }> | null;
  addons?: { convert?: { enabled?: boolean; fee_percent?: number | null; pairs?: string[] } } | null;
  price?: { amount_brl?: number | null; period?: string };
};

function resolvePlanBadgeLabel(badge: CatalogPlan["badge_label"]): string {
  if (!badge) return "";
  if (typeof badge === "string") return badge;
  return String(badge["pt-BR"] || badge["en-US"] || "").trim();
}

function planShortDescription(code: string): string {
  if (code === "EDITOR_FREE") return "Entrada guiada para validar rotinas com IA sem sobrecarga.";
  if (code === "EDITOR_PRO") return "Operação recorrente com mais volume, previsibilidade e eficiência.";
  if (code === "EDITOR_ULTRA") return "Escala de criação intensiva para times que entregam em alta cadência.";
  if (code === "EMPRESARIAL") return "Operação assistida para equipe com governança, atendimento dedicado e conversão sem taxa.";
  if (code === "ENTERPRISE") return "Implantação corporativa com controle avançado e suporte estratégico.";
  return "Plano disponível no catálogo beta.";
}

function formatCreditsIncluded(credits?: CatalogPlan["credits"]): string[] {
  if (!credits) return [];
  return [
    `${Number(credits.common || 0)} Comum`,
    `${Number(credits.pro || 0)} Pro`,
    `${Number(credits.ultra || 0)} Ultra`,
  ];
}

function totalCreditsIncluded(credits?: CatalogPlan["credits"]): number {
  if (!credits) return 0;
  return Number(credits.common || 0) + Number(credits.pro || 0) + Number(credits.ultra || 0);
}

type PlanNarrative = {
  audience: string;
  valueBullets: string[];
  limits: string[];
};

function planNarrative(code: string): PlanNarrative {
  if (code === "EDITOR_FREE") {
    return {
      audience: "Ideal para quem está começando e quer estruturar o primeiro fluxo.",
      valueBullets: [
        "Base para creators essenciais com investimento inicial baixo.",
        "Créditos equilibrados para testes e produção leve.",
        "Entrada simples no beta com upgrade rápido para operação contínua.",
      ],
      limits: ["Uso individual", "Ritmo leve a moderado"],
    };
  }

  if (code === "EDITOR_PRO") {
    return {
      audience: "Ideal para operação recorrente com foco em consistência e qualidade.",
      valueBullets: [
        "Maior volume mensal para manter calendário ativo.",
        "Melhor equilíbrio entre custo operacional e alcance.",
        "Conversão de créditos mais eficiente para manter o ritmo.",
      ],
      limits: ["Uso profissional", "Fluxo recorrente de campanhas"],
    };
  }

  if (code === "EDITOR_ULTRA") {
    return {
      audience: "Ideal para criação intensiva com múltiplas entregas e experimentação.",
      valueBullets: [
        "Pacote robusto para criadores e squads com produção diária.",
        "Maior flexibilidade para alternar formatos e intensidade.",
        "Taxa de conversão otimizada para preservar escala.",
      ],
      limits: ["Uso intensivo", "Escala criativa avançada"],
    };
  }

  if (code === "EMPRESARIAL") {
    return {
      audience: "Ideal para times em fase de expansão com operação assistida.",
      valueBullets: [
        "Capacidade ampliada para múltiplos perfis de uso.",
        "Estrutura voltada para coordenação de equipe e governança.",
        "Conversão entre tipos com taxa 0% para preservar crédito líquido da equipe.",
      ],
      limits: ["Roadmap enterprise", "Entrada assistida"],
    };
  }

  return {
    audience: "Ideal para operação corporativa com requisitos avançados de escala.",
    valueBullets: [
      "Camada corporativa para implantação personalizada.",
      "Governança e controle com suporte estratégico contínuo.",
      "Ambiente preparado para grandes volumes e políticas internas.",
    ],
    limits: ["Implantação customizada", "Contrato corporativo"],
  };
}

function uniquePlanHighlights(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  return [...primary, ...secondary].filter((item) => {
    const normalized = String(item || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

type NoticeTone = "info" | "warning" | "success";

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

const CHECKOUT_PLAN_BY_CATALOG_CODE: Record<string, "EDITOR_FREE" | "EDITOR_PRO" | "EDITOR_ULTRA"> = {
  EDITOR_FREE: "EDITOR_FREE",
  EDITOR_PRO: "EDITOR_PRO",
  EDITOR_ULTRA: "EDITOR_ULTRA",
};

export default function PlansPage() {
  return (
    <Suspense fallback={<div className="page-shell"><div className="premium-card" style={{ padding: 16 }}>Carregando planos...</div></div>}>
      <PlansPageContent />
    </Suspense>
  );
}

function PlansPageContent() {
  const searchParams = useSearchParams();
  const {
    loading,
    error,
    email,
    planLabel,
    planCodeRaw,
    betaAccess,
    betaBlocked,
    onLogout,
    refresh,
  } = useDashboardBootstrap({ loadDashboard: true });

  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogPlans, setCatalogPlans] = useState<CatalogPlan[]>([]);
  const [checkoutLoadingCode, setCheckoutLoadingCode] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [handledCheckoutState, setHandledCheckoutState] = useState<string>("");

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await apiFetch("/api/plans/catalog?lang=pt-BR");
      if (!response.ok) {
        throw new Error("Falha ao carregar catálogo de planos.");
      }
      const payload = await response.json().catch(() => null);
      const plans = Array.isArray(payload?.plans) ? payload.plans : [];
      const visiblePlans = plans.filter((item: CatalogPlan) => item?.visible !== false);

      if (!visiblePlans.some((item: CatalogPlan) => String(item?.code || "").toUpperCase() === "ENTERPRISE")) {
        visiblePlans.push({
          code: "ENTERPRISE",
          name: "Enterprise",
          coming_soon: true,
          purchasable: false,
          price: { amount_brl: null, period: "month" },
        });
      }
      setCatalogPlans(visiblePlans);
    } catch (loadError: any) {
      setCatalogPlans([]);
      setCatalogError(loadError?.message || "Falha ao carregar catálogo de planos.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const currentPlanCodeNormalized = useMemo(
    () => normalizePlanCode(planCodeRaw || planLabel || "EDITOR_FREE"),
    [planCodeRaw, planLabel]
  );

  const currentPlanVisibleInCatalog = useMemo(
    () => catalogPlans.some((plan) => normalizePlanCode(plan.code) === currentPlanCodeNormalized),
    [catalogPlans, currentPlanCodeNormalized]
  );
  const currentCatalogPlan = useMemo(
    () => catalogPlans.find((plan) => normalizePlanCode(plan.code) === currentPlanCodeNormalized) || null,
    [catalogPlans, currentPlanCodeNormalized]
  );
  const currentPlanFeePercent = useMemo(() => {
    const fee = Number(currentCatalogPlan?.addons?.convert?.fee_percent ?? NaN);
    return Number.isFinite(fee) ? fee : null;
  }, [currentCatalogPlan]);
  const currentPlanCredits = useMemo(
    () => formatCreditsIncluded(currentCatalogPlan?.credits || undefined),
    [currentCatalogPlan]
  );
  const currentPlanCreditsTotal = useMemo(
    () => totalCreditsIncluded(currentCatalogPlan?.credits || undefined),
    [currentCatalogPlan]
  );
  const currentPlanNarrative = useMemo(
    () => planNarrative(currentPlanCodeNormalized),
    [currentPlanCodeNormalized]
  );
  const planLabelDisplay = loading ? "Sincronizando plano" : planLabel ?? "—";
  const currentPlanCreditsValue = loading
    ? "Créditos em sincronização"
    : currentPlanCreditsTotal > 0
      ? `${currentPlanCreditsTotal} créditos totais`
      : "Consulte o catálogo";
  const currentPlanCreditsDetail = loading
    ? "A composição do plano aparece assim que o catálogo for sincronizado."
    : currentPlanCredits.length > 0
      ? currentPlanCredits.join(" • ")
      : "Detalhamento completo no catálogo abaixo.";
  const currentPlanFeeValue = loading
    ? "..."
    : currentPlanFeePercent != null
      ? `${currentPlanFeePercent}%`
      : "—";
  const currentPlanFeeDetail = loading
    ? "Sincronizando regras do plano e benefícios de conversão."
    : currentPlanFeePercent === 0
      ? "Taxa zero na conversão entre tipos: todo o crédito líquido permanece com a equipe."
      : currentPlanFeePercent != null
        ? "Quanto menor a taxa, mais crédito líquido você mantém ao converter entre Comum, Pro e Ultra."
        : "Este plano não habilita conversão entre tipos.";
  const currentPlanAudience = loading
    ? "Sincronizando benefícios, créditos e disponibilidade do plano."
    : currentPlanNarrative.audience;

  useEffect(() => {
    if (!loading && !betaBlocked) {
      loadCatalog();
    }
  }, [loading, betaBlocked, loadCatalog]);

  useEffect(() => {
    const checkoutState = String(searchParams.get("checkout") || "").toLowerCase();
    if (checkoutState !== "success" && checkoutState !== "canceled") return;
    if (handledCheckoutState === checkoutState) return;

    setHandledCheckoutState(checkoutState);

    if (checkoutState === "canceled") {
      setCheckoutNotice({
        tone: "warning",
        message: "Checkout cancelado. Você pode tentar novamente quando quiser.",
      });
      clearCheckoutSearchParams(["checkout"]);
      return;
    }

    let cancelled = false;

    setCheckoutNotice({
      tone: "info",
      message: "Pagamento confirmado na Stripe. Atualizando plano e saldo nesta página...",
    });

    (async () => {
      let synced = false;
      let lastSyncError: any = null;

      for (const delayMs of [0, 1200, 2400]) {
        if (cancelled) return;
        if (delayMs > 0) {
          await waitForCheckoutSync(delayMs);
        }

        try {
          await api.refreshStripeSubscription();
          await refresh();
          await loadCatalog();
          synced = true;
          lastSyncError = null;
          break;
        } catch (syncError: any) {
          lastSyncError = syncError;
        }
      }

      if (cancelled) return;

      if (synced) {
        setCheckoutNotice({
          tone: "success",
          message: "Pagamento confirmado. Plano e saldo foram sincronizados com sucesso.",
        });
      } else {
        setCheckoutNotice({
          tone: "warning",
          message: toUserFacingError(
            lastSyncError?.message,
            "Checkout concluído. Não foi possível sincronizar automaticamente agora; tente atualizar o plano."
          ),
        });
      }

      clearCheckoutSearchParams(["checkout"]);
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, refresh, loadCatalog, handledCheckoutState]);

  async function onStartPlanCheckout(planCode: string) {
    const normalized = normalizePlanCode(planCode);
    const checkoutPlanCode = CHECKOUT_PLAN_BY_CATALOG_CODE[normalized];

    if (!checkoutPlanCode) {
      setCheckoutNotice({
        tone: "warning",
        message: "Checkout deste plano ainda não está disponível no beta fechado.",
      });
      return;
    }

    if (normalized === currentPlanCodeNormalized) {
      setCheckoutNotice({
        tone: "info",
        message: "Este já é o seu plano atual.",
      });
      return;
    }

    setCheckoutLoadingCode(normalized);
    setCheckoutNotice(null);
    try {
      const baseUrl = window.location.origin;
      const payload = await api.createCheckoutSession({
        plan_code: checkoutPlanCode,
        mode: "subscription",
        success_url: `${baseUrl}/plans?checkout=success`,
        cancel_url: `${baseUrl}/plans?checkout=canceled`,
      });
      const checkoutUrl = String(payload?.url || "").trim();
      if (!checkoutUrl) {
        throw new Error("checkout_url_missing");
      }
      window.location.href = checkoutUrl;
    } catch (checkoutError: any) {
      const rawMessage = String(checkoutError?.message || "");
      if (rawMessage.toLowerCase().includes("plan_unavailable")) {
        setCheckoutNotice({
          tone: "warning",
          message: "Este plano ainda não possui checkout configurado no ambiente atual. Use ativação assistida no suporte.",
        });
        return;
      }
      setCheckoutNotice({
        tone: "warning",
        message: toUserFacingError(rawMessage, "Não foi possível iniciar o checkout agora."),
      });
    } finally {
      setCheckoutLoadingCode(null);
    }
  }

  function onRequestPlanActivation(planCode: string, planName?: string) {
    const normalized = normalizePlanCode(planCode);
    const displayName = String(planName || normalized || "selecionado");
    setCheckoutNotice({
      tone: "info",
      message: `O plano ${displayName} está disponível no beta com ativação assistida. Você será redirecionado para o suporte.`,
    });
    const query = new URLSearchParams({
      topic: "plan_activation",
      plan: normalized,
    });
    window.location.href = `/support?${query.toString()}`;
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
    <div className="page-shell plans-page">
      <section className="premium-hero plans-hero">
        <div className="hero-split">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Assinatura e disponibilidade</p>
              <h1 className="heading-reset">Planos</h1>
              <p className="section-header-copy hero-copy-compact">
                Compare valor, créditos e taxa de conversão antes de decidir upgrade ou ativação.
              </p>
            </div>
            <div className="hero-meta-row hero-meta-row-compact">
              <span className="premium-badge premium-badge-phase">Plano atual: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-warning">Checkout self-serve quando disponível</span>
            </div>
            <div className="signal-strip plans-hero-signal-strip">
              <div className="signal-chip signal-chip-sober">
                <strong>Escolha objetiva</strong>
                <span>Preço, créditos e taxa aparecem sem abrir telas extras.</span>
              </div>
              <div className="signal-chip signal-chip-sober">
                <strong>Checkout seguro</strong>
                <span>Planos self-serve seguem para a Stripe; os demais continuam assistidos.</span>
              </div>
              <div className="signal-chip signal-chip-sober">
                <strong>Progressão visível</strong>
                <span>Entrada, operação recorrente e escala ficam lado a lado.</span>
              </div>
            </div>
          </div>
          <div className="premium-card-soft hero-side-panel plans-hero-panel">
            <span className="plan-card-section-label">Cobrança e segurança</span>
            <div className="hero-side-list hero-side-list-compact">
              <div className="hero-side-note">
                <strong>Checkout via Stripe</strong>
                <span>Planos self-serve seguem por Stripe com retorno controlado ao produto para sincronizar assinatura e disponibilidade.</span>
              </div>
              <div className="hero-side-note">
                <strong>Progressão objetiva</strong>
                <span>Créditos, taxa de conversão e perfil de uso ficam visíveis antes da decisão.</span>
              </div>
              <div className="hero-side-note hero-side-note-trust">
                <strong>Confidencialidade empresarial</strong>
                <span>Planos assistidos reforçam processamento isolado, dados fora de treino de modelos e governança para operações sensíveis.</span>
              </div>
            </div>
            <div className="hero-actions-row">
              <button
                onClick={async () => {
                  await refresh();
                  await loadCatalog();
                }}
                className="btn-ea btn-secondary"
              >
                Atualizar plano e catálogo
              </button>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Falha ao carregar dados da conta</p>
          <div className="state-ea-text">{toUserFacingError(error, "Tente atualizar os dados novamente.")}</div>
        </div>
      ) : null}

      {catalogError ? (
        <div className="state-ea state-ea-warning">
          <p className="state-ea-title">Catálogo indisponível no momento</p>
          <div className="state-ea-text">{toUserFacingError(catalogError, "Atualize o catálogo para tentar novamente.")}</div>
          <div className="state-ea-actions">
            <button onClick={loadCatalog} className="btn-ea btn-secondary btn-sm">Atualizar catálogo</button>
          </div>
        </div>
      ) : null}

      {checkoutNotice ? (
        <div className={`state-ea ${checkoutNotice.tone === "success" ? "state-ea-success" : checkoutNotice.tone === "warning" ? "state-ea-warning" : ""}`}>
          <p className="state-ea-title">
            {checkoutNotice.tone === "success"
              ? "Checkout confirmado"
              : checkoutNotice.tone === "warning"
                ? "Atenção no checkout"
                : "Plano selecionado"}
          </p>
          <div className="state-ea-text">{checkoutNotice.message}</div>
        </div>
      ) : null}

      {!catalogLoading &&
      currentPlanCodeNormalized !== "FREE" &&
      currentPlanCodeNormalized !== "EDITOR_FREE" &&
      !currentPlanVisibleInCatalog ? (
        <div className="state-ea">
          <p className="state-ea-title">Plano atual fora do catálogo exibido</p>
          <div className="state-ea-text">
            Seu plano atual ({planLabel || "Gratuito"}) não aparece como card nesta visão. Use o resumo acima para referência.
          </div>
        </div>
      ) : null}

      <section className="summary-grid plans-summary-grid">
        <div className="premium-card executive-card plans-summary-card">
          <p className="executive-eyebrow">Plano atual</p>
          <p className="executive-value">{planLabelDisplay}</p>
          <p className="executive-detail">{currentPlanAudience}</p>
        </div>
        <div className="premium-card executive-card plans-summary-card">
          <p className="executive-eyebrow">Créditos incluídos</p>
          <p className="executive-value metric-value-compact">{currentPlanCreditsValue}</p>
          <p className="executive-detail">{currentPlanCreditsDetail}</p>
        </div>
        <div className="premium-card executive-card plans-summary-card">
          <p className="executive-eyebrow">Conversão entre tipos</p>
          <p className="executive-value">{currentPlanFeeValue}</p>
          <p className="executive-detail">{currentPlanFeeDetail}</p>
        </div>
      </section>

      <section className="premium-card-soft plans-confidence-strip">
        <div className="plans-confidence-note">
          <strong>Checkout claro</strong>
          <span>Planos self-serve seguem para assinatura imediata via Stripe; os assistidos continuam via suporte.</span>
        </div>
        <div className="plans-confidence-note">
          <strong>Controle comercial</strong>
          <span>Preço, disponibilidade e diferenças principais ficam expostos sem leitura longa.</span>
        </div>
        <div className="plans-confidence-note">
          <strong>Sincronização pós-checkout</strong>
          <span>Depois da compra, atualize o plano para refletir benefícios e disponibilidade.</span>
        </div>
        <div className="plans-confidence-note plans-confidence-note-trust">
          <strong>Privacidade aplicada</strong>
          <span>Dados operacionais não são usados para treino de modelos e o processamento segue isolado por conta.</span>
        </div>
      </section>

      <section className="premium-card plans-catalog-section section-card">
        <div className="section-head">
          <div className="section-header-ea">
            <h3 className="heading-reset">Catálogo de planos</h3>
            <p className="helper-text-ea">Entrada, operação recorrente e escala criativa em uma progressão curta.</p>
          </div>
          <span className="premium-badge premium-badge-phase plans-catalog-badge">Escolha com contexto</span>
        </div>
        {catalogLoading ? (
          <div className="plan-catalog-grid plan-catalog-grid-spaced">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`plan-skeleton-${index}`} className="premium-skeleton premium-skeleton-card" />
            ))}
          </div>
        ) : catalogPlans.length === 0 ? (
          <div className="state-ea">
            <p className="state-ea-title">Sem dados de catálogo nesta versão</p>
            <div className="state-ea-text">
              Atualize o catálogo. Se persistir, use o suporte para validar disponibilidade dos planos no beta.
            </div>
            <div className="state-ea-actions">
              <button onClick={loadCatalog} className="btn-ea btn-secondary btn-sm">
                Atualizar catálogo
              </button>
              <Link href="/support" className="btn-link-ea btn-ghost btn-sm">
                Falar com suporte
              </Link>
            </div>
          </div>
        ) : (
          <div className="plan-catalog-grid plan-catalog-grid-spaced">
            {catalogPlans.map((item) => {
              const comingSoon = item?.coming_soon === true || item?.purchasable === false;
              const codeUpper = String(item?.code || "").toUpperCase();
              const normalizedCatalogCode = normalizePlanCode(codeUpper);
              const mappedCheckoutPlanCode = CHECKOUT_PLAN_BY_CATALOG_CODE[normalizedCatalogCode];
              const checkoutSupported = Boolean(mappedCheckoutPlanCode);
              const isCurrentPlan = normalizedCatalogCode === currentPlanCodeNormalized;
              const hasInteractiveCheckout = !comingSoon && checkoutSupported && !isCurrentPlan;
              const requiresAssistedActivation = !comingSoon && !checkoutSupported && !isCurrentPlan;
              const rawAmount = Number(item?.price?.amount_brl);
              const hasPrice = Number.isFinite(rawAmount) && rawAmount > 0;
              const priceLabel = comingSoon ? "Em breve" : hasPrice ? `R$ ${rawAmount.toFixed(2)}/mês` : "Preço sob consulta";
              const badgeText = resolvePlanBadgeLabel(item.badge_label) || (comingSoon ? "Em breve" : "");
              const creditsIncluded = formatCreditsIncluded(item?.credits || undefined);
              const creditsTotal = totalCreditsIncluded(item?.credits || undefined);
              const topBenefits = Array.isArray(item?.features)
                ? item.features.filter((feature) => feature?.enabled).map((feature) => String(feature?.label || "").trim()).filter(Boolean).slice(0, 3)
                : [];
              const narrative = planNarrative(normalizedCatalogCode);
              const displayBenefits = uniquePlanHighlights(narrative.valueBullets, topBenefits).slice(0, 4);
              const convertEnabled = Boolean(item?.addons?.convert?.enabled);
              const convertFee = Number(item?.addons?.convert?.fee_percent ?? 0);
              const statusText = isCurrentPlan
                ? "Plano atual"
                : comingSoon
                  ? "Em breve"
                  : hasInteractiveCheckout
                    ? "Checkout imediato"
                    : "Ativação assistida";
              const isMostPopular = String(item.highlight || "").toLowerCase() === "most_popular";
              const isLoadingCheckout = checkoutLoadingCode === normalizedCatalogCode;
              const buttonLabel = isCurrentPlan
                ? "Plano atual"
                : comingSoon
                  ? "Em breve"
                  : checkoutSupported
                    ? (isLoadingCheckout ? "Abrindo checkout..." : "Abrir checkout")
                    : "Solicitar ativação";

              return (
                <div
                  key={item.code}
                  className={`premium-card-soft plan-card ${isCurrentPlan ? "plan-card-current" : isMostPopular ? "plan-card-featured" : "plan-card-default"}`}
                >
                  <div className="plan-card-top">
                    <div className="plan-card-header">
                      <div className="plan-card-section-label">Plano</div>
                      <strong>{item.name || item.code}</strong>
                      <div className="plan-card-description">{planShortDescription(normalizedCatalogCode)}</div>
                    </div>
                    {isCurrentPlan ? (
                      <span className="premium-badge premium-badge-warning plan-pill">
                        Plano atual
                      </span>
                    ) : badgeText ? (
                      <span
                        className={`premium-badge ${comingSoon ? "premium-badge-soon" : "premium-badge-phase"} plan-pill`}
                      >
                        {badgeText}
                      </span>
                      ) : null}
                  </div>
                  <div className="plan-card-price">{priceLabel}</div>
                  <div className="helper-text-ea">
                    {narrative.audience}
                  </div>
                  <div className="plan-card-metrics">
                    <span className="premium-badge premium-badge-phase plan-pill">
                      {statusText}
                    </span>
                    {convertEnabled ? (
                      <span className="premium-badge premium-badge-warning plan-pill">
                        {convertFee === 0 ? "Conversão com taxa 0%" : `Taxa de conversão: ${convertFee}%`}
                      </span>
                    ) : (
                      <span className="premium-badge premium-badge-soon plan-pill">
                        Conversão indisponível
                      </span>
                    )}
                  </div>
                  {convertEnabled ? (
                    <div className="plan-card-support-note">
                      {convertFee === 0
                        ? "Conversão entre tipos com taxa 0% neste plano."
                        : `Conversão entre tipos com taxa de ${convertFee}% neste plano.`}
                    </div>
                  ) : null}
                  {creditsIncluded.length > 0 ? (
                    <div className="plan-card-credits">
                      <div className="plan-card-section-label">Créditos incluídos</div>
                      <div className="plan-card-metrics">
                        {creditsIncluded.map((itemCredit) => (
                          <span
                            key={`${codeUpper}-${itemCredit}`}
                            className="plan-credit-pill"
                          >
                            {itemCredit}
                          </span>
                        ))}
                      </div>
                      <div className="plan-card-total">Total agregado: {creditsTotal} créditos</div>
                    </div>
                  ) : null}
                  <div className="plan-card-bullets">
                    <div className="plan-card-section-label">Principais diferenças</div>
                    {displayBenefits.map((benefit) => (
                      <div key={`${codeUpper}-highlight-${benefit}`}>• {benefit}</div>
                    ))}
                  </div>
                  <div className="plan-card-limits">
                    {narrative.limits.map((itemLimit) => (
                      <span
                        key={`${codeUpper}-limit-${itemLimit}`}
                        className="premium-badge premium-badge-soon plan-pill"
                      >
                        {itemLimit}
                      </span>
                    ))}
                  </div>
                  <button
                    disabled={(!hasInteractiveCheckout && !requiresAssistedActivation) || isLoadingCheckout}
                    onClick={() => {
                      if (hasInteractiveCheckout) {
                        onStartPlanCheckout(codeUpper);
                        return;
                      }
                      if (requiresAssistedActivation) {
                        onRequestPlanActivation(codeUpper, item.name || item.code);
                      }
                    }}
                    className={`btn-ea ${hasInteractiveCheckout ? "btn-primary" : requiresAssistedActivation ? "btn-secondary" : "btn-ghost"} btn-sm plan-card-cta ${!hasInteractiveCheckout && !requiresAssistedActivation ? "plan-card-cta-muted" : ""}`}
                  >
                    {buttonLabel}
                  </button>
                  {isCurrentPlan ? (
                    <div className="plan-note-subtle">
                      Este plano já está ativo na sua conta.
                    </div>
                  ) : comingSoon ? (
                    <div className="plan-card-support-note">
                      {codeUpper === "EMPRESARIAL"
                        ? "Plano Empresarial em breve no beta."
                        : codeUpper === "ENTERPRISE" || codeUpper === "ENTERPRISE_ULTRA"
                          ? "Plano Enterprise em breve no beta."
                          : "Disponível em breve no beta."}
                    </div>
                  ) : requiresAssistedActivation ? (
                    <div className="plan-card-support-note">
                      Disponível no beta com ativação assistida pelo suporte.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
