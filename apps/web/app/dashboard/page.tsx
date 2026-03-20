"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { ApprovedBetaOnboardingCard } from "../../components/dashboard/ApprovedBetaOnboardingCard";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
import { api } from "../../lib/api";
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
    tag: "Workspace",
    title: "Creators",
    description: "Abra Creator Post, Scripts ou Clips com briefing, estimativa e continuidade para o editor.",
    cta: "Abrir workspace",
  },
  {
    href: "/projects",
    group: "core",
    tag: "Continuidade",
    title: "Projetos",
    description: "Retome entregas salvas e siga direto para o editor com contexto.",
    cta: "Ver projetos",
  },
  {
    href: "/editor/new",
    group: "core",
    tag: "Editor",
    title: "Novo projeto",
    description: "Entre direto no editor quando já souber o entregável principal e quiser abrir a mesa central de produção.",
    cta: "Abrir editor",
  },
  {
    href: "/credits",
    group: "support",
    tag: "Financeiro",
    title: "Créditos",
    description: "Acompanhe saldo, conversão e compra avulsa como camada operacional do beta.",
    cta: "Abrir créditos",
  },
  {
    href: "/plans",
    group: "support",
    tag: "Assinatura",
    title: "Planos",
    description: "Compare níveis, taxa de conversão e checkout com foco no plano principal do beta pago/controlado.",
    cta: "Revisar planos",
  },
  {
    href: "/support",
    group: "support",
    tag: "Suporte",
    title: "Suporte",
    description: "Acione ajuda assistida quando precisar de ativação ou orientação.",
    cta: "Falar com suporte",
  },
  {
    href: "/how-it-works",
    group: "support",
    tag: "Guia",
    title: "Como funciona",
    description: "Recapitule creators hero, editor, projetos e saída em poucos passos.",
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

function formatWalletSummary(wallet: any | null): string {
  if (!wallet) return "—";
  return `${wallet.common ?? 0} Comum • ${wallet.pro ?? 0} Pro • ${wallet.ultra ?? 0} Ultra`;
}

function usageProgress(item: UsageItem): number {
  if (!item.limit || item.limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((item.used / item.limit) * 100)));
}

export default function DashboardPage() {
  const {
    loading,
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
    if (!loading && !betaBlocked) {
      loadUsage();
    }
  }, [loading, betaBlocked, loadUsage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkoutState = String(new URLSearchParams(window.location.search).get("coins_package") || "").toLowerCase();
    if (checkoutState !== "success" && checkoutState !== "cancel") return;
    window.location.replace(`/credits?coins_package=${checkoutState}`);
  }, []);

  const recentProjects = useMemo(() => projects.slice(0, 6), [projects]);
  const walletSummary = useMemo(() => formatWalletSummary(wallet), [wallet]);
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
  const nextAction = recentProjects.length > 0
    ? {
        title: "Retomar projeto",
        description: "Continue do ponto em que parou no editor ou use Creators para gerar a próxima peça.",
        href: recentProjects[0]?.id ? `/editor/${recentProjects[0].id}` : "/projects",
        cta: recentProjects[0]?.id ? "Abrir último projeto" : "Abrir projetos",
      }
    : {
        title: "Gerar primeira entrega",
        description: "Abra um Creator, gere sua primeira saída e salve em Projetos para continuar com contexto.",
        href: "/creators",
        cta: "Abrir Creators",
      };
  const recentUsageText = usageLoading
    ? "Atualizando métricas do mês."
    : usageItems.length === 0
      ? "Sem uso registrado neste mês."
      : `${usageItems.length} feature(s) com atividade e ${totalUsage} consumo(s) registrados no período.`;
  const recentUsageValue = usageLoading ? "..." : totalUsage.toLocaleString("pt-BR");
  const recentUsageDetail = usageLoading
    ? "Atualizando o monitoramento do período."
    : usageItems.length === 0
      ? "Sem consumo registrado neste mês."
      : `${usageItems.length} feature(s) com atividade monitorada no período.`;
  const planLabelDisplay = loading ? "Plano em sincronização" : planLabel ?? "—";
  const emailDisplay = loading ? "Sincronizando conta..." : email || "—";
  const walletSummaryDisplay = loading ? "Saldo em sincronização" : walletSummary;
  const recentUsageValueDisplay = loading || usageLoading ? "Uso em sincronização" : recentUsageValue;
  const recentUsageDetailDisplay = loading ? "Sincronizando métricas, saldo e histórico recente." : recentUsageDetail;
  const nextActionTitleDisplay = loading ? "Preparando seu próximo passo" : nextAction.title;
  const nextActionCtaDisplay = loading ? "Aguarde a sincronização" : nextAction.cta;
  const nextActionDescriptionDisplay = loading
    ? "Estamos sincronizando saldo, plano, projetos e próximos passos do workspace."
    : nextAction.description;

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
      <section className="premium-hero dashboard-hero" data-reveal>
        <div className="hero-split">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Painel executivo</p>
              <h1 className="heading-reset">Dashboard</h1>
              <p className="section-header-copy hero-copy-compact">
                Plano, saldo, uso recente e saída organizada para leitura rápida. Conta ativa: {emailDisplay}.
              </p>
            </div>
            <div className="hero-meta-row">
              <span className="premium-badge premium-badge-phase">Plano: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-warning">{loading ? "Conta em sincronização" : "Histórico confirma o consumo real"}</span>
            </div>
            <div className="signal-strip dashboard-hero-signal-strip">
              <div className="signal-chip signal-chip-sober">
                <strong>Saldo e uso visíveis</strong>
                <span>Plano, créditos e atividade recente aparecem na mesma leitura.</span>
              </div>
              <div className="signal-chip signal-chip-sober">
                <strong>Próxima ação clara</strong>
                <span>Retome um projeto, refine no editor e avance para exportação sem perder contexto.</span>
              </div>
              <div className="signal-chip signal-chip-sober">
                <strong>Histórico confiável</strong>
                <span>Estimativa antes da ação e confirmação no consumo real.</span>
              </div>
            </div>
          </div>
          <div className="premium-card-soft hero-side-panel dashboard-hero-panel">
            <span className="plan-card-section-label">Operação</span>
            <div className="hero-side-list">
              <div className="hero-side-note">
                <strong>Núcleo do beta pago/controlado</strong>
                <span>Creators hero, editor e projetos concentram a maior parte do valor recorrente da plataforma hoje.</span>
              </div>
              <div className="hero-side-note">
                <strong>Operação rastreada</strong>
                <span>Conta, saldo, projetos e continuidade operacional ficam persistidos para retomar o trabalho com contexto.</span>
              </div>
              <div className="hero-side-note">
                <strong>Camadas de apoio</strong>
                <span>Plans, Credits e Support continuam visíveis, mas sem disputar o centro da experiência criativa.</span>
              </div>
            </div>
            <div className="hero-actions-row">
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
        </div>
        <div className="hero-kpi-grid hero-kpi-grid-compact">
          <div className="premium-card-soft hero-kpi" data-reveal data-reveal-delay="70">
            <span className="hero-kpi-label">Saldo total</span>
            <strong className="hero-kpi-value">{walletSummaryDisplay}</strong>
            <span className="helper-text-ea">{loading ? "Saldo e distribuição estão sendo sincronizados." : "Distribuição pronta para operação e conversão."}</span>
          </div>
          <div className="premium-card-soft hero-kpi" data-reveal data-reveal-delay="120">
            <span className="hero-kpi-label">Uso recente</span>
            <strong className="hero-kpi-value">{recentUsageValueDisplay}</strong>
            <span className="helper-text-ea">{recentUsageDetailDisplay}</span>
          </div>
          <div className="premium-card-soft hero-kpi" data-reveal data-reveal-delay="170">
            <span className="hero-kpi-label">Próxima decisão</span>
            <strong className="hero-kpi-value">{nextActionTitleDisplay}</strong>
            <span className="helper-text-ea">{nextActionCtaDisplay}</span>
          </div>
        </div>
      </section>

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

      <section className="summary-grid dashboard-summary-grid dashboard-summary-surface" data-reveal data-reveal-delay="60">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={`summary-skeleton-${index}`} className="premium-card executive-card">
              <div className="premium-skeleton premium-skeleton-line" style={{ width: "42%" }} />
              <div className="premium-skeleton premium-skeleton-line" style={{ width: "68%", marginTop: 10 }} />
              <div className="premium-skeleton premium-skeleton-line" style={{ width: "54%", marginTop: 18 }} />
            </div>
          ))
        ) : (
          <>
            <div className="premium-card executive-card dashboard-summary-card dashboard-summary-card-primary">
              <p className="executive-eyebrow">Saldo de créditos</p>
              <p className="executive-value metric-value-compact">{walletSummary}</p>
              <div className="dashboard-balance-stack">
                {walletBreakdown.map((item) => (
                  <div key={item.coinType} className="premium-card-soft dashboard-balance-chip">
                    <span className="helper-text-ea">
                      {coinTypeLabel(item.coinType)} • {item.description}
                    </span>
                    <strong>{item.amount}</strong>
                  </div>
                ))}
              </div>
              <Link href="/credits" className="card-cta-link">
                Comprar créditos
              </Link>
            </div>

            <Link href={nextAction.href} className="premium-card executive-card dashboard-summary-card dashboard-summary-card-action dashboard-summary-card-link">
              <p className="executive-eyebrow">Próxima ação</p>
              <p className="executive-value metric-value-compact">{nextActionTitleDisplay}</p>
              <p className="executive-detail">{nextActionDescriptionDisplay}</p>
              <span className="card-cta-link card-cta-link-inline">
                {nextActionCtaDisplay}
              </span>
            </Link>

            <div className="premium-card executive-card dashboard-summary-card dashboard-summary-card-secondary">
              <p className="executive-eyebrow">Plano atual</p>
              <p className="executive-value">{planLabel ?? "—"}</p>
              <p className="executive-detail">Revise assinatura, créditos incluídos, checkout e benefícios no catálogo.</p>
              <Link href="/plans" className="card-cta-link">
                Gerenciar planos
              </Link>
            </div>

            <div className="premium-card executive-card dashboard-summary-card dashboard-summary-card-monitor">
              <p className="executive-eyebrow">Uso recente</p>
              <p className="executive-value">{recentUsageValue}</p>
              <p className="executive-detail">{recentUsageText}</p>
              <Link href="/credits#credits-history" className="card-cta-link">
                Ver histórico do período
              </Link>
            </div>
          </>
        )}
      </section>

      <ApprovedBetaOnboardingCard email={email} wallet={wallet} loading={loading} />

      <section className="premium-card dashboard-section-card dashboard-flow-section dashboard-flow-section-start" data-reveal data-reveal-delay="120">
        <div className="section-head">
          <div className="section-header-ea">
            <h3 className="heading-reset">Transparência de consumo</h3>
            <p className="helper-text-ea">Estimativa antes da ação e confirmação no histórico.</p>
          </div>
          <Link href="/credits#credits-history" className="btn-link-ea btn-ghost btn-sm">
            Ver histórico completo
          </Link>
        </div>
        <div className="trust-grid dashboard-section-body">
          {CREDIT_GUIDE_ITEMS.map((item) => (
            <div key={item.coinType} className="premium-card-soft trust-note">
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </div>
          ))}
        </div>
        <div className="helper-text-ea">
          Os Creators mostram estimativas antes da geração. O consumo final fica registrado no histórico de créditos.
        </div>
      </section>

      <section className="premium-card dashboard-section-card dashboard-flow-section dashboard-flow-section-middle" data-reveal data-reveal-delay="150">
        <div className="section-head">
          <div className="section-header-ea">
            <h3 className="heading-reset">Projetos recentes</h3>
            <p className="helper-text-ea">Retome uma entrega recente sem reconstruir contexto.</p>
          </div>
          <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">Abrir página de projetos</Link>
        </div>
        {loading ? (
          <div className="dashboard-section-body">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`project-skeleton-${index}`} className="premium-skeleton premium-skeleton-card" />
            ))}
          </div>
        ) : recentProjects.length === 0 ? (
          <div className="state-ea state-ea-spaced">
            <p className="state-ea-title">Nenhum projeto criado ainda</p>
            <div className="state-ea-text">
              Gere seu primeiro conteúdo em Creators e salve em Projetos para continuar no editor.
            </div>
            <div className="state-ea-actions">
              <Link href="/creators" className="btn-link-ea btn-primary btn-sm">
                Ir para Creators
              </Link>
              <Link href="/editor/new" className="btn-link-ea btn-ghost btn-sm">
                Criar projeto manual
              </Link>
            </div>
          </div>
        ) : (
          <div className="dashboard-section-body">
            {recentProjects.map((project: any, index: number) => {
              const projectId = String(project.id || project.project_id || "");
              const content = (
                <>
                  <div className="dashboard-project-link-main">
                    <span className="dashboard-project-link-title">{project.name || project.title || project.id}</span>
                    <span className="dashboard-project-link-meta">{String(project.kind || project.type || "projeto")}</span>
                  </div>
                  {projectId ? <span className="dashboard-project-link-cta">Abrir</span> : null}
                </>
              );
              return projectId ? (
                <Link
                  key={projectId || JSON.stringify(project)}
                  href={`/editor/${projectId}`}
                  className="premium-card-soft dashboard-project-link"
                  data-reveal
                  data-reveal-delay={String(70 + Math.min(index, 5) * 35)}
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={projectId || JSON.stringify(project)}
                  className="premium-card-soft dashboard-project-link"
                  data-reveal
                  data-reveal-delay={String(70 + Math.min(index, 5) * 35)}
                >
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="premium-card dashboard-section-card dashboard-flow-section dashboard-flow-section-middle" data-reveal data-reveal-delay="180">
        <div className="section-header-ea">
          <h3 className="heading-reset">Núcleo do beta pago/controlado</h3>
          <p className="helper-text-ea">Atalhos para o que precisa carregar valor, retenção e continuidade real no uso recorrente.</p>
        </div>
        <div className="dashboard-quick-links-stack">
          <div className="section-stack-tight">
            <p className="section-kicker">Centro da experiência</p>
            <div className="dashboard-quick-links-grid">
              {coreQuickLinks.map((item, index) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="premium-card-soft dashboard-quick-link"
                  data-reveal
                  data-reveal-delay={String(70 + index * 40)}
                >
                  <div className="dashboard-quick-link-kicker">{item.tag}</div>
                  <div className="dashboard-project-link-title">{item.title}</div>
                  <div className="dashboard-quick-link-copy helper-text-ea">{item.description}</div>
                  <div className="dashboard-quick-link-footer">
                    <span className="dashboard-quick-link-cta">{item.cta}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
          <div className="section-stack-tight dashboard-quick-links-secondary">
            <p className="section-kicker">Camadas operacionais</p>
            <p className="helper-text-ea">
              Financeiro, suporte e leitura do beta continuam acessíveis, mas como apoio ao núcleo criativo e editorial.
            </p>
            <div className="dashboard-quick-links-grid">
              {supportQuickLinks.map((item, index) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="premium-card-soft dashboard-quick-link"
                  data-reveal
                  data-reveal-delay={String(90 + index * 35)}
                >
                  <div className="dashboard-quick-link-kicker">{item.tag}</div>
                  <div className="dashboard-project-link-title">{item.title}</div>
                  <div className="dashboard-quick-link-copy helper-text-ea">{item.description}</div>
                  <div className="dashboard-quick-link-footer">
                    <span className="dashboard-quick-link-cta">{item.cta}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="premium-card dashboard-section-card dashboard-flow-section dashboard-flow-section-end" data-reveal data-reveal-delay="210">
        <div className="section-header-ea">
          <h3 className="heading-reset">Uso por feature</h3>
          <p className="helper-text-ea">Consumo por módulo para ajustar ritmo, plano e próxima ação.</p>
        </div>
        {loading || usageLoading ? (
          <div className="dashboard-section-body">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`usage-skeleton-${index}`} className="premium-card-soft dashboard-progress-card">
                <div className="premium-skeleton premium-skeleton-line" style={{ width: "45%" }} />
                <div className="premium-skeleton premium-skeleton-line" style={{ width: "75%", marginTop: 9 }} />
              </div>
            ))}
          </div>
        ) : usageItems.length === 0 ? (
          <div className="state-ea">
            <p className="state-ea-title">Sem uso registrado neste mês</p>
            <div className="state-ea-text">
              Assim que você gerar conteúdo em algum Creator, o consumo aparece aqui e no histórico de créditos.
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
          <div className="dashboard-section-body">
            {usageItems.map((item) => {
              const progress = usageProgress(item);
              return (
                <div key={item.feature} className="premium-card-soft dashboard-progress-card">
                  <div className="dashboard-progress-row">
                    <span>{item.feature}</span>
                    <strong>{item.used}/{item.limit}</strong>
                  </div>
                  <div className="dashboard-progress-track">
                    <div className="dashboard-progress-bar" style={{ width: `${progress}%` }} />
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
