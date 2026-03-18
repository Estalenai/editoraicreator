"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PremiumSelect } from "../ui/PremiumSelect";
import {
  buildVercelDeployManifest,
  downloadVercelDeployManifest,
  getVercelProjectBinding,
  readVercelWorkspace,
  recommendedRootDirectory,
  recommendVercelFramework,
  removeVercelProjectBinding,
  saveVercelWorkspace,
  upsertVercelProjectBinding,
  vercelDeployStatusLabel,
  vercelFrameworkLabel,
  type VercelDeployStatus,
  type VercelFramework,
  type VercelProjectSummary,
  type VercelWorkspaceState,
} from "../../lib/vercelWorkspace";

type ProjectInput = {
  id?: string;
  project_id?: string;
  title?: string;
  name?: string;
  kind?: string;
  type?: string;
};

type Props = {
  variant?: "full" | "compact";
  project?: ProjectInput | null;
  projects?: ProjectInput[];
};

const FRAMEWORK_OPTIONS = [
  { value: "nextjs", label: "Next.js" },
  { value: "vite", label: "Vite" },
  { value: "static", label: "Static" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Rascunho" },
  { value: "ready", label: "Pronto para publicar" },
  { value: "published", label: "Publicado (manual)" },
];

function normalizeProject(project: ProjectInput | null | undefined): VercelProjectSummary | null {
  const id = String(project?.id || project?.project_id || "").trim();
  if (!id) return null;
  return {
    id,
    title: String(project?.title || project?.name || "Projeto sem título").trim(),
    kind: String(project?.kind || project?.type || "").trim(),
  };
}

function buildDefaultProjectName(project: VercelProjectSummary | null): string {
  if (!project) return "";
  return project.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeUrl(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function vercelAppUrl(connected: boolean): string {
  return connected ? "https://vercel.com/dashboard" : "https://vercel.com/new";
}

export function VercelPublishCard({ variant = "full", project = null, projects = [] }: Props) {
  const availableProjects = useMemo(() => {
    if (project) {
      const normalized = normalizeProject(project);
      return normalized ? [normalized] : [];
    }
    return projects.map(normalizeProject).filter(Boolean) as VercelProjectSummary[];
  }, [project, projects]);

  const [workspace, setWorkspace] = useState<VercelWorkspaceState | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [vercelProjectName, setVercelProjectName] = useState("");
  const [framework, setFramework] = useState<VercelFramework>("nextjs");
  const [rootDirectory, setRootDirectory] = useState("");
  const [deployStatus, setDeployStatus] = useState<VercelDeployStatus>("draft");
  const [previewUrl, setPreviewUrl] = useState("");
  const [productionUrl, setProductionUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"info" | "success">("info");

  useEffect(() => {
    setWorkspace(readVercelWorkspace());
  }, []);

  useEffect(() => {
    if (availableProjects.length === 0) {
      setSelectedProjectId("");
      return;
    }
    setSelectedProjectId((current) => {
      if (current && availableProjects.some((item) => item.id === current)) return current;
      return availableProjects[0].id;
    });
  }, [availableProjects]);

  const selectedProject = useMemo(
    () => availableProjects.find((item) => item.id === selectedProjectId) || availableProjects[0] || null,
    [availableProjects, selectedProjectId]
  );

  useEffect(() => {
    if (!workspace || !selectedProject) return;
    const binding = getVercelProjectBinding(selectedProject.id);
    const suggestedFramework = recommendVercelFramework(selectedProject.kind);
    setTeamSlug(binding?.teamSlug || workspace.defaultTeamSlug || "");
    setVercelProjectName(binding?.vercelProjectName || buildDefaultProjectName(selectedProject));
    setFramework(binding?.framework || suggestedFramework);
    setRootDirectory(binding?.rootDirectory || recommendedRootDirectory(binding?.framework || suggestedFramework));
    setDeployStatus(binding?.deployStatus || "draft");
    setPreviewUrl(binding?.previewUrl || "");
    setProductionUrl(binding?.productionUrl || "");
    setNotice(null);
  }, [workspace, selectedProject]);

  const compact = variant === "compact";
  const connected = Boolean(selectedProject && workspace?.projectBindings?.[selectedProject.id]);

  function persistWorkspace(nextWorkspace: VercelWorkspaceState) {
    saveVercelWorkspace(nextWorkspace);
    setWorkspace(nextWorkspace);
  }

  function onSave() {
    if (!selectedProject) return;
    const nextWorkspace = upsertVercelProjectBinding({
      projectId: selectedProject.id,
      projectTitle: selectedProject.title,
      projectKind: selectedProject.kind,
      vercelProjectName: vercelProjectName || buildDefaultProjectName(selectedProject),
      teamSlug: teamSlug.trim(),
      framework,
      rootDirectory: rootDirectory.trim() || recommendedRootDirectory(framework),
      deployStatus,
      previewUrl: normalizeUrl(previewUrl),
      productionUrl: normalizeUrl(productionUrl),
    });
    persistWorkspace(nextWorkspace);
    setNoticeTone("success");
    setNotice("Base Vercel salva neste navegador. O projeto já está pronto para handoff beta e acompanhamento manual do deploy.");
  }

  function onDisconnect() {
    if (!selectedProject) return;
    const nextWorkspace = removeVercelProjectBinding(selectedProject.id);
    persistWorkspace(nextWorkspace);
    setNoticeTone("info");
    setNotice("Base local da Vercel removida deste projeto. Você pode configurar novamente quando quiser.");
  }

  function onExportManifest() {
    if (!selectedProject) return;
    downloadVercelDeployManifest(selectedProject, {
      projectId: selectedProject.id,
      projectTitle: selectedProject.title,
      projectKind: selectedProject.kind,
      vercelProjectName: vercelProjectName || buildDefaultProjectName(selectedProject),
      teamSlug: teamSlug.trim(),
      framework,
      rootDirectory: rootDirectory.trim() || recommendedRootDirectory(framework),
      deployStatus,
      previewUrl: normalizeUrl(previewUrl),
      productionUrl: normalizeUrl(productionUrl),
      updatedAt: new Date().toISOString(),
    });
    setNoticeTone("success");
    setNotice("Manifest exportado. Use esse arquivo como handoff inicial para publicar manualmente na Vercel.");
  }

  const deployManifest = useMemo(() => {
    if (!selectedProject) return null;
    return buildVercelDeployManifest(selectedProject, {
      projectId: selectedProject.id,
      projectTitle: selectedProject.title,
      projectKind: selectedProject.kind,
      vercelProjectName: vercelProjectName || buildDefaultProjectName(selectedProject),
      teamSlug: teamSlug.trim(),
      framework,
      rootDirectory: rootDirectory.trim() || recommendedRootDirectory(framework),
      deployStatus,
      previewUrl: normalizeUrl(previewUrl),
      productionUrl: normalizeUrl(productionUrl),
      updatedAt: new Date().toISOString(),
    });
  }, [selectedProject, vercelProjectName, teamSlug, framework, rootDirectory, deployStatus, previewUrl, productionUrl]);

  if (!selectedProject) {
    return (
      <section className={`premium-card vercel-publish-card${compact ? " vercel-publish-card-compact" : ""}`}>
        <div className="vercel-publish-head">
          <div className="vercel-publish-copy">
            <p className="section-kicker">Vercel beta</p>
            <h3>{compact ? "Publicação" : "Publicação e deploy"}</h3>
            <p className="helper-text-ea">
              A base inicial da Vercel entra quando houver um projeto salvo para preparar o handoff de publicação no fluxo criar → editar → publicar.
            </p>
          </div>
          <span className="premium-badge premium-badge-soon">Aguardando projeto</span>
        </div>
        <div className="vercel-publish-empty">
          <strong>Nenhum projeto elegível para publicação ainda.</strong>
          <span>Crie ou salve um projeto primeiro. Depois disso, você já consegue salvar a base de publicação beta e exportar o handoff para a Vercel.</span>
        </div>
        <div className="vercel-publish-actions">
          <Link href="/editor/new" className="btn-link-ea btn-primary btn-sm">
            Criar projeto
          </Link>
          <a href="https://vercel.com/new" target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
            Abrir Vercel
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className={`premium-card vercel-publish-card${compact ? " vercel-publish-card-compact" : ""}`} id="vercel-publish">
      <div className="vercel-publish-head">
        <div className="vercel-publish-copy">
          <p className="section-kicker">Vercel beta</p>
          <h3>{compact ? "Base de publicação" : "Base beta de publicação na Vercel"}</h3>
          <p className="helper-text-ea">
            No beta, a Vercel cobre a base do projeto, framework, URLs e handoff manual de deploy. OAuth e publicação automática entram na próxima fase.
          </p>
        </div>
        <span className={`premium-badge ${connected ? "premium-badge-phase" : "premium-badge-warning"}`}>
          {connected ? "Base Vercel salva" : "Base Vercel pendente"}
        </span>
      </div>

      {!compact && availableProjects.length > 1 ? (
        <div className="vercel-publish-form">
          <label className="field-label-ea">
            <span>Projeto para publicar</span>
            <PremiumSelect
              value={selectedProject.id}
              onChange={setSelectedProjectId}
              options={availableProjects.map((item) => ({
                value: item.id,
                label: item.title,
              }))}
              ariaLabel="Projeto selecionado para publicação"
            />
          </label>
        </div>
      ) : null}

      <div className="vercel-publish-status-grid">
        <div className="vercel-publish-status-item">
          <span>Projeto atual</span>
          <strong>{selectedProject.title}</strong>
        </div>
        <div className="vercel-publish-status-item">
          <span>Framework sugerido</span>
          <strong>{vercelFrameworkLabel(framework)}</strong>
        </div>
        <div className="vercel-publish-status-item">
          <span>Status acompanhado</span>
          <strong>{vercelDeployStatusLabel(deployStatus)}</strong>
        </div>
        <div className="vercel-publish-status-item">
          <span>Fluxo do beta</span>
          <strong>Criar → editar → publicar</strong>
        </div>
      </div>

      <div className="vercel-publish-grid">
        <div className="vercel-publish-form">
          <label className="field-label-ea">
            <span>Projeto na Vercel</span>
            <input
              className="field-ea"
              value={vercelProjectName}
              onChange={(event) => setVercelProjectName(event.target.value)}
              placeholder="meu-site-beta"
            />
          </label>
          <label className="field-label-ea">
            <span>Time ou workspace</span>
            <input
              className="field-ea"
              value={teamSlug}
              onChange={(event) => setTeamSlug(event.target.value)}
              placeholder="time-ou-workspace"
            />
          </label>
          <label className="field-label-ea">
            <span>Framework</span>
            <PremiumSelect
              value={framework}
              onChange={(next) => {
                const nextFramework = next as VercelFramework;
                setFramework(nextFramework);
                setRootDirectory((current) => current.trim() || recommendedRootDirectory(nextFramework));
              }}
              options={FRAMEWORK_OPTIONS}
              ariaLabel="Framework para publicação na Vercel"
            />
          </label>
          <label className="field-label-ea">
            <span>Root directory</span>
            <input
              className="field-ea"
              value={rootDirectory}
              onChange={(event) => setRootDirectory(event.target.value)}
              placeholder={recommendedRootDirectory(framework)}
            />
          </label>
        </div>

        <div className="vercel-publish-form">
          <label className="field-label-ea">
            <span>Status básico do deploy</span>
            <PremiumSelect
              value={deployStatus}
              onChange={(next) => setDeployStatus(next as VercelDeployStatus)}
              options={STATUS_OPTIONS}
              ariaLabel="Status básico do deploy"
            />
          </label>
          <label className="field-label-ea">
            <span>Preview URL</span>
            <input
              className="field-ea"
              value={previewUrl}
              onChange={(event) => setPreviewUrl(event.target.value)}
              placeholder="preview-projeto.vercel.app"
            />
          </label>
          <label className="field-label-ea">
            <span>Production URL</span>
            <input
              className="field-ea"
              value={productionUrl}
              onChange={(event) => setProductionUrl(event.target.value)}
              placeholder="meu-projeto.vercel.app"
            />
          </label>
          <div className="vercel-publish-note">
            No beta, esta integração salva a base local da publicação, o status acompanhado manualmente e o handoff do projeto. Domínio, multiambiente e publicação totalmente automatizada entram na próxima fase.
          </div>
        </div>
      </div>

      {(previewUrl || productionUrl) ? (
        <div className="vercel-publish-links">
          {previewUrl ? (
            <div className="vercel-publish-link-card">
              <span>Preview URL</span>
              <strong>{normalizeUrl(previewUrl)}</strong>
              <a href={normalizeUrl(previewUrl)} target="_blank" rel="noreferrer" className="text-link-ea">
                Abrir preview
              </a>
            </div>
          ) : null}
          {productionUrl ? (
            <div className="vercel-publish-link-card">
              <span>Production URL</span>
              <strong>{normalizeUrl(productionUrl)}</strong>
              <a href={normalizeUrl(productionUrl)} target="_blank" rel="noreferrer" className="text-link-ea">
                Abrir produção
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <div className={`state-ea ${noticeTone === "success" ? "state-ea-success" : ""}`}>
          <p className="state-ea-title">{noticeTone === "success" ? "Base beta atualizada" : "Status da integração"}</p>
          <div className="state-ea-text">{notice}</div>
        </div>
      ) : null}

      <div className="vercel-publish-actions">
        <button type="button" onClick={onSave} className="btn-ea btn-primary btn-sm">
          {connected ? "Atualizar base local" : "Salvar base Vercel"}
        </button>
        <button type="button" onClick={onExportManifest} className="btn-ea btn-secondary btn-sm">
          Exportar handoff .json
        </button>
        <a
          href={vercelAppUrl(connected)}
          target="_blank"
          rel="noreferrer"
          className="btn-link-ea btn-ghost btn-sm"
        >
          {connected ? "Abrir painel da Vercel" : "Abrir Vercel"}
        </a>
        {connected ? (
          <button type="button" onClick={onDisconnect} className="btn-ea btn-ghost btn-sm">
            Remover base local
          </button>
        ) : null}
      </div>

      {!compact && deployManifest ? (
        <div className="vercel-publish-note">
          <strong>O que entra agora:</strong> projeto, framework, root directory, status acompanhado e URLs básicas. <strong>O que fica para depois:</strong> OAuth real, importação automática, domínio customizado e deploy sincronizado.
        </div>
      ) : null}
    </section>
  );
}
