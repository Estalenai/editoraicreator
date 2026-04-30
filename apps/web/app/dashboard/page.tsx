"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { ApprovedBetaOnboardingCard } from "../../components/dashboard/ApprovedBetaOnboardingCard";
import { EditorRouteLink } from "../../components/ui/EditorRouteLink";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
import { api } from "../../lib/api";
import { CREATOR_COINS_PUBLIC_NAME, formatCreatorCoinsWalletSummary } from "../../lib/creatorCoins";
import { ensureCanonicalProjectData, getCanonicalProjectSummary } from "../../lib/projectModel";
import { toUserFacingError } from "../../lib/uiFeedback";

type UsageItem = { feature: string; used: number; limit: number };

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
    description: "Abra Post, Scripts ou Clips com contexto pronto.",
    cta: "Abrir workspace",
  },
  {
    href: "/editor/new",
    group: "core",
    tag: "Editor",
    title: "Editor",
    description: "Entre direto no núcleo de revisão.",
    cta: "Abrir editor",
  },
  {
    href: "/projects",
    group: "core",
    tag: "Projetos",
    title: "Projetos",
    description: "Retome continuidade e saída no mesmo fluxo.",
    cta: "Ver projetos",
  },
  {
    href: "/projects#publish",
    group: "core",
    tag: "Saída",
    title: "Output",
    description: "Veja o que saiu e o próximo passo.",
    cta: "Ver saída",
  },
  {
    href: "/credits",
    group: "support",
    tag: "Financeiro",
    title: "Creator Coins",
    description: "Veja saldo, conversão e compra.",
    cta: "Abrir Creator Coins",
  },
  {
    href: "/plans",
    group: "support",
    tag: "Assinatura",
    title: "Planos",
    description: "Compare níveis e checkout.",
    cta: "Revisar planos",
  },
  {
    href: "/support",
    group: "support",
    tag: "Suporte",
    title: "Suporte",
    description: "Acione ajuda quando precisar.",
    cta: "Falar com suporte",
  },
  {
    href: "/how-it-works",
    group: "support",
    tag: "Guia",
    title: "Como funciona",
    description: "Revise o fluxo principal.",
    cta: "Ler guia",
  },
];

const CREDIT_GUIDE_ITEMS = [
  {
    coinType: "common" as const,
    title: "Comum",
    description: "Fluxos de rotina e volume diário.",
  },
  {
    coinType: "pro" as const,
    title: "Pro",
    description: "Gerações estratégicas com mais qualidade.",
  },
  {
    coinType: "ultra" as const,
    title: "Ultra",
    description: "Processamento premium para cenários pesados.",
  },
];

const USAGE_FLOW_MARKERS = [
  {
    title: "Creators abre a base",
    description: "A primeira geração organiza a entrada do fluxo.",
  },
  {
    title: "Editor consolida a peça",
    description: "Revisão e acabamento transformam o rascunho em entrega.",
  },
  {
    title: "Saída fecha o ciclo",
    description: `O histórico confirmado aparece quando a trilha chega em ${CREATOR_COINS_PUBLIC_NAME}.`,
  },
];

function usageProgress(item: UsageItem): number {
  if (!item.limit || item.limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((item.used / item.limit) * 100)));
}

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
  if (normalized === "text") return "Peca";
  if (normalized === "script") return "Roteiro";
  if (normalized === "clip") return "Clipe";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDashboardUsageFeatureLabel(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Feature";

  const presets: Record<string, string> = {
    text_generate: "Peca textual",
    image_generate: "Imagem",
    video_generate: "Video",
    voice_generate: "Voz",
    music_generate: "Musica",
    publish: "Publicacao",
    project_sync: "Continuidade",
    creator_post: "Creator Post",
    creator_scripts: "Creator Scripts",
    creator_clips: "Creator Clips",
  };

  if (presets[normalized]) return presets[normalized];

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

  useEffect(() => {
    if (accessReady) {
      loadUsage();
    }
  }, [accessReady, loadUsage]);

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
  const coreQuickLinks = useMemo(
    () => QUICK_LINKS.filter((item) => item.group === "core"),
    []
  );
  const supportQuickLinks = useMemo(
    () => QUICK_LINKS.filter((item) => item.group === "support"),
    []
  );
  const railPrimaryQuickLinks = useMemo(
    () => supportQuickLinks.filter((item) => item.href === "/plans" || item.href === "/support"),
    [supportQuickLinks]
  );
  const railSecondaryQuickLinks = useMemo(
    () => supportQuickLinks.filter((item) => item.href !== "/plans" && item.href !== "/support"),
    [supportQuickLinks]
  );
  const walletBreakdown = useMemo(
    () =>
      CREDIT_GUIDE_ITEMS.map((item) => ({
        ...item,
        amount: Number(wallet?.[item.coinType] ?? 0),
      })),
    [wallet]
  );
  const totalUsage = useMemo(
    () => usageItems.reduce((sum, item) => sum + Number(item.used || 0), 0),
    [usageItems]
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
  const supportingProjects = useMemo(
    () => recentProjects.slice(featuredProject ? 1 : 0, 5),
    [recentProjects, featuredProject]
  );
  const supportingProjectDisplay = useMemo(
    () =>
      supportingProjects.slice(0, 4).map((project: any) => {
        const deliverableLabel = String(
          project.summary?.deliverable?.label || formatDashboardKindLabel(project.kind, "Projeto")
        ).trim();
        return {
          ...project,
          kindLabel: formatDashboardKindLabel(project.kind, deliverableLabel),
          displayTitle: formatDashboardProjectTitle(project.title, deliverableLabel),
          deliverableLabel,
          stageLabel: project.summary?.outputStageLabel || project.summary?.continuityStatusLabel,
          statusLabel: project.summary?.continuityStatusLabel || "Em andamento",
        };
      }),
    [supportingProjects]
  );
  const usagePreviewItems = useMemo(
    () =>
      [...usageItems]
        .sort((a, b) => Number(b.used || 0) - Number(a.used || 0) || Number(b.limit || 0) - Number(a.limit || 0))
        .slice(0, 4),
    [usageItems]
  );
  const usageDisplayItems = useMemo(
    () =>
      usagePreviewItems.map((item) => ({
        ...item,
        displayLabel: formatDashboardUsageFeatureLabel(item.feature),
      })),
    [usagePreviewItems]
  );
  const usageRemainingCount = Math.max(0, usageItems.length - usagePreviewItems.length);
  const hasConfirmedUsage = totalUsage > 0;
  const usageLeadInsight =
    loading || usageLoading
      ? "Sincronizando ciclo."
      : hasConfirmedUsage && usageDisplayItems[0]
        ? `${usageDisplayItems[0].displayLabel} lidera.`
        : `Primeira entrega fecha em ${CREATOR_COINS_PUBLIC_NAME}.`;
  const nextAction = recentProjects.length > 0
      ? {
        title: "Retomar projeto",
        description: "Continue no editor.",
        href: recentProjects[0]?.id ? `/editor/${recentProjects[0].id}` : "/projects",
        cta: recentProjects[0]?.id ? "Abrir último projeto" : "Abrir projetos",
      }
    : {
        title: "Gerar primeira entrega",
        description: "Abra um Creator e salve a primeira saída.",
        href: "/creators",
        cta: "Abrir Creators",
      };
  const usageSignalItems = useMemo(
    () => [
      {
        label: "Histórico",
        value: loading || usageLoading ? "Sincronizando" : hasConfirmedUsage ? "Reconciliado" : "Aberto",
        note:
          loading || usageLoading
            ? "Atualizando ciclo."
            : hasConfirmedUsage
              ? `${usageItems.length} feature(s).`
              : "Primeira saída.",
      },
      {
        label: "Ritmo",
        value:
          loading || usageLoading
            ? "Carregando"
            : hasConfirmedUsage && usageDisplayItems[0]
              ? usageDisplayItems[0].displayLabel
              : "Primeira entrega",
        note:
          loading || usageLoading
            ? "Lendo atividade."
            : hasConfirmedUsage && usageDisplayItems[0]
              ? `${usageDisplayItems[0].used}/${usageDisplayItems[0].limit}.`
              : "Entrega em aberto.",
      },
      {
        label: "Próximo passo",
        value: loading ? "Preparando" : nextAction.title,
        note:
          loading
            ? "Preparando workspace."
            : nextAction.description,
      },
    ],
    [
      hasConfirmedUsage,
      loading,
      usageDisplayItems,
      usageItems.length,
      usageLoading,
      nextAction.description,
      nextAction.title,
    ]
  );
  const usageEmptyState = !hasConfirmedUsage
    ? {
        kicker: "Histórico em aberto",
        title: "Primeira entrega fecha.",
        description:
          "Creator, editor e saída no mesmo ciclo.",
        primaryHref: "/creators",
        primaryLabel: "Abrir Creators",
        secondaryHref: "/credits#credits-history",
        secondaryLabel: `Abrir ${CREATOR_COINS_PUBLIC_NAME}`,
      }
    : usagePreviewItems.length === 0
      ? {
          kicker: "Sem uso confirmado",
          title: "Publique a primeira entrega.",
          description:
            `A estimativa aparece antes; ${CREATOR_COINS_PUBLIC_NAME} confirma depois.`,
          primaryHref: "/creators",
          primaryLabel: "Gerar agora",
          secondaryHref: "/credits#credits-history",
          secondaryLabel: "Ver histórico",
        }
      : null;
  const recentUsageText = usageLoading
    ? "Atualizando ciclo."
    : usageItems.length === 0
      ? "Sem uso registrado."
      : `${usageItems.length} feature(s) • ${totalUsage} consumo(s).`;
  const planLabelDisplay = loading ? "Plano em sincronização" : planLabel ?? "—";
  const emailDisplay = loading ? "Sincronizando conta..." : email || "—";
  const walletSummaryDisplay = loading ? "Saldo em sincronização" : walletSummary;
  const totalUsageDisplay = loading || usageLoading ? "Uso em sincronização" : totalUsage.toLocaleString("pt-BR");
  const nextActionTitleDisplay = loading ? "Preparando seu próximo passo" : nextAction.title;
  const nextActionCtaDisplay = loading ? "Aguarde a sincronização" : nextAction.cta;
  const nextActionDescriptionDisplay = loading
    ? "Estamos sincronizando saldo, plano, projetos e próximos passos do workspace."
    : nextAction.description;
  const continuityValue = loading ? "Projetos em sincronização" : `${recentProjects.length} projeto(s)`;
  const continuityDetail = loading
    ? "A trilha criativa entra completa quando a conta terminar de sincronizar."
    : featuredProjectDisplay
      ? `${featuredProjectDisplay.statusLabel} • ${featuredProjectDisplay.displayTitle}`
      : "Crie o primeiro projeto.";
  const focusContinuationLabel = loading
    ? "Trilha em sincronização"
    : featuredProjectDisplay?.stageLabel || "Trilha inicial";
  const focusContinuationDetail = loading
    ? "Sincronizando a etapa principal do projeto."
    : featuredProjectDisplay
      ? `${featuredProjectDisplay.deliverableLabel} • ${featuredProjectDisplay.kindLabel}`
      : "Abra um Creator e registre a primeira saída para ocupar esta trilha.";
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
    <div className="page-shell dashboard-surface-page dashboard-operating-page" data-dashboard-contract="operating-canvas">
      <div className="dashboard-surface-canvas dashboard-operating-canvas">
        <section className="dashboard-surface-stage dashboard-operating-stage" data-reveal>
          <div className="dashboard-surface-stage-grid">
            <div className="dashboard-surface-stage-main">
              <div className="dashboard-surface-flow dashboard-operating-flow">
                <section className="dashboard-operating-grid" aria-label="Superfície operacional do Editor AI Creator">
                  <header className="dashboard-surface-hero dashboard-operating-command" data-reveal data-reveal-delay="35">
                    <div className="dashboard-surface-command" data-reveal data-reveal-delay="70">
                      <div className="dashboard-command-field">
                        <div className="dashboard-surface-command-copy">
                          <div className="dashboard-surface-hero-intro">
                            <div className="hero-title-stack">
                              <p className="section-kicker">Workspace ativo</p>
                              <h1 className="heading-reset">Dashboard</h1>
                              <p className="section-header-copy hero-copy-compact">
                                Criacao, revisao e retomada permanecem no mesmo campo operacional.
                              </p>
                            </div>
                            <div className="hero-meta-row dashboard-surface-hero-badges">
                              <span className="premium-badge dashboard-operating-badge">Plano: {planLabelDisplay}</span>
                              <span className="premium-badge premium-badge-warning">
                                {loading ? "Conta em sincronizacao" : "Historico confirmado no backend"}
                              </span>
                            </div>
                          </div>
                          <span className="dashboard-hero-flow-label">Ciclo em operacao</span>
                          <strong>O ciclo de criacao ja esta em movimento.</strong>
                          <p>
                            Creator, Editor, Projetos e Saida aparecem juntos para retomar a proxima entrega sem trocar de contexto.
                          </p>
                        </div>

                        <aside className="dashboard-command-live-panel dashboard-operating-account" aria-label="Sinais operacionais da conta">
                          <div className="dashboard-command-live-head">
                            <span className="dashboard-overview-label">Conta ativa</span>
                            <strong>{planLabelDisplay}</strong>
                            <span>{emailDisplay}</span>
                          </div>

                          <div className="dashboard-command-live-grid">
                            <div className="dashboard-command-live-signal">
                              <span className="dashboard-overview-label">{CREATOR_COINS_PUBLIC_NAME}</span>
                              <strong>{walletSummaryDisplay}</strong>
                              <span>Saldo reconciliado dentro do fluxo.</span>
                            </div>
                            <div className="dashboard-command-live-signal">
                              <span className="dashboard-overview-label">Continuidade</span>
                              <strong>{continuityValue}</strong>
                              <span>{continuityDetail}</span>
                            </div>
                            <div className="dashboard-command-live-signal dashboard-command-live-next">
                              <span className="dashboard-overview-label">Proximo movimento</span>
                              <strong>{nextActionTitleDisplay}</strong>
                              <span>{nextActionDescriptionDisplay}</span>
                              {nextAction.href.startsWith("/editor") ? (
                                <EditorRouteLink href={nextAction.href} className="dashboard-inline-action">
                                  {nextActionCtaDisplay}
                                </EditorRouteLink>
                              ) : (
                                <Link href={nextAction.href} className="dashboard-inline-action">
                                  {nextActionCtaDisplay}
                                </Link>
                              )}
                            </div>
                          </div>

                          <div className="dashboard-command-live-actions">
                            <button
                              onClick={async () => {
                                await onSyncSubscription();
                                await refresh();
                                await loadUsage();
                              }}
                              disabled={syncingSubscription || loading}
                              className="btn-ea btn-secondary"
                            >
                              {syncingSubscription ? "Sincronizando..." : "Sincronizar"}
                            </button>
                            <button onClick={onLogout} className="btn-ea btn-ghost">
                              Sair
                            </button>
                          </div>
                        </aside>
                      </div>

                      <div className="dashboard-surface-command-sequence">
                        <div className="dashboard-surface-command-step">
                          <span className="dashboard-surface-step-index">01</span>
                          <div className="dashboard-surface-command-step-copy">
                            <span className="dashboard-hero-flow-label">Creators</span>
                            <strong>gera a base</strong>
                            <span>Abra Post, Scripts ou Clips com contexto pronto.</span>
                          </div>
                        </div>
                        <div className="dashboard-surface-command-step">
                          <span className="dashboard-surface-step-index">02</span>
                          <div className="dashboard-surface-command-step-copy">
                            <span className="dashboard-hero-flow-label">Editor</span>
                            <strong>lapida o material</strong>
                            <span>Revise, consolide e preserve a continuidade.</span>
                          </div>
                        </div>
                        <div className="dashboard-surface-command-step">
                          <span className="dashboard-surface-step-index">03</span>
                          <div className="dashboard-surface-command-step-copy">
                            <span className="dashboard-hero-flow-label">Projetos</span>
                            <strong>preserva o eixo</strong>
                            <span>O que foi salvo continua pronto para retomada.</span>
                          </div>
                        </div>
                        <div className="dashboard-surface-command-step">
                          <span className="dashboard-surface-step-index">04</span>
                          <div className="dashboard-surface-command-step-copy">
                            <span className="dashboard-hero-flow-label">Saida</span>
                            <strong>confirma a entrega</strong>
                            <span>Publicacao, historico e saldo fecham o mesmo ciclo.</span>
                          </div>
                        </div>

                        <div className="dashboard-command-bridge dashboard-ecosystem-stage">
                          <div className="dashboard-surface-focus-lead-wrap dashboard-ecosystem-lead">
                            {loading ? (
                              <div className="dashboard-surface-focus-lead dashboard-surface-focus-skeleton">
                                <div className="premium-skeleton premium-skeleton-line" style={{ width: "24%" }} />
                                <div className="premium-skeleton premium-skeleton-line" style={{ width: "62%", marginTop: 18 }} />
                                <div className="premium-skeleton premium-skeleton-line" style={{ width: "48%", marginTop: 16 }} />
                              </div>
                            ) : featuredProjectDisplay ? (
                              <EditorRouteLink href={`/editor/${featuredProjectDisplay.id}`} className="dashboard-surface-focus-lead">
                                <div className="dashboard-stage-lead-topline">
                                  <span className="dashboard-stage-lead-kicker">Agora no fluxo</span>
                                  <span className="dashboard-stage-lead-pill">{featuredProjectDisplay.stageLabel}</span>
                                </div>
                                <strong className="dashboard-stage-lead-title">{featuredProjectDisplay.displayTitle}</strong>
                                <p className="dashboard-stage-lead-copy">{featuredProjectDisplay.narrative}</p>
                                <div className="dashboard-stage-lead-meta">
                                  <span>{featuredProjectDisplay.deliverableLabel}</span>
                                  <span>{featuredProjectDisplay.statusLabel}</span>
                                  {featuredProjectDisplay.reviewLabel ? <span>{featuredProjectDisplay.reviewLabel}</span> : null}
                                </div>
                                <div className="dashboard-stage-lead-footer">
                                  <span className="dashboard-stage-lead-note">{featuredProjectDisplay.kindLabel}</span>
                                  <span className="dashboard-stage-lead-action">Abrir projeto</span>
                                </div>
                              </EditorRouteLink>
                            ) : (
                              <div className="dashboard-surface-focus-lead dashboard-surface-focus-empty">
                                <span className="dashboard-stage-lead-kicker">Agora no fluxo</span>
                                <strong>A trilha ganha peso quando um Creator vira projeto real.</strong>
                                <p>
                                  Abra Creators, salve a primeira saída e use Projetos para continuar no editor
                                  sem recomeçar o fluxo.
                                </p>
                                <div className="dashboard-surface-focus-empty-actions">
                                  <Link href="/creators" className="btn-link-ea btn-primary btn-sm">
                                    Ir para Creators
                                  </Link>
                                  <EditorRouteLink href="/editor/new" className="btn-link-ea btn-ghost btn-sm">
                                    Criar projeto manual
                                  </EditorRouteLink>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="dashboard-ecosystem-state">
                            <div className="dashboard-surface-stat">
                              <span className="dashboard-stage-stat-label">Estado</span>
                              <strong>{focusContinuationLabel}</strong>
                              <span>{focusContinuationDetail}</span>
                            </div>
                            <div className="dashboard-surface-stat">
                              <span className="dashboard-stage-stat-label">Ritmo</span>
                              <strong>{continuityValue}</strong>
                              <span>{continuityDetail}</span>
                            </div>
                            <div className="dashboard-surface-stat dashboard-surface-stat-action">
                              <span className="dashboard-stage-stat-label">Movimento</span>
                              <strong>{nextActionTitleDisplay}</strong>
                              <span>{nextActionDescriptionDisplay}</span>
                              {nextAction.href.startsWith("/editor") ? (
                                <EditorRouteLink href={nextAction.href} className="dashboard-inline-action">
                                  {nextActionCtaDisplay}
                                </EditorRouteLink>
                              ) : (
                                <Link href={nextAction.href} className="dashboard-inline-action">
                                  {nextActionCtaDisplay}
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </header>

                  <section className="dashboard-surface-ecosystem dashboard-operating-ecosystem" data-reveal data-reveal-delay="140">
                        {loading ? (
                          <div className="dashboard-ecosystem-ribbon">
                            {Array.from({ length: 3 }).map((_, index) => (
                              <div key={`project-skeleton-${index}`} className="dashboard-project-skeleton-row" />
                            ))}
                          </div>
                        ) : supportingProjectDisplay.length > 0 ? (
                          <div className="dashboard-ecosystem-ribbon">
                            {supportingProjectDisplay.map((project: any, index: number) => (
                              <EditorRouteLink
                                key={String(project.id || project.project_id || index)}
                                href={`/editor/${project.id}`}
                                className="dashboard-surface-ribbon-link"
                                data-reveal
                                data-reveal-delay={String(80 + index * 35)}
                              >
                                <div className="dashboard-surface-ribbon-copy">
                                  <span className="dashboard-stream-link-kicker">{project.deliverableLabel}</span>
                                  <strong className="dashboard-stream-link-title">{project.displayTitle}</strong>
                                  <span className="dashboard-stream-link-copy">{project.statusLabel}</span>
                                </div>
                                <span className="dashboard-stream-link-cta">{project.stageLabel}</span>
                              </EditorRouteLink>
                            ))}
                          </div>
                        ) : null}

                        <div className="dashboard-ecosystem-flow">
                          <div className="dashboard-surface-head-note dashboard-ecosystem-flow-note">
                            <strong>O workspace se move como um ciclo, não como atalhos soltos.</strong>
                            <span>Creators, editor, projetos e saída permanecem conectados ao mesmo contexto.</span>
                            <div className="dashboard-ecosystem-flow-note-links">
                              <Link href="/credits#credits-history" className="dashboard-stream-link-cta">
                                Histórico no fluxo
                              </Link>
                              <Link href="/support" className="dashboard-stream-link-cta">
                                Suporte acompanha
                              </Link>
                            </div>
                          </div>

                          <div className="dashboard-ecosystem-lanes">
                            {coreQuickLinks.map((item, index) =>
                              item.href.startsWith("/editor") ? (
                                <EditorRouteLink
                                  key={item.href}
                                  href={item.href}
                                  className="dashboard-ecosystem-lane"
                                  data-reveal
                                  data-reveal-delay={String(90 + index * 30)}
                                >
                                  <span className="dashboard-surface-step-index">{String(index + 1).padStart(2, "0")}</span>
                                  <div className="dashboard-surface-core-link-main">
                                    <span className="dashboard-stream-link-kicker">{item.tag}</span>
                                    <strong className="dashboard-stream-link-title">{item.title}</strong>
                                    <span className="dashboard-stream-link-copy">{item.description}</span>
                                  </div>
                                  <span className="dashboard-stream-link-cta">{item.cta}</span>
                                </EditorRouteLink>
                              ) : (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  className="dashboard-ecosystem-lane"
                                  data-reveal
                                  data-reveal-delay={String(90 + index * 30)}
                                >
                                  <span className="dashboard-surface-step-index">{String(index + 1).padStart(2, "0")}</span>
                                  <div className="dashboard-surface-core-link-main">
                                    <span className="dashboard-stream-link-kicker">{item.tag}</span>
                                    <strong className="dashboard-stream-link-title">{item.title}</strong>
                                    <span className="dashboard-stream-link-copy">{item.description}</span>
                                  </div>
                                  <span className="dashboard-stream-link-cta">{item.cta}</span>
                                </Link>
                              )
                            )}
                          </div>
                        </div>

                        <div className="dashboard-ecosystem-infrastructure">
                          <div className="dashboard-ecosystem-account-column">
                            <div className="dashboard-surface-wallet dashboard-ecosystem-wallet">
                              <div className="dashboard-surface-wallet-copy">
                                <span className="dashboard-stream-link-kicker">{CREATOR_COINS_PUBLIC_NAME}</span>
                                <strong className="dashboard-stream-link-title">{walletSummaryDisplay}</strong>
                                <span className="dashboard-stream-link-copy">
                                  O saldo acompanha a produção sem transformar o meio em painel financeiro.
                                </span>
                              </div>

                              <div className="dashboard-surface-wallet-breakdown">
                                {walletBreakdown.map((item) => (
                                  <div key={item.coinType} className="dashboard-wallet-row">
                                    <div className="dashboard-wallet-row-main">
                                      <strong>{coinTypeLabel(item.coinType)}</strong>
                                      <span>{item.description}</span>
                                    </div>
                                    <span className="dashboard-wallet-row-value">{item.amount.toLocaleString("pt-BR")}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="dashboard-ecosystem-continuity-column">
                            <div className="dashboard-continuity-ledger dashboard-surface-usage dashboard-ecosystem-ledger">
                              <div className="dashboard-surface-usage-grid">
                                <div className="dashboard-surface-usage-copy">
                                  <div className="dashboard-surface-usage-hero dashboard-surface-usage-strip">
                                    <div className="dashboard-surface-usage-hero-main">
                                      <span className="dashboard-stage-stat-label">Historico</span>
                                      <strong>{totalUsageDisplay}</strong>
                                    </div>
                                    <p>{usageLeadInsight}</p>
                                    <Link href="/credits#credits-history" className="dashboard-stream-link-cta dashboard-surface-usage-inline-cta">
                                      Histórico completo
                                    </Link>
                                  </div>

                                  <div className="dashboard-surface-usage-signals">
                                    {usageSignalItems.map((item) => (
                                      <div key={item.label} className="dashboard-surface-usage-signal">
                                        <span className="dashboard-stage-stat-label">{item.label}</span>
                                        <strong>{item.value}</strong>
                                        <span>{item.note}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="dashboard-surface-usage-list">
                                  {loading || usageLoading ? (
                                    <div className="dashboard-surface-usage-cards">
                                      {Array.from({ length: 6 }).map((_, index) => (
                                        <div key={`usage-skeleton-${index}`} className="dashboard-surface-usage-card-skeleton">
                                          <div className="premium-skeleton premium-skeleton-line" style={{ width: "42%" }} />
                                          <div className="premium-skeleton premium-skeleton-line" style={{ width: "26%" }} />
                                        </div>
                                      ))}
                                    </div>
                                  ) : usageEmptyState ? (
                                    <div className="dashboard-surface-usage-empty">
                                      <div className="dashboard-surface-usage-empty-story">
                                        <div className="dashboard-surface-usage-empty-copy">
                                          <span className="dashboard-stage-stat-label">{usageEmptyState.kicker}</span>
                                          <strong>{usageEmptyState.title}</strong>
                                          <span>{usageEmptyState.description}</span>
                                        </div>
                                        <div className="dashboard-surface-usage-empty-actions">
                                          <Link href={usageEmptyState.primaryHref} className="btn-link-ea btn-primary btn-sm">
                                            {usageEmptyState.primaryLabel}
                                          </Link>
                                          <Link href={usageEmptyState.secondaryHref} className="btn-link-ea btn-ghost btn-sm">
                                            {usageEmptyState.secondaryLabel}
                                          </Link>
                                        </div>
                                      </div>

                                      <div className="dashboard-surface-usage-route">
                                        {USAGE_FLOW_MARKERS.map((item, index) => (
                                          <div key={item.title} className="dashboard-surface-usage-route-step">
                                            <span className="dashboard-surface-usage-route-index">{String(index + 1).padStart(2, "0")}</span>
                                            <div className="dashboard-surface-usage-route-copy">
                                              <strong>{item.title}</strong>
                                              <span>{item.description}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="dashboard-surface-usage-cards">
                                        {usageDisplayItems.map((item, index) => {
                                          const progress = usageProgress(item);
                                          return (
                                            <article
                                              key={item.feature}
                                              className="dashboard-surface-usage-card"
                                            >
                                              <div className="dashboard-surface-usage-card-copy">
                                                <span className="dashboard-stage-stat-label">
                                                  {index === 0 ? "Feature líder" : "Uso confirmado"}
                                                </span>
                                                <strong className="dashboard-stream-link-title">{item.displayLabel}</strong>
                                                <span className="dashboard-stream-link-copy">{item.used}/{item.limit} neste ciclo.</span>
                                              </div>
                                              <div className="dashboard-surface-usage-meter">
                                                <strong>{item.used}/{item.limit}</strong>
                                                <div className="dashboard-progress-track">
                                                  <div className="dashboard-progress-bar" style={{ width: `${progress}%` }} />
                                                </div>
                                              </div>
                                            </article>
                                          );
                                        })}
                                      </div>
                                      {usageRemainingCount > 0 ? (
                                        <div className="dashboard-surface-usage-footnote">
                                          +{usageRemainingCount} no histórico completo.
                                        </div>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="dashboard-ecosystem-route-column">
                              <ApprovedBetaOnboardingCard email={email} wallet={wallet} loading={loading} />

                              <div className="dashboard-ecosystem-support-links">
                                {[...railPrimaryQuickLinks, ...railSecondaryQuickLinks].map((item, index) => (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    className="dashboard-ecosystem-support-link"
                                    data-reveal
                                    data-reveal-delay={String(120 + index * 25)}
                                  >
                                    <div className="dashboard-surface-command-link-main">
                                      <span className="dashboard-stream-link-kicker">{item.tag}</span>
                                      <strong className="dashboard-stream-link-title">{item.title}</strong>
                                      <span className="dashboard-stream-link-copy">{item.description}</span>
                                    </div>
                                    <span className="dashboard-stream-link-cta">{item.cta}</span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>

                  {error || usageError ? (
                    <div className="dashboard-status-stack dashboard-surface-inline-status">
                  {error ? (
                    <div className="state-ea state-ea-error">
                      <p className="state-ea-title">Não foi possível carregar painel, plano e saldo agora</p>
                      <div className="state-ea-text">{toUserFacingError(error, "Atualize a página e tente novamente.")}</div>
                      <div className="state-ea-actions">
                        <button onClick={refresh} className="btn-ea btn-secondary btn-sm">
                          Atualizar dashboard
                        </button>
                        <Link href="/support" className="btn-link-ea btn-ghost btn-sm">
                          Pedir ajuda
                        </Link>
                      </div>
                    </div>
                  ) : null}

                  {usageError ? (
                    <div className="dashboard-surface-inline-warning" role="status" aria-live="polite">
                      <div className="dashboard-surface-inline-warning-copy">
                        <span className="dashboard-stage-stat-label">Uso do período indisponível</span>
                        <strong>As métricas não responderam agora.</strong>
                        <span>{toUserFacingError(usageError, "Atualize as métricas para tentar novamente.")}</span>
                      </div>
                      <button onClick={loadUsage} className="btn-ea btn-secondary btn-sm">
                        Atualizar uso
                      </button>
                    </div>
                  ) : null}
                    </div>
                  ) : null}

                </section>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

