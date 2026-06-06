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
  { id: "hero", title: "Formatos principais", subtitle: "Entrada principal de criação." },
  { id: "secondary", title: "Formatos de apoio", subtitle: "Campanhas e produção complementar." },
  { id: "labs", title: "Em exploração", subtitle: "Formatos disponíveis em evolução." },
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
    stageLabel: "Principal",
  },
  {
    id: "scripts",
    group: "hero",
    label: "Creator Scripts",
    description: "Roteiros curtos para vídeo e continuidade no editor.",
    bestFor: "Narrativa antes de gravar ou anunciar.",
    expectedOutput: "Roteiro com gancho, desenvolvimento e fechamento.",
    continuity: "Vira base de vídeo, anúncio ou apresentação.",
    stageLabel: "Principal",
  },
  {
    id: "ads",
    group: "secondary",
    label: "Creator Ads",
    description: "Peças de conversão com headline e CTA.",
    bestFor: "Campanhas com mensagem já definida.",
    expectedOutput: "Copy de anúncio e variações de conversão.",
    continuity: "Complementa a campanha.",
    stageLabel: "Apoio",
  },
  {
    id: "music",
    group: "secondary",
    label: "Creator Music",
    description: "Trilhas e direção sonora para acelerar produção.",
    bestFor: "Identidade sonora quando o conteúdo já está definido.",
    expectedOutput: "Direção musical e job de trilha com acompanhamento.",
    continuity: "Apoia a produção.",
    stageLabel: "Apoio",
  },
  {
    id: "clips",
    group: "hero",
    label: "Creator Clips",
    description: "Clipes com job assíncrono e continuidade para edição.",
    bestFor: "Ideia em vídeo curto.",
    expectedOutput: "Job de clipe com status, preview e rota para o editor.",
    continuity: "Segue para revisão de vídeo.",
    stageLabel: "Principal",
  },
  {
    id: "live-cuts",
    group: "labs",
    label: "Creator Live Cuts",
    description: "Sessões de cortes ao vivo em fase inicial.",
    bestFor: "Cortes recorrentes de lives.",
    expectedOutput: "Sessão operacional com estimativa e acompanhamento.",
    continuity: "Formato especializado.",
    stageLabel: "Experimento",
  },
  {
    id: "no-code",
    group: "labs",
    label: "Creator No Code",
    description: "Blueprint inicial de produto.",
    bestFor: "Estruturar uma ideia de produto.",
    expectedOutput: "Estrutura inicial de produto e escopo.",
    continuity: "Exploração de produto.",
    stageLabel: "Experimento",
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
    title: "Formato principal",
    description: "Boa entrada para transformar pedido em material pronto para revisar.",
  },
  secondary: {
    title: "Formato de apoio",
    description: "Ajuda campanhas e produção quando o pedido principal já está claro.",
  },
  labs: {
    title: "Formato em exploração",
    description: "Disponível para testes e usos especializados.",
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
  const activeShowcase = useMemo(
    () => CREATOR_SHOWCASES.find((item) => item.creator === activeTabMeta.label) ?? CREATOR_SHOWCASES[0],
    [activeTabMeta.label]
  );
  const supportHeroCreator = useMemo(
    () => secondaryCreators.find((tab) => tab.id === "ads") ?? secondaryCreators[0] ?? null,
    [secondaryCreators]
  );
  const featuredCreatorFormat = useMemo(
    () => heroCreators.find((tab) => tab.id === "post") ?? heroCreators[0] ?? null,
    [heroCreators]
  );
  const compactHeroFormats = useMemo(
    () => heroCreators.filter((tab) => tab.id !== featuredCreatorFormat?.id),
    [heroCreators, featuredCreatorFormat?.id]
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
    <div
      className="page-shell creators-page creators-dashboard-system-page creators-lasy-system-page"
      data-creators-system="dashboard-parity"
      data-creators-composition="continuous-field"
      data-creators-reference="lasy-meta"
    >
      <section className="creators-hero creators-hero-open">
        <div className="creators-hero-scene creators-hero-shell creators-lasy-hero-shell" data-creators-hero="single-scene">
          <div className="hero-copy creators-hero-copy creators-lasy-hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Creators • criação guiada</p>
              <h1 style={{ margin: 0, letterSpacing: -0.35 }}>Transforme ideia em briefing pronto</h1>
              <p className="creators-hero-lead">
                Escolha o formato, descreva o pedido e gere um briefing pronto para seguir ao editor ou salvar como projeto.
              </p>
            </div>

            <div className="hero-meta-row hero-meta-row-compact">
              <span className="premium-badge premium-badge-phase">Plano: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-soon">Formatos principais no centro</span>
            </div>
          </div>

          <div className="creators-hero-panel creators-entry-command creators-entry-surface creators-entry-field creators-lasy-entry">
            <div className="section-stack-tight creators-entry-heading">
              <p className="section-kicker">Pedido de criação</p>
              <h2 className="creators-hero-panel-title">Briefing guiado</h2>
              <p className="meta-text-ea creators-hero-panel-copy">
                Transforme o pedido em base de criação com formato, contexto e próximo passo definidos.
              </p>
            </div>

            <div className="creators-lasy-command-field creators-entry-command-field" data-creators-command="primary">
              <div className="creators-entry-prompt-shell creators-entry-prompt-field" aria-label={`Exemplo de pedido para ${activeTabMeta.label}`}>
                <span className="creators-entry-prompt-label">Pedido para {activeTabMeta.label}</span>
                <p>{activeShowcase.briefing}</p>
              </div>

              <div className="hero-actions-row creators-hero-panel-actions creators-entry-actions creators-entry-cta-stack">
                <button
                  type="button"
                  onClick={() => focusSection("workspace", { scroll: "always" })}
                  className="btn-ea btn-primary btn-sm"
                >
                  Abrir briefing guiado
                </button>
                <button
                  type="button"
                  onClick={() => focusSection("showcase", { scroll: "always" })}
                  className="btn-ea btn-ghost btn-sm"
                >
                  Ver tipos de entrega
                </button>
              </div>
            </div>

            <div className="creators-entry-context-strip" aria-label="Contexto do briefing inicial">
              <div className="creators-entry-prompt-meta">
                <span>{activeTabMeta.expectedOutput}</span>
                <span>{walletSummaryDisplay}</span>
              </div>
              <div className="creators-entry-type-strip" aria-label="Tipos principais de entrega">
                {heroCreators.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    data-active={activeTab === tab.id}
                    onClick={() => activateTab(tab.id, { scrollToWorkspace: false })}
                  >
                    {tab.label.replace("Creator ", "")}
                  </button>
                ))}
              </div>
            </div>

          </div>

        </div>
      </section>

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível carregar a área de Creators</p>
          <div className="state-ea-text">{toUserFacingError(error, "Atualize a área de criação e tente novamente.")}</div>
          <div className="state-ea-actions">
            <button onClick={refresh} className="btn-ea btn-secondary btn-sm">Atualizar</button>
            <Link href="/support" className="btn-link-ea btn-ghost btn-sm">Pedir ajuda</Link>
          </div>
        </div>
      ) : null}

      <div className="creators-core-canvas layout-contract-region" data-reveal data-reveal-delay="60">
        <section className="proof-value-section creators-proof-section creators-flow-section surface-flow-region creators-flow-section-start layout-contract-region creators-open-track">
          <div className="proof-value-header">
            <div className="section-stack-tight">
              <p className="section-kicker">Exemplos de resultado</p>
              <h2 className="heading-reset">Três saídas que já nascem com próximo passo</h2>
              <p className="helper-text-ea">
                Briefing, entrega e continuidade aparecem como prova de fluxo, antes de virar projeto.
              </p>
            </div>
            <Link href="/projects" className="btn-link-ea btn-secondary btn-sm">
              Ver continuidade em Projetos
            </Link>
          </div>

          <div className="proof-value-grid proof-value-grid-creators creators-proof-stream creators-editorial-stream">
            {CREATOR_SHOWCASES.map((item, index) => {
              const proofBody = (
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
              );

              return (
                <article
                  key={item.creator}
                  className={`proof-value-card layout-contract-item creators-open-module creators-editorial-item ${index === 0 ? "creators-proof-card-primary" : "creators-proof-card-support"}`}
                  data-featured={index === 0 ? "true" : "false"}
                  data-reveal
                  data-reveal-delay={String(70 + index * 55)}
                >
                  <div className="proof-value-meta-row">
                    <span className="proof-value-kicker">{item.kicker}</span>
                    <span className="proof-value-chip">{item.creator}</span>
                  </div>
                  {proofBody}
                </article>
              );
            })}
          </div>
        </section>

      <section
        ref={registerSection("showcase")}
        className="creators-hero-core-section creators-flow-section surface-flow-region creators-flow-section-middle layout-contract-region focus-shell-section creators-open-track"
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
            <p className="section-kicker">Formatos principais</p>
            <h2 className="heading-reset">Escolha o ponto de partida da criação</h2>
            <p className="helper-text-ea">
              <strong>Creator Post</strong>, <strong>Creator Scripts</strong> e <strong>Creator Clips</strong> formam a linha principal. <strong>Creator Ads</strong> entra como apoio de conversão.
            </p>
          </div>
          <div className="creators-hero-core-header-note">
            <span className="premium-badge premium-badge-phase">Prioridade de criação</span>
            <span className="helper-text-ea">Os demais formatos continuam disponíveis sem competir com o briefing.</span>
          </div>
          <button
            type="button"
            onClick={() => focusSection("showcase", { scroll: "auto" })}
            className={`btn-ea ${activeSection === "showcase" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
            aria-pressed={activeSection === "showcase"}
          >
            {activeSection === "showcase" ? "Em foco" : "Ver formatos"}
          </button>
        </div>
        <div className="focus-shell-preview">
          A seleção orienta o builder sem virar catálogo técnico.
        </div>
          <div className="focus-shell-body">
            <div className="creators-format-vitrine" aria-label="Vitrine de formatos principais">
              {featuredCreatorFormat ? (
                <article
                  className="creators-format-vitrine-feature layout-contract-item creators-open-module"
                  data-active={activeTab === featuredCreatorFormat.id}
                  data-reveal
                  data-reveal-delay="70"
                >
                  <div className="creators-format-vitrine-eyebrow">
                    <span className={`premium-badge premium-badge-${creatorStageTone(featuredCreatorFormat.group)}`}>{featuredCreatorFormat.stageLabel}</span>
                    <span>Escolha principal para começar</span>
                  </div>
                  <div className="creators-format-vitrine-feature-copy">
                    <h3 className="heading-reset">{featuredCreatorFormat.label}</h3>
                    <p className="helper-text-ea">{featuredCreatorFormat.description}</p>
                  </div>
                  <div className="creators-format-vitrine-proof" aria-label={`${featuredCreatorFormat.label}: resumo do formato`}>
                    <div>
                      <span>Para</span>
                      <strong>{featuredCreatorFormat.bestFor}</strong>
                    </div>
                    <div>
                      <span>Entrega</span>
                      <strong>{featuredCreatorFormat.expectedOutput}</strong>
                    </div>
                    <div>
                      <span>Continua em</span>
                      <strong>{featuredCreatorFormat.continuity}</strong>
                    </div>
                  </div>
                  <div className="creators-format-vitrine-actions">
                    <button onClick={() => activateTab(featuredCreatorFormat.id, { scrollToWorkspace: true })} className="btn-ea btn-primary btn-sm">
                      Usar este formato
                    </button>
                    <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">
                      Ver continuidade em Projetos
                    </Link>
                  </div>
                </article>
              ) : null}

              <div className="creators-format-vitrine-side" aria-label="Alternativas principais">
                <div className="creators-format-vitrine-alternatives">
                  {compactHeroFormats.map((tab, index) => (
                    <article
                      key={tab.id}
                      className="creators-format-vitrine-option layout-contract-item creators-open-module"
                      data-active={activeTab === tab.id}
                      data-reveal
                      data-reveal-delay={String(95 + index * 45)}
                    >
                      <div className="creators-format-vitrine-option-head">
                        <span className={`premium-badge premium-badge-${creatorStageTone(tab.group)}`}>{tab.stageLabel}</span>
                        <h3 className="heading-reset">{tab.label}</h3>
                      </div>
                      <p className="helper-text-ea">{tab.description}</p>
                      <div className="creators-format-vitrine-option-meta">
                        <span>{tab.bestFor}</span>
                        <strong>{tab.expectedOutput}</strong>
                      </div>
                      <div className="creators-format-vitrine-actions creators-format-vitrine-actions-compact">
                        <button onClick={() => activateTab(tab.id, { scrollToWorkspace: true })} className="btn-ea btn-ghost btn-sm">
                          Usar formato
                        </button>
                        <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">
                          Projetos
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>

                {supportHeroCreator ? (
                  <article
                    className="creators-format-vitrine-support layout-contract-item creators-open-module"
                    data-active={activeTab === supportHeroCreator.id}
                    data-reveal
                    data-reveal-delay="190"
                  >
                    <div>
                      <span className={`premium-badge premium-badge-${creatorStageTone(supportHeroCreator.group)}`}>{supportHeroCreator.stageLabel}</span>
                      <strong>{supportHeroCreator.label}</strong>
                    </div>
                    <p className="helper-text-ea">{supportHeroCreator.description}</p>
                    <button onClick={() => activateTab(supportHeroCreator.id, { scrollToWorkspace: true })} className="btn-ea btn-ghost btn-sm">
                      Usar como apoio
                    </button>
                  </article>
                ) : null}
              </div>
            </div>
          </div>
        </section>

      <section
        ref={registerSection("catalog")}
        className="creators-secondary-section creators-flow-section surface-flow-region creators-flow-section-middle layout-contract-region focus-shell-section creators-open-track"
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
            <p className="section-kicker">Apoio e exploração</p>
            <h2 className="heading-reset">Apoios que ampliam a criação sem virar configuração</h2>
            <p className="helper-text-ea">
              <strong>Formatos de apoio</strong> complementam campanhas e produção. <strong>Experimentos</strong> seguem como trilhas leves de validação.
            </p>
          </div>
          <button
            type="button"
            onClick={() => focusSection("catalog", { scroll: "auto" })}
            className={`btn-ea ${activeSection === "catalog" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
            aria-pressed={activeSection === "catalog"}
          >
            {activeSection === "catalog" ? "Em foco" : "Ver catálogo"}
          </button>
        </div>
        <div className="focus-shell-preview">
          Apoio e experimentos ficam acessíveis como extensão do fluxo, não como documentação.
        </div>
          <div className="focus-shell-body">
            <div className="creators-secondary-grid creators-secondary-stream creators-decision-stream creators-decision-stream-secondary">
              {secondaryCatalog.map((tab, index) => (
                <details
                  key={tab.id}
                  className="creators-secondary-card creators-secondary-disclosure layout-contract-item creators-open-module creators-decision-item creators-decision-item-secondary"
                  data-priority={tab.group}
                  data-reveal
                  data-reveal-delay={String(70 + index * 45)}
                  open={activeTab === tab.id}
                >
                  <summary>
                    <span className="creators-secondary-card-head">
                      <strong>{tab.label}</strong>
                      <span className={`premium-badge premium-badge-${creatorStageTone(tab.group)}`}>{tab.stageLabel}</span>
                    </span>
                    <span className="creators-secondary-summary-copy">{tab.expectedOutput}</span>
                  </summary>
                  <div className="creators-secondary-disclosure-body">
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
                      Usar este formato
                    </button>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section
        ref={registerSection("workspace")}
        className="creator-workspace-shell creators-flow-section surface-flow-region creators-flow-section-end layout-contract-region focus-shell-section creators-open-track creators-workspace-field"
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
            <h2 className="heading-reset">Criação ativa</h2>
            <p className="helper-text-ea">Um formato por vez, com ideia, revisão e continuidade no mesmo eixo.</p>
          </div>
          <button
            type="button"
            onClick={() => focusSection("workspace", { scroll: "auto" })}
            className={`btn-ea ${activeSection === "workspace" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
            aria-pressed={activeSection === "workspace"}
          >
            {activeSection === "workspace" ? "Em foco" : "Abrir criação"}
          </button>
        </div>
        <div className="focus-shell-preview">
          A criação começa pela ideia. Formato, saldo e conta ficam como apoio.
        </div>
        <div className="focus-shell-body creator-workspace-grid">
        <div className="creator-workspace-main layout-contract-panel" data-reveal data-reveal-delay="140">
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
              <div className="creator-workspace-operational-strip" aria-label="Contexto operacional da criação">
                <div className="creator-workspace-operational-item">
                  <span>Formato atual</span>
                  <strong>{activeTabMeta.label}</strong>
                  <small>{activeTabMeta.bestFor}</small>
                </div>
                <div className="creator-workspace-operational-item">
                  <span>Disponibilidade</span>
                  <strong>{planLabelDisplay} · {walletSummaryDisplay}</strong>
                  <small>{loading ? "Sincronizando disponibilidade." : `Custo final em ${CREATOR_COINS_PUBLIC_NAME}.`}</small>
                </div>
                <div className="creator-workspace-operational-item">
                  <span>Próximo passo</span>
                  <strong>Criar → revisar → salvar</strong>
                  <small>Projeto e editor seguem com o mesmo contexto.</small>
                </div>
                <div className="creator-workspace-account-actions">
                  <span>Conta</span>
                  <button
                    onClick={async () => {
                      await onSyncSubscription();
                      await refresh();
                    }}
                    disabled={syncingSubscription || loading}
                    className="btn-ea btn-ghost btn-sm"
                  >
                    {syncingSubscription ? "Sincronizando..." : "Sincronizar"}
                  </button>
                  <button onClick={onLogout} className="btn-ea btn-ghost btn-sm">
                    Sair
                  </button>
                </div>
              </div>
              <div className="creator-active-panel layout-contract-region">
                <div className="creator-active-panel-head">
                  <div className="section-stack">
                    <p className="section-kicker">Criação ativa</p>
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
                    <span>O que sai</span>
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
        <aside className="creator-workspace-side creators-sidebar creators-sidebar-soft layout-contract-rail creators-format-rail creators-context-ribbon" data-reveal data-reveal-delay="180">
          <div className="creators-side-note creators-side-note-primary">
            <strong>Comece pelos formatos principais</strong>
            <span>
              Publicação: <strong>Creator Post</strong> • Narrativa: <strong>Creator Scripts</strong> • Vídeo: <strong>Creator Clips</strong>
            </span>
          </div>

          <div className="creators-sidebar-nav">
            {tabsByGroup.map((group) => (
              group.id === "hero" ? (
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
              ) : (
                <details
                  key={group.id}
                  className="creators-sidebar-group creators-sidebar-group-disclosure"
                  open={activeTabMeta.group === group.id}
                >
                  <summary>
                    <span className="creator-group-title">{group.title}</span>
                    <span className="creator-group-subtitle">{group.subtitle}</span>
                  </summary>
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
                </details>
              )
            ))}
          </div>

          <div className="creators-sidebar-stack">
            <div className="creators-side-note">
              <strong>{activeTabMeta.label}</strong>
              <span>{activeTabMeta.bestFor}</span>
            </div>

            <details className="creators-side-note creators-side-disclosure creators-wallet-panel">
              <summary>
                <span>Saldo</span>
                <strong>{walletCommon} Comum</strong>
              </summary>
              <span>Estimativa antes de gerar; Créditos confirma o consumo real.</span>
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
            </details>

            <details className="creators-side-note creators-side-disclosure">
              <summary>
                <span>Guia</span>
                <strong>Contexto rápido</strong>
              </summary>
              <span>Revise fluxo, saldo e próximo passo sem sair daqui.</span>
              <Link href="/how-it-works" className="btn-link-ea btn-ghost btn-sm">
                Abrir guia rápido
              </Link>
            </details>
          </div>
        </aside>
        </div>
      </section>
    </div>
  );
}
