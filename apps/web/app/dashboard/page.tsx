"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { ApprovedBetaOnboardingCard } from "../../components/dashboard/ApprovedBetaOnboardingCard";
import { EditorRouteLink } from "../../components/ui/EditorRouteLink";
import { api } from "../../lib/api";
import { formatCreatorCoinsWalletSummary } from "../../lib/creatorCoins";
import { ensureCanonicalProjectData, getCanonicalProjectSummary } from "../../lib/projectModel";
import { toUserFacingError } from "../../lib/uiFeedback";

type UsageItem = { feature: string; used: number; limit: number };

type AccountOverview = {
  plan?: {
    plan_code?: string | null;
    status?: string | null;
  } | null;
  wallet?: {
    common?: number | null;
    pro?: number | null;
    ultra?: number | null;
    total?: number | null;
    updated_at?: string | null;
  } | null;
  financial?: {
    recent?: Array<Record<string, any>>;
  } | null;
  projects?: {
    recent?: Array<Record<string, any>>;
  } | null;
  notifications?: {
    items?: Array<{
      id?: string;
      title?: string;
      message?: string;
      created_at?: string;
      status_code?: string;
      href?: string;
      meta?: Record<string, any>;
    }>;
  } | null;
};

type QuickLinkItem = {
  href: string;
  group: "core" | "support";
  tag: string;
  title: string;
  description: string;
  cta: string;
};

const QUICK_LINKS: QuickLinkItem[] = [
  {
    href: "/creators",
    group: "core",
    tag: "Creators",
    title: "Creators",
    description: "Entrada pronta.",
    cta: "Abrir workspace",
  },
  {
    href: "/editor/new",
    group: "core",
    tag: "Editor",
    title: "Editor",
    description: "Revisão direta.",
    cta: "Abrir editor",
  },
  {
    href: "/projects",
    group: "core",
    tag: "Projetos",
    title: "Projetos",
    description: "Retorno salvo.",
    cta: "Ver projetos",
  },
  {
    href: "/projects#publish",
    group: "core",
    tag: "Saída",
    title: "Output",
    description: "Entrega visível.",
    cta: "Ver saída",
  },
  {
    href: "/credits",
    group: "support",
    tag: "Capacidade",
    title: "Creator Coins",
    description: "Energia do ciclo.",
    cta: "Abrir Creator Coins",
  },
  {
    href: "/plans",
    group: "support",
    tag: "Acesso",
    title: "Planos",
    description: "Nível ativo.",
    cta: "Revisar planos",
  },
  {
    href: "/support",
    group: "support",
    tag: "Confiança",
    title: "Suporte",
    description: "Ajuda pronta.",
    cta: "Falar com suporte",
  },
  {
    href: "/how-it-works",
    group: "support",
    tag: "Guia",
    title: "Como funciona",
    description: "Rota curta.",
    cta: "Ler guia",
  },
];

function formatDashboardProjectTitle(rawTitle: string | null | undefined, fallback: string): string {
  const source = String(rawTitle || "").trim();
  if (!source) return fallback;

  const cleaned = source
    .replace(/^codex[\s:-]+/i, "")
    .replace(/\b20\d{6}(?:[- ]\d{6})\b/g, "")
    .replace(/\s+\d{10,}$/g, "")
    .replace(/[_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const normalized = cleaned.toLowerCase();
  const technicalLabels: Array<[RegExp, string]> = [
    [/\bpublish reconcile failure\b/i, "Retomada de publicacao"],
    [/\bpublish reconcile success\b/i, "Saida publicada"],
    [/\bgithub backend validation\b/i, "Validacao GitHub"],
    [/\bvercel backend validation\b/i, "Validacao Vercel"],
    [/\bbackend validation\b/i, "Validacao de backend"],
    [/\bsmoke deliverable\b/i, "Saida validada"],
    [/\bsmoke validation\b/i, "Validacao final"],
  ];

  for (const [pattern, replacement] of technicalLabels) {
    if (pattern.test(normalized)) {
      return replacement;
    }
  }

  return cleaned || fallback;
}

function formatDashboardKindLabel(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "text" || normalized === "peca" || normalized === "peça") return "Peça";
  if (normalized === "script") return "Roteiro";
  if (normalized === "clip") return "Clipe";
  if (normalized === "video") return "Vídeo";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDashboardNumber(value: number | null | undefined): string {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return safeValue.toLocaleString("pt-BR");
}

function formatDashboardDate(value: string | null | undefined): string {
  if (!value) return "Data em sincronização";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data em sincronização";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatDashboardStatus(value: string | null | undefined, fallback = "Ativo"): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "active" || normalized === "trialing" || normalized === "approved") return "Ativo";
  if (normalized === "inactive") return "Inativo";
  if (normalized === "past_due") return "Pendente";
  if (normalized === "canceled" || normalized === "cancelled") return "Cancelado";
  if (normalized === "confirmed") return "Confirmado";
  if (normalized === "running" || normalized === "queued") return "Em andamento";
  if (normalized === "needs_attention") return "Revisar";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, " ");
}

function getTransactionAmount(transaction: Record<string, any>): number {
  const amount = Number(transaction?.amount ?? transaction?.meta?.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function getTransactionLabel(transaction: Record<string, any>): string {
  const source = String(transaction?.feature || transaction?.reason || transaction?.ref_kind || "Movimentação").trim();
  return source || "Movimentação";
}

function formatDashboardActivityTitle(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Atividade registrada";
  if (normalized === "coins_convert") return "Conversão de créditos";
  if (normalized.includes("coin") || normalized.includes("credit")) return "Movimentação de Creator Coins";
  if (normalized.includes("project")) return "Projeto atualizado";
  if (normalized.includes("subscription") || normalized.includes("plan")) return "Plano atualizado";
  return formatDashboardStatus(normalized, "Atividade registrada");
}

function formatDashboardActivityMessage(item: { title?: string; message?: string }): string {
  const normalizedTitle = String(item.title || "").trim().toLowerCase();
  if (normalizedTitle === "coins_convert") return "Saldo convertido entre tipos de Creator Coins.";
  const message = String(item.message || "").trim();
  if (!message) return "Evento confirmado na conta.";
  if (message.toLowerCase().includes("ledger")) return "Movimentação registrada na carteira.";
  return message;
}

export default function DashboardPage() {
  const {
    loading,
    accessReady,
    syncingSubscription,
    error,
    email,
    planLabel,
    wallet,
    projects,
    betaAccess,
    betaBlocked,
    onLogout,
    onSyncSubscription,
    refresh,
  } = useDashboardBootstrap({ loadDashboard: true });

  const [usageItems, setUsageItems] = useState<UsageItem[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [accountOverview, setAccountOverview] = useState<AccountOverview | null>(null);
  const [accountOverviewLoading, setAccountOverviewLoading] = useState(false);
  const [accountOverviewError, setAccountOverviewError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const usage = await api.getUsageSummary();
      setUsageItems(Array.isArray(usage?.items) ? usage.items : []);
    } catch (loadError: any) {
      setUsageItems([]);
      setUsageError(loadError?.message || "Falha ao carregar uso do mês.");
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const loadAccountOverview = useCallback(async () => {
    setAccountOverviewLoading(true);
    setAccountOverviewError(null);
    try {
      const overview = await api.accountOverview();
      setAccountOverview(overview || null);
    } catch (loadError: any) {
      setAccountOverview(null);
      setAccountOverviewError(loadError?.message || "Falha ao carregar visão da conta.");
    } finally {
      setAccountOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessReady) {
      loadUsage();
      loadAccountOverview();
    }
  }, [accessReady, loadAccountOverview, loadUsage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentUrl = new URL(window.location.href);
    const checkoutState = String(currentUrl.searchParams.get("coins_package") || "").toLowerCase();
    if (checkoutState !== "success" && checkoutState !== "cancel") return;
    const nextSearch = new URLSearchParams();
    nextSearch.set("coins_package", checkoutState);
    const quoteId = String(currentUrl.searchParams.get("quote_id") || "").trim();
    if (quoteId) {
      nextSearch.set("quote_id", quoteId);
    }
    window.location.replace(`/credits?${nextSearch.toString()}`);
  }, []);

  const recentProjects = useMemo(
    () =>
      projects.slice(0, 6).map((project: any) => {
        const title = project?.name || project?.title || project?.id || "Projeto sem título";
        const kind = String(project?.kind || project?.type || "projeto");
        const data = ensureCanonicalProjectData(project?.data, {
          projectKind: kind,
          projectTitle: title,
        });
        return {
          ...project,
          title,
          kind,
          data,
          summary: getCanonicalProjectSummary(data, {
            projectKind: kind,
            projectTitle: title,
          }),
        };
      }),
    [projects]
  );
  const walletSummary = useMemo(() => formatCreatorCoinsWalletSummary(wallet), [wallet]);
  const supportQuickLinks = useMemo(
    () => QUICK_LINKS.filter((item) => item.group === "support" && item.href !== "/credits"),
    []
  );
  const totalUsage = useMemo(
    () => usageItems.reduce((sum, item) => sum + Number(item.used || 0), 0),
    [usageItems]
  );
  const operatingWallet = accountOverview?.wallet ?? wallet;
  const walletCommon = Number(operatingWallet?.common ?? 0);
  const walletPro = Number(operatingWallet?.pro ?? 0);
  const walletUltra = Number(operatingWallet?.ultra ?? 0);
  const walletTotal = Number.isFinite(Number(operatingWallet?.total))
    ? Number(operatingWallet?.total)
    : walletCommon + walletPro + walletUltra;
  const walletRows = [
    { key: "common", label: "Common", value: walletCommon },
    { key: "pro", label: "Pro", value: walletPro },
    { key: "ultra", label: "Ultra", value: walletUltra },
  ];
  const walletPeak = Math.max(walletCommon, walletPro, walletUltra, 1);
  const financialTransactions = useMemo(
    () => (Array.isArray(accountOverview?.financial?.recent) ? accountOverview.financial.recent : []),
    [accountOverview]
  );
  const creditsSpent = useMemo(
    () => financialTransactions.reduce((sum, item) => {
      const amount = getTransactionAmount(item);
      return amount < 0 ? sum + Math.abs(amount) : sum;
    }, 0),
    [financialTransactions]
  );
  const creditsReceived = useMemo(
    () => financialTransactions.reduce((sum, item) => {
      const amount = getTransactionAmount(item);
      return amount > 0 ? sum + amount : sum;
    }, 0),
    [financialTransactions]
  );
  const accountActivityItems = useMemo(
    () => (Array.isArray(accountOverview?.notifications?.items) ? accountOverview.notifications.items.slice(0, 4) : []),
    [accountOverview]
  );
  const leadProject = recentProjects[0] ?? null;
  const featuredProject = leadProject;
  const featuredProjectDisplay = useMemo(() => {
    if (!featuredProject) return null;

    const deliverableLabel = String(
      featuredProject.summary?.deliverable?.label ||
        formatDashboardKindLabel(featuredProject.kind, "Projeto em continuidade")
    ).trim();
    const rawTitle = String(featuredProject.title || "").trim();
    const displayTitle = formatDashboardProjectTitle(rawTitle, deliverableLabel);
    const narrative =
      String(featuredProject.summary?.deliverable?.summary || "").trim() ||
      "Retome no editor, preserve o contexto e registre a saída sem reabrir o fluxo inteiro.";

    return {
      ...featuredProject,
      deliverableLabel,
      displayTitle,
      kindLabel: formatDashboardKindLabel(featuredProject.kind, deliverableLabel),
      stageLabel: featuredProject.summary?.outputStageLabel || featuredProject.summary?.continuityStatusLabel,
      statusLabel: featuredProject.summary?.continuityStatusLabel || "Em andamento",
      reviewLabel: featuredProject.summary?.reviewStatusLabel || "",
      narrative,
      showRawTitle: rawTitle.length > 0 && rawTitle !== displayTitle,
      rawTitle,
    };
  }, [featuredProject]);
  const hasConfirmedUsage = totalUsage > 0;
  const nextAction = recentProjects.length > 0
      ? {
        title: "Continuar no canvas",
        description: "Retome a criação sem trocar de contexto.",
        href: recentProjects[0]?.id ? `/editor/${recentProjects[0].id}` : "/projects",
        cta: recentProjects[0]?.id ? "Continuar no canvas" : "Abrir projetos",
      }
    : {
        title: "Criar primeira entrega",
        description: "Comece pelo canvas criativo.",
        href: "/creators",
        cta: "Criar primeira entrega",
      };
  const demoDeliverableLabel = featuredProjectDisplay?.deliverableLabel || "Clipe";
  const demoDeliverableLower = demoDeliverableLabel.toLocaleLowerCase("pt-BR");
  const demoKindLower = (featuredProjectDisplay?.kindLabel || "vídeo").toLocaleLowerCase("pt-BR");
  const demoSourceLabel = featuredProjectDisplay && demoKindLower !== demoDeliverableLower ? demoKindLower : "ideia";
  const demoIdeaTitle = featuredProjectDisplay ? "Canvas transforma o pedido" : "Pedido vira entrega";
  const demoPromptTitle = featuredProjectDisplay && demoKindLower !== demoDeliverableLower
    ? `Quero transformar ${demoSourceLabel} em ${demoDeliverableLower} pronto`
    : featuredProjectDisplay
      ? `Quero finalizar ${demoDeliverableLower} pronto`
      : "Quero transformar vídeo em clipe pronto";
  const demoIdeaCopy = featuredProjectDisplay
    ? `${featuredProjectDisplay.displayTitle} chega com objetivo, formato e contexto.`
    : "Um pedido de vídeo chega com objetivo, formato e contexto.";
  const demoCanvasCopy = featuredProjectDisplay
    ? "IA organiza formato, revisão e saída até a entrega final."
    : "IA organiza cenas, ritmo e texto até a entrega final.";
  const demoOutputTitle = featuredProjectDisplay ? `${demoDeliverableLabel} pronto para publicar` : "Clipe pronto para publicar";
  const demoOutputStatus = "Resultado final";
  const demoOutputContext = "Formato e contexto aplicados";
  const recentUsageText = usageLoading
    ? "Ciclo em leitura."
    : usageItems.length === 0
      ? "Sem leitura recente."
      : `${totalUsage} uso(s).`;
  const planLabelDisplay = loading ? "Plano em sincronização" : planLabel ?? "—";
  const planStatusDisplay = accountOverviewLoading
    ? "Sincronizando"
    : formatDashboardStatus(accountOverview?.plan?.status, planLabel ? "Ativo" : "Plano em sincronização");
  const walletSummaryDisplay = loading ? "Saldo em sincronização" : walletSummary;
  const totalUsageDisplay = loading || usageLoading ? "Uso em sincronização" : totalUsage.toLocaleString("pt-BR");
  const periodUsageDisplay = usageLoading ? "Uso em sincronização" : `${formatDashboardNumber(totalUsage)} créditos usados`;
  const periodUsageDetail = usageItems.length > 0
    ? `${usageItems.length} trilha(s) com leitura no período`
    : "Histórico será exibido após a primeira entrega.";
  const nextActionCtaDisplay = loading ? "Preparando canvas" : nextAction.cta;
  const continuityValue = loading ? "Projetos em sincronização" : `${recentProjects.length} projeto(s)`;
  const continuityDetail = loading
    ? "Sincronizando trilha."
    : featuredProjectDisplay
      ? `${featuredProjectDisplay.statusLabel} • ${featuredProjectDisplay.displayTitle}`
      : "Entrada inicial.";
  const focusContinuationLabel = loading
    ? "Trilha em sincronização"
    : featuredProjectDisplay?.stageLabel || "Trilha inicial";
  const focusContinuationDetail = loading
    ? "Etapa principal."
    : featuredProjectDisplay
      ? `${featuredProjectDisplay.deliverableLabel} • ${featuredProjectDisplay.kindLabel}`
      : "Trilha vazia.";
  const studioFlowNodes = QUICK_LINKS.filter((item) => item.group === "core" && item.href !== "/projects#publish").map(
    (item, index) => ({
      ...item,
      cue: index === 0 ? "Ideia" : index === 1 ? "Refino" : "Continuidade",
    })
  );
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
    <div
      className="page-shell dashboard-surface-page dashboard-operating-page dashboard-studio-page"
      data-dashboard-contract="studio-canvas"
      data-dashboard-composition="ecosystem-field"
      data-dashboard-rhythm="breathing"
      data-dashboard-proof="selective"
      data-dashboard-gap="lasy-bridge"
      data-dashboard-thesis="editorial-demo"
      data-dashboard-thesis-clarity="concrete"
      data-dashboard-demo-proof="single"
      data-dashboard-shell="editorial"
      data-dashboard-final-rhythm="editorial"
      data-dashboard-optical-center="hero-demo"
      data-dashboard-demo-clarity="brief-to-delivery"
    >
      <div className="dashboard-surface-canvas dashboard-operating-canvas dashboard-studio-canvas dashboard-ecosystem-field">
        <section className="dashboard-surface-stage dashboard-operating-stage dashboard-studio-stage" data-reveal>
          <div className="dashboard-surface-stage-grid">
            <div className="dashboard-surface-stage-main">
              <div className="dashboard-surface-flow dashboard-operating-flow">
                <section className="dashboard-operating-grid dashboard-studio-grid" aria-label="Studio Canvas do Editor AI Creator">
                  <header className="dashboard-surface-hero dashboard-operating-command dashboard-studio-hero" data-reveal data-reveal-delay="35">
                    <div className="dashboard-surface-command dashboard-unified-command" data-reveal data-reveal-delay="70">
                      <div className="dashboard-unified-field dashboard-field-thread">
                        <div className="dashboard-unified-context" aria-label="Tese editorial do Studio Canvas">
                          <div className="dashboard-unified-mark">
                            <p className="section-kicker">Studio Canvas vivo</p>
                            <h1 className="heading-reset">
                              <span>Crie, edite</span>
                              <span>e entregue no mesmo canvas.</span>
                            </h1>
                            <p className="section-header-copy hero-copy-compact">
                              Do primeiro brief à saída final, avance sem perder o contexto criativo.
                            </p>
                          </div>

                          <div className="dashboard-unified-intent dashboard-editorial-intent" aria-label="Ação principal do Studio Canvas">
                            <div className="dashboard-studio-primary-actions" aria-label="Ações principais do Studio Canvas">
                              {nextAction.href.startsWith("/editor") ? (
                                <EditorRouteLink href={nextAction.href} className="btn-link-ea btn-primary dashboard-studio-primary-cta">
                                  {nextActionCtaDisplay}
                                </EditorRouteLink>
                              ) : (
                                <Link href={nextAction.href} className="btn-link-ea btn-primary dashboard-studio-primary-cta">
                                  {nextActionCtaDisplay}
                                </Link>
                              )}
                              <Link href="/projects" className="dashboard-studio-secondary-cta">
                                Ver projetos
                              </Link>
                            </div>
                            <div className="dashboard-unified-proofline" aria-label="Prova rápida do Studio Canvas">
                              <span>{featuredProjectDisplay ? `${featuredProjectDisplay.deliverableLabel} no canvas` : "Ideia e entrega no mesmo lugar"}</span>
                              <strong>{featuredProjectDisplay ? "Contexto preservado" : "Comece pelo canvas"}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="dashboard-surface-command-sequence dashboard-studio-orbit dashboard-field-map dashboard-unified-artifact">
                        <div className="dashboard-command-bridge dashboard-ecosystem-stage dashboard-studio-artifact dashboard-field-surface">
                          <div className="dashboard-studio-artifact-thread" aria-label="Fluxo acoplado ao artefato">
                            {studioFlowNodes.map((flowNode) => {
                              const node = (
                                <>
                                  <div className="dashboard-surface-command-step-copy">
                                    <span className="dashboard-hero-flow-label">{flowNode.tag}</span>
                                    <strong>{flowNode.title}</strong>
                                    <span>{flowNode.cue}</span>
                                  </div>
                                </>
                              );

                              return flowNode.href.startsWith("/editor") ? (
                                <EditorRouteLink
                                  key={flowNode.href}
                                  href={flowNode.href}
                                  className="dashboard-surface-command-step dashboard-studio-artifact-node"
                                >
                                  {node}
                                </EditorRouteLink>
                              ) : (
                                <Link
                                  key={flowNode.href}
                                  href={flowNode.href}
                                  className="dashboard-surface-command-step dashboard-studio-artifact-node"
                                >
                                  {node}
                                </Link>
                              );
                            })}
                          </div>

                          <div className="dashboard-surface-focus-lead-wrap dashboard-ecosystem-lead dashboard-studio-preview-shell">
                            <div className="dashboard-studio-preview-topbar" aria-label="Prova visual do canvas">
                              <span>Pedido real</span>
                              <span>Canvas transforma</span>
                              <span>Resultado pronto</span>
                            </div>

                            <div className="dashboard-studio-preview-canvas">
                              <div className="dashboard-studio-preview-beam" aria-hidden="true" />
                              <div className="dashboard-studio-signature-field" aria-hidden="true">
                                <span className="dashboard-studio-signature-node dashboard-studio-signature-node-a" />
                                <span className="dashboard-studio-signature-node dashboard-studio-signature-node-b" />
                                <span className="dashboard-studio-signature-thread dashboard-studio-signature-thread-a" />
                                <span className="dashboard-studio-signature-thread dashboard-studio-signature-thread-b" />
                              </div>
                              <div className="dashboard-studio-demo-prompt" aria-label="Pedido do usuário no canvas">
                                <span className="dashboard-stage-stat-label">Pedido</span>
                                <strong>{demoPromptTitle}</strong>
                                <span className="dashboard-studio-demo-frequency">Pedido humano</span>
                                <span>{demoIdeaCopy}</span>
                              </div>

                              <div className="dashboard-studio-demo-engine" aria-hidden="true">
                                <span className="dashboard-studio-demo-axis dashboard-studio-demo-axis-x" />
                                <span className="dashboard-studio-demo-axis dashboard-studio-demo-axis-y" />
                                <span className="dashboard-studio-demo-engine-core">EA</span>
                                <span className="dashboard-studio-demo-orbit dashboard-studio-demo-orbit-a" />
                                <span className="dashboard-studio-demo-orbit dashboard-studio-demo-orbit-b" />
                              </div>

                              {loading ? (
                                <div className="dashboard-surface-focus-lead dashboard-surface-focus-skeleton dashboard-studio-preview-brief">
                                  <div className="premium-skeleton premium-skeleton-line" style={{ width: "24%" }} />
                                  <div className="premium-skeleton premium-skeleton-line" style={{ width: "62%", marginTop: 18 }} />
                                  <div className="premium-skeleton premium-skeleton-line" style={{ width: "48%", marginTop: 16 }} />
                                </div>
                              ) : featuredProjectDisplay ? (
                                <EditorRouteLink href={`/editor/${featuredProjectDisplay.id}`} className="dashboard-surface-focus-lead dashboard-studio-preview-brief">
                                  <div className="dashboard-stage-lead-topline">
                                    <span className="dashboard-stage-lead-kicker">Canvas transforma</span>
                                    <span className="dashboard-stage-lead-pill" title={featuredProjectDisplay.stageLabel || undefined}>IA aplica contexto</span>
                                  </div>
                                  <strong className="dashboard-stage-lead-title">{demoIdeaTitle}</strong>
                                  <p className="dashboard-stage-lead-copy">{demoCanvasCopy}</p>
                                  <div className="dashboard-stage-lead-meta">
                                    <span>{featuredProjectDisplay.displayTitle}</span>
                                    <span>{demoDeliverableLabel}</span>
                                    {featuredProjectDisplay.reviewLabel ? <span>{featuredProjectDisplay.reviewLabel}</span> : null}
                                  </div>
                                  <div className="dashboard-stage-lead-footer">
                                  <span className="dashboard-stage-lead-note">{featuredProjectDisplay.kindLabel}</span>
                                  <span className="dashboard-stage-lead-action">Continuar no canvas</span>
                                  </div>
                                </EditorRouteLink>
                              ) : (
                                <div className="dashboard-surface-focus-lead dashboard-surface-focus-empty dashboard-studio-preview-brief">
                                  <span className="dashboard-stage-lead-kicker">Canvas vivo</span>
                                  <strong>Brief vira entrega.</strong>
                                  <p>Crie, refine e publique sem trocar de contexto.</p>
                                  <div className="dashboard-surface-focus-empty-actions">
                                    <Link href="/creators" className="btn-link-ea btn-primary btn-sm">
                                      Criar no canvas
                                    </Link>
                                    <EditorRouteLink href="/editor/new" className="btn-link-ea btn-ghost btn-sm">
                                      Criar projeto manual
                                    </EditorRouteLink>
                                  </div>
                                </div>
                              )}

                              <div className="dashboard-studio-demo-review" aria-label="Camada de revisão do estúdio">
                                  <span>
                                    <strong>Pedido</strong>
                                  <em>{featuredProjectDisplay ? "entra claro" : "brief pronto"}</em>
                                </span>
                                <span>
                                  <strong>Canvas</strong>
                                  <em>transforma</em>
                                </span>
                                <span>
                                  <strong>Entrega</strong>
                                  <em>resultado pronto</em>
                                </span>
                              </div>

                              <div className="dashboard-studio-preview-output" aria-label="Entrega final do estúdio">
                                <div className="dashboard-studio-output-frame">
                                  <span className="dashboard-studio-output-pulse" />
                                  <div>
                                    <span className="dashboard-stage-stat-label">Entrega pronta</span>
                                    <strong>{demoOutputTitle}</strong>
                                  </div>
                                </div>
                                <div className="dashboard-studio-output-strips" aria-hidden="true">
                                  <span />
                                  <span />
                                  <span />
                                </div>
                                <div className="dashboard-studio-output-proof">
                                  <span>{demoOutputStatus}</span>
                                  <span title={featuredProjectDisplay?.statusLabel || undefined}>{demoOutputContext}</span>
                                </div>
                              </div>

                              <div className="dashboard-studio-preview-stream" aria-label="Síntese do fluxo criativo">
                                <span>Pedido entra</span>
                                <span>Entrega sai</span>
                              </div>
                            </div>
                          </div>

                          <div className="dashboard-context-dock dashboard-context-dock-quiet dashboard-context-dock-proof dashboard-field-thread" aria-label="Sinais contextuais do estúdio">
                            <Link
                              href="/credits"
                              className="dashboard-context-signal dashboard-context-capacity dashboard-field-signal"
                            >
                              <span className="dashboard-stream-link-kicker">Capacidade</span>
                              <strong>Disponível</strong>
                              <span className="dashboard-context-energy-meter" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                              </span>
                              <span className="dashboard-context-meta">{walletSummaryDisplay}</span>
                            </Link>

                            <Link
                              href="/credits#credits-history"
                              className="dashboard-context-signal dashboard-context-log dashboard-field-signal"
                            >
                              <span className="dashboard-stream-link-kicker">Ritmo</span>
                              <strong>Leitura discreta</strong>
                              <span className="dashboard-context-activity-pulse" aria-hidden="true" />
                              <span className="dashboard-context-meta">{totalUsageDisplay} · {recentUsageText}</span>
                            </Link>

                            <div className="dashboard-context-signal dashboard-context-support dashboard-field-signal" aria-label="Infraestrutura do estúdio">
                              <span className="dashboard-context-support-orbit" aria-hidden="true" />
                              {supportQuickLinks.map((item) => (
                                <Link key={item.href} href={item.href} className="dashboard-context-support-link">
                                  <span>Base</span>
                                  <strong title={item.href === "/plans" ? planLabelDisplay : item.title}>
                                    {item.href === "/plans" ? "Acesso ativo" : item.href === "/support" ? "Ajuda" : "Guia"}
                                  </strong>
                                </Link>
                              ))}
                            </div>

                            <ApprovedBetaOnboardingCard email={email} wallet={wallet} loading={loading} />
                            <div className="dashboard-context-utility-actions" aria-label="Ações discretas da conta">
                              <button
                                onClick={async () => {
                                  await onSyncSubscription();
                                  await refresh();
                                  await loadUsage();
                                  await loadAccountOverview();
                                }}
                                disabled={syncingSubscription || loading}
                                className="btn-ea btn-secondary btn-sm"
                              >
                                {syncingSubscription ? "Atualizando" : "Atualizar leitura"}
                              </button>
                              <button onClick={onLogout} className="btn-ea btn-ghost btn-sm">
                                Sair
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                  </header>

                  {error || usageError ? (
                    <div className="dashboard-status-stack dashboard-surface-inline-status dashboard-studio-quiet-status">
                  {error ? (
                    <div className="state-ea state-ea-error dashboard-studio-quiet-error">
                      <p className="state-ea-title">Painel em revalidação</p>
                      <div className="state-ea-text">{toUserFacingError(error, "Atualize a leitura para tentar novamente.")}</div>
                      <div className="state-ea-actions">
                        <button onClick={refresh} className="btn-ea btn-secondary btn-sm">
                          Revalidar
                        </button>
                        <Link href="/support" className="btn-link-ea btn-ghost btn-sm">
                          Pedir ajuda
                        </Link>
                      </div>
                    </div>
                  ) : null}

                  {usageError ? (
                    <div className="dashboard-surface-inline-warning dashboard-studio-usage-signal" role="status" aria-live="polite">
                      <div className="dashboard-surface-inline-warning-copy">
                        <span className="dashboard-stage-stat-label">Leitura em segundo plano</span>
                        <strong>Uso será atualizado sem interromper o canvas.</strong>
                        <span>{toUserFacingError(usageError, "Sem leitura recente.")}</span>
                      </div>
                      <button onClick={loadUsage} className="btn-ea btn-secondary btn-sm">
                        Revalidar
                      </button>
                    </div>
                  ) : null}
                    </div>
                  ) : null}

                  <section className="dashboard-intelligence-field" aria-label="Estado da conta, Creator Coins e continuidade">
                    <div className="dashboard-intelligence-heading">
                      <div>
                        <span className="dashboard-intelligence-kicker">Conta em tempo real</span>
                        <strong>Dashboard operacional</strong>
                      </div>
                      <p>Plano, Creator Coins, uso, projetos e histórico sem sair do campo criativo.</p>
                    </div>

                    <div className="dashboard-intelligence-primary" aria-label="Carteira, plano e uso do período">
                      <Link href="/credits" className="dashboard-intelligence-surface dashboard-intelligence-wallet">
                        <span className="dashboard-intelligence-kicker">Creator Coins</span>
                        <strong>{accountOverviewLoading || loading ? "Saldo em sincronização" : formatDashboardNumber(walletTotal)}</strong>
                        <span className="dashboard-intelligence-muted">Total disponível</span>
                        <div className="dashboard-intelligence-wallet-lines" aria-label="Créditos por tipo">
                          {walletRows.map((row) => (
                            <span key={row.key} className={`dashboard-intelligence-wallet-row dashboard-intelligence-wallet-row-${row.key}`}>
                              <span>{row.label}</span>
                              <i aria-hidden="true">
                                <b style={{ width: `${Math.max(8, Math.round((row.value / walletPeak) * 100))}%` }} />
                              </i>
                              <strong>{formatDashboardNumber(row.value)}</strong>
                            </span>
                          ))}
                        </div>
                        <span className="dashboard-intelligence-action">Comprar créditos</span>
                      </Link>

                      <Link href="/plans" className="dashboard-intelligence-surface dashboard-intelligence-plan">
                        <span className="dashboard-intelligence-kicker">Plano atual</span>
                        <strong>{planLabelDisplay}</strong>
                        <span>{planStatusDisplay} · modelos do plano preservados</span>
                        <span className="dashboard-intelligence-action">Gerenciar plano</span>
                      </Link>

                      <div className="dashboard-intelligence-surface dashboard-intelligence-usage">
                        <span className="dashboard-intelligence-kicker">Uso do período</span>
                        <strong>{periodUsageDisplay}</strong>
                        <span>{periodUsageDetail}</span>
                        <div className="dashboard-intelligence-usage-pair">
                          <span>
                            <em>Gastos</em>
                            <strong>{financialTransactions.length > 0 ? formatDashboardNumber(creditsSpent) : "Sem gasto registrado"}</strong>
                          </span>
                          <span>
                            <em>Comprados/recebidos</em>
                            <strong>{financialTransactions.length > 0 ? formatDashboardNumber(creditsReceived) : "Sem entrada registrada"}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="dashboard-intelligence-continuity" aria-label="Projetos recentes, histórico e próxima ação">
                      <div className="dashboard-intelligence-surface dashboard-intelligence-projects">
                        <div className="dashboard-intelligence-section-head">
                          <span className="dashboard-intelligence-kicker">Projetos recentes</span>
                          <Link href="/projects">Ver todos</Link>
                        </div>
                        <div className="dashboard-intelligence-list">
                          {recentProjects.length > 0 ? recentProjects.slice(0, 3).map((project: any) => (
                            <EditorRouteLink key={project.id || project.title} href={project.id ? `/editor/${project.id}` : "/projects"} className="dashboard-intelligence-row">
                              <span>
                                <strong>{formatDashboardProjectTitle(project.title, "Projeto sem título")}</strong>
                                <em>{formatDashboardKindLabel(project.kind, "Projeto")} · {project.summary?.continuityStatusLabel || "Em continuidade"}</em>
                              </span>
                              <small>{formatDashboardDate(project.updated_at || project.created_at)}</small>
                            </EditorRouteLink>
                          )) : (
                            <div className="dashboard-intelligence-empty">
                              <strong>Nenhum projeto recente</strong>
                              <span>Projetos criados no canvas aparecem aqui.</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="dashboard-intelligence-surface dashboard-intelligence-activity">
                        <div className="dashboard-intelligence-section-head">
                          <span className="dashboard-intelligence-kicker">Histórico / atividade</span>
                          <Link href="/credits#credits-history">Abrir ledger</Link>
                        </div>
                        <div className="dashboard-intelligence-list">
                          {accountActivityItems.length > 0 ? accountActivityItems.map((item) => (
                            <Link key={item.id || item.title} href={item.href || "/dashboard/account"} className="dashboard-intelligence-row">
                              <span>
                                <strong>{formatDashboardActivityTitle(item.title)}</strong>
                                <em>{formatDashboardActivityMessage(item)}</em>
                              </span>
                              <small>{formatDashboardStatus(item.status_code, "Registrado")}</small>
                            </Link>
                          )) : (
                            <div className="dashboard-intelligence-empty">
                              <strong>Histórico em sincronização</strong>
                              <span>{accountOverviewError ? toUserFacingError(accountOverviewError, "Sem histórico recente.") : "Histórico será exibido após a primeira entrega."}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="dashboard-intelligence-surface dashboard-intelligence-next">
                        <span className="dashboard-intelligence-kicker">Próxima ação</span>
                        <strong>{nextAction.title}</strong>
                        <span>{nextAction.description}</span>
                        {nextAction.href.startsWith("/editor") ? (
                          <EditorRouteLink href={nextAction.href} className="dashboard-intelligence-action">
                            {nextActionCtaDisplay}
                          </EditorRouteLink>
                        ) : (
                          <Link href={nextAction.href} className="dashboard-intelligence-action">
                            {nextActionCtaDisplay}
                          </Link>
                        )}
                      </div>
                    </div>
                  </section>

                </section>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

