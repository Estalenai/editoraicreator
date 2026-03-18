"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { CreatorPostCard } from "../../components/dashboard/CreatorPostCard";
import { CreatorMusicCard } from "../../components/dashboard/CreatorMusicCard";
import { CreatorScriptCard } from "../../components/dashboard/CreatorScriptCard";
import { CreatorAdsCard } from "../../components/dashboard/CreatorAdsCard";
import { CreatorClipsCard } from "../../components/dashboard/CreatorClipsCard";
import { CreatorLiveCutsCard } from "../../components/dashboard/CreatorLiveCutsCard";
import { CreatorNoCodeCard } from "../../components/dashboard/CreatorNoCodeCard";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
import { toUserFacingError } from "../../lib/uiFeedback";

type CreatorTab =
  | "post"
  | "music"
  | "scripts"
  | "ads"
  | "clips"
  | "live-cuts"
  | "no-code";

type CreatorGroupId = "content" | "media" | "product";

const CREATOR_GROUPS: Array<{ id: CreatorGroupId; title: string; subtitle: string }> = [
  { id: "content", title: "Conteúdo", subtitle: "Ideias, roteiro e copy para distribuição." },
  { id: "media", title: "Vídeo e música", subtitle: "Vídeo, foto, trilha e clipes para acelerar publicação." },
  { id: "product", title: "Produto e automação", subtitle: "Estruture uma base de produto para evoluir no editor." },
];

const CREATOR_TABS: Array<{
  id: CreatorTab;
  group: CreatorGroupId;
  label: string;
  description: string;
  bestFor: string;
}> = [
  {
    id: "post",
    group: "content",
    label: "Creator Post",
    description: "Posts para redes sociais com CTA e variações.",
    bestFor: "Quando você precisa publicar rápido com consistência.",
  },
  {
    id: "scripts",
    group: "content",
    label: "Creator Scripts",
    description: "Roteiros curtos e estruturados para vídeo.",
    bestFor: "Quando precisa organizar narrativa antes de gravar.",
  },
  {
    id: "ads",
    group: "content",
    label: "Creator Ads",
    description: "Anúncios com briefing, headline e CTA.",
    bestFor: "Quando o objetivo é conversão e teste de mensagem.",
  },
  {
    id: "music",
    group: "media",
    label: "Creator Music",
    description: "Trilhas em evolução para acelerar produção.",
    bestFor: "Quando o conteúdo precisa de identidade sonora rápida.",
  },
  {
    id: "clips",
    group: "media",
    label: "Creator Clips",
    description: "Clipes com job assíncrono e status de processamento.",
    bestFor: "Quando você quer transformar uma ideia em vídeo curto.",
  },
  {
    id: "live-cuts",
    group: "media",
    label: "Creator Live Cuts",
    description: "Sessões de cortes ao vivo em Fase 1.",
    bestFor: "Quando quer configurar cortes recorrentes para lives.",
  },
  {
    id: "no-code",
    group: "product",
    label: "Creator No Code",
    description: "Estrutura inicial de produto em Fase 1.",
    bestFor: "Quando precisa transformar ideia em blueprint acionável.",
  },
];

const CREATOR_CREDIT_GUIDE = [
  { coinType: "common" as const, description: "rotina e volume" },
  { coinType: "pro" as const, description: "qualidade avançada" },
  { coinType: "ultra" as const, description: "processamento premium" },
];

const CREATOR_SHOWCASES = [
  {
    creator: "Creator Post",
    kicker: "Saída de publicação",
    briefing: "Lançar uma consultoria de marca pessoal para vídeo com CTA para lista VIP.",
    delivery: "Legenda pronta, variações de hook e CTA final para testar distribuição.",
    nextStep: "Salvar em projeto e abrir no editor para ajuste fino.",
  },
  {
    creator: "Creator Scripts",
    kicker: "Saída de roteiro",
    briefing: "Explicar em 40 segundos por que um anúncio sem prova social converte menos.",
    delivery: "Roteiro curto com abertura, argumento central e fechamento para gravação.",
    nextStep: "Converter em clipe, anúncio ou base de apresentação.",
  },
  {
    creator: "Creator Music",
    kicker: "Saída de identidade sonora",
    briefing: "Criar uma trilha leve, eletrônica e otimista para produto digital premium.",
    delivery: "Direção musical, status do job e base pronta para continuar no projeto.",
    nextStep: "Acompanhar processamento e seguir para edição ou exportação.",
  },
  {
    creator: "Creator Clips",
    kicker: "Saída de vídeo curto",
    briefing: "Montar um clipe de apresentação com ritmo rápido e direção de cena.",
    delivery: "Job assíncrono com acompanhamento claro e continuidade para editar depois.",
    nextStep: "Salvar contexto e preparar publicação quando a peça estiver pronta.",
  },
];

function parseTab(raw: string | null): CreatorTab {
  const value = String(raw || "").toLowerCase();
  return (
    CREATOR_TABS.find((tab) => tab.id === value)?.id ||
    "post"
  );
}

export default function CreatorsPage() {
  return (
    <Suspense fallback={<div className="page-shell"><div className="premium-card" style={{ padding: 16 }}>Carregando Creators...</div></div>}>
      <CreatorsPageContent />
    </Suspense>
  );
}

function CreatorsPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<CreatorTab>("post");

  const {
    loading,
    syncingSubscription,
    error,
    email,
    planLabel,
    planCodeRaw,
    wallet,
    projects,
    betaAccess,
    betaBlocked,
    refresh,
    onLogout,
    onSyncSubscription,
  } = useDashboardBootstrap({ loadDashboard: true });

  useEffect(() => {
    setActiveTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  const walletCommon = Number(wallet?.common ?? 0);
  const hasWorkspaceSnapshot = Boolean(planLabel || wallet || projects.length > 0);
  const initialLoading = loading && !hasWorkspaceSnapshot;
  const walletSummary = useMemo(
    () => `${wallet?.common ?? 0} Comum • ${wallet?.pro ?? 0} Pro • ${wallet?.ultra ?? 0} Ultra`,
    [wallet]
  );
  const walletByType = useMemo(
    () =>
      CREATOR_CREDIT_GUIDE.map((item) => ({
        ...item,
        amount: loading && !wallet ? null : Number(wallet?.[item.coinType] ?? 0),
      })),
    [wallet, loading]
  );
  const planLabelDisplay = loading ? "Sincronizando plano" : planLabel ?? "—";
  const walletSummaryDisplay = loading && !wallet ? "Saldo em atualização" : walletSummary;

  const activeTabMeta = useMemo(
    () => CREATOR_TABS.find((tab) => tab.id === activeTab) || CREATOR_TABS[0],
    [activeTab]
  );
  const tabsByGroup = useMemo(
    () =>
      CREATOR_GROUPS.map((group) => ({
        ...group,
        items: CREATOR_TABS.filter((tab) => tab.group === group.id),
      })),
    []
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
    <div className="page-shell creators-page">
      <section className="premium-hero creators-hero">
        <div className="hero-split creators-hero-split">
          <div className="hero-copy creators-hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Workspace de criação</p>
              <h1 style={{ margin: 0, letterSpacing: -0.35 }}>Creators</h1>
              <p className="creators-hero-lead">
                Configure com clareza, gere base para vídeo, foto e conteúdo e siga para o editor com contexto preservado.
              </p>
            </div>

            <div className="hero-meta-row hero-meta-row-compact">
              <span className="premium-badge premium-badge-phase">Plano: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-soon">Resultado pronto para salvar em projeto</span>
            </div>

            <div className="signal-strip creators-hero-signal-strip">
              <div className="signal-chip signal-chip-creative">
                <strong>Briefing</strong>
                <span>Campos objetivos e estimativa antes de qualquer geração.</span>
              </div>
              <div className="signal-chip signal-chip-creative">
                <strong>Geração</strong>
                <span>Feedback curto, loading claro e erro legível durante a execução.</span>
              </div>
              <div className="signal-chip signal-chip-creative">
                <strong>Continuidade</strong>
                <span>Salvar em projeto, editar no workspace e preparar exportação sem perder contexto.</span>
              </div>
            </div>

            <div className="hero-kpi-grid creators-hero-metrics creators-hero-metrics-compact">
              <div className="premium-card-soft hero-kpi creators-hero-metric">
                <span className="hero-kpi-label">Ferramenta ativa</span>
                <strong className="hero-kpi-value">{activeTabMeta.label}</strong>
                <span className="hero-kpi-text">{activeTabMeta.bestFor}</span>
              </div>
              <div className="premium-card-soft hero-kpi creators-hero-metric">
                <span className="hero-kpi-label">Saldo para operar</span>
                <strong className="hero-kpi-value">{walletSummaryDisplay}</strong>
                <span className="hero-kpi-text">{loading ? "Saldo e plano estão sendo sincronizados." : "Estimativa antes da geração. Consumo real em Créditos."}</span>
              </div>
              <div className="premium-card-soft hero-kpi creators-hero-metric">
                <span className="hero-kpi-label">Próximo passo</span>
                <strong className="hero-kpi-value">Gerar → editar → exportar</strong>
                <span className="hero-kpi-text">Projeto salvo, refinamento no editor e exportação local quando a peça estiver pronta.</span>
              </div>
            </div>
          </div>

          <div className="hero-side-panel creators-hero-panel">
            <div className="section-stack">
              <p className="section-kicker">Controle operacional</p>
              <h2 style={{ margin: 0 }}>Criatividade com estrutura</h2>
              <p className="meta-text-ea">
                Briefing, configuração, ação e resultado ficam separados para reduzir ruído, acelerar leitura e manter previsibilidade.
              </p>
            </div>

            <div className="creators-hero-panel-stack hero-side-list hero-side-list-compact">
              <div className="hero-side-note">
                <strong>Briefing orientado</strong>
                <span>Objetivo, formato e contexto ficam agrupados sem virar um formulário gigante.</span>
              </div>
              <div className="hero-side-note">
                <strong>Continuidade pronta</strong>
                <span>Depois de gerar, salve em projeto, refine no editor e prepare a exportação no dispositivo.</span>
              </div>
            </div>

            <div className="hero-actions-row">
              <button
                onClick={async () => {
                  await onSyncSubscription();
                  await refresh();
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
      </section>

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível carregar o workspace de Creators</p>
          <div className="state-ea-text">{toUserFacingError(error, "Atualize o workspace e tente novamente.")}</div>
          <div className="state-ea-actions">
            <button onClick={refresh} className="btn-ea btn-secondary btn-sm">Atualizar</button>
            <Link href="/support" className="btn-link-ea btn-ghost btn-sm">Pedir ajuda</Link>
          </div>
        </div>
      ) : null}

      <section className="proof-value-section premium-card-soft creators-proof-section">
        <div className="proof-value-header">
          <div className="section-stack-tight">
            <p className="section-kicker">Exemplos de resultado</p>
            <h2 className="heading-reset">O que cada Creator pode destravar</h2>
            <p className="helper-text-ea">
              Estas amostras mostram o tipo de saída que você pode esperar antes de abrir um projeto. Elas ajudam a entender o valor da IA sem vender um fluxo maior do que o beta entrega hoje.
            </p>
          </div>
          <Link href="/projects" className="btn-link-ea btn-secondary btn-sm">
            Ver continuidade em Projetos
          </Link>
        </div>

        <div className="proof-value-grid proof-value-grid-creators">
          {CREATOR_SHOWCASES.map((item) => (
            <article key={item.creator} className="proof-value-card premium-card-soft">
              <div className="proof-value-meta-row">
                <span className="proof-value-kicker">{item.kicker}</span>
                <span className="proof-value-chip">{item.creator}</span>
              </div>
              <div className="proof-value-stack">
                <div className="proof-value-block">
                  <span className="proof-value-label">Briefing</span>
                  <p>{item.briefing}</p>
                </div>
                <div className="proof-value-block">
                  <span className="proof-value-label">Entrega</span>
                  <p>{item.delivery}</p>
                </div>
                <div className="proof-value-block proof-value-block-inline">
                  <span className="proof-value-label">Próximo passo</span>
                  <strong>{item.nextStep}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="creator-workspace-grid">
        <aside className="premium-card creator-workspace-side creators-sidebar creators-sidebar-soft">
          <div className="creators-side-note creators-side-note-primary">
            <strong>Comece pelo objetivo</strong>
            <span>
              Conteúdo rápido: <strong>Creator Post</strong> • Narrativa: <strong>Creator Scripts</strong> • Conversão: <strong>Creator Ads</strong>
            </span>
          </div>

          <div className="creators-sidebar-nav">
            {tabsByGroup.map((group) => (
              <div key={group.id} className="creators-sidebar-group">
                <div className="creator-group-title">{group.title}</div>
                <div className="creator-group-subtitle">{group.subtitle}</div>
                <div className="creators-sidebar-group-list">
                  {group.items.map((tab) => (
                    <button
                      key={tab.id}
                      data-active={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="creator-tab-btn"
                    >
                      <span className="creator-tab-title">{tab.label}</span>
                      <span className="creator-tab-meta">{tab.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="creators-sidebar-stack">
            <div className="creators-side-note">
              <strong>{activeTabMeta.label}</strong>
              <span>{activeTabMeta.bestFor}</span>
            </div>

            <div className="creators-side-note creators-wallet-panel">
              <strong>Saldo disponível</strong>
              <span>Cada Creator mostra a estimativa antes da geração. O histórico em Créditos confirma o consumo real.</span>
              <div className="creators-wallet-stack">
                {walletByType.map((item) => (
                  <div key={item.coinType} className="creators-wallet-row">
                    <span>
                      {coinTypeLabel(item.coinType)} • {item.description}
                    </span>
                    <strong>{item.amount == null ? "…" : item.amount}</strong>
                  </div>
                ))}
              </div>
              <a href="/credits#credits-history" className="btn-link-ea btn-ghost btn-sm">
                Ver histórico de consumo
              </a>
            </div>

            <div className="creators-side-note">
              <strong>Contexto rápido</strong>
              <span>Revise fluxo, créditos e próximo passo sem sair do workspace.</span>
              <Link href="/how-it-works" className="btn-link-ea btn-ghost btn-sm">
                Abrir guia rápido
              </Link>
            </div>
          </div>
        </aside>

        <div className="creator-workspace-main">
          {initialLoading ? (
            <div className="premium-card creators-loading-card">
              <div className="premium-skeleton premium-skeleton-line" style={{ width: "40%" }} />
              <div className="premium-skeleton premium-skeleton-line" style={{ width: "78%" }} />
              <div className="premium-skeleton premium-skeleton-card" />
              <div className="premium-skeleton premium-skeleton-card" />
            </div>
          ) : (
            <>
              {loading ? (
                <div className="premium-card-soft creators-inline-note">
                  <strong>Atualização em segundo plano</strong>
                  <span>Saldo e plano estão sendo atualizados enquanto você continua no briefing.</span>
                </div>
              ) : null}
              <div className="premium-card-soft creator-active-panel">
                <div className="creator-active-panel-head">
                  <div className="section-stack">
                    <p className="section-kicker">Ferramenta ativa</p>
                    <h2 className="creator-active-panel-title">{activeTabMeta.label}</h2>
                    <p className="creator-active-panel-copy">{activeTabMeta.bestFor}</p>
                  </div>
                  <div className="creator-active-panel-meta">
                    <span className="premium-badge premium-badge-phase">Plano {planLabelDisplay}</span>
                    <span className="premium-badge premium-badge-warning">Saldo {walletSummaryDisplay}</span>
                  </div>
                </div>
                <div className="hero-actions-row creator-active-panel-actions">
                  <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">
                    Ver projetos
                  </Link>
                  <Link href="/editor/new" className="btn-link-ea btn-secondary btn-sm">
                    Abrir editor novo
                  </Link>
                </div>
              </div>
              {activeTab === "post" ? <CreatorPostCard walletCommon={walletCommon} onRefetch={refresh} /> : null}
              {activeTab === "music" ? <CreatorMusicCard walletCommon={walletCommon} onRefetch={refresh} /> : null}
              {activeTab === "scripts" ? <CreatorScriptCard walletCommon={walletCommon} onRefetch={refresh} /> : null}
              {activeTab === "ads" ? <CreatorAdsCard walletCommon={walletCommon} onRefetch={refresh} /> : null}
              {activeTab === "clips" ? <CreatorClipsCard walletCommon={walletCommon} onRefetch={refresh} /> : null}
              {activeTab === "live-cuts" ? <CreatorLiveCutsCard /> : null}
              {activeTab === "no-code" ? (
                <CreatorNoCodeCard
                  planCode={planCodeRaw}
                  walletCommon={walletCommon}
                  onRefetch={refresh}
                />
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
