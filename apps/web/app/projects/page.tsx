"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { GitHubWorkspaceCard } from "../../components/projects/GitHubWorkspaceCard";
import { VercelPublishCard } from "../../components/projects/VercelPublishCard";

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
      projects.map((project: any) => ({
        id: getProjectId(project),
        title: project?.name || project?.title || project?.id || "Projeto sem título",
        kind: String(project?.kind || project?.type || "projeto"),
        updatedAt: project?.updated_at || project?.created_at || null,
      })),
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
      <section className="premium-hero projects-hero">
        <div className="hero-split">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Continuidade</p>
              <h1 style={{ margin: 0, letterSpacing: -0.3 }}>Projetos</h1>
              <p className="section-header-copy hero-copy-compact">
                Abra um projeto salvo ou inicie um novo workspace com contexto pronto para editar, exportar e continuar fora da plataforma quando fizer sentido.
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
                <strong>GitHub beta</strong>
                <span>Conecte a conta, defina owner/repositório e prepare versões do projeto para app ou site fora da plataforma.</span>
              </div>
              <div className="hero-side-note">
                <strong>Fluxo curto</strong>
                <span>Creators gera contexto, Projetos organiza continuidade e Vercel prepara a publicação beta sem fluxo técnico pesado.</span>
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

      <GitHubWorkspaceCard />
      <VercelPublishCard projects={normalizedProjects.map((project) => ({ id: project.id, title: project.title, kind: project.kind }))} />

      <section className="premium-card projects-list-section">
        <div className="section-head">
          <div className="section-header-ea">
            <h2 className="heading-reset">Abrir no editor</h2>
            <p className="helper-text-ea">
              Selecione um projeto existente ou crie um novo para entrar no editor com contexto salvo.
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
            {normalizedProjects.map((project) => (
              <Link
                key={project.id || project.title}
                href={project.id ? `/editor/${project.id}` : "/editor/new"}
                className="dashboard-project-link"
              >
                <div className="dashboard-project-link-main">
                  <span className="dashboard-project-link-title">{project.title}</span>
                  <span className="dashboard-project-link-meta">
                    {project.kind}
                    {project.updatedAt
                      ? ` • atualizado em ${new Date(project.updatedAt).toLocaleDateString("pt-BR")}`
                      : ""}
                  </span>
                </div>
                <span className="dashboard-project-link-cta">Abrir</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
