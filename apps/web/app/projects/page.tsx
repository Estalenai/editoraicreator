"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { GitHubWorkspaceCard } from "../../components/projects/GitHubWorkspaceCard";
import { VercelPublishCard } from "../../components/projects/VercelPublishCard";
import { ensureCanonicalProjectData, getCanonicalProjectSummary } from "../../lib/projectModel";

function getProjectId(project: any) {
  return String(project?.id || project?.project_id || "").trim();
}

type ProjectsFocusSection = "list" | "publish" | "handoff";

export default function ProjectsPage() {
  const {
    loading,
    error,
    email,
    planLabel,
    projects,
    betaAccess,
    betaBlocked,
    refresh,
    onLogout,
  } = useDashboardBootstrap({ loadDashboard: true });

  const normalizedProjects = useMemo(
    () =>
      projects.map((project: any) => {
        const title = project?.name || project?.title || project?.id || "Projeto sem título";
        const kind = String(project?.kind || project?.type || "projeto");
        const data = ensureCanonicalProjectData(project?.data, {
          projectKind: kind,
          projectTitle: title,
        });
        const summary = getCanonicalProjectSummary(data, {
          projectKind: kind,
          projectTitle: title,
        });
        return {
          id: getProjectId(project),
          title,
          kind,
          updatedAt: project?.updated_at || project?.created_at || null,
          data,
          summary,
        };
      }),
    [projects]
  );
  const [activeSection, setActiveSection] = useState<ProjectsFocusSection>("list");

  const planLabelDisplay = loading ? "Sincronizando plano" : planLabel ?? "—";
  const projectCountLabel = loading
    ? "Projetos em sincronização"
    : `${normalizedProjects.length} projeto(s) disponível(is)`;
  const leadProject = normalizedProjects[0] ?? null;
  const leadProjectHref = leadProject?.id ? `/editor/${leadProject.id}` : "/editor/new";
  const leadProjectMeta = loading
    ? "A lista completa entra logo abaixo, assim que a base terminar de sincronizar."
    : leadProject
      ? `${leadProject.kind} • ${leadProject.summary.outputStageLabel} • ${leadProject.summary.reviewStatusLabel}${
          leadProject.updatedAt
            ? ` • atualizado em ${new Date(leadProject.updatedAt).toLocaleDateString("pt-BR")}`
            : ""
        }`
      : "Abra um novo projeto e siga pela mesma trilha operacional que continua logo abaixo.";

  if (betaBlocked) {
    return <BetaAccessBlockedView email={email} status={betaAccess?.status} onLogout={onLogout} />;
  }

  return (
    <div className="page-shell projects-page">
      <section className="projects-hero projects-hero-open">
        <div className="hero-split projects-hero-split">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Continuidade</p>
              <h1 style={{ margin: 0, letterSpacing: -0.3 }}>Projetos</h1>
              <p className="section-header-copy hero-copy-compact">
                Projetos é o hub de continuidade do beta pago/controlado: abra um draft salvo, continue no editor, acompanhe a saída e só então leve o trabalho para fora da plataforma quando fizer sentido.
              </p>
            </div>
            <div className="hero-meta-row">
              <span className="premium-badge premium-badge-phase">Plano: {planLabelDisplay}</span>
              <span className="premium-badge premium-badge-soon">{projectCountLabel}</span>
            </div>
            <div className="projects-hero-bridge-stack">
              <span className="projects-hero-bridge-label">
                {loading ? "Sincronizando continuidade" : leadProject ? "Continue agora" : "Pronto para abrir"}
              </span>
              {loading ? (
                <div className="projects-hero-bridge" aria-live="polite">
                  <div className="projects-hero-bridge-main">
                    <strong>Carregando projetos salvos</strong>
                    <span className="projects-hero-bridge-meta">{leadProjectMeta}</span>
                  </div>
                  <span className="projects-hero-bridge-cta">Sincronizando</span>
                </div>
              ) : (
                <Link href={leadProjectHref} className="projects-hero-bridge">
                  <div className="projects-hero-bridge-main">
                    <strong>{leadProject ? leadProject.title : "Abrir um novo projeto"}</strong>
                    <span className="projects-hero-bridge-meta">{leadProjectMeta}</span>
                  </div>
                  <span className="projects-hero-bridge-cta">
                    {leadProject ? "Continuar" : "Criar agora"}
                  </span>
                </Link>
              )}
            </div>
          </div>

          <div className="projects-hero-panel projects-hero-panel-quiet">
            <div className="projects-hero-panel-list">
              <div className="projects-hero-note">
                <strong>Abra e continue</strong>
                <span>Retome um draft salvo diretamente na lista logo abaixo.</span>
              </div>
              <div className="projects-hero-note">
                <strong>Saída e handoff em apoio</strong>
                <span>Draft, exported e published ficam claros, com GitHub e Vercel só como camada secundária.</span>
              </div>
            </div>

            <div className="hero-actions-row projects-hero-actions">
              <Link href="/editor/new" className="btn-link-ea btn-primary">
                Novo projeto
              </Link>
              <Link href="/dashboard" className="btn-link-ea btn-ghost">
                Voltar ao dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível carregar os projetos</p>
          <div className="state-ea-text">{error}</div>
          <div className="state-ea-actions">
            <button onClick={refresh} className="btn-ea btn-secondary btn-sm">
              Atualizar
            </button>
          </div>
        </div>
      ) : null}

      <section className="projects-list-section projects-list-open projects-flow-section projects-flow-section-start focus-shell-section" data-focus-active={activeSection === "list"}>
        <div className="section-head focus-shell-head">
          <div className="section-header-ea">
            <h2 className="heading-reset">Abrir no editor</h2>
            <p className="helper-text-ea">
              Retome um projeto existente ou crie um novo para seguir no núcleo principal do beta: creators hero, editor, checkpoint e saída.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveSection("list")}
            className={`btn-ea ${activeSection === "list" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
            aria-pressed={activeSection === "list"}
          >
            {activeSection === "list" ? "Em foco" : "Trazer para foco"}
          </button>
        </div>
        <div className="focus-shell-preview">
          Abra um projeto salvo ou inicie um novo sem deixar as camadas de saída competirem na mesma leitura.
        </div>
        <div className="focus-shell-body">

        {loading ? (
          <div className="state-ea-spaced projects-loading-stack">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="premium-skeleton premium-skeleton-card" />
            ))}
          </div>
        ) : normalizedProjects.length === 0 ? (
          <div className="state-ea state-ea-spaced">
            <p className="state-ea-title">Nenhum projeto salvo ainda</p>
            <div className="state-ea-text">
              Comece em Creators ou abra um novo projeto direto no editor para criar sua primeira base.
            </div>
            <div className="state-ea-actions">
              <Link href="/editor/new" className="btn-link-ea btn-primary btn-sm">
                Criar projeto
              </Link>
              <Link href="/creators" className="btn-link-ea btn-ghost btn-sm">
                Ir para Creators
              </Link>
            </div>
          </div>
        ) : (
          <div className="dashboard-section-body projects-list-stack">
            {normalizedProjects.map((project, index) => (
              <Link
                key={project.id || project.title}
                href={project.id ? `/editor/${project.id}` : "/editor/new"}
                className="dashboard-project-link layout-contract-item"
              >
                <div className="dashboard-project-link-main">
                  <span className="dashboard-project-link-title">{project.title}</span>
                  <span className="dashboard-project-link-meta">
                    {project.kind} • {project.summary.outputStageLabel} • {project.summary.reviewStatusLabel}
                    {project.updatedAt
                      ? ` • atualizado em ${new Date(project.updatedAt).toLocaleDateString("pt-BR")}`
                      : ""}
                  </span>
                </div>
                <span className="dashboard-project-link-cta">{project.summary.deliverable.label}</span>
              </Link>
            ))}
          </div>
        )}
        </div>
      </section>

      <section className="projects-publish-section projects-publish-open projects-flow-section projects-flow-section-middle focus-shell-section" data-focus-active={activeSection === "publish"}>
        <div className="focus-shell-head">
        <div className="section-header-ea">
          <p className="section-kicker">Pipeline de saída</p>
          <h2 className="heading-reset">Draft, exported e published sem ambiguidade</h2>
          <p className="helper-text-ea">
            O beta pago/controlado separa três estados e mantém trilha de saída: o que ainda está em rascunho no projeto, o que já saiu como handoff exportado e o que já foi publicado manualmente fora da plataforma.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveSection("publish")}
          className={`btn-ea ${activeSection === "publish" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
          aria-pressed={activeSection === "publish"}
        >
          {activeSection === "publish" ? "Em foco" : "Trazer para foco"}
        </button>
        </div>
        <div className="focus-shell-preview">
          Veja os três estados de saída sem abrir o handoff completo enquanto a prioridade ainda é seguir no editor.
        </div>
        <div className="focus-shell-body">
        <div className="proof-value-grid projects-publish-grid">
          <div className="proof-value-card layout-contract-item">
            <div className="proof-value-block">
              <span className="proof-value-chip">Draft</span>
              <strong>No editor e em Projetos</strong>
              <p>Projeto salvo, contexto ativo e entregável ainda em refinamento.</p>
            </div>
          </div>
          <div className="proof-value-card layout-contract-item">
            <div className="proof-value-block">
              <span className="proof-value-chip">Exported</span>
              <strong>Handoff beta gerado</strong>
              <p>Snapshot GitHub ou manifest Vercel já saíram da plataforma para continuidade manual.</p>
            </div>
          </div>
          <div className="proof-value-card layout-contract-item">
            <div className="proof-value-block">
              <span className="proof-value-chip">Published</span>
              <strong>Publicado com confirmação manual</strong>
              <p>Publicação informada manualmente na base beta da Vercel, sem fingir sincronização automática.</p>
            </div>
          </div>
        </div>
        </div>
      </section>

      <section className="projects-handoff-section projects-handoff-open projects-flow-section projects-flow-section-end focus-shell-section" data-focus-active={activeSection === "handoff"}>
        <div className="section-head focus-shell-head">
          <div className="section-header-ea">
            <h2 className="heading-reset">Handoff beta e publicação manual</h2>
            <p className="helper-text-ea">
              GitHub e Vercel continuam disponíveis para saída manual, mas entram apenas como continuação do fluxo principal de projetos.
            </p>
          </div>
          <div className="hero-actions-row">
            <Link href="/support" className="btn-link-ea btn-ghost btn-sm">
              Entender limites do beta
            </Link>
            <button
              type="button"
              onClick={() => setActiveSection("handoff")}
              className={`btn-ea ${activeSection === "handoff" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
              aria-pressed={activeSection === "handoff"}
            >
              {activeSection === "handoff" ? "Em foco" : "Trazer para foco"}
            </button>
          </div>
        </div>
        <div className="focus-shell-preview">
          GitHub e Vercel seguem disponíveis como camada de saída manual, sem tomar a frente da lista de projetos.
        </div>
        <div className="focus-shell-body">
        <div className="projects-handoff-stack">
          <GitHubWorkspaceCard projects={normalizedProjects.map((project) => ({ id: project.id, title: project.title, kind: project.kind, data: project.data }))} />
          <VercelPublishCard projects={normalizedProjects.map((project) => ({ id: project.id, title: project.title, kind: project.kind, data: project.data }))} />
        </div>
        </div>
      </section>
    </div>
  );
}
