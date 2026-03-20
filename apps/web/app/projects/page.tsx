"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { GitHubWorkspaceCard } from "../../components/projects/GitHubWorkspaceCard";
import { VercelPublishCard } from "../../components/projects/VercelPublishCard";
import { ensureCanonicalProjectData, getCanonicalProjectSummary } from "../../lib/projectModel";

function getProjectId(project: any) {
  return String(project?.id || project?.project_id || "").trim();
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

  const planLabelDisplay = loading ? "Sincronizando plano" : planLabel ?? "—";
  const projectCountLabel = loading
    ? "Projetos em sincronização"
    : `${normalizedProjects.length} projeto(s) disponível(is)`;

  if (betaBlocked) {
    return <BetaAccessBlockedView email={email} status={betaAccess?.status} onLogout={onLogout} />;
  }

  return (
    <div className="page-shell projects-page">
      <section className="premium-hero projects-hero surface-flow-hero" data-reveal>
        <div className="hero-split">
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
          </div>

          <div className="hero-side-panel">
            <div className="hero-side-list">
              <div className="hero-side-note">
                <strong>Abra e continue</strong>
                <span>Use a lista abaixo para retomar do ponto em que o projeto foi salvo.</span>
              </div>
              <div className="hero-side-note">
                <strong>Estado de saída claro</strong>
                <span>Draft, exported e published aparecem como estados distintos para separar trabalho em andamento de entrega já encerrada.</span>
              </div>
              <div className="hero-side-note">
                <strong>Handoff beta secundário</strong>
                <span>GitHub e Vercel seguem úteis para continuidade manual, mas fora do centro da promessa principal desta fase.</span>
              </div>
              <div className="hero-side-note hero-side-note-trust">
                <strong>Persistência com Supabase</strong>
                <span>Projetos, histórico e continuidade da conta ficam persistidos em Supabase para retomar o trabalho sem perder contexto.</span>
              </div>
            </div>

            <div className="hero-actions-row">
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

      <section className="projects-list-section projects-flow-section surface-flow-region projects-flow-section-start" data-reveal data-reveal-delay="70">
        <div className="section-head">
          <div className="section-header-ea">
            <h2 className="heading-reset">Abrir no editor</h2>
            <p className="helper-text-ea">
              Retome um projeto existente ou crie um novo para seguir no núcleo principal do beta: creators hero, editor, checkpoint e saída.
            </p>
          </div>
          <Link href="/editor/new" className="btn-link-ea btn-secondary btn-sm">
            Abrir editor novo
          </Link>
        </div>

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
          <div className="dashboard-section-body">
            {normalizedProjects.map((project, index) => (
              <Link
                key={project.id || project.title}
                href={project.id ? `/editor/${project.id}` : "/editor/new"}
                className="dashboard-project-link"
                data-reveal
                data-reveal-delay={String(70 + Math.min(index, 5) * 40)}
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
      </section>

      <section className="projects-publish-section projects-flow-section surface-flow-region projects-flow-section-middle" data-reveal data-reveal-delay="110">
        <div className="section-header-ea">
          <p className="section-kicker">Pipeline de saída</p>
          <h2 className="heading-reset">Draft, exported e published sem ambiguidade</h2>
          <p className="helper-text-ea">
            O beta pago/controlado separa três estados e mantém trilha de saída: o que ainda está em rascunho no projeto, o que já saiu como handoff exportado e o que já foi publicado manualmente fora da plataforma.
          </p>
        </div>
        <div className="proof-value-grid">
          <div className="proof-value-card" data-reveal data-reveal-delay="70">
            <div className="proof-value-block">
              <span className="proof-value-chip">Draft</span>
              <strong>No editor e em Projetos</strong>
              <p>Projeto salvo, contexto ativo e entregável ainda em refinamento.</p>
            </div>
          </div>
          <div className="proof-value-card" data-reveal data-reveal-delay="120">
            <div className="proof-value-block">
              <span className="proof-value-chip">Exported</span>
              <strong>Handoff beta gerado</strong>
              <p>Snapshot GitHub ou manifest Vercel já saíram da plataforma para continuidade manual.</p>
            </div>
          </div>
          <div className="proof-value-card" data-reveal data-reveal-delay="170">
            <div className="proof-value-block">
              <span className="proof-value-chip">Published</span>
              <strong>Publicado com confirmação manual</strong>
              <p>Publicação informada manualmente na base beta da Vercel, sem fingir sincronização automática.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="projects-handoff-section projects-flow-section surface-flow-region projects-flow-section-end" data-reveal data-reveal-delay="150">
        <div className="section-head">
          <div className="section-header-ea">
            <h2 className="heading-reset">Handoff beta e publicação manual</h2>
            <p className="helper-text-ea">
              GitHub e Vercel continuam acessíveis como fundações úteis de continuidade fora da plataforma, mas agora aparecem como camada secundária ao fluxo principal.
            </p>
          </div>
          <Link href="/support" className="btn-link-ea btn-ghost btn-sm">
            Entender limites do beta
          </Link>
        </div>
        <div className="dashboard-section-body">
          <GitHubWorkspaceCard projects={normalizedProjects.map((project) => ({ id: project.id, title: project.title, kind: project.kind, data: project.data }))} />
          <VercelPublishCard projects={normalizedProjects.map((project) => ({ id: project.id, title: project.title, kind: project.kind, data: project.data }))} />
        </div>
        <div className="helper-text-ea">
          Use essas integrações quando o projeto já estiver suficientemente maduro para sair da plataforma. O núcleo do beta pago/controlado continua sendo creators hero, editor, projetos e saída rastreada.
        </div>
      </section>
    </div>
  );
}
