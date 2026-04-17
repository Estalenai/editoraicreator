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
      ? "Sincronizando as features mais usadas no período."
      : hasConfirmedUsage && usageDisplayItems[0]
        ? `${usageDisplayItems[0].displayLabel} puxa a atividade confirmada deste ciclo.`
        : `Quando uma entrega atravessar o fluxo completo, o consumo confirmado aparece aqui e no histórico de ${CREATOR_COINS_PUBLIC_NAME}.`;
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
  const recentUsageText = usageLoading
    ? "Atualizando métricas do mês."
    : usageItems.length === 0
      ? "Sem uso registrado neste mês."
      : `${usageItems.length} feature(s) ativas e ${totalUsage} consumo(s) no período.`;
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
    <div className="page-shell dashboard-page">
      <div className="dashboard-page-canvas">
      <section className="premium-hero dashboard-hero surface-flow-hero dashboard-command-stage dashboard-benchmark-hero" data-reveal>
        <div className="dashboard-command-header">
          <div className="hero-copy dashboard-command-intro">
            <div className="hero-title-stack">
              <p className="section-kicker">Painel executivo</p>
              <h1 className="heading-reset">Dashboard</h1>
              <p className="section-header-copy hero-copy-compact">
                O nucleo criativo, a continuidade dos projetos e a operacao em apoio entram na mesma
                superficie. Conta: {emailDisplay}.
              </p>
            </div>
            <div className="hero-meta-row dashboard-command-meta">
              <span className="premium-badge premium-badge-phase">Plano: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-warning">
                {loading ? "Conta em sincronização" : "Histórico confirmado no backend"}
              </span>
            </div>
          </div>
          <div className="hero-actions-row dashboard-command-actions">
            <button
              onClick={async () => {
                await onSyncSubscription();
                await refresh();
                await loadUsage();
              }}
              disabled={syncingSubscription || loading}
              className="btn-ea btn-secondary"
            >
              {syncingSubscription ? "Sincronizando..." : "Sincronizar assinatura"}
            </button>
            <button onClick={onLogout} className="btn-ea btn-ghost">
              Sair
            </button>
          </div>
        </div>

        <div className="dashboard-command-grid dashboard-benchmark-hero-grid" data-reveal data-reveal-delay="55">
          <div className="dashboard-benchmark-hero-main">
            <div className="dashboard-command-track dashboard-benchmark-hero-poster">
              <div className="dashboard-command-track-head">
                <span className="dashboard-hero-flow-label">Linha criativa</span>
                <strong>Creator, editor e saida ocupam o palco principal do produto.</strong>
                <p className="dashboard-command-track-copy">
                  O dashboard precisa abrir como superficie principal: criacao, refinamento,
                  continuidade e saida aparecem na primeira leitura, sem cara de painel tecnico.
                </p>
              </div>

              <div className="dashboard-benchmark-hero-sequence">
                <div className="dashboard-benchmark-step">
                  <span className="dashboard-benchmark-step-index">01</span>
                  <div className="dashboard-command-node-copy">
                    <span className="dashboard-hero-flow-label">Creators</span>
                    <strong>gera a base</strong>
                    <span>Abra Post, Scripts ou Clips com contexto pronto.</span>
                  </div>
                </div>
                <div className="dashboard-benchmark-step">
                  <span className="dashboard-benchmark-step-index">02</span>
                  <div className="dashboard-command-node-copy">
                    <span className="dashboard-hero-flow-label">Editor</span>
                    <strong>lapida o material</strong>
                    <span>Revise, consolide e preserve a continuidade.</span>
                  </div>
                </div>
                <div className="dashboard-benchmark-step">
                  <span className="dashboard-benchmark-step-index">03</span>
                  <div className="dashboard-command-node-copy">
                    <span className="dashboard-hero-flow-label">Projetos + saída</span>
                    <strong>fecha o ciclo</strong>
                    <span>O que foi salvo e entregue continua no mesmo eixo.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="dashboard-benchmark-hero-rail" data-reveal data-reveal-delay="90">
            <div className="dashboard-benchmark-hero-rail-row dashboard-benchmark-hero-rail-row-strong">
              <span className="dashboard-overview-label">Conta ativa</span>
              <strong>{planLabelDisplay}</strong>
              <span>{emailDisplay}</span>
            </div>

            <div className="dashboard-benchmark-hero-rail-split">
              <div className="dashboard-benchmark-hero-rail-row">
                <span className="dashboard-overview-label">{CREATOR_COINS_PUBLIC_NAME}</span>
                <strong>{walletSummaryDisplay}</strong>
                <span>Saldo confirmado e leitura financeira reconciliada.</span>
              </div>
              <div className="dashboard-benchmark-hero-rail-row">
                <span className="dashboard-overview-label">Continuidade</span>
                <strong>{continuityValue}</strong>
                <span>{continuityDetail}</span>
              </div>
            </div>

            <div className="dashboard-benchmark-hero-rail-row dashboard-benchmark-hero-rail-next">
              <span className="dashboard-overview-label">Próximo passo</span>
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
          </aside>
        </div>
      </section>

      {error || usageError ? (
        <div className="dashboard-status-stack">
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
            <div className="dashboard-benchmark-inline-warning" role="status" aria-live="polite">
              <div className="dashboard-benchmark-inline-warning-copy">
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

      <section className="dashboard-workspace-shell dashboard-workspace-shell-flat dashboard-benchmark-shell" data-reveal data-reveal-delay="135">
        <div className="dashboard-workspace-grid dashboard-workspace-grid-flat dashboard-benchmark-grid">
          <div className="dashboard-workspace-main dashboard-workspace-main-flat dashboard-benchmark-main">
            <section className="dashboard-stage-feature dashboard-stage-feature-premium dashboard-benchmark-focus-section" data-reveal data-reveal-delay="150">
              <div className="dashboard-stage-shell dashboard-stage-shell-benchmark">
                <div className="section-head dashboard-stage-feature-head dashboard-benchmark-focus-head">
                  <div className="section-header-ea">
                    <p className="section-kicker">Continuidade viva</p>
                    <h3 className="heading-reset">Projeto em foco</h3>
                    <p className="helper-text-ea">
                      Uma retomada central: menos painel bruto e mais clareza sobre o que esta vivo agora.
                    </p>
                  </div>
                  <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">Abrir projetos</Link>
                </div>

                <div className="dashboard-benchmark-focus-grid">
                  <div className="dashboard-benchmark-focus-lead">
                    {loading ? (
                      <div className="dashboard-stage-lead-skeleton">
                        <div className="premium-skeleton premium-skeleton-line" style={{ width: "24%" }} />
                        <div className="premium-skeleton premium-skeleton-line" style={{ width: "62%", marginTop: 18 }} />
                        <div className="premium-skeleton premium-skeleton-line" style={{ width: "48%", marginTop: 16 }} />
                      </div>
                    ) : featuredProjectDisplay ? (
                      <EditorRouteLink href={`/editor/${featuredProjectDisplay.id}`} className="dashboard-benchmark-focus-link">
                        <div className="dashboard-stage-lead-topline">
                          <span className="dashboard-stage-lead-kicker">Projeto em foco</span>
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
                      <div className="dashboard-benchmark-focus-empty">
                        <span className="dashboard-stage-lead-kicker">Projeto em foco</span>
                        <strong>A trilha fica premium quando um Creator vira projeto de verdade.</strong>
                        <p>
                          Abra Creators, salve a primeira saída e use Projetos para continuar no editor
                          sem recomeçar o fluxo.
                        </p>
                        <div className="dashboard-benchmark-focus-empty-actions">
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

                  <div className="dashboard-benchmark-focus-side">
                    <div className="dashboard-benchmark-focus-kpi">
                      <span className="dashboard-stage-stat-label">Ritmo atual</span>
                      <strong>{continuityValue}</strong>
                      <span>{continuityDetail}</span>
                    </div>
                    <div className="dashboard-benchmark-focus-kpi">
                      <span className="dashboard-stage-stat-label">Saldo pronto</span>
                      <strong>{walletSummaryDisplay}</strong>
                      <span>Saldo confirmado e historico reconciliado.</span>
                    </div>
                    <div className="dashboard-benchmark-focus-kpi dashboard-benchmark-focus-kpi-action">
                      <span className="dashboard-stage-stat-label">Próximo movimento</span>
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

                {loading ? (
                  <div className="dashboard-benchmark-ribbon">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={`project-skeleton-${index}`} className="dashboard-project-skeleton-row" />
                    ))}
                  </div>
                ) : supportingProjectDisplay.length > 0 ? (
                  <div className="dashboard-benchmark-ribbon">
                    {supportingProjectDisplay.map((project: any, index: number) => (
                      <EditorRouteLink
                        key={String(project.id || project.project_id || index)}
                        href={`/editor/${project.id}`}
                        className="dashboard-benchmark-ribbon-link"
                        data-reveal
                        data-reveal-delay={String(80 + index * 35)}
                      >
                        <span className="dashboard-stream-link-kicker">{project.deliverableLabel}</span>
                        <strong className="dashboard-stream-link-title">{project.displayTitle}</strong>
                        <span className="dashboard-stream-link-copy">{project.statusLabel}</span>
                        <span className="dashboard-stream-link-cta">{project.stageLabel}</span>
                      </EditorRouteLink>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="dashboard-main-detail-region dashboard-detail-region-premium dashboard-benchmark-detail-region" data-reveal data-reveal-delay="210">
              <div className="dashboard-main-detail-grid dashboard-benchmark-detail-grid">
                <section className="dashboard-flow-section dashboard-flow-section-core dashboard-core-atlas dashboard-benchmark-core">
                  <div className="dashboard-core-atlas-head dashboard-benchmark-core-head">
                    <div className="section-header-ea">
                      <p className="section-kicker">Centro da experiência</p>
                      <h3 className="heading-reset">Núcleo em ação</h3>
                      <p className="helper-text-ea">
                        O centro da tela precisa orientar o fluxo inteiro em uma única leitura,
                        sem cair em grade utilitária ou catálogo de módulos.
                      </p>
                    </div>
                    <div className="dashboard-core-atlas-summary">
                      <span className="dashboard-stage-stat-label">Fluxo principal</span>
                      <strong>Creators, editor e saída seguem a mesma trilha principal.</strong>
                      <span>
                        Criação, revisão, continuidade e publicação aparecem como uma linha única,
                        com peso de produto principal em vez de módulos encaixados.
                      </span>
                    </div>
                  </div>
                  <div className="dashboard-core-stream dashboard-core-stream-grid dashboard-benchmark-core-grid">
                    {coreQuickLinks.map((item, index) =>
                      item.href.startsWith("/editor") ? (
                        <EditorRouteLink
                          key={item.href}
                          href={item.href}
                          className="dashboard-stream-link dashboard-stream-link-core dashboard-benchmark-core-link"
                          data-reveal
                          data-reveal-delay={String(90 + index * 30)}
                        >
                          <div className="dashboard-stream-link-main">
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
                          className="dashboard-stream-link dashboard-stream-link-core dashboard-benchmark-core-link"
                          data-reveal
                          data-reveal-delay={String(90 + index * 30)}
                        >
                          <div className="dashboard-stream-link-main">
                            <span className="dashboard-stream-link-kicker">{item.tag}</span>
                            <strong className="dashboard-stream-link-title">{item.title}</strong>
                            <span className="dashboard-stream-link-copy">{item.description}</span>
                          </div>
                          <span className="dashboard-stream-link-cta">{item.cta}</span>
                        </Link>
                      )
                    )}
                  </div>
                </section>

                <section className="dashboard-flow-section dashboard-flow-section-usage dashboard-usage-pane dashboard-benchmark-usage">
                  <div className="dashboard-usage-pane-grid dashboard-benchmark-usage-grid">
                    <div className="dashboard-usage-pane-copy dashboard-benchmark-usage-copy">
                      <div className="section-head dashboard-section-head-flat">
                        <div className="section-header-ea">
                          <p className="section-kicker">Uso recente</p>
                          <h3 className="heading-reset">Uso confirmado</h3>
                          <p className="helper-text-ea">{recentUsageText}</p>
                        </div>
                        <Link href="/credits#credits-history" className="btn-link-ea btn-ghost btn-sm">
                          Ver histórico
                        </Link>
                      </div>
                      <div className="dashboard-usage-hero dashboard-benchmark-usage-hero">
                        <div className="dashboard-usage-hero-main">
                          <span className="dashboard-stage-stat-label">Consumo confirmado</span>
                          <strong>{totalUsageDisplay}</strong>
                        </div>
                        <p>{usageLeadInsight}</p>
                      </div>
                    </div>

                    <div className="dashboard-usage-pane-list dashboard-benchmark-usage-list">
                      {loading || usageLoading ? (
                        <div className="dashboard-usage-grid">
                          {Array.from({ length: 6 }).map((_, index) => (
                            <div key={`usage-skeleton-${index}`} className="dashboard-usage-row-skeleton">
                              <div className="premium-skeleton premium-skeleton-line" style={{ width: "42%" }} />
                              <div className="premium-skeleton premium-skeleton-line" style={{ width: "26%" }} />
                            </div>
                          ))}
                        </div>
                      ) : !hasConfirmedUsage ? (
                        <div className="dashboard-usage-empty dashboard-benchmark-usage-empty">
                          <div className="dashboard-usage-empty-copy">
                            <span className="dashboard-stage-stat-label">Aguardando confirmações</span>
                            <strong>O histórico confirmado aparece quando a trilha fecha.</strong>
                            <span>
                              Quando creators, editor e saída completarem o mesmo ciclo, esta área
                              sai do provisório e passa a mostrar o consumo reconciliado.
                            </span>
                          </div>
                          <Link href="/creators" className="dashboard-inline-action">
                            Abrir Creators
                          </Link>
                        </div>
                      ) : usagePreviewItems.length === 0 ? (
                        <div className="dashboard-benchmark-usage-empty">
                          <div className="dashboard-usage-empty-copy">
                            <span className="dashboard-stage-stat-label">Sem uso confirmado</span>
                            <strong>O consumo aparece aqui assim que a primeira entrega fechar o ciclo.</strong>
                            <span>
                              Gere no creators, revise no editor e acompanhe o histórico completo em {CREATOR_COINS_PUBLIC_NAME}.
                            </span>
                          </div>
                          <div className="dashboard-benchmark-focus-empty-actions">
                            <Link href="/creators" className="btn-link-ea btn-primary btn-sm">
                              Gerar agora
                            </Link>
                            <Link href="/credits#credits-history" className="btn-link-ea btn-ghost btn-sm">
                              Ver histórico
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="dashboard-usage-grid">
                            {usageDisplayItems.map((item) => {
                              const progress = usageProgress(item);
                              return (
                                <div key={item.feature} className="dashboard-usage-row">
                                  <div className="dashboard-usage-row-main">
                                    <span className="dashboard-stream-link-title">{item.displayLabel}</span>
                                    <span className="dashboard-stream-link-copy">
                                      {item.used} de {item.limit} consumo(s) no período.
                                    </span>
                                  </div>
                                  <div className="dashboard-usage-row-meter">
                                    <strong>{item.used}/{item.limit}</strong>
                                    <div className="dashboard-progress-track">
                                      <div className="dashboard-progress-bar" style={{ width: `${progress}%` }} />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {usageRemainingCount > 0 ? (
                            <div className="dashboard-usage-footnote">
                              +{usageRemainingCount} feature(s) adicionais aparecem no histórico completo.
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </div>

          <aside className="dashboard-workspace-rail dashboard-workspace-rail-flat dashboard-benchmark-rail">
            <section className="dashboard-flow-section dashboard-flow-section-operations dashboard-operations-region dashboard-operations-region-premium dashboard-benchmark-ops" data-reveal data-reveal-delay="170">
              <div className="section-head dashboard-section-head-flat">
                <div className="section-header-ea">
                  <p className="section-kicker">Operação em apoio</p>
                  <h3 className="heading-reset">Conta, saldo e suporte</h3>
                  <p className="helper-text-ea">
                    A rail precisa agir como apoio nobre: leitura financeira, conta ativa e
                    comandos essenciais sem cara de lateral utilitária.
                  </p>
                </div>
                <Link href="/credits#credits-history" className="btn-link-ea btn-ghost btn-sm">
                  Ver histórico completo
                </Link>
              </div>

              <div className="dashboard-benchmark-ops-account">
                <span className="dashboard-stage-stat-label">Conta ativa</span>
                <strong>{planLabelDisplay}</strong>
                <span>{emailDisplay}</span>
              </div>

              <div className="dashboard-benchmark-ops-wallet">
                <div className="dashboard-wallet-summary-copy">
                  <span className="dashboard-stream-link-kicker">{CREATOR_COINS_PUBLIC_NAME}</span>
                  <strong className="dashboard-stream-link-title">{walletSummaryDisplay}</strong>
                  <span className="dashboard-stream-link-copy">
                    O creator estima antes. O histórico confirma depois. A rail segura essa leitura sem roubar o palco.
                  </span>
                </div>

                <div className="dashboard-wallet-breakdown dashboard-benchmark-wallet-breakdown">
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

              <div className="dashboard-flow-divider dashboard-flow-divider-compact" aria-hidden="true" />

              <div className="dashboard-ops-actions-head">
                <span className="dashboard-stage-stat-label">Comandos de apoio</span>
                <strong>Plano, suporte e leitura financeira sem cara de coluna auxiliar improvisada.</strong>
              </div>

              <div className="dashboard-support-stream dashboard-support-command-list dashboard-benchmark-rail-links">
                {supportQuickLinks.map((item, index) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="dashboard-stream-link dashboard-stream-link-support dashboard-stream-link-support-command"
                    data-reveal
                    data-reveal-delay={String(95 + index * 30)}
                  >
                    <div className="dashboard-stream-link-main">
                      <span className="dashboard-stream-link-kicker">{item.tag}</span>
                      <strong className="dashboard-stream-link-title">{item.title}</strong>
                      <span className="dashboard-stream-link-copy">{item.description}</span>
                    </div>
                    <span className="dashboard-stream-link-cta">{item.cta}</span>
                  </Link>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <ApprovedBetaOnboardingCard email={email} wallet={wallet} loading={loading} />
      </section>
      </div>
    </div>
  );
}
