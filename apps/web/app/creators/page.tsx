"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { useSectionFocus } from "../../hooks/useSectionFocus";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { EditorRouteLink } from "../../components/ui/EditorRouteLink";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
import { CREATOR_COINS_PUBLIC_NAME, formatCreatorCoinsWalletSummary } from "../../lib/creatorCoins";
import { toUserFacingError } from "../../lib/uiFeedback";

type CreatorTab =
  | "post"
  | "music"
  | "scripts"
  | "ads"
  | "clips"
  | "live-cuts"
  | "no-code";
type CreatorsFocusSection = "showcase" | "catalog" | "workspace";
type CreatorWorkspaceCardProps = {
  planCode: string | null;
  walletCommon: number;
  onRefetch: () => Promise<void>;
};

function CreatorWorkspacePanelSkeleton() {
  return (
    <div className="creators-loading-card layout-contract-card">
      <div className="premium-skeleton premium-skeleton-line" style={{ width: "40%" }} />
      <div className="premium-skeleton premium-skeleton-line" style={{ width: "78%" }} />
      <div className="premium-skeleton premium-skeleton-card" />
      <div className="premium-skeleton premium-skeleton-card" />
    </div>
  );
}

const CreatorPostCard = dynamic<CreatorWorkspaceCardProps>(
  () => import("../../components/dashboard/CreatorPostCard").then((mod) => mod.CreatorPostCard),
  { loading: () => <CreatorWorkspacePanelSkeleton /> }
);
const CreatorMusicCard = dynamic<CreatorWorkspaceCardProps>(
  () => import("../../components/dashboard/CreatorMusicCard").then((mod) => mod.CreatorMusicCard),
  { loading: () => <CreatorWorkspacePanelSkeleton /> }
);
const CreatorScriptCard = dynamic<CreatorWorkspaceCardProps>(
  () => import("../../components/dashboard/CreatorScriptCard").then((mod) => mod.CreatorScriptCard),
  { loading: () => <CreatorWorkspacePanelSkeleton /> }
);
const CreatorAdsCard = dynamic<CreatorWorkspaceCardProps>(
  () => import("../../components/dashboard/CreatorAdsCard").then((mod) => mod.CreatorAdsCard),
  { loading: () => <CreatorWorkspacePanelSkeleton /> }
);
const CreatorClipsCard = dynamic<CreatorWorkspaceCardProps>(
  () => import("../../components/dashboard/CreatorClipsCard").then((mod) => mod.CreatorClipsCard),
  { loading: () => <CreatorWorkspacePanelSkeleton /> }
);
const CreatorLiveCutsCard = dynamic<CreatorWorkspaceCardProps>(
  () =>
    import("../../components/dashboard/CreatorLiveCutsCard").then((mod) => ({
      default: function CreatorLiveCutsWorkspaceCard() {
        return <mod.CreatorLiveCutsCard />;
      },
    })),
  { loading: () => <CreatorWorkspacePanelSkeleton /> }
);
const CreatorNoCodeCard = dynamic<CreatorWorkspaceCardProps>(
  () => import("../../components/dashboard/CreatorNoCodeCard").then((mod) => mod.CreatorNoCodeCard),
  { loading: () => <CreatorWorkspacePanelSkeleton /> }
);

type CreatorGroupId = "hero" | "secondary" | "labs";

const CREATOR_GROUPS: Array<{ id: CreatorGroupId; title: string; subtitle: string }> = [
  { id: "hero", title: "Creators hero", subtitle: "Núcleo principal do produto." },
  { id: "secondary", title: "Apoio estratégico", subtitle: "Apoio ao pipeline." },
  { id: "labs", title: "Labs e preview", subtitle: "Explorações fora do núcleo." },
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
    description: "Posts com legenda, CTA e variações prontos para o editor.",
    bestFor: "Publicação rápida.",
    expectedOutput: "Legenda principal, CTA e variações.",
    continuity: "Entra no editor como base de copy.",
    stageLabel: "Hero",
  },
  {
    id: "scripts",
    group: "hero",
    label: "Creator Scripts",
    description: "Roteiros curtos para vídeo e continuidade no editor.",
    bestFor: "Narrativa antes de gravar ou anunciar.",
    expectedOutput: "Roteiro com gancho, desenvolvimento e fechamento.",
    continuity: "Vira base de vídeo, anúncio ou apresentação.",
    stageLabel: "Hero",
  },
  {
    id: "ads",
    group: "secondary",
    label: "Creator Ads",
    description: "Peças de conversão com headline e CTA.",
    bestFor: "Campanhas quando o núcleo editorial já está claro.",
    expectedOutput: "Copy de anúncio e variações de conversão.",
    continuity: "Complementa campanhas.",
    stageLabel: "Apoio",
  },
  {
    id: "music",
    group: "secondary",
    label: "Creator Music",
    description: "Trilhas e direção sonora para acelerar produção.",
    bestFor: "Identidade sonora quando o conteúdo já está definido.",
    expectedOutput: "Direção musical e job de trilha com acompanhamento.",
    continuity: "Apoia o pipeline.",
    stageLabel: "Apoio",
  },
  {
    id: "clips",
    group: "hero",
    label: "Creator Clips",
    description: "Clipes com job assíncrono e continuidade para edição.",
    bestFor: "Ideia em vídeo curto.",
    expectedOutput: "Job de clipe com status, preview e rota para o editor.",
    continuity: "Fecha a trilha de vídeo.",
    stageLabel: "Hero",
  },
  {
    id: "live-cuts",
    group: "labs",
    label: "Creator Live Cuts",
    description: "Sessões de cortes ao vivo em fase inicial.",
    bestFor: "Operação recorrente de live fora do centro da proposta atual.",
    expectedOutput: "Sessão operacional com estimativa e acompanhamento.",
    continuity: "Ainda especializado.",
    stageLabel: "Lab",
  },
  {
    id: "no-code",
    group: "labs",
    label: "Creator No Code",
    description: "Blueprint inicial de produto.",
    bestFor: "Estruturação de ideia fora do núcleo criativo principal.",
    expectedOutput: "Estrutura inicial de produto e escopo.",
    continuity: "Exploração lateral.",
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
    nextStep: "Salvar no projeto e abrir no editor.",
  },
  {
    creator: "Creator Scripts",
    kicker: "Saída de roteiro",
    briefing: "Explicar em 40 segundos por que um anúncio sem prova social converte menos.",
    delivery: "Roteiro curto com abertura, argumento central e fechamento para gravação.",
    nextStep: "Virar clipe, anúncio ou base de apresentação.",
  },
  {
    creator: "Creator Clips",
    kicker: "Saída de vídeo curto",
    briefing: "Montar um clipe de apresentação com ritmo rápido e direção de cena.",
    delivery: "Job assíncrono com acompanhamento claro e continuidade para editar depois.",
    nextStep: "Salvar contexto e preparar a publicação.",
  },
];

const CREATOR_STAGE_GUIDANCE: Record<CreatorGroupId, { title: string; description: string }> = {
  hero: {
    title: "Creator hero do produto",
    description: "Faz parte do trio central com continuidade para o editor.",
  },
  secondary: {
    title: "Creator de apoio estratégico",
    description: "Complementa o pipeline sem carregar a promessa principal.",
  },
  labs: {
    title: "Creator em lab ou preview",
    description: "Continua disponível, mas fora do centro da proposta.",
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

function isFocusActivationKey(event: KeyboardEvent) {
  return event.key === "Enter" || event.key === " ";
}

export default function CreatorsPage() {
  return (
    <Suspense fallback={<div className="page-shell"><div className="layout-contract-card" style={{ padding: 16 }}>Carregando área de Creators...</div></div>}>
      <CreatorsPageContent />
    </Suspense>
  );
}

function CreatorsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() || "";
  const [activeTab, setActiveTab] = useState<CreatorTab>("post");
  const { activeSection, registerSection, focusSection } =
    useSectionFocus<CreatorsFocusSection>("workspace");

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
    setActiveTab(parseTab(searchParams?.get("tab") ?? null));
  }, [searchParams]);

  const walletCommon = Number(wallet?.common ?? 0);
  const hasWorkspaceSnapshot = Boolean(planLabel || wallet || projects.length > 0);
  const initialLoading = loading && !hasWorkspaceSnapshot;
  const walletSummary = useMemo(
    () => formatCreatorCoinsWalletSummary(wallet),
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
    focusSection("workspace", {
      scroll: options?.scrollToWorkspace ? "always" : "auto",
    });
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", nextTab);
    router.replace(`${pathname ?? "/creators"}?${params.toString()}`, { scroll: false });
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
      <section className="creators-hero creators-hero-open">
        <div className="hero-split creators-hero-split creators-hero-shell">
          <div className="hero-copy creators-hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Workspace de criação</p>
              <h1 style={{ margin: 0, letterSpacing: -0.35 }}>Creators</h1>
              <p className="creators-hero-lead">
                Briefing, geração, projeto e continuidade no mesmo workspace.
              </p>
            </div>

            <div className="hero-meta-row hero-meta-row-compact">
              <span className="premium-badge premium-badge-phase">Plano: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-soon">Creators hero no centro do produto</span>
            </div>

            <div className="hero-kpi-grid creators-hero-metrics creators-hero-metrics-compact">
              <div className="creators-hero-metric-card">
                <span className="hero-kpi-label">Ferramenta ativa</span>
                <strong className="hero-kpi-value">{activeTabMeta.label}</strong>
                <span className="hero-kpi-text">{activeTabMeta.bestFor}</span>
              </div>
              <div className="creators-hero-metric-card">
                <span className="hero-kpi-label">Saldo para operar</span>
                <strong className="hero-kpi-value">{walletSummaryDisplay}</strong>
                <span className="hero-kpi-text">{loading ? "Saldo e plano em sincronização." : `Estimativa antes da geração. Consumo real em ${CREATOR_COINS_PUBLIC_NAME}.`}</span>
              </div>
              <div className="creators-hero-metric-card">
                <span className="hero-kpi-label">Próximo passo</span>
                <strong className="hero-kpi-value">Gerar → editar → exportar</strong>
                <span className="hero-kpi-text">Projeto salvo e editor na mesma trilha.</span>
              </div>
            </div>
          </div>

          <div className="creators-hero-panel creators-hero-panel-quiet">
            <div className="section-stack">
              <p className="section-kicker">Controle operacional</p>
              <h2 className="creators-hero-panel-title">Criar com estrutura</h2>
              <p className="meta-text-ea creators-hero-panel-copy">
                Briefing, ação e resultado no mesmo eixo.
              </p>
            </div>

            <div className="creators-hero-panel-stack hero-side-list hero-side-list-compact">
              <div className="creators-hero-panel-note">
                <strong>Briefing e continuidade</strong>
                <span>Objetivo, contexto e resultado seguem juntos.</span>
              </div>
            </div>

            <div className="hero-actions-row creators-hero-panel-actions">
              <button
                onClick={async () => {
                  await onSyncSubscription();
                  await refresh();
                }}
                disabled={syncingSubscription || loading}
                className="btn-ea btn-ghost btn-sm"
              >
                {syncingSubscription ? "Sincronizando..." : "Sincronizar assinatura"}
              </button>
              <button onClick={onLogout} className="btn-ea btn-ghost btn-sm">
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

      <div className="creators-core-canvas layout-contract-region" data-reveal data-reveal-delay="60">
        <section className="proof-value-section creators-proof-section creators-flow-section surface-flow-region creators-flow-section-start layout-contract-region">
          <div className="proof-value-header">
            <div className="section-stack-tight">
              <p className="section-kicker">Exemplos de resultado</p>
              <h2 className="heading-reset">O que os creators hero podem destravar</h2>
              <p className="helper-text-ea">
                Exemplos do que o núcleo já entrega antes de virar projeto.
              </p>
            </div>
            <Link href="/projects" className="btn-link-ea btn-secondary btn-sm">
              Ver continuidade em Projetos
            </Link>
          </div>

          <div className="proof-value-grid proof-value-grid-creators">
            {CREATOR_SHOWCASES.map((item, index) => (
              <article
                key={item.creator}
                className={`proof-value-card layout-contract-item ${index === 0 ? "creators-proof-card-primary" : "creators-proof-card-support"}`}
                data-reveal
                data-reveal-delay={String(70 + index * 55)}
              >
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

      <section
        ref={registerSection("showcase")}
        className="creators-hero-core-section creators-flow-section surface-flow-region creators-flow-section-middle layout-contract-region focus-shell-section"
        data-focus-active={activeSection === "showcase"}
        data-reveal
        data-reveal-delay="90"
      >
        <div
          className="proof-value-header creators-hero-core-header focus-shell-head"
          data-focus-clickable={activeSection !== "showcase"}
          role={activeSection !== "showcase" ? "button" : undefined}
          tabIndex={activeSection !== "showcase" ? 0 : -1}
          onClick={activeSection !== "showcase" ? () => focusSection("showcase", { scroll: "auto" }) : undefined}
          onKeyDown={activeSection !== "showcase" ? (event) => {
            if (!isFocusActivationKey(event)) return;
            event.preventDefault();
            focusSection("showcase", { scroll: "auto" });
          } : undefined}
        >
          <div className="section-stack-tight">
            <p className="section-kicker">Creators hero</p>
            <h2 className="heading-reset">Os 3 creators que precisam carregar a plataforma</h2>
            <p className="helper-text-ea">
              <strong>Creator Post</strong>, <strong>Creator Scripts</strong> e <strong>Creator Clips</strong> seguem no centro. O quarto card entra como apoio.
            </p>
          </div>
          <div className="creators-hero-core-header-note">
            <span className="premium-badge premium-badge-phase">Núcleo principal</span>
            <span className="helper-text-ea">O resto do catálogo continua disponível, mas fora do centro.</span>
          </div>
          <button
            type="button"
            onClick={() => focusSection("showcase", { scroll: "auto" })}
            className={`btn-ea ${activeSection === "showcase" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
            aria-pressed={activeSection === "showcase"}
          >
            {activeSection === "showcase" ? "Em foco" : "Trazer para foco"}
          </button>
        </div>
        <div className="focus-shell-preview">
          O trio hero fica visível sem disputar o workspace.
        </div>
          <div className="focus-shell-body">
            <div className="creators-hero-core-grid">
              {heroCoreCards.map((tab, index) => (
                <article
                  key={tab.id}
                  className={`creators-hero-core-card layout-contract-item ${tab.group !== "hero" ? "creators-hero-core-card-support" : ""}`}
                  data-active={activeTab === tab.id}
                  data-group={tab.group}
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
          </div>
        </section>

      <section
        ref={registerSection("catalog")}
        className="creators-secondary-section creators-flow-section surface-flow-region creators-flow-section-middle layout-contract-region focus-shell-section"
        data-focus-active={activeSection === "catalog"}
        data-reveal
        data-reveal-delay="120"
      >
        <div
          className="proof-value-header creators-secondary-header focus-shell-head"
          data-focus-clickable={activeSection !== "catalog"}
          role={activeSection !== "catalog" ? "button" : undefined}
          tabIndex={activeSection !== "catalog" ? 0 : -1}
          onClick={activeSection !== "catalog" ? () => focusSection("catalog", { scroll: "auto" }) : undefined}
          onKeyDown={activeSection !== "catalog" ? (event) => {
            if (!isFocusActivationKey(event)) return;
            event.preventDefault();
            focusSection("catalog", { scroll: "auto" });
          } : undefined}
        >
          <div className="section-stack-tight">
            <p className="section-kicker">Apoio e labs</p>
            <h2 className="heading-reset">O restante do catálogo continua útil, mas com papel mais claro</h2>
            <p className="helper-text-ea">
              <strong>Apoio estratégico</strong> complementa campanhas e produção. <strong>Labs</strong> seguem para exploração.
            </p>
          </div>
          <button
            type="button"
            onClick={() => focusSection("catalog", { scroll: "auto" })}
            className={`btn-ea ${activeSection === "catalog" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
            aria-pressed={activeSection === "catalog"}
          >
            {activeSection === "catalog" ? "Em foco" : "Trazer para foco"}
          </button>
        </div>
        <div className="focus-shell-preview">
          Apoio e labs continuam acessíveis, com menos peso quando o foco está no creator ativo.
        </div>
          <div className="focus-shell-body">
            <div className="creators-secondary-grid">
              {secondaryCatalog.map((tab, index) => (
                <article key={tab.id} className="creators-secondary-card layout-contract-item" data-priority={tab.group} data-reveal data-reveal-delay={String(70 + index * 45)}>
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
          </div>
        </section>
      </div>

      <section
        ref={registerSection("workspace")}
        className="creator-workspace-shell creators-flow-section surface-flow-region creators-flow-section-end layout-contract-region focus-shell-section"
        data-focus-active={activeSection === "workspace"}
      >
        <div
          className="focus-shell-head"
          data-focus-clickable={activeSection !== "workspace"}
          role={activeSection !== "workspace" ? "button" : undefined}
          tabIndex={activeSection !== "workspace" ? 0 : -1}
          onClick={activeSection !== "workspace" ? () => focusSection("workspace", { scroll: "auto" }) : undefined}
          onKeyDown={activeSection !== "workspace" ? (event) => {
            if (!isFocusActivationKey(event)) return;
            event.preventDefault();
            focusSection("workspace", { scroll: "auto" });
          } : undefined}
        >
          <div className="section-header-ea">
            <h2 className="heading-reset">Workspace ativo</h2>
            <p className="helper-text-ea">Uma ferramenta por vez, com briefing, estimativa e continuidade no mesmo eixo.</p>
          </div>
          <button
            type="button"
            onClick={() => focusSection("workspace", { scroll: "auto" })}
            className={`btn-ea ${activeSection === "workspace" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
            aria-pressed={activeSection === "workspace"}
          >
            {activeSection === "workspace" ? "Em foco" : "Trazer para foco"}
          </button>
        </div>
        <div className="focus-shell-preview">
          O workspace concentra creator ativo, saldo e próximo passo.
        </div>
        <div className="focus-shell-body creator-workspace-grid">
        <aside className="creator-workspace-side creators-sidebar creators-sidebar-soft layout-contract-rail" data-reveal data-reveal-delay="140">
          <div className="creators-side-note creators-side-note-primary">
            <strong>Comece pelos creators hero</strong>
            <span>
              Publicação: <strong>Creator Post</strong> • Narrativa: <strong>Creator Scripts</strong> • Vídeo: <strong>Creator Clips</strong>
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
              <span>O Creator mostra a estimativa antes. Créditos confirma o consumo real.</span>
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
              <span>Revise fluxo, saldo e próximo passo sem sair daqui.</span>
              <Link href="/how-it-works" className="btn-link-ea btn-ghost btn-sm">
                Abrir guia rápido
              </Link>
            </div>
          </div>
        </aside>

        <div className="creator-workspace-main layout-contract-panel" data-reveal data-reveal-delay="180">
          {initialLoading ? (
            <CreatorWorkspacePanelSkeleton />
          ) : (
            <div className="creator-workspace-main-stack">
              {loading ? (
                <div className="creators-inline-note layout-contract-note">
                  <strong>Sincronização em segundo plano</strong>
                  <span>Saldo, plano e disponibilidade seguem em atualização.</span>
                </div>
              ) : null}
              <div className="creator-active-panel layout-contract-region">
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
                  <EditorRouteLink href="/editor/new" className="btn-link-ea btn-secondary btn-sm">
                    Abrir editor novo
                  </EditorRouteLink>
                </div>
              </div>
              {activeTab === "post" ? <CreatorPostCard planCode={planCodeRaw} walletCommon={walletCommon} onRefetch={refresh} /> : null}
              {activeTab === "music" ? <CreatorMusicCard planCode={planCodeRaw} walletCommon={walletCommon} onRefetch={refresh} /> : null}
              {activeTab === "scripts" ? <CreatorScriptCard planCode={planCodeRaw} walletCommon={walletCommon} onRefetch={refresh} /> : null}
              {activeTab === "ads" ? <CreatorAdsCard planCode={planCodeRaw} walletCommon={walletCommon} onRefetch={refresh} /> : null}
              {activeTab === "clips" ? <CreatorClipsCard planCode={planCodeRaw} walletCommon={walletCommon} onRefetch={refresh} /> : null}
              {activeTab === "live-cuts" ? (
                <CreatorLiveCutsCard
                  planCode={planCodeRaw}
                  walletCommon={walletCommon}
                  onRefetch={refresh}
                />
              ) : null}
              {activeTab === "no-code" ? (
                <CreatorNoCodeCard
                  planCode={planCodeRaw}
                  walletCommon={walletCommon}
                  onRefetch={refresh}
                />
              ) : null}
            </div>
          )}
        </div>
        </div>
      </section>
    </div>
  );
}
