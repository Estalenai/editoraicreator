"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, apiFetch } from "../../lib/api";
import { normalizePlanCode, resolvePlanLabel } from "../../lib/planLabel";
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

function normalizePlanIdentity(planCodeOrLabel: string | null | undefined): string {
  const raw = String(planCodeOrLabel || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  if (!raw) return "FREE";
  if (raw === "EMPRESARIAL") return "EMPRESARIAL";
  if (raw === "ENTERPRISE" || raw === "ENTERPRISE_ULTRA") return "ENTERPRISE";
  return normalizePlanCode(raw);
}

function isContractOnlyPlan(planCodeOrLabel: string | null | undefined): boolean {
  return normalizePlanIdentity(planCodeOrLabel) === "ENTERPRISE";
}

function resolvePlanBadgeLabel(badge: CatalogPlan["badge_label"]): string {
  if (!badge) return "";
  if (typeof badge === "string") return badge;
  return String(badge["pt-BR"] || badge["en-US"] || "").trim();
}

function planShortDescription(code: string): string {
  if (code === "EDITOR_FREE") return "Entrada guiada para validar rotinas com IA sem sobrecarga.";
  if (code === "EDITOR_PRO") return "Operação recorrente com mais volume, previsibilidade e eficiência.";
  if (code === "EDITOR_ULTRA") return "Escala de criação intensiva para times que entregam em alta cadência.";
  if (code === "EMPRESARIAL") return "Operação assistida para equipes em expansão, com governança e acompanhamento dedicado.";
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

function isEnterpriseConversionPlan(code: string): boolean {
  const normalized = normalizePlanCode(code);
  return normalized === "ENTERPRISE";
}

function resolvePlanConversionState(code: string, plan: CatalogPlan) {
  const fee = Number(plan?.addons?.convert?.fee_percent ?? NaN);
  if (Number.isFinite(fee)) {
    return { enabled: true, feePercent: Math.max(0, fee) };
  }
  if (isEnterpriseConversionPlan(code)) {
    return { enabled: true, feePercent: 0 };
  }
  return { enabled: Boolean(plan?.addons?.convert?.enabled), feePercent: 0 };
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
      audience: "Ideal para equipes em expansão que precisam de ativação assistida e operação mais governada.",
      valueBullets: [
        "Capacidade ampliada para múltiplos perfis de uso com acompanhamento dedicado.",
        "Estrutura pensada para coordenação de time, governança e entrada assistida.",
        "Etapa comercial intermediária antes da camada enterprise completa.",
      ],
      limits: ["Ativação assistida", "Operação em expansão"],
    };
  }

  if (code === "ENTERPRISE") {
    return {
      audience: "Plano por contrato para operação corporativa, fora do catálogo self-serve nesta fase.",
      valueBullets: [
        "Escopo comercial, volume e condições definidos por contrato.",
        "Ativação assistida para operação corporativa com governança mais forte.",
        "Fora da comparação pública com os planos abertos do produto.",
      ],
      limits: ["Implantação assistida", "Contrato corporativo"],
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

function planPriority(code: string): number {
  const raw = String(code || "").trim().toUpperCase();
  const normalized = normalizePlanCode(raw);
  if (raw === "INICIANTE" || normalized === "EDITOR_FREE") return 0;
  if (normalized === "EDITOR_PRO") return 1;
  if (raw === "CREATOR_PRO" || normalized === "EDITOR_ULTRA") return 2;
  if (raw === "EMPRESARIAL") return 3;
  if (raw === "ENTERPRISE" || normalized === "ENTERPRISE") return 4;
  return 10;
}

function resolveVisiblePlanName(plan: Pick<CatalogPlan, "code" | "name">): string {
  const raw = String(plan.code || plan.name || "").trim().toUpperCase();
  if (raw === "EMPRESARIAL") return "Empresarial";
  return resolvePlanLabel(plan.code || plan.name || "");
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
    <Suspense fallback={<div className="page-shell"><div className="layout-contract-card" style={{ padding: 16 }}>Carregando opções de plano...</div></div>}>
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
      const plans: CatalogPlan[] = Array.isArray(payload?.plans) ? payload.plans : [];
      const visiblePlans: CatalogPlan[] = plans.filter((item) => {
        if (item?.visible === false) return false;
        return !isContractOnlyPlan(item?.code);
      });

      if (!visiblePlans.some((item: CatalogPlan) => String(item?.code || "").toUpperCase() === "EMPRESARIAL")) {
        visiblePlans.push({
          code: "EMPRESARIAL",
          name: "Empresarial",
          coming_soon: true,
          purchasable: false,
          price: { amount_brl: null, period: "month" },
        });
      }
      visiblePlans.sort((left, right) => {
        const orderDiff = planPriority(left?.code || "") - planPriority(right?.code || "");
        if (orderDiff !== 0) return orderDiff;
        return resolveVisiblePlanName(left).localeCompare(resolveVisiblePlanName(right), "pt-BR");
      });
      setCatalogPlans(visiblePlans);
    } catch (loadError: any) {
      setCatalogPlans([]);
      setCatalogError(loadError?.message || "Falha ao carregar catálogo de planos.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const currentPlanIdentity = useMemo(
    () => normalizePlanIdentity(planCodeRaw || planLabel || "FREE"),
    [planCodeRaw, planLabel]
  );
  const currentPlanIsContract = useMemo(
    () => currentPlanIdentity === "ENTERPRISE",
    [currentPlanIdentity]
  );

  const currentPlanVisibleInCatalog = useMemo(
    () => catalogPlans.some((plan) => normalizePlanIdentity(plan.code) === currentPlanIdentity),
    [catalogPlans, currentPlanIdentity]
  );
  const orderedCatalogPlans = useMemo(
    () => [...catalogPlans].sort((a, b) => planPriority(a.code) - planPriority(b.code)),
    [catalogPlans]
  );
  const currentCatalogPlan = useMemo(
    () => catalogPlans.find((plan) => normalizePlanIdentity(plan.code) === currentPlanIdentity) || null,
    [catalogPlans, currentPlanIdentity]
  );
  const currentPlanFeePercent = useMemo(() => {
    if (currentPlanIsContract) {
      return null;
    }
    if (!currentCatalogPlan) {
      return null;
    }
    const conversionState = resolvePlanConversionState(currentPlanIdentity, currentCatalogPlan);
    return conversionState.enabled ? conversionState.feePercent : null;
  }, [currentCatalogPlan, currentPlanIdentity, currentPlanIsContract]);
  const currentPlanCredits = useMemo(
    () => formatCreditsIncluded(currentCatalogPlan?.credits || undefined),
    [currentCatalogPlan]
  );
  const currentPlanCreditsTotal = useMemo(
    () => totalCreditsIncluded(currentCatalogPlan?.credits || undefined),
    [currentCatalogPlan]
  );
  const currentPlanNarrative = useMemo(
    () => planNarrative(currentPlanIdentity),
    [currentPlanIdentity]
  );
  const planLabelDisplay = loading
    ? "Plano em sincronização"
    : currentPlanIsContract
      ? "Enterprise por contrato"
      : resolvePlanLabel(planCodeRaw || planLabel || "EDITOR_FREE");
  const currentPlanCreditsValue = loading
    ? "Créditos do plano em sincronização"
    : currentPlanIsContract
      ? "Sob contrato"
    : currentPlanCreditsTotal > 0
      ? `${currentPlanCreditsTotal} créditos totais`
      : "Consulte o catálogo";
  const currentPlanCreditsDetail = loading
    ? "A composição, os limites e a disponibilidade aparecem assim que o catálogo for confirmado."
    : currentPlanIsContract
      ? "Créditos, composição e volume do Enterprise são definidos por contrato e não aparecem no catálogo público."
    : currentPlanCredits.length > 0
      ? currentPlanCredits.join(" • ")
      : "Detalhamento completo no catálogo abaixo.";
  const currentPlanFeeValue = loading
    ? "..."
    : currentPlanIsContract
      ? "Sob contrato"
    : currentPlanFeePercent != null
      ? `${currentPlanFeePercent}%`
      : "—";
  const currentPlanFeeDetail = loading
    ? "Sincronizando regras de conversão e benefícios do plano."
    : currentPlanIsContract
      ? "Condições de conversão, limites e escopo operacional do Enterprise são definidos comercialmente."
    : currentPlanFeePercent === 0
      ? "Taxa zero na conversão entre tipos: todo o crédito líquido permanece com a equipe."
      : currentPlanFeePercent != null
        ? "Quanto menor a taxa, mais crédito líquido você mantém ao converter entre Comum, Pro e Ultra."
        : "Conversão entre tipos indisponível neste plano.";
  const currentPlanAudience = loading
    ? "Sincronizando benefícios, créditos incluídos e disponibilidade do plano."
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
        message: "Checkout cancelado. Nenhuma assinatura foi alterada e você pode tentar novamente quando quiser.",
      });
      clearCheckoutSearchParams(["checkout"]);
      return;
    }

    let cancelled = false;

    setCheckoutNotice({
      tone: "info",
      message: "Pagamento confirmado na Stripe. Validando plano, créditos incluídos e disponibilidade nesta página...",
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
          message: "Pagamento confirmado. Plano, créditos incluídos e disponibilidade já foram atualizados.",
        });
      } else {
        setCheckoutNotice({
          tone: "warning",
          message: toUserFacingError(
            lastSyncError?.message,
            "Checkout concluído. Não foi possível sincronizar automaticamente agora; atualize plano e catálogo em instantes."
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
        message: "Este plano ainda não abre checkout automático no beta. Use ativação assistida quando necessário.",
      });
      return;
    }

    if (normalized === normalizePlanCode(currentPlanIdentity)) {
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
      <section className="plans-hero plans-hero-open">
        <div className="plans-hero-intro">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Assinatura e disponibilidade</p>
              <h1 className="heading-reset">Planos</h1>
              <p className="section-header-copy hero-copy-compact">
                O beta pago/controlado precisa de uma oferta clara. Hoje o centro comercial é <strong>Editor Pro</strong>, com checkout seguro, créditos visíveis e continuidade forte; <strong>Enterprise</strong> fica fora do catálogo aberto e segue apenas por contrato.
              </p>
            </div>
            <div className="hero-meta-row hero-meta-row-compact plans-hero-meta">
              <span className="premium-badge premium-badge-phase">Plano atual: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-warning">Editor Pro é o plano principal do beta</span>
              <button
                onClick={async () => {
                  await refresh();
                  await loadCatalog();
                }}
                className="btn-link-ea btn-ghost btn-sm plans-hero-refresh"
              >
                Atualizar plano e catálogo
              </button>
            </div>
          </div>
          <div className="plans-hero-signals" aria-label="Pontos-chave da comparação de planos">
              <div className="plans-hero-signal">
                <strong>Oferta mais decidida</strong>
                <span>Entrada, plano principal e escala aparecem com papéis comerciais mais claros.</span>
              </div>
              <div className="plans-hero-signal">
                <strong>Checkout seguro</strong>
                <span>Planos com checkout automático seguem para a Stripe; os demais continuam assistidos.</span>
              </div>
              <div className="plans-hero-signal">
                <strong>Menos ruído comercial</strong>
                <span>Preço, créditos, conversão e disponibilidade ficam expostos antes de qualquer decisão.</span>
              </div>
            </div>
          </div>
      </section>

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível carregar planos e status da conta</p>
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
              ? "Assinatura confirmada"
              : checkoutNotice.tone === "warning"
                ? "Atenção no checkout"
                : "Sincronizando retorno do checkout"}
          </p>
          <div className="state-ea-text">{checkoutNotice.message}</div>
        </div>
      ) : null}

      {!catalogLoading &&
      currentPlanIdentity !== "FREE" &&
      currentPlanIdentity !== "EDITOR_FREE" &&
      !currentPlanVisibleInCatalog ? (
        <div className="state-ea">
          <p className="state-ea-title">
            {currentPlanIsContract ? "Enterprise fora do catálogo aberto" : "Plano atual fora do catálogo exibido"}
          </p>
          <div className="state-ea-text">
            {currentPlanIsContract
              ? "Sua conta está em Enterprise por contrato. Esse plano não aparece como card comparável, não expõe créditos públicos e não participa do fluxo aberto desta página."
              : `Seu plano atual (${resolvePlanLabel(planCodeRaw || planLabel || "EDITOR_FREE")}) não aparece como card nesta visão. Use o resumo acima para consultar créditos, taxa e disponibilidade.`}
          </div>
        </div>
      ) : null}

      <section className="plans-summary-strip" aria-label="Resumo do plano atual">
        <div className="plans-summary-stat">
          <p className="plans-summary-label">Plano atual</p>
          <p className="plans-summary-primary">{planLabelDisplay}</p>
          <p className="plans-summary-detail">{currentPlanAudience}</p>
        </div>
        <div className="plans-summary-stat">
          <p className="plans-summary-label">Créditos incluídos</p>
          <p className="plans-summary-primary">{currentPlanCreditsValue}</p>
          <p className="plans-summary-detail">{currentPlanCreditsDetail}</p>
        </div>
        <div className="plans-summary-stat">
          <p className="plans-summary-label">Conversão entre tipos</p>
          <p className="plans-summary-primary">{currentPlanFeeValue}</p>
          <p className="plans-summary-detail">{currentPlanFeeDetail}</p>
        </div>
      </section>

      <section className="plans-confidence-strip">
        <div className="plans-confidence-note">
          <strong>Editor Pro como centro comercial</strong>
          <span>Iniciante valida encaixe, Editor Pro concentra recorrência e Editor Ultra amplia cadência sem espalhar a comparação.</span>
        </div>
        <div className="plans-confidence-note">
          <strong>Checkout ou ativação assistida</strong>
          <span>Stripe para o fluxo self-serve; suporte quando o plano ainda exige ativação acompanhada.</span>
        </div>
        <div className="plans-confidence-note plans-confidence-note-trust">
          <strong>Enterprise e privacidade fora do ruído</strong>
          <span>Enterprise segue por contrato; dados operacionais continuam isolados por conta e sem exposição desnecessária.</span>
        </div>
      </section>

      <section className="plans-catalog-section">
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
            {orderedCatalogPlans.map((item) => {
              const comingSoon = item?.coming_soon === true || item?.purchasable === false;
              const codeUpper = String(item?.code || "").toUpperCase();
              const visibleCatalogCode = normalizePlanIdentity(codeUpper);
              const normalizedCatalogCode = normalizePlanCode(codeUpper);
              const mappedCheckoutPlanCode = CHECKOUT_PLAN_BY_CATALOG_CODE[normalizedCatalogCode];
              const checkoutSupported = Boolean(mappedCheckoutPlanCode);
              const isCurrentPlan = visibleCatalogCode === currentPlanIdentity;
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
              const narrative = planNarrative(visibleCatalogCode);
              const displayBenefits = uniquePlanHighlights(narrative.valueBullets, topBenefits).slice(0, 4);
              const conversionState = resolvePlanConversionState(normalizedCatalogCode, item);
              const convertEnabled = conversionState.enabled;
              const convertFee = conversionState.feePercent;
              const statusText = isCurrentPlan
                ? "Plano atual"
                : comingSoon
                  ? "Em breve"
                  : hasInteractiveCheckout
                    ? "Checkout imediato via Stripe"
                    : "Ativação assistida";
              const isMostPopular = String(item.highlight || "").toLowerCase() === "most_popular";
              const isRecommendedPlan = visibleCatalogCode === "EDITOR_PRO" && !isCurrentPlan;
              const isLoadingCheckout = checkoutLoadingCode === normalizedCatalogCode;
              const buttonLabel = isCurrentPlan
                ? "Plano atual"
                : comingSoon
                  ? "Em breve"
                  : checkoutSupported
                    ? (isLoadingCheckout ? "Abrindo checkout seguro..." : "Abrir checkout seguro")
                    : "Solicitar ativação";

              return (
                <div
                  key={item.code}
                  className={`plan-card ${
                    isCurrentPlan
                      ? "plan-card-current"
                      : isRecommendedPlan
                        ? "plan-card-recommended"
                        : isMostPopular
                          ? "plan-card-featured"
                          : "plan-card-default"
                  }`}
                >
                  <div className="plan-card-top">
                    <div className="plan-card-header">
                      <div className="plan-card-section-label">Plano</div>
                      <strong>{resolveVisiblePlanName(item)}</strong>
                      <div className="plan-card-description">{planShortDescription(visibleCatalogCode)}</div>
                    </div>
                    {isCurrentPlan ? (
                      <span className="premium-badge premium-badge-warning plan-pill">
                        Plano atual
                      </span>
                    ) : isRecommendedPlan ? (
                      <span className="premium-badge premium-badge-phase plan-pill">
                        Recomendado
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
                  <div className="plan-card-mode">
                    <strong>{statusText}</strong>
                    <span>
                      {convertEnabled
                        ? convertFee === 0
                          ? "Conversão entre tipos com taxa 0% neste plano."
                          : `Conversão entre tipos com taxa de ${convertFee}% neste plano.`
                        : "Conversão entre tipos indisponível neste plano."}
                    </span>
                  </div>
                  {creditsIncluded.length > 0 ? (
                    <div className="plan-card-credits">
                      <div className="plan-card-credit-line"><strong>Créditos:</strong> {creditsIncluded.join(" • ")}</div>
                      <div className="plan-card-total">Total agregado: {creditsTotal} créditos</div>
                    </div>
                  ) : null}
                  <div className="plan-card-bullets">
                    <div className="plan-card-section-label">Principais diferenças</div>
                    {displayBenefits.map((benefit) => (
                      <div key={`${codeUpper}-highlight-${benefit}`} className="plan-card-bullet">• {benefit}</div>
                    ))}
                  </div>
                  <div className="plan-card-limits">
                    <div className="plan-card-limit-line"><strong>Uso:</strong> {narrative.limits.join(" • ")}</div>
                  </div>
                  <div className="plan-card-footer">
                    <button
                      disabled={(!hasInteractiveCheckout && !requiresAssistedActivation) || isLoadingCheckout}
                      onClick={() => {
                        if (hasInteractiveCheckout) {
                          onStartPlanCheckout(codeUpper);
                          return;
                        }
                        if (requiresAssistedActivation) {
                          onRequestPlanActivation(codeUpper, resolveVisiblePlanName(item));
                        }
                      }}
                      className={`btn-ea ${hasInteractiveCheckout ? "btn-primary" : requiresAssistedActivation ? "btn-secondary" : "btn-ghost"} btn-sm plan-card-cta ${!hasInteractiveCheckout && !requiresAssistedActivation ? "plan-card-cta-muted" : ""}`}
                    >
                      {buttonLabel}
                    </button>
                    {isCurrentPlan ? (
                      <div className="plan-note-subtle">
                        Este plano já está ativo e com benefícios aplicados na sua conta.
                      </div>
                    ) : isRecommendedPlan ? (
                      <div className="plan-card-support-note">
                        Melhor ponto de entrada comercial para o beta pago/controlado nesta fase.
                      </div>
                    ) : comingSoon ? (
                      <div className="plan-card-support-note">
                        {codeUpper === "EMPRESARIAL"
                          ? "Plano Empresarial em breve no beta."
                          : normalizePlanCode(codeUpper) === "ENTERPRISE"
                            ? "Plano Enterprise em breve no beta."
                            : "Disponível em breve no beta."}
                      </div>
                    ) : requiresAssistedActivation ? (
                      <div className="plan-card-support-note">
                        Disponível no beta com ativação assistida via suporte.
                      </div>
                    ) : null}
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
