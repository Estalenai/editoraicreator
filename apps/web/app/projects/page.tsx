"use client";

import Link from "next/link";
import { useMemo, type KeyboardEvent } from "react";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { useSectionFocus } from "../../hooks/useSectionFocus";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { GitHubWorkspaceCard } from "../../components/projects/GitHubWorkspaceCard";
import { PublishConfidenceState } from "../../components/projects/PublishConfidenceState";
import { VercelPublishCard } from "../../components/projects/VercelPublishCard";
import { OperationalState } from "../../components/ui/OperationalState";
import { ensureCanonicalProjectData, getCanonicalProjectSummary } from "../../lib/projectModel";

function getProjectId(project: any) {
  return String(project?.id || project?.project_id || "").trim();
}

type ProjectsFocusSection = "list" | "publish" | "handoff";

function isFocusActivationKey(event: KeyboardEvent) {
  return event.key === "Enter" || event.key === " ";
}

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
  const { activeSection, registerSection, focusSection } =
    useSectionFocus<ProjectsFocusSection>("list");

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
                Abra um draft salvo, continue no editor e acompanhe a saída com clareza.
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
                  <span>Draft, exported e published ficam claros, com GitHub e Vercel rastreados pelo backend.</span>
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
        <OperationalState
          kind="error"
          title="Não foi possível carregar os projetos"
          description={error}
          meta={[
            { label: "Escopo", value: "Lista, pipeline e handoff" },
            { label: "Impacto", value: "Sem leitura confiável da continuidade" },
          ]}
          actions={
            <button onClick={refresh} className="btn-ea btn-secondary btn-sm">
              Atualizar
            </button>
          }
        />
      ) : null}

      <section
        ref={registerSection("list")}
        className="projects-list-section projects-list-open projects-flow-section projects-flow-section-start focus-shell-section"
        data-focus-active={activeSection === "list"}
      >
        <div
          className="section-head focus-shell-head"
          data-focus-clickable={activeSection !== "list"}
          role={activeSection !== "list" ? "button" : undefined}
          tabIndex={activeSection !== "list" ? 0 : -1}
          onClick={activeSection !== "list" ? () => focusSection("list", { scroll: "auto" }) : undefined}
          onKeyDown={activeSection !== "list" ? (event) => {
            if (!isFocusActivationKey(event)) return;
            event.preventDefault();
            focusSection("list", { scroll: "auto" });
          } : undefined}
        >
          <div className="section-header-ea">
            <h2 className="heading-reset">Abrir no editor</h2>
            <p className="helper-text-ea">
              Retome um projeto existente ou crie um novo para seguir no editor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => focusSection("list", { scroll: "auto" })}
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
          <OperationalState
            kind="loading"
            title="Carregando projetos e continuidade"
            description="Lista, estados draft/exported/published e handoff em sincronização."
            meta={[
              { label: "Lista", value: "Projetos salvos" },
              { label: "Saída", value: "Pipeline draft/exported/published" },
              { label: "Sync", value: "GitHub server-owned e Vercel em apoio" },
            ]}
            footer="A visualização só entra completa depois que a camada de continuidade responde com segurança."
          />
        ) : normalizedProjects.length === 0 ? (
          <OperationalState
            kind="empty"
            title="Nenhum projeto salvo ainda"
            description="Comece em Creators ou abra um novo projeto direto no editor."
            meta={[
              { label: "Primeiro marco", value: "Salvar projeto" },
              { label: "Depois disso", value: "Checkpoint, exported e published" },
            ]}
            actions={
              <>
                <Link href="/editor/new" className="btn-link-ea btn-primary btn-sm">
                  Criar projeto
                </Link>
                <Link href="/creators" className="btn-link-ea btn-ghost btn-sm">
                  Ir para Creators
                </Link>
              </>
            }
          />
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

      <section
        ref={registerSection("publish")}
        className="projects-publish-section projects-publish-open projects-flow-section projects-flow-section-middle focus-shell-section"
        data-focus-active={activeSection === "publish"}
      >
        <div
          className="focus-shell-head"
          data-focus-clickable={activeSection !== "publish"}
          role={activeSection !== "publish" ? "button" : undefined}
          tabIndex={activeSection !== "publish" ? 0 : -1}
          onClick={activeSection !== "publish" ? () => focusSection("publish", { scroll: "auto" }) : undefined}
          onKeyDown={activeSection !== "publish" ? (event) => {
            if (!isFocusActivationKey(event)) return;
            event.preventDefault();
            focusSection("publish", { scroll: "auto" });
          } : undefined}
        >
        <div className="section-header-ea">
          <p className="section-kicker">Pipeline de saída</p>
          <h2 className="heading-reset">Draft, exported e published sem ambiguidade</h2>
          <p className="helper-text-ea">
            Três estados claros: o que ainda está em rascunho, o que já saiu com sync real e o que já foi publicado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => focusSection("publish", { scroll: "auto" })}
          className={`btn-ea ${activeSection === "publish" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
          aria-pressed={activeSection === "publish"}
        >
          {activeSection === "publish" ? "Em foco" : "Trazer para foco"}
        </button>
        </div>
        <div className="focus-shell-preview">
          Veja os três estados de saída sem abrir o handoff completo.
        </div>
        <div className="focus-shell-body">
        <PublishConfidenceState projects={normalizedProjects} />
        <div className="proof-value-grid projects-publish-grid">
          <div className="proof-value-card layout-contract-item">
            <div className="proof-value-block">
              <span className="proof-value-chip">Draft</span>
              <strong>No editor e em Projetos</strong>
              <p>Projeto salvo e entregável em refinamento.</p>
            </div>
          </div>
          <div className="proof-value-card layout-contract-item">
              <div className="proof-value-block">
                <span className="proof-value-chip">Exported</span>
                <strong>Saída registrada</strong>
                <p>Commit GitHub ou deployment Vercel já foram registrados como próxima etapa do projeto.</p>
              </div>
          </div>
          <div className="proof-value-card layout-contract-item">
              <div className="proof-value-block">
                <span className="proof-value-chip">Published</span>
                <strong>Publicado com retorno verificável</strong>
                <p>Produção confirmada pelo provider e persistida no projeto com horário, ambiente e URL.</p>
              </div>
          </div>
        </div>
        </div>
      </section>

      <section
        ref={registerSection("handoff")}
        className="projects-handoff-section projects-handoff-open projects-flow-section projects-flow-section-end focus-shell-section"
        data-focus-active={activeSection === "handoff"}
      >
        <div
          className="section-head focus-shell-head"
          data-focus-clickable={activeSection !== "handoff"}
          role={activeSection !== "handoff" ? "button" : undefined}
          tabIndex={activeSection !== "handoff" ? 0 : -1}
          onClick={activeSection !== "handoff" ? () => focusSection("handoff", { scroll: "auto" }) : undefined}
          onKeyDown={activeSection !== "handoff" ? (event) => {
            if (!isFocusActivationKey(event)) return;
            event.preventDefault();
            focusSection("handoff", { scroll: "auto" });
          } : undefined}
        >
            <div className="section-header-ea">
              <h2 className="heading-reset">GitHub e Vercel integrados no backend</h2>
              <p className="helper-text-ea">
                GitHub já opera com workspace, sync e PR pelo backend. Vercel agora valida workspace, dispara deploy e reconcilia status pelo backend.
              </p>
            </div>
          <div className="hero-actions-row">
            <Link href="/support" className="btn-link-ea btn-ghost btn-sm">
              Entender limites do beta
            </Link>
            <button
              type="button"
              onClick={() => focusSection("handoff", { scroll: "auto" })}
              className={`btn-ea ${activeSection === "handoff" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
              aria-pressed={activeSection === "handoff"}
            >
              {activeSection === "handoff" ? "Em foco" : "Trazer para foco"}
            </button>
          </div>
        </div>
        <div className="focus-shell-preview">
          GitHub já registra sync real; Vercel agora registra workspace, deployment e retorno real do provedor.
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
