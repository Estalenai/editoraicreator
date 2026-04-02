"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PremiumSelect } from "../ui/PremiumSelect";
import { OperationalState, type OperationalStateKind, type OperationalStateMetaItem } from "../ui/OperationalState";
import { api } from "../../lib/api";
import { ensureCanonicalProjectData } from "../../lib/projectModel";
import {
  assessGitHubWorkspaceDraft,
  buildGitHubWorkingBranch,
  formatGitHubRepoLabel,
  githubSyncStatusLabel,
  normalizeRootPath,
  type GitHubConnectionSummary,
  type GitHubProjectExport,
  type GitHubProjectRef,
  type GitHubProjectVersion,
  type GitHubWorkspace,
  type GitHubWorkspaceTarget,
} from "../../lib/githubWorkspace";
import { toUserFacingError } from "../../lib/uiFeedback";

type Props = {
  variant?: "full" | "compact";
  project?: GitHubProjectRef | null;
  projects?: GitHubProjectRef[];
  onProjectDataChange?: (projectId: string, data: any) => void;
};

type WorkspaceDraft = {
  owner: string;
  repo: string;
  branch: string;
  rootPath: string;
  target: GitHubWorkspaceTarget;
};

type BusyAction = "connect" | "disconnect" | "save" | "clear" | "checkpoint" | "sync" | "pull-request" | null;

const DEFAULT_DRAFT: WorkspaceDraft = {
  owner: "",
  repo: "",
  branch: "main",
  rootPath: "/",
  target: "site",
};

const EMPTY_CONNECTION: GitHubConnectionSummary = {
  connected: false,
  login: null,
  name: null,
  avatarUrl: null,
  htmlUrl: null,
  scopes: [],
  updatedAt: null,
  mode: "none",
};

function normalizeProject(project: GitHubProjectRef | null | undefined): GitHubProjectRef | null {
  const id = String(project?.id || "").trim();
  if (!id) return null;
  return {
    id,
    title: String(project?.title || "Projeto").trim() || "Projeto",
    kind: String(project?.kind || "projeto").trim() || "projeto",
    data: project?.data,
  };
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "Ainda não registrado";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return String(value);
  }
}

function targetLabel(target: GitHubWorkspaceTarget): string {
  return target === "app" ? "App" : "Site";
}

function draftFromWorkspace(workspace: GitHubWorkspace | null, suggestedBranch: string | null): WorkspaceDraft {
  if (!workspace) {
    return {
      ...DEFAULT_DRAFT,
      branch: suggestedBranch || DEFAULT_DRAFT.branch,
    };
  }

  return {
    owner: workspace.owner,
    repo: workspace.repo,
    branch: workspace.branch,
    rootPath: workspace.rootPath,
    target: workspace.target,
  };
}

function workspaceSignature(workspace: GitHubWorkspace | null): string {
  if (!workspace) return "";
  return [workspace.owner, workspace.repo, workspace.branch, workspace.rootPath, workspace.target].join("|");
}

function draftSignature(draft: WorkspaceDraft): string {
  return [draft.owner.trim(), draft.repo.trim(), draft.branch.trim(), normalizeRootPath(draft.rootPath), draft.target].join("|");
}

function actionLabel(action: BusyAction): string | null {
  if (action === "connect") return "Conectando credencial GitHub";
  if (action === "disconnect") return "Removendo credencial GitHub";
  if (action === "save") return "Salvando workspace GitHub";
  if (action === "clear") return "Removendo workspace GitHub";
  if (action === "checkpoint") return "Registrando checkpoint";
  if (action === "sync") return "Sincronizando commit";
  if (action === "pull-request") return "Abrindo pull request";
  return null;
}

function extractUpdatedProjectData(response: any, fallback: any): any {
  const item = response?.item || response?.data?.item || response;
  return item?.data ?? fallback;
}

function latestCommitLabel(item: GitHubProjectExport | null | undefined): string {
  if (!item?.commitSha) return "Ainda não sincronizado";
  return item.commitSha.slice(0, 7);
}

export function GitHubWorkspaceCard({ variant = "full", project = null, projects = [], onProjectDataChange }: Props) {
  const availableProjects = useMemo(() => {
    const single = normalizeProject(project);
    if (single) return [single];
    return projects.map((item) => normalizeProject(item)).filter(Boolean) as GitHubProjectRef[];
  }, [project, projects]);

  const [ready, setReady] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectDataMap, setProjectDataMap] = useState<Record<string, any>>({});
  const [connection, setConnection] = useState<GitHubConnectionSummary>(EMPTY_CONNECTION);
  const [tokenDraft, setTokenDraft] = useState("");
  const [draft, setDraft] = useState<WorkspaceDraft>(DEFAULT_DRAFT);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setProjectDataMap((current) => {
      const next: Record<string, any> = {};
      for (const item of availableProjects) {
        next[item.id] = Object.prototype.hasOwnProperty.call(current, item.id) ? current[item.id] : item.data;
      }
      return next;
    });
  }, [availableProjects]);

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

  useEffect(() => {
    let cancelled = false;

    async function loadConnection() {
      try {
        const payload = await api.getGitHubConnection();
        if (cancelled) return;
        setConnection(payload?.connection || EMPTY_CONNECTION);
      } catch (loadError) {
        if (cancelled) return;
        setConnection(EMPTY_CONNECTION);
        setError(toUserFacingError(loadError, "Não foi possível carregar o estado do GitHub."));
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    loadConnection();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = useMemo(
    () => availableProjects.find((item) => item.id === selectedProjectId) || availableProjects[0] || null,
    [availableProjects, selectedProjectId]
  );

  const selectedProjectData = selectedProject ? projectDataMap[selectedProject.id] ?? selectedProject.data : null;
  const selectedProjectCanonical = useMemo(
    () =>
      selectedProject
        ? ensureCanonicalProjectData(selectedProjectData, {
            projectKind: selectedProject.kind,
            projectTitle: selectedProject.title,
          })
        : null,
    [selectedProject, selectedProjectData]
  );

  const githubIntegration = selectedProjectCanonical?.integrations.github || null;
  const workspace = (githubIntegration?.binding as GitHubWorkspace | null) || null;
  const versions = (githubIntegration?.versions || []) as GitHubProjectVersion[];
  const exportsHistory = (githubIntegration?.exports || []) as GitHubProjectExport[];
  const latestVersion = versions[0] || null;
  const latestExport = exportsHistory[0] || null;
  const suggestedBranch = useMemo(() => buildGitHubWorkingBranch(selectedProject), [selectedProject]);

  useEffect(() => {
    setDraft(draftFromWorkspace(workspace, suggestedBranch));
  }, [selectedProject?.id, suggestedBranch, workspace]);

  const assessment = useMemo(
    () =>
      assessGitHubWorkspaceDraft({
        owner: draft.owner,
        repo: draft.repo,
        branch: draft.branch,
        rootPath: draft.rootPath,
        target: draft.target,
      }),
    [draft]
  );

  const hasUnsavedWorkspaceDraft = Boolean(assessment.ready && draftSignature(draft) !== workspaceSignature(workspace));
  const repoLabel = formatGitHubRepoLabel(workspace);
  const canCreatePullRequest = Boolean(
    workspace?.branch &&
      workspace?.defaultBranch &&
      workspace.branch !== workspace.defaultBranch &&
      latestExport?.status &&
      ["synced", "pr_open"].includes(latestExport.status)
  );

  async function refreshConnectionState() {
    const payload = await api.getGitHubConnection();
    setConnection(payload?.connection || EMPTY_CONNECTION);
  }

  function persistProjectData(projectId: string, nextData: any) {
    setProjectDataMap((current) => ({ ...current, [projectId]: nextData }));
    onProjectDataChange?.(projectId, nextData);
  }

  const runProjectAction = async (action: Exclude<BusyAction, "connect" | "disconnect">, handler: () => Promise<void>) => {
    setBusyAction(action);
    setError(null);
    setSuccess(null);
    try {
      await handler();
    } catch (actionError) {
      setError(toUserFacingError(actionError, "Não foi possível concluir o fluxo GitHub."));
    } finally {
      setBusyAction(null);
    }
  };

  async function handleConnect() {
    if (!tokenDraft.trim()) {
      setError("Cole um personal access token do GitHub antes de conectar.");
      return;
    }

    setBusyAction("connect");
    setError(null);
    setSuccess(null);
    try {
      const payload = await api.saveGitHubConnection({ personalAccessToken: tokenDraft.trim() });
      setConnection(payload?.connection || EMPTY_CONNECTION);
      setTokenDraft("");
      setSuccess("Credencial GitHub validada e armazenada no backend.");
    } catch (connectError) {
      setError(toUserFacingError(connectError, "Não foi possível validar a credencial GitHub."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    setBusyAction("disconnect");
    setError(null);
    setSuccess(null);
    try {
      await api.removeGitHubConnection();
      setConnection(EMPTY_CONNECTION);
      setSuccess("Credencial GitHub removida do backend.");
    } catch (disconnectError) {
      setError(toUserFacingError(disconnectError, "Não foi possível remover a credencial GitHub."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveWorkspace() {
    if (!selectedProject) {
      setError("Abra um projeto antes de salvar o workspace GitHub.");
      return;
    }
    if (!assessment.ready) {
      setError("Corrija owner, repositório e branch antes de salvar o workspace GitHub.");
      return;
    }

    await runProjectAction("save", async () => {
      const response = await api.saveGitHubWorkspace(selectedProject.id, {
        owner: assessment.owner,
        repo: assessment.repo,
        branch: assessment.branch,
        rootPath: assessment.rootPath,
        target: assessment.target,
      });
      const nextData = extractUpdatedProjectData(response, selectedProjectData);
      persistProjectData(selectedProject.id, nextData);
      setSuccess(`Workspace ${assessment.repoLabel || `${assessment.owner}/${assessment.repo}`} salvo e verificado pelo backend.`);
    });
  }

  async function handleClearWorkspace() {
    if (!selectedProject) {
      setError("Abra um projeto antes de remover o workspace GitHub.");
      return;
    }

    await runProjectAction("clear", async () => {
      const response = await api.clearGitHubWorkspace(selectedProject.id);
      const nextData = extractUpdatedProjectData(response, selectedProjectData);
      persistProjectData(selectedProject.id, nextData);
      setSuccess("Workspace GitHub removido do projeto.");
    });
  }

  async function handleCheckpoint() {
    if (!selectedProject) {
      setError("Abra um projeto antes de registrar um checkpoint GitHub.");
      return;
    }

    await runProjectAction("checkpoint", async () => {
      const response = await api.createGitHubCheckpoint(selectedProject.id);
      const nextData = extractUpdatedProjectData(response, selectedProjectData);
      persistProjectData(selectedProject.id, nextData);
      setSuccess("Checkpoint GitHub persistido no backend.");
    });
  }

  async function handleSync() {
    if (!selectedProject) {
      setError("Abra um projeto antes de sincronizar com o GitHub.");
      return;
    }

    await runProjectAction("sync", async () => {
      const response = await api.syncGitHubProject(selectedProject.id);
      const nextData = extractUpdatedProjectData(response, selectedProjectData);
      persistProjectData(selectedProject.id, nextData);
      await refreshConnectionState();
      const commitSha = String(response?.sync?.commitSha || "").trim();
      setSuccess(
        commitSha
          ? `Commit ${commitSha.slice(0, 7)} sincronizado no repositório pelo backend.`
          : "Projeto sincronizado com o GitHub pelo backend."
      );
    });
  }

  async function handleCreatePullRequest() {
    if (!selectedProject) {
      setError("Abra um projeto antes de abrir o pull request.");
      return;
    }

    await runProjectAction("pull-request", async () => {
      const response = await api.createGitHubPullRequest(selectedProject.id);
      const nextData = extractUpdatedProjectData(response, selectedProjectData);
      persistProjectData(selectedProject.id, nextData);
      const prNumber = response?.pullRequest?.number;
      setSuccess(prNumber ? `PR #${prNumber} registrado pelo backend.` : "Pull request aberto pelo backend.");
    });
  }

  const busyKind: OperationalStateKind | null =
    busyAction === "checkpoint" ? "saved" : busyAction === "disconnect" ? "retry" : busyAction ? "syncing" : null;

  const trustState = useMemo(() => {
    const meta: OperationalStateMetaItem[] = [
      { label: "Projeto", value: selectedProject?.title || "Abra um projeto" },
      { label: "Credencial", value: connection.connected ? connection.login || connection.name || "Token validado" : "Pendente" },
      { label: "Workspace", value: repoLabel || "Pendente" },
      { label: "Branch", value: workspace?.branch || assessment.branch || "Pendente" },
    ];

    if (!selectedProject) {
      return {
        kind: "empty" as const,
        title: "Abra um projeto para ativar o GitHub",
        description: "O GitHub agora depende de projeto, credencial e sync no backend. Sem projeto, não existe integração verificável.",
        meta,
        details: ["Selecione um projeto antes de salvar workspace, checkpoint, commit ou pull request."],
        footer: "A fonte de verdade do GitHub fica no backend do projeto, não no navegador.",
      };
    }

    meta.push(
      { label: "Último checkpoint", value: formatDateLabel(latestVersion?.savedAt) },
      {
        label: "Último sync",
        value: latestExport ? `${formatDateLabel(latestExport.exportedAt)} • ${githubSyncStatusLabel(latestExport.status)}` : "Nenhum",
        tone: latestExport?.status === "pr_open" || latestExport?.status === "synced" ? "success" : "default",
      }
    );

    if (workspace?.lastCommitSha) {
      meta.push({ label: "Commit", value: workspace.lastCommitSha.slice(0, 7) });
    }
    if (workspace?.lastPullRequestNumber) {
      meta.push({
        label: "PR",
        value: `#${workspace.lastPullRequestNumber}`,
        tone: workspace.lastPullRequestState === "open" ? "success" : "default",
      });
    }

    if (!connection.connected) {
      return {
        kind: "retry" as const,
        title: "Credencial GitHub ainda ausente",
        description: "O frontend não decide mais push, commit nem PR. Sem token validado no backend, a integração não fecha.",
        meta,
        details: [
          "Conecte um personal access token para permitir sync e pull request pelo servidor.",
          "O token fica criptografado no backend e não é salvo no navegador.",
        ],
        footer: "Sem credencial backend-owned, o GitHub volta a ser só configuração parcial.",
      };
    }

    if (!workspace) {
      return {
        kind: "unsaved" as const,
        title: "Workspace GitHub ainda não salvo",
        description: "A credencial já existe, mas owner, repositório, branch e raiz ainda não foram verificados no backend.",
        meta,
        details: ["Salve a base GitHub do projeto para transformar repo e branch em source of truth."],
        footer: "Sem workspace verificado, não existe commit nem PR confiável.",
      };
    }

    if (latestExport?.status === "pr_open" || workspace.lastPullRequestState === "open") {
      return {
        kind: "success" as const,
        title: "GitHub sincronizado com PR ativo",
        description: "Workspace, commit e pull request já foram registrados pelo backend. O fluxo agora parece integração real, não handoff solto.",
        meta,
        details: [
          workspace.lastPullRequestUrl ? `PR: ${workspace.lastPullRequestUrl}` : "PR aberto e rastreado no projeto.",
          workspace.lastCommitUrl ? `Commit: ${workspace.lastCommitUrl}` : "Último commit persistido no histórico do projeto.",
        ],
        footer: "O próximo passo é revisar o PR e manter a trilha do projeto consistente até o publish.",
      };
    }

    if (latestExport?.status === "synced" || workspace.lastSyncStatus === "synced") {
      return {
        kind: "syncing" as const,
        title: "Commit sincronizado e aguardando próximo passo",
        description: "O backend já escreveu no repositório e deixou o projeto pronto para abrir PR ou seguir revisão.",
        meta,
        details: [
          latestExport?.path ? `Arquivo sincronizado: ${latestExport.path}` : "Snapshot do projeto sincronizado no repositório.",
          workspace.lastCommitUrl ? `Commit: ${workspace.lastCommitUrl}` : "Commit rastreado no projeto.",
        ],
        footer: canCreatePullRequest
          ? "Abra o pull request para fechar a trilha GitHub dentro do produto."
          : "Revise branch, base e próximo passo antes de seguir.",
      };
    }

    if (latestVersion) {
      return {
        kind: "saved" as const,
        title: "Workspace pronto e checkpoint salvo",
        description: "O projeto já tem base GitHub verificada e checkpoint persistido no backend. Falta executar o sync remoto.",
        meta,
        details: [`Checkpoint mais recente em ${formatDateLabel(latestVersion.savedAt)}.`],
        footer: "Sincronize o commit no GitHub para sair da etapa de preparação.",
      };
    }

    return {
      kind: "saved" as const,
      title: "Workspace verificado e pronto para sync",
      description: "Owner, repo, branch e raiz já foram validados no backend. O próximo passo real é criar checkpoint e sincronizar.",
      meta,
      details: [
        workspace.repositoryUrl ? `Repositório: ${workspace.repositoryUrl}` : "Repositório validado pelo backend.",
      ],
      footer: "Crie o primeiro checkpoint para começar a trilha verificável do GitHub.",
    };
  }, [assessment.branch, canCreatePullRequest, connection.connected, connection.login, connection.name, latestExport, latestVersion, repoLabel, selectedProject, workspace]);

  const workspaceState = useMemo(() => {
    if (!assessment.ready) {
      return {
        kind: "error" as const,
        title: "Workspace GitHub inválido",
        description: "Owner, repositório ou branch ainda não passam na validação local.",
        details: assessment.issues.filter((item) => item.level === "error").map((item) => item.message),
      };
    }
    if (hasUnsavedWorkspaceDraft) {
      return {
        kind: "unsaved" as const,
        title: "Alterações de workspace pendentes",
        description: "O rascunho local não corresponde ao workspace salvo no backend.",
        details: assessment.issues.map((item) => item.message),
      };
    }
    if (workspace) {
      return {
        kind: "saved" as const,
        title: "Workspace persistido no backend",
        description: "Repositório e branch já foram verificados e gravados no projeto.",
        details: assessment.issues.map((item) => item.message),
      };
    }
    return {
      kind: "empty" as const,
      title: "Workspace ainda não salvo",
      description: "Defina owner, repositório, branch e raiz antes de registrar a integração do projeto.",
      details: assessment.issues.map((item) => item.message),
    };
  }, [assessment, hasUnsavedWorkspaceDraft, workspace]);

  const compact = variant === "compact";

  if (!ready) {
    return (
      <section className="github-workspace-card github-workspace-card-full github-workspace-anchor layout-contract-card">
        <OperationalState
          kind="loading"
          title="Carregando integração GitHub"
          description="Buscando credencial, workspace e trilha persistida do projeto."
          badge="GitHub"
        />
      </section>
    );
  }

  return (
    <section id="github-workspace" className="github-workspace-card github-workspace-card-full github-workspace-anchor layout-contract-card">
      <div className="github-workspace-head">
        <div className="section-header-ea">
          <p className="section-kicker">GitHub</p>
          <h2 className="heading-reset">Integração GitHub backend-owned</h2>
          <p className="section-header-copy">
            Credencial, workspace, checkpoint, commit e PR agora ficam presos ao backend do projeto, não ao navegador.
          </p>
        </div>
        <div className="hero-meta-row github-workspace-meta-row">
          <span className="premium-badge premium-badge-phase">
            {connection.connected ? "Credencial validada" : "Credencial pendente"}
          </span>
          <span className="premium-badge premium-badge-warning">{repoLabel || "Workspace pendente"}</span>
          <span className="premium-badge premium-badge-soon">
            {workspace?.lastPullRequestState === "open"
              ? "PR aberto"
              : workspace?.lastSyncStatus === "synced"
                ? "Sync concluído"
                : "Sem sync remoto"}
          </span>
        </div>
      </div>

      {availableProjects.length > 1 ? (
        <div className="github-workspace-form-grid">
          <label className="field-label-ea">
            <span>Projeto</span>
            <PremiumSelect
              value={selectedProject?.id || ""}
              onChange={setSelectedProjectId}
              options={availableProjects.map((item) => ({ value: item.id, label: item.title }))}
              ariaLabel="Projeto selecionado para integração GitHub"
            />
          </label>
        </div>
      ) : null}

      {busyKind && busyAction ? (
        <OperationalState
          kind={busyKind}
          title={actionLabel(busyAction) || "Executando ação GitHub"}
          description="A ação está sendo executada pelo backend e o estado do projeto será reconciliado em seguida."
          badge="GitHub operação"
          emphasis={selectedProject?.title || "Sem projeto selecionado"}
          meta={[
            { label: "Projeto", value: selectedProject?.title || "Abra um projeto" },
            { label: "Workspace", value: repoLabel || "Pendente" },
          ]}
        />
      ) : null}

      {error ? (
        <OperationalState
          kind="error"
          title="Falha no fluxo GitHub"
          description={error}
          badge="GitHub"
          emphasis={selectedProject?.title || "Sem projeto selecionado"}
        />
      ) : null}

      {success ? (
        <OperationalState
          kind="success"
          title="Fluxo GitHub atualizado"
          description={success}
          badge="GitHub"
          emphasis={selectedProject?.title || "Sem projeto selecionado"}
        />
      ) : null}

      <OperationalState
        compact={compact}
        kind={trustState.kind}
        title={trustState.title}
        description={trustState.description}
        badge="GitHub status"
        emphasis={selectedProject?.title || "Sem projeto selecionado"}
        meta={trustState.meta}
        details={trustState.details}
        footer={trustState.footer}
        actions={
          <div className="github-workspace-cta-row">
            {workspace?.repositoryUrl ? (
              <a href={workspace.repositoryUrl} target="_blank" rel="noreferrer" className="btn-link-ea btn-secondary btn-sm">
                Abrir repositório
              </a>
            ) : null}
            {workspace?.lastCommitUrl ? (
              <a href={workspace.lastCommitUrl} target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
                Ver commit
              </a>
            ) : null}
            {workspace?.lastPullRequestUrl ? (
              <a href={workspace.lastPullRequestUrl} target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
                Ver PR
              </a>
            ) : null}
            <Link href={selectedProject ? `/editor/${selectedProject.id}` : "/editor/new"} className="btn-link-ea btn-ghost btn-sm">
              {selectedProject ? "Abrir projeto" : "Abrir editor"}
            </Link>
          </div>
        }
      />

      <div className="github-workspace-grid">
        <article className="github-workspace-pane layout-contract-item">
          <div className="section-stack-tight">
            <p className="section-kicker">1. Credencial</p>
            <h3 className="heading-reset">Token validado no backend</h3>
            <p className="helper-text-ea">
              O GitHub agora depende de credencial armazenada com criptografia no servidor. Sem isso, não existe sync remoto confiável.
            </p>
          </div>

          <div className="github-workspace-status-list">
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Estado</span>
              <strong>{connection.connected ? "Conectado" : "Pendente"}</strong>
              <small>
                {connection.connected
                  ? `${connection.login || connection.name || "Token validado"} • atualizado em ${formatDateLabel(connection.updatedAt)}`
                  : "Cole um personal access token para permitir repo verification, commit e pull request pelo backend."}
              </small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Escopo</span>
              <strong>Token seguro, sem localStorage</strong>
              <small>O navegador não guarda a credencial GitHub. O backend usa configs + criptografia como fonte de verdade.</small>
            </div>
          </div>

          {!connection.connected ? (
            <label className="field-label-ea">
              <span>Personal access token</span>
              <input
                className="field-ea"
                type="password"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                placeholder="ghp_..."
                autoComplete="off"
              />
            </label>
          ) : null}

          <div className="github-workspace-cta-row">
            {!connection.connected ? (
              <button onClick={handleConnect} disabled={busyAction === "connect" || !tokenDraft.trim()} className="btn-ea btn-primary btn-sm">
                {busyAction === "connect" ? "Validando..." : "Conectar credencial"}
              </button>
            ) : (
              <button onClick={handleDisconnect} disabled={busyAction === "disconnect"} className="btn-ea btn-ghost btn-sm">
                {busyAction === "disconnect" ? "Removendo..." : "Remover credencial"}
              </button>
            )}
          </div>
        </article>

        <article className="github-workspace-pane layout-contract-item">
          <div className="section-stack-tight">
            <p className="section-kicker">2. Workspace</p>
            <h3 className="heading-reset">Repositório e branch de trabalho</h3>
            <p className="helper-text-ea">
              O backend valida owner, repo e branch antes de aceitar o vínculo do projeto com o GitHub.
            </p>
          </div>

          <div className="github-workspace-form-grid">
            <label className="field-label-ea">
              <span>Owner</span>
              <input className="field-ea" value={draft.owner} onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))} placeholder="empresa-ou-usuario" />
            </label>
            <label className="field-label-ea">
              <span>Repositório</span>
              <input className="field-ea" value={draft.repo} onChange={(event) => setDraft((current) => ({ ...current, repo: event.target.value }))} placeholder="owner/repo ou URL do GitHub" />
            </label>
            <label className="field-label-ea">
              <span>Branch de trabalho</span>
              <input className="field-ea" value={draft.branch} onChange={(event) => setDraft((current) => ({ ...current, branch: event.target.value }))} placeholder={suggestedBranch || "ea/meu-projeto"} />
            </label>
            <label className="field-label-ea">
              <span>Raiz do projeto</span>
              <input className="field-ea" value={draft.rootPath} onChange={(event) => setDraft((current) => ({ ...current, rootPath: event.target.value }))} placeholder="/apps/web" />
            </label>
          </div>

          <div className="github-workspace-target-row" role="radiogroup" aria-label="Destino do workspace GitHub">
            {(["site", "app"] as GitHubWorkspaceTarget[]).map((target) => (
              <button
                key={target}
                type="button"
                className={`btn-ea btn-sm ${draft.target === target ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setDraft((current) => ({ ...current, target }))}
                aria-pressed={draft.target === target}
              >
                {targetLabel(target)}
              </button>
            ))}
          </div>

          <OperationalState
            compact
            kind={workspaceState.kind}
            title={workspaceState.title}
            description={workspaceState.description}
            badge="Workspace"
            meta={[
              { label: "Repositório", value: assessment.repoLabel || "Pendente" },
              { label: "Branch", value: assessment.branch },
              { label: "Raiz", value: assessment.rootPath },
              { label: "Destino", value: targetLabel(assessment.target) },
            ]}
            details={workspaceState.details}
          />

          <div className="github-workspace-cta-row">
            <button onClick={handleSaveWorkspace} disabled={busyAction === "save" || !selectedProject || !assessment.ready} className="btn-ea btn-secondary btn-sm">
              {busyAction === "save" ? "Salvando..." : "Salvar workspace"}
            </button>
            <button onClick={handleClearWorkspace} disabled={busyAction === "clear" || !selectedProject || !workspace} className="btn-ea btn-ghost btn-sm">
              {busyAction === "clear" ? "Removendo..." : "Remover workspace"}
            </button>
          </div>
        </article>

        <article className="github-workspace-pane layout-contract-item">
          <div className="section-stack-tight">
            <p className="section-kicker">3. Sync</p>
            <h3 className="heading-reset">Checkpoint, commit e pull request</h3>
            <p className="helper-text-ea">
              O fluxo sai do navegador e vira trilha persistida: checkpoint no projeto, commit no repositório e PR quando fizer sentido.
            </p>
          </div>

          <div className="github-workspace-status-list">
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Checkpoint</span>
              <strong>{latestVersion ? formatDateLabel(latestVersion.savedAt) : "Nenhum"}</strong>
              <small>{latestVersion ? `${latestVersion.branch || workspace?.branch || "branch"} • ${latestVersion.commitMessage || "mensagem padrão do backend"}` : "Crie um checkpoint antes do primeiro sync."}</small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Último sync</span>
              <strong>{latestExport ? githubSyncStatusLabel(latestExport.status) : "Nenhum"}</strong>
              <small>
                {latestExport
                  ? `${formatDateLabel(latestExport.exportedAt)}${latestExport.path ? ` • ${latestExport.path}` : ""}`
                  : "O commit ainda não foi enviado pelo backend."}
              </small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Commit</span>
              <strong>{latestCommitLabel(latestExport)}</strong>
              <small>{latestExport?.commitUrl ? "Commit rastreado e disponível para auditoria." : "Sem commit remoto registrado ainda."}</small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Pull request</span>
              <strong>{workspace?.lastPullRequestNumber ? `#${workspace.lastPullRequestNumber}` : "Ainda não aberto"}</strong>
              <small>
                {canCreatePullRequest
                  ? `Branch ${workspace?.branch} pronta para abrir PR contra ${workspace?.defaultBranch}.`
                  : workspace?.defaultBranch
                    ? `Base padrão: ${workspace.defaultBranch}.`
                    : "O backend precisa resolver a branch base antes do PR."}
              </small>
            </div>
          </div>

          <div className="github-workspace-inline-note">
            <strong>Fonte de verdade</strong>
            <span>Binding, checkpoint, commit SHA, commit URL e PR ficam persistidos no projeto e atualizados pelo backend.</span>
          </div>

          <div className="github-workspace-cta-row">
            <button onClick={handleCheckpoint} disabled={busyAction === "checkpoint" || !selectedProject || !workspace} className="btn-ea btn-secondary btn-sm">
              {busyAction === "checkpoint" ? "Registrando..." : "Registrar checkpoint"}
            </button>
            <button onClick={handleSync} disabled={busyAction === "sync" || !selectedProject || !workspace || !connection.connected} className="btn-ea btn-primary btn-sm">
              {busyAction === "sync" ? "Sincronizando..." : "Sincronizar commit"}
            </button>
            <button onClick={handleCreatePullRequest} disabled={busyAction === "pull-request" || !selectedProject || !canCreatePullRequest} className="btn-ea btn-ghost btn-sm">
              {busyAction === "pull-request" ? "Abrindo PR..." : "Abrir pull request"}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
