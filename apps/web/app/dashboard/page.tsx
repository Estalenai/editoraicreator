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
  const supportingProjects = useMemo(
    () => recentProjects.slice(featuredProject ? 1 : 0, 5),
    [recentProjects, featuredProject]
  );
  const usagePreviewItems = useMemo(() => usageItems.slice(0, 8), [usageItems]);
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
    : leadProject
      ? `${leadProject.summary.continuityStatusLabel} • ${leadProject.title}`
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
      <section className="premium-hero dashboard-hero surface-flow-hero dashboard-hero-flat" data-reveal>
        <div className="dashboard-hero-main dashboard-hero-main-flat">
          <div className="hero-copy dashboard-hero-copy-flat">
            <div className="hero-title-stack">
              <p className="section-kicker">Painel executivo</p>
              <h1 className="heading-reset">Dashboard</h1>
              <p className="section-header-copy hero-copy-compact">
                Orientação, continuidade e operação entram na mesma leitura. Conta: {emailDisplay}.
              </p>
            </div>
            <div className="hero-meta-row">
              <span className="premium-badge premium-badge-phase">Plano: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-warning">
                {loading ? "Conta em sincronização" : "Histórico confirmado no backend"}
              </span>
            </div>
          </div>
          <div className="hero-actions-row dashboard-hero-actions dashboard-hero-actions-flat">
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

        <div className="dashboard-hero-flow" data-reveal data-reveal-delay="55">
          <div className="dashboard-hero-flow-node">
            <span className="dashboard-hero-flow-label">Creators</span>
            <strong>gera a base</strong>
            <span>Abra Post, Scripts ou Clips com contexto pronto.</span>
          </div>
          <div className="dashboard-hero-flow-node">
            <span className="dashboard-hero-flow-label">Editor</span>
            <strong>lapida no mesmo núcleo</strong>
            <span>Revise, consolide e preserve a continuidade.</span>
          </div>
          <div className="dashboard-hero-flow-node">
            <span className="dashboard-hero-flow-label">Projetos + saída</span>
            <strong>registra e publica</strong>
            <span>O que foi salvo e entregue continua na mesma trilha.</span>
          </div>
        </div>

        <div className="dashboard-overview-strip" data-reveal data-reveal-delay="90">
          <div className="dashboard-overview-item">
            <span className="dashboard-overview-label">Conta</span>
            <strong>{planLabelDisplay}</strong>
            <span>{emailDisplay}</span>
          </div>
          <div className="dashboard-overview-item">
            <span className="dashboard-overview-label">{CREATOR_COINS_PUBLIC_NAME}</span>
            <strong>{walletSummaryDisplay}</strong>
            <span>Estimativa antes, histórico depois.</span>
          </div>
          <div className="dashboard-overview-item">
            <span className="dashboard-overview-label">Continuidade</span>
            <strong>{continuityValue}</strong>
            <span>{continuityDetail}</span>
          </div>
          <div className="dashboard-overview-item dashboard-overview-item-action">
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
            <div className="state-ea state-ea-warning">
              <p className="state-ea-title">Uso do período indisponível no momento</p>
              <div className="state-ea-text">{toUserFacingError(usageError, "Atualize as métricas para tentar novamente.")}</div>
              <div className="state-ea-actions">
                <button onClick={loadUsage} className="btn-ea btn-secondary btn-sm">
                  Atualizar uso
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="dashboard-workspace-shell dashboard-workspace-shell-flat" data-reveal data-reveal-delay="135">
        <div className="dashboard-workspace-grid dashboard-workspace-grid-flat">
          <div className="dashboard-workspace-main dashboard-workspace-main-flat">
            <section className="dashboard-stage-feature dashboard-region-wash dashboard-region-wash-strong" data-reveal data-reveal-delay="150">
              <div className="section-head dashboard-stage-feature-head">
                <div className="section-header-ea">
                  <p className="section-kicker">Continuidade viva</p>
                  <h3 className="heading-reset">Projetos recentes</h3>
                  <p className="helper-text-ea">Uma região forte para retomada, status atual e próximo avanço.</p>
                </div>
                <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">Abrir projetos</Link>
              </div>

              <div className="dashboard-stage-feature-layout">
                <div className="dashboard-stage-lead">
                  {loading ? (
                    <div className="dashboard-stage-lead-skeleton">
                      <div className="premium-skeleton premium-skeleton-line" style={{ width: "28%" }} />
                      <div className="premium-skeleton premium-skeleton-line" style={{ width: "72%", marginTop: 12 }} />
                      <div className="premium-skeleton premium-skeleton-line" style={{ width: "54%", marginTop: 14 }} />
                    </div>
                  ) : featuredProject ? (
                    <EditorRouteLink href={`/editor/${featuredProject.id}`} className="dashboard-stage-lead-link">
                      <span className="dashboard-stage-lead-kicker">{featuredProject.kind}</span>
                      <strong className="dashboard-stage-lead-title">{featuredProject.title}</strong>
                      <span className="dashboard-stage-lead-status">
                        {featuredProject.summary.continuityStatusLabel} • {featuredProject.summary.deliverable.label}
                      </span>
                      <p className="dashboard-stage-lead-copy">
                        Use este projeto como eixo do dashboard: retomada no editor, continuidade em projetos e saída no mesmo ciclo.
                      </p>
                      <span className="dashboard-stage-lead-action">Abrir projeto</span>
                    </EditorRouteLink>
                  ) : (
                    <div className="state-ea state-ea-spaced">
                      <p className="state-ea-title">Nenhum projeto criado ainda</p>
                      <div className="state-ea-text">
                        Gere algo em Creators e salve em Projetos para continuar no editor.
                      </div>
                      <div className="state-ea-actions">
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

                <div className="dashboard-stage-side">
                  <div className="dashboard-stage-stat">
                    <span className="dashboard-stage-stat-label">Projetos ativos</span>
                    <strong>{continuityValue}</strong>
                    <span>{continuityDetail}</span>
                  </div>
                  <div className="dashboard-stage-stat">
                    <span className="dashboard-stage-stat-label">{CREATOR_COINS_PUBLIC_NAME}</span>
                    <strong>{walletSummaryDisplay}</strong>
                    <span>Saldo confirmado e histórico reconciliado.</span>
                  </div>
                  <div className="dashboard-stage-stat dashboard-stage-stat-action">
                    <span className="dashboard-stage-stat-label">Próximo passo</span>
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
                <div className="dashboard-stage-project-grid">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={`project-skeleton-${index}`} className="dashboard-project-skeleton-row" />
                  ))}
                </div>
              ) : supportingProjects.length > 0 ? (
                <div className="dashboard-stage-project-grid">
                  {supportingProjects.map((project: any, index: number) => (
                    <EditorRouteLink
                      key={String(project.id || project.project_id || index)}
                      href={`/editor/${project.id}`}
                      className="dashboard-stream-link dashboard-stream-link-project"
                      data-reveal
                      data-reveal-delay={String(80 + index * 35)}
                    >
                      <div className="dashboard-stream-link-main">
                        <span className="dashboard-stream-link-kicker">{project.kind}</span>
                        <strong className="dashboard-stream-link-title">{project.title}</strong>
                        <span className="dashboard-stream-link-copy">{project.summary.continuityStatusLabel}</span>
                      </div>
                      <span className="dashboard-stream-link-cta">{project.summary.deliverable.label}</span>
                    </EditorRouteLink>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="dashboard-main-detail-region dashboard-region-wash" data-reveal data-reveal-delay="210">
              <div className="dashboard-main-detail-grid">
                <section className="dashboard-flow-section dashboard-flow-section-core">
                  <div className="section-head dashboard-section-head-flat">
                    <div className="section-header-ea">
                      <p className="section-kicker">Centro da experiência</p>
                      <h3 className="heading-reset">Fluxo principal</h3>
                      <p className="helper-text-ea">Geração, revisão, continuidade e saída em leitura rápida.</p>
                    </div>
                  </div>
                  <div className="dashboard-core-stream dashboard-core-stream-grid">
                    {coreQuickLinks.map((item, index) =>
                      item.href.startsWith("/editor") ? (
                        <EditorRouteLink
                          key={item.href}
                          href={item.href}
                          className="dashboard-stream-link dashboard-stream-link-core"
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
                          className="dashboard-stream-link dashboard-stream-link-core"
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

                <section className="dashboard-flow-section dashboard-flow-section-usage">
                  <div className="section-head dashboard-section-head-flat">
                    <div className="section-header-ea">
                      <p className="section-kicker">Uso recente</p>
                      <h3 className="heading-reset">Uso por feature</h3>
                      <p className="helper-text-ea">{recentUsageText}</p>
                    </div>
                    <Link href="/credits#credits-history" className="btn-link-ea btn-ghost btn-sm">
                      Ver histórico
                    </Link>
                  </div>
                  {loading || usageLoading ? (
                    <div className="dashboard-usage-grid">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={`usage-skeleton-${index}`} className="dashboard-usage-row-skeleton">
                          <div className="premium-skeleton premium-skeleton-line" style={{ width: "42%" }} />
                          <div className="premium-skeleton premium-skeleton-line" style={{ width: "26%" }} />
                        </div>
                      ))}
                    </div>
                  ) : usagePreviewItems.length === 0 ? (
                    <div className="state-ea">
                      <p className="state-ea-title">Sem uso registrado neste mês</p>
                      <div className="state-ea-text">
                        Quando você gerar conteúdo, o consumo aparece aqui e no histórico de {CREATOR_COINS_PUBLIC_NAME}.
                      </div>
                      <div className="state-ea-actions">
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
                      <div className="dashboard-usage-summary-line">
                        <strong>{totalUsageDisplay}</strong>
                        <span>consumos confirmados no período atual.</span>
                      </div>
                      <div className="dashboard-usage-grid">
                        {usagePreviewItems.map((item) => {
                          const progress = usageProgress(item);
                          return (
                            <div key={item.feature} className="dashboard-usage-row">
                              <div className="dashboard-usage-row-main">
                                <span className="dashboard-stream-link-title">{item.feature}</span>
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
                    </>
                  )}
                </section>
              </div>
            </section>
          </div>

          <aside className="dashboard-workspace-rail dashboard-workspace-rail-flat">
            <section className="dashboard-flow-section dashboard-flow-section-operations dashboard-operations-region dashboard-region-wash dashboard-region-wash-quiet" data-reveal data-reveal-delay="170">
              <div className="section-head dashboard-section-head-flat">
                <div className="section-header-ea">
                  <p className="section-kicker">Operação em apoio</p>
                  <h3 className="heading-reset">Conta, saldo e suporte</h3>
                  <p className="helper-text-ea">Rail secundária com densidade útil, não painel lateral isolado.</p>
                </div>
                <Link href="/credits#credits-history" className="btn-link-ea btn-ghost btn-sm">
                  Ver histórico completo
                </Link>
              </div>

              <div className="dashboard-wallet-summary">
                <div className="dashboard-wallet-summary-copy">
                  <span className="dashboard-stream-link-kicker">{CREATOR_COINS_PUBLIC_NAME}</span>
                  <strong className="dashboard-stream-link-title">{walletSummaryDisplay}</strong>
                  <span className="dashboard-stream-link-copy">
                    O creator mostra a estimativa antes e o histórico confirma depois.
                  </span>
                </div>
              </div>

              <div className="dashboard-wallet-breakdown">
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

              <div className="dashboard-flow-divider dashboard-flow-divider-compact" aria-hidden="true" />

              <div className="dashboard-support-stream">
                {supportQuickLinks.map((item, index) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="dashboard-stream-link dashboard-stream-link-support"
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
