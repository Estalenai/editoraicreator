"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

type CreatorGroupId = "hero" | "secondary" | "labs";

const CREATOR_GROUPS: Array<{ id: CreatorGroupId; title: string; subtitle: string }> = [
  { id: "hero", title: "Creators hero", subtitle: "Núcleo principal de aquisição, repetição de uso e continuidade com o editor no beta pago/controlado." },
  { id: "secondary", title: "Apoio estratégico", subtitle: "Complementam o pipeline, mas não carregam o centro da promessa agora." },
  { id: "labs", title: "Labs e preview", subtitle: "Explorações úteis, ainda fora do núcleo principal do produto." },
];

const CREATOR_TABS: Array<{
  id: CreatorTab;
  group: CreatorGroupId;
  label: string;
  description: string;
  bestFor: string;
  expectedOutput: string;
  continuity: string;
  stageLabel: string;
}> = [
  {
    id: "post",
    group: "hero",
    label: "Creator Post",
    description: "Posts com legenda, CTA e variações prontos para virar peça-mãe no editor.",
    bestFor: "Publicação rápida com clareza de saída, repetição alta e continuidade pronta para o editor.",
    expectedOutput: "Legenda principal, CTA e variações prontas para salvar em projeto.",
    continuity: "Entra no editor como base de copy, versão e exportação.",
    stageLabel: "Hero",
  },
  {
    id: "scripts",
    group: "hero",
    label: "Creator Scripts",
    description: "Roteiros curtos e estruturados para vídeo, gravação e continuidade no editor.",
    bestFor: "Narrativa estruturada antes de gravar, editar, anunciar ou transformar em clipe.",
    expectedOutput: "Roteiro com gancho, desenvolvimento e fechamento utilizável de imediato.",
    continuity: "Vira linha mestra de vídeo, anúncio, apresentação ou refinamento editorial.",
    stageLabel: "Hero",
  },
  {
    id: "ads",
    group: "secondary",
    label: "Creator Ads",
    description: "Peças de conversão com briefing, headline e CTA.",
    bestFor: "Campanhas e testes de mensagem quando o núcleo editorial já está claro.",
    expectedOutput: "Copy de anúncio e variações de conversão.",
    continuity: "Complementa campanhas, mas não é o ponto mais forte do produto agora.",
    stageLabel: "Apoio",
  },
  {
    id: "music",
    group: "secondary",
    label: "Creator Music",
    description: "Trilhas e direção sonora para acelerar produção.",
    bestFor: "Identidade sonora complementar quando o conteúdo principal já está definido.",
    expectedOutput: "Direção musical e job de trilha com acompanhamento.",
    continuity: "Apoia o pipeline criativo, mas ainda não deve carregar a promessa principal.",
    stageLabel: "Apoio",
  },
  {
    id: "clips",
    group: "hero",
    label: "Creator Clips",
    description: "Clipes com job assíncrono, status legível e continuidade para edição e publicação.",
    bestFor: "Ideia transformada em vídeo curto com o maior potencial de impacto visual do produto.",
    expectedOutput: "Job de clipe com status real, preview e rota clara para o editor.",
    continuity: "Fecha a narrativa de vídeo: ideia, roteiro, geração, revisão e saída.",
    stageLabel: "Hero",
  },
  {
    id: "live-cuts",
    group: "labs",
    label: "Creator Live Cuts",
    description: "Sessões de cortes ao vivo em fase inicial.",
    bestFor: "Operação recorrente de live ainda fora do centro da proposta atual.",
    expectedOutput: "Sessão operacional com estimativa e acompanhamento.",
    continuity: "É promissor, porém mais especializado e menos forte como wedge neste momento.",
    stageLabel: "Lab",
  },
  {
    id: "no-code",
    group: "labs",
    label: "Creator No Code",
    description: "Blueprint inicial de produto para exploração.",
    bestFor: "Estruturação de ideia fora do núcleo criativo principal da plataforma.",
    expectedOutput: "Estrutura inicial de produto e escopo.",
    continuity: "Serve como exploração lateral; não deve carregar aquisição nem retenção agora.",
    stageLabel: "Lab",
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
    creator: "Creator Clips",
    kicker: "Saída de vídeo curto",
    briefing: "Montar um clipe de apresentação com ritmo rápido e direção de cena.",
    delivery: "Job assíncrono com acompanhamento claro e continuidade para editar depois.",
    nextStep: "Salvar contexto e preparar publicação quando a peça estiver pronta.",
  },
];

const CREATOR_STAGE_GUIDANCE: Record<CreatorGroupId, { title: string; description: string }> = {
  hero: {
    title: "Creator hero do produto",
    description: "Este creator faz parte do trio que precisa carregar aquisição, repetição de uso e continuidade com o editor. O valor real do beta pago/controlado começa aqui.",
  },
  secondary: {
    title: "Creator de apoio estratégico",
    description: "Este creator complementa o pipeline, mas não deve carregar a promessa principal do produto agora. Use depois que o núcleo principal já estiver claro.",
  },
  labs: {
    title: "Creator em lab ou preview",
    description: "Este creator continua disponível, mas ainda está fora do centro da proposta atual. Trate como exploração útil, não como ponto principal de entrada.",
  },
};

function parseTab(raw: string | null): CreatorTab {
  const value = String(raw || "").toLowerCase();
  return (
    CREATOR_TABS.find((tab) => tab.id === value)?.id ||
    "post"
  );
}

function creatorStageTone(group: CreatorGroupId): "phase" | "warning" | "soon" {
  if (group === "hero") return "phase";
  if (group === "secondary") return "warning";
  return "soon";
}

export default function CreatorsPage() {
  return (
    <Suspense fallback={<div className="page-shell"><div className="premium-card" style={{ padding: 16 }}>Carregando área de Creators...</div></div>}>
      <CreatorsPageContent />
    </Suspense>
  );
}

function CreatorsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const workspaceRef = useRef<HTMLElement | null>(null);
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
  const planLabelDisplay = loading ? "Plano em sincronização" : planLabel ?? "—";
  const walletSummaryDisplay = loading && !wallet ? "Saldo em sincronização" : walletSummary;

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
  const heroCreators = useMemo(
    () => tabsByGroup.find((group) => group.id === "hero")?.items ?? [],
    [tabsByGroup]
  );
  const secondaryCreators = useMemo(
    () => tabsByGroup.find((group) => group.id === "secondary")?.items ?? [],
    [tabsByGroup]
  );
  const labCreators = useMemo(
    () => tabsByGroup.find((group) => group.id === "labs")?.items ?? [],
    [tabsByGroup]
  );
  const activeStageTone = creatorStageTone(activeTabMeta.group);
  const activeStageGuidance = CREATOR_STAGE_GUIDANCE[activeTabMeta.group];
  const supportHeroCreator = useMemo(
    () => secondaryCreators.find((tab) => tab.id === "ads") ?? secondaryCreators[0] ?? null,
    [secondaryCreators]
  );
  const heroCoreCards = useMemo(
    () => (supportHeroCreator ? [...heroCreators, supportHeroCreator] : heroCreators),
    [heroCreators, supportHeroCreator]
  );
  const secondaryCatalog = useMemo(
    () => [...secondaryCreators, ...labCreators].filter((tab) => tab.id !== supportHeroCreator?.id),
    [secondaryCreators, labCreators, supportHeroCreator]
  );

  function activateTab(nextTab: CreatorTab, options?: { scrollToWorkspace?: boolean }) {
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });

    if (options?.scrollToWorkspace) {
      requestAnimationFrame(() => {
        workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
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
    <div className="page-shell creators-page">
      <section className="premium-hero creators-hero surface-flow-hero" data-reveal>
        <div className="hero-split creators-hero-split">
          <div className="hero-copy creators-hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Workspace de criação</p>
              <h1 style={{ margin: 0, letterSpacing: -0.35 }}>Creators</h1>
              <p className="creators-hero-lead">
                O núcleo da plataforma concentra briefing, geração, continuidade editorial e saída rastreável em um único workspace. Os creators hero entram primeiro, o editor amadurece a peça e o projeto preserva a continuidade até a exportação.
              </p>
            </div>

            <div className="hero-meta-row hero-meta-row-compact">
              <span className="premium-badge premium-badge-phase">Plano: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-soon">Creators hero no centro do beta pago/controlado</span>
            </div>

            <div className="signal-strip creators-hero-signal-strip">
              <div className="signal-chip signal-chip-creative">
                <strong>Briefing</strong>
                <span>Campos objetivos e estimativa antes de qualquer geração.</span>
              </div>
              <div className="signal-chip signal-chip-creative">
                <strong>Geração</strong>
                <span>Progresso claro, erro legível e retorno visível durante a execução.</span>
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
                <span className="hero-kpi-text">{loading ? "Saldo, plano e regras de uso estão sendo sincronizados." : "Estimativa antes da geração. Consumo real em Créditos."}</span>
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
                <span>Objetivo, formato e contexto ficam agrupados sem transformar o fluxo em um formulário extenso.</span>
              </div>
              <div className="hero-side-note">
                <strong>Continuidade pronta</strong>
                <span>Depois da geração, o resultado entra em projeto, editor e pipeline de saída com contexto preservado.</span>
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
          <p className="state-ea-title">Não foi possível carregar a área de Creators</p>
          <div className="state-ea-text">{toUserFacingError(error, "Atualize o workspace e tente novamente.")}</div>
          <div className="state-ea-actions">
            <button onClick={refresh} className="btn-ea btn-secondary btn-sm">Atualizar</button>
            <Link href="/support" className="btn-link-ea btn-ghost btn-sm">Pedir ajuda</Link>
          </div>
        </div>
      ) : null}

      <section className="proof-value-section creators-proof-section creators-flow-section surface-flow-region creators-flow-section-start" data-reveal data-reveal-delay="60">
        <div className="proof-value-header">
          <div className="section-stack-tight">
            <p className="section-kicker">Exemplos de resultado</p>
            <h2 className="heading-reset">O que os creators hero podem destravar</h2>
            <p className="helper-text-ea">
              Estas amostras mostram o tipo de saída que o núcleo atual já organiza antes de abrir um projeto. A leitura continua objetiva, sem vender um fluxo maior do que o beta realmente sustenta hoje.
            </p>
          </div>
          <Link href="/projects" className="btn-link-ea btn-secondary btn-sm">
            Ver continuidade em Projetos
          </Link>
        </div>

        <div className="proof-value-grid proof-value-grid-creators">
          {CREATOR_SHOWCASES.map((item, index) => (
            <article key={item.creator} className="proof-value-card premium-card-soft" data-reveal data-reveal-delay={String(70 + index * 55)}>
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

      <section className="creators-hero-core-section creators-flow-section surface-flow-region creators-flow-section-middle" data-reveal data-reveal-delay="90">
        <div className="proof-value-header creators-hero-core-header">
          <div className="section-stack-tight">
            <p className="section-kicker">Creators hero</p>
            <h2 className="heading-reset">Os 3 creators que precisam carregar a plataforma</h2>
            <p className="helper-text-ea">
              <strong>Creator Post</strong>, <strong>Creator Scripts</strong> e <strong>Creator Clips</strong> continuam no centro da promessa. Um quarto card secundário fecha a grade com apoio de campanha sem competir com o trio hero principal.
            </p>
          </div>
          <div className="creators-hero-core-header-note">
            <span className="premium-badge premium-badge-phase">Núcleo principal</span>
            <span className="helper-text-ea">O restante do catálogo continua disponível, mas sai do centro da promessa.</span>
          </div>
        </div>

        <div className="creators-hero-core-grid">
          {heroCoreCards.map((tab, index) => (
            <article
              key={tab.id}
              className={`premium-card-soft creators-hero-core-card ${tab.group !== "hero" ? "creators-hero-core-card-support" : ""}`}
              data-active={activeTab === tab.id}
              data-reveal
              data-reveal-delay={String(70 + index * 50)}
            >
              <div className="creators-hero-core-card-head">
                <span className={`premium-badge premium-badge-${creatorStageTone(tab.group)}`}>{tab.stageLabel}</span>
                <span className="creators-hero-core-card-kicker">{tab.group === "hero" ? "Creator central" : "Apoio recomendado"}</span>
              </div>
              <div className="section-stack-tight">
                <h3 className="heading-reset">{tab.label}</h3>
                <p className="helper-text-ea">{tab.description}</p>
              </div>
              <div className="creators-hero-core-stack">
                <div className="creators-hero-core-point">
                  <span>Melhor para</span>
                  <strong>{tab.bestFor}</strong>
                </div>
                <div className="creators-hero-core-point">
                  <span>Saída esperada</span>
                  <strong>{tab.expectedOutput}</strong>
                </div>
                <div className="creators-hero-core-point">
                  <span>Continuidade</span>
                  <strong>{tab.continuity}</strong>
                </div>
              </div>
              <div className="creators-hero-card-actions">
                <button onClick={() => activateTab(tab.id, { scrollToWorkspace: true })} className="btn-ea btn-primary btn-sm">
                  {tab.group === "hero" ? "Abrir no workspace" : "Abrir apoio no workspace"}
                </button>
                <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">
                  Ver continuidade em Projetos
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="creators-secondary-section creators-flow-section surface-flow-region creators-flow-section-middle" data-reveal data-reveal-delay="120">
        <div className="proof-value-header creators-secondary-header">
          <div className="section-stack-tight">
            <p className="section-kicker">Apoio e labs</p>
            <h2 className="heading-reset">O restante do catálogo continua útil, mas com papel mais claro</h2>
            <p className="helper-text-ea">
              <strong>Apoio estratégico</strong> complementa campanhas e produção. <strong>Labs e preview</strong> seguem disponíveis para exploração, sem disputar o centro da promessa agora.
            </p>
          </div>
        </div>

        <div className="creators-secondary-grid">
          {secondaryCatalog.map((tab, index) => (
            <article key={tab.id} className="creators-secondary-card premium-card-soft" data-priority={tab.group} data-reveal data-reveal-delay={String(70 + index * 45)}>
              <div className="creators-secondary-card-head">
                <strong>{tab.label}</strong>
                <span className={`premium-badge premium-badge-${creatorStageTone(tab.group)}`}>{tab.stageLabel}</span>
              </div>
              <p className="helper-text-ea">{tab.description}</p>
              <div className="creators-secondary-card-copy">
                <span>Saída esperada</span>
                <strong>{tab.expectedOutput}</strong>
              </div>
              <div className="creators-secondary-card-copy">
                <span>Papel atual</span>
                <strong>{tab.continuity}</strong>
              </div>
              <button onClick={() => activateTab(tab.id, { scrollToWorkspace: true })} className="btn-ea btn-ghost btn-sm">
                Abrir no workspace
              </button>
            </article>
          ))}
        </div>
      </section>

      <section ref={workspaceRef} className="creator-workspace-grid creators-flow-section surface-flow-region creators-flow-section-end">
        <aside className="creator-workspace-side creators-sidebar creators-sidebar-soft" data-reveal data-reveal-delay="140">
          <div className="creators-side-note creators-side-note-primary">
            <strong>Comece pelos creators hero</strong>
            <span>
              Publicação rápida: <strong>Creator Post</strong> • Narrativa: <strong>Creator Scripts</strong> • Vídeo curto: <strong>Creator Clips</strong>
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
                      data-priority={tab.group}
                      data-active={activeTab === tab.id}
                      onClick={() => activateTab(tab.id)}
                      className="creator-tab-btn"
                    >
                      <span className="creator-tab-head">
                        <span className="creator-tab-title">{tab.label}</span>
                        <span className="creator-tab-chip">{tab.stageLabel}</span>
                      </span>
                      <span className="creator-tab-meta">{tab.description}</span>
                      <span className="creator-tab-support">{tab.expectedOutput}</span>
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

        <div className="creator-workspace-main" data-reveal data-reveal-delay="180">
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
                  <strong>Sincronização em segundo plano</strong>
                  <span>Saldo, plano e disponibilidade continuam sendo atualizados em segundo plano.</span>
                </div>
              ) : null}
              <div className="creator-active-panel">
                <div className="creator-active-panel-head">
                  <div className="section-stack">
                    <p className="section-kicker">Ferramenta ativa</p>
                    <h2 className="creator-active-panel-title">{activeTabMeta.label}</h2>
                    <p className="creator-active-panel-copy">{activeTabMeta.bestFor}</p>
                  </div>
                  <div className="creator-active-panel-meta">
                    <span className={`premium-badge premium-badge-${activeStageTone}`}>{activeTabMeta.stageLabel}</span>
                    <span className="premium-badge premium-badge-phase">Plano {planLabelDisplay}</span>
                    <span className="premium-badge premium-badge-warning">Saldo {walletSummaryDisplay}</span>
                  </div>
                </div>
                <div className="creator-active-summary-grid">
                  <div className="creator-active-summary-card">
                    <span>Saída esperada</span>
                    <strong>{activeTabMeta.expectedOutput}</strong>
                  </div>
                  <div className="creator-active-summary-card">
                    <span>Continuidade</span>
                    <strong>{activeTabMeta.continuity}</strong>
                  </div>
                  <div className="creator-active-summary-card">
                    <span>Papel no produto</span>
                    <strong>{activeStageGuidance.title}</strong>
                  </div>
                </div>
                <div className={`creator-active-stage-note creator-active-stage-note-${activeTabMeta.group}`}>
                  <strong>{activeStageGuidance.title}</strong>
                  <span>{activeStageGuidance.description}</span>
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
