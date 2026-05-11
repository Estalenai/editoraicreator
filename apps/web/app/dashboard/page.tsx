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

const CREDIT_GUIDE_ITEMS = [
  {
    coinType: "common" as const,
    title: "Comum",
    description: "Rotina.",
  },
  {
    coinType: "pro" as const,
    title: "Pro",
    description: "Qualidade.",
  },
  {
    coinType: "ultra" as const,
    title: "Ultra",
    description: "Premium.",
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
  const hasConfirmedUsage = totalUsage > 0;
  const usageLeadInsight =
    loading || usageLoading
      ? "Sincronizando ciclo."
      : hasConfirmedUsage && usageDisplayItems[0]
        ? `${usageDisplayItems[0].displayLabel} lidera.`
        : "Entrega em aberto.";
  const nextAction = recentProjects.length > 0
      ? {
        title: "Retomar projeto",
        description: "Continue no editor.",
        href: recentProjects[0]?.id ? `/editor/${recentProjects[0].id}` : "/projects",
        cta: recentProjects[0]?.id ? "Abrir último projeto" : "Abrir projetos",
      }
    : {
        title: "Primeira entrega",
        description: "Abrir Creator.",
        href: "/creators",
        cta: "Abrir Creators",
      };
  const recentUsageText = usageLoading
    ? "Atualizando ciclo."
    : usageItems.length === 0
      ? "Sem uso."
      : `${usageItems.length} recurso(s) • ${totalUsage} uso(s).`;
  const planLabelDisplay = loading ? "Plano em sincronização" : planLabel ?? "—";
  const emailDisplay = loading ? "Sincronizando conta..." : email || "—";
  const walletSummaryDisplay = loading ? "Saldo em sincronização" : walletSummary;
  const totalUsageDisplay = loading || usageLoading ? "Uso em sincronização" : totalUsage.toLocaleString("pt-BR");
  const nextActionTitleDisplay = loading ? "Preparando seu próximo passo" : nextAction.title;
  const nextActionCtaDisplay = loading ? "Aguarde a sincronização" : nextAction.cta;
  const nextActionDescriptionDisplay = loading
    ? "Sincronizando workspace."
    : nextAction.description;
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
  const studioFlowNodes = QUICK_LINKS.filter((item) => item.group === "core").map((item, index) => ({
    ...item,
    index: String(index + 1).padStart(2, "0"),
    cue:
      index === 0
        ? "Entrada"
        : index === 1
          ? "Revisão"
          : index === 2
            ? "Retorno"
            : "Entrega",
    status:
      index === 0
        ? "Entrada"
        : index === 1
          ? "Revisão"
          : index === 2
            ? continuityValue
            : focusContinuationLabel,
  }));
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
    <div className="page-shell dashboard-surface-page dashboard-operating-page dashboard-studio-page" data-dashboard-contract="studio-canvas" data-dashboard-composition="ecosystem-field">
      <div className="dashboard-surface-canvas dashboard-operating-canvas dashboard-studio-canvas dashboard-ecosystem-field">
        <section className="dashboard-surface-stage dashboard-operating-stage dashboard-studio-stage" data-reveal>
          <div className="dashboard-surface-stage-grid">
            <div className="dashboard-surface-stage-main">
              <div className="dashboard-surface-flow dashboard-operating-flow">
                <section className="dashboard-operating-grid dashboard-studio-grid" aria-label="Creator Operating Studio do Editor AI Creator">
                  <header className="dashboard-surface-hero dashboard-operating-command dashboard-studio-hero" data-reveal data-reveal-delay="35">
                    <div className="dashboard-surface-command dashboard-unified-command" data-reveal data-reveal-delay="70">
                      <div className="dashboard-unified-field dashboard-field-thread">
                        <div className="dashboard-unified-context" aria-label="Sinais do Creator Operating Studio">
                          <div className="dashboard-unified-mark">
                            <p className="section-kicker">Creator Operating Studio</p>
                            <h1 className="heading-reset">
                              <span>Studio</span>
                              <span>Canvas</span>
                            </h1>
                            <p className="section-header-copy hero-copy-compact">
                              Produto vivo, projeto e saída no mesmo campo.
                            </p>
                            <div className="hero-meta-row dashboard-unified-badges">
                              <span className="premium-badge dashboard-operating-badge">Plano: {planLabelDisplay}</span>
                              <span className="premium-badge premium-badge-warning">
                                {loading ? "Conta em sincronizacao" : "Historico confirmado no backend"}
                              </span>
                            </div>
                          </div>

                          <div className="dashboard-unified-intent">
                            <span className="dashboard-hero-flow-label">Produto vivo</span>
                            <strong>Entrega ativa.</strong>
                            <div className="dashboard-studio-hero-metadata" aria-label="Camadas visuais do estúdio">
                              <span>Projeto</span>
                              <span>Revisão</span>
                              <span>Saída</span>
                              <span>Capacidade</span>
                            </div>
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
                          </div>

                          <div className="dashboard-unified-signals">
                            <div className="dashboard-unified-signal">
                              <span className="dashboard-overview-label">{CREATOR_COINS_PUBLIC_NAME}</span>
                              <strong>{walletSummaryDisplay}</strong>
                              <span>Capacidade ativa.</span>
                            </div>
                            <div className="dashboard-unified-signal">
                              <span className="dashboard-overview-label">Continuidade</span>
                              <strong>{continuityValue}</strong>
                              <span>{continuityDetail}</span>
                            </div>
                            <div className="dashboard-unified-signal dashboard-unified-next">
                              <span className="dashboard-overview-label">Proximo movimento</span>
                              <strong>{nextActionTitleDisplay}</strong>
                              <span>{nextActionDescriptionDisplay}</span>
                              <span className="dashboard-unified-action-cue">{nextActionCtaDisplay}</span>
                            </div>
                            <div className="dashboard-unified-actions" aria-label="Ações da conta">
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
                          </div>
                        </div>

                        <div className="dashboard-surface-command-sequence dashboard-studio-orbit dashboard-field-map dashboard-unified-artifact">
                        <div className="dashboard-command-bridge dashboard-ecosystem-stage dashboard-studio-artifact dashboard-field-surface">
                          <div className="dashboard-studio-artifact-thread" aria-label="Fluxo acoplado ao artefato">
                            {studioFlowNodes.map((flowNode) => {
                              const node = (
                                <>
                                  <span className="dashboard-surface-step-index">{flowNode.index}</span>
                                  <span className="dashboard-studio-node-status">{flowNode.status}</span>
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
                            <div className="dashboard-studio-preview-topbar" aria-label="Camadas do artefato">
                              <span>Prompt</span>
                              <span>IA</span>
                              <span>Revisão</span>
                              <span>Saída</span>
                            </div>

                            <div className="dashboard-studio-preview-canvas">
                              <div className="dashboard-studio-preview-beam" aria-hidden="true" />
                              <div className="dashboard-studio-signature-field" aria-hidden="true">
                                <span className="dashboard-studio-signature-node dashboard-studio-signature-node-a" />
                                <span className="dashboard-studio-signature-node dashboard-studio-signature-node-b" />
                                <span className="dashboard-studio-signature-thread dashboard-studio-signature-thread-a" />
                                <span className="dashboard-studio-signature-thread dashboard-studio-signature-thread-b" />
                              </div>
                              <div className="dashboard-studio-demo-prompt" aria-label="Entrada ativa do estúdio">
                                <span className="dashboard-stage-stat-label">Entrada ativa</span>
                                <strong>
                                  {featuredProjectDisplay
                                    ? featuredProjectDisplay.displayTitle
                                    : "Criar primeira entrega"}
                                </strong>
                                <span className="dashboard-studio-demo-frequency">Studio field</span>
                                <span>
                                  {featuredProjectDisplay
                                    ? `${featuredProjectDisplay.deliverableLabel} em ${featuredProjectDisplay.statusLabel.toLowerCase()}.`
                                    : "Brief, contexto e saída conectados."}
                                </span>
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
                                    <span className="dashboard-stage-lead-kicker">Artefato ativo</span>
                                    <span className="dashboard-stage-lead-pill">{featuredProjectDisplay.stageLabel}</span>
                                  </div>
                                  <strong className="dashboard-stage-lead-title">{featuredProjectDisplay.displayTitle}</strong>
                                  <p className="dashboard-stage-lead-copy">{featuredProjectDisplay.deliverableLabel} em continuidade.</p>
                                  <div className="dashboard-stage-lead-meta">
                                    <span>{featuredProjectDisplay.deliverableLabel}</span>
                                    <span>{featuredProjectDisplay.statusLabel}</span>
                                    {featuredProjectDisplay.reviewLabel ? <span>{featuredProjectDisplay.reviewLabel}</span> : null}
                                  </div>
                                  <div className="dashboard-stage-lead-footer">
                                    <span className="dashboard-stage-lead-note">{featuredProjectDisplay.kindLabel}</span>
                                    <span className="dashboard-stage-lead-action">Abrir no editor</span>
                                  </div>
                                </EditorRouteLink>
                              ) : (
                                <div className="dashboard-surface-focus-lead dashboard-surface-focus-empty dashboard-studio-preview-brief">
                                  <span className="dashboard-stage-lead-kicker">Artefato inicial</span>
                                  <strong>Primeira entrega.</strong>
                                  <p>Brief, Creator e saída no mesmo canvas.</p>
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

                              <div className="dashboard-studio-demo-review" aria-label="Camada de revisão do estúdio">
                                <span>
                                  <strong>Creator</strong>
                                  <em>{featuredProjectDisplay ? "Base preservada" : "Entrada pronta"}</em>
                                </span>
                                <span>
                                  <strong>Editor</strong>
                                  <em>{featuredProjectDisplay?.reviewLabel || "Revisão aplicável"}</em>
                                </span>
                                <span>
                                  <strong>Projeto</strong>
                                  <em>{continuityValue}</em>
                                </span>
                              </div>

                              <div className="dashboard-studio-preview-output" aria-label="Preview da entrega do estúdio">
                                <div className="dashboard-studio-output-frame">
                                  <span className="dashboard-studio-output-pulse" />
                                  <div>
                                    <span className="dashboard-stage-stat-label">Preview</span>
                                    <strong>{featuredProjectDisplay?.deliverableLabel || "Primeira entrega"}</strong>
                                  </div>
                                </div>
                                <div className="dashboard-studio-output-strips" aria-hidden="true">
                                  <span />
                                  <span />
                                  <span />
                                </div>
                                <div className="dashboard-studio-output-proof">
                                  <span>{featuredProjectDisplay?.statusLabel || "Canvas pronto"}</span>
                                  <span>{focusContinuationLabel}</span>
                                </div>
                              </div>

                              <div className="dashboard-studio-preview-stream" aria-label="Estado do fluxo criativo">
                                <span>Prompt sincronizado</span>
                                <span>IA em contexto</span>
                                <span>{walletSummaryDisplay}</span>
                                <span>{focusContinuationLabel}</span>
                              </div>
                            </div>
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

                          <div className="dashboard-context-dock dashboard-field-thread" aria-label="Sinais contextuais do estúdio">
                            <Link
                              href="/credits"
                              className="dashboard-context-signal dashboard-context-capacity dashboard-field-signal"
                            >
                              <span className="dashboard-stream-link-kicker">{CREATOR_COINS_PUBLIC_NAME}</span>
                              <strong>{walletSummaryDisplay}</strong>
                              <span className="dashboard-context-energy-meter" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                              </span>
                              <span>Energia acoplada ao ciclo.</span>
                              <span className="dashboard-context-chipline" aria-label="Saldos por camada">
                                {walletBreakdown.map((item) => (
                                  <span key={item.coinType}>
                                    {coinTypeLabel(item.coinType)} {item.amount.toLocaleString("pt-BR")}
                                  </span>
                                ))}
                              </span>
                            </Link>

                            <Link
                              href="/credits#credits-history"
                              className="dashboard-context-signal dashboard-context-log dashboard-field-signal"
                            >
                              <span className="dashboard-stream-link-kicker">Histórico</span>
                              <strong>{totalUsageDisplay}</strong>
                              <span className="dashboard-context-activity-pulse" aria-hidden="true" />
                              <span>{usageLeadInsight}</span>
                              <span className="dashboard-context-meta">{recentUsageText}</span>
                            </Link>

                            <div className="dashboard-context-signal dashboard-context-support dashboard-field-signal" aria-label="Infraestrutura do estúdio">
                              <span className="dashboard-context-support-orbit" aria-hidden="true" />
                              {supportQuickLinks.map((item) => (
                                <Link key={item.href} href={item.href} className="dashboard-context-support-link">
                                  <span>{item.tag}</span>
                                  <strong>{item.title}</strong>
                                </Link>
                              ))}
                            </div>

                            <ApprovedBetaOnboardingCard email={email} wallet={wallet} loading={loading} />
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                  </header>

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

