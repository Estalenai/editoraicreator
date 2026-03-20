"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PremiumSelect } from "../ui/PremiumSelect";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabaseClient";
import { toUserFacingError } from "../../lib/uiFeedback";
import { ensureCanonicalProjectData, getCanonicalProjectSummary, mergeCanonicalProjectData } from "../../lib/projectModel";
import {
  clearGitHubWorkspace,
  downloadGitHubProjectBundle,
  formatGitHubRepoLabel,
  listGitHubProjectExports,
  listGitHubProjectVersions,
  normalizeRootPath,
  readGitHubWorkspace,
  resolveGitHubConnection,
  saveGitHubProjectExport,
  saveGitHubProjectVersion,
  saveGitHubWorkspace,
  type GitHubProjectExport,
  type GitHubProjectRef,
  type GitHubProjectVersion,
  type GitHubWorkspace,
  type GitHubWorkspaceTarget,
} from "../../lib/githubWorkspace";

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

const DEFAULT_DRAFT: WorkspaceDraft = {
  owner: "",
  repo: "",
  branch: "main",
  rootPath: "/",
  target: "site",
};

function accountKeyFromUser(user: any): string | null {
  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  if (email) return email;
  const id = typeof user?.id === "string" ? user.id.trim() : "";
  return id || null;
}

function formatDateLabel(value: string | null): string {
  if (!value) return "Nenhuma versão salva ainda";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

function draftFromWorkspace(workspace: GitHubWorkspace | null): WorkspaceDraft {
  if (!workspace) return DEFAULT_DRAFT;
  return {
    owner: workspace.owner,
    repo: workspace.repo,
    branch: workspace.branch,
    rootPath: workspace.rootPath,
    target: workspace.target,
  };
}

function targetLabel(target: GitHubWorkspaceTarget): string {
  return target === "app" ? "App" : "Site";
}

function createClientId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

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

function workspaceFromBinding(binding: any): GitHubWorkspace | null {
  if (!binding || typeof binding !== "object") return null;
  const owner = String(binding.owner || "").trim();
  const repo = String(binding.repo || "").trim();
  if (!owner || !repo) return null;
  return {
    provider: "github",
    owner,
    repo,
    branch: String(binding.branch || "main").trim() || "main",
    rootPath: normalizeRootPath(binding.rootPath || "/"),
    target: binding.target === "app" ? "app" : "site",
    connectedAt: String(binding.connectedAt || new Date().toISOString()),
    updatedAt: String(binding.updatedAt || new Date().toISOString()),
    accountLabel: binding.accountLabel ? String(binding.accountLabel) : null,
  };
}

function toProjectVersions(project: GitHubProjectRef | null, value: any): GitHubProjectVersion[] {
  if (!project || !Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item: any) => ({
      id: String(item.id || createClientId()),
      projectId: project.id,
      projectTitle: project.title,
      projectKind: project.kind,
      savedAt: String(item.savedAt || new Date().toISOString()),
      handoffTarget: (item.handoffTarget === "app" ? "app" : "site") as GitHubWorkspaceTarget,
      repoLabel: item.repoLabel ? String(item.repoLabel) : null,
    }))
    .slice(0, 16);
}

function toProjectExports(project: GitHubProjectRef | null, value: any): GitHubProjectExport[] {
  if (!project || !Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item: any) => ({
      id: String(item.id || createClientId()),
      projectId: project.id,
      projectTitle: project.title,
      exportedAt: String(item.exportedAt || new Date().toISOString()),
      handoffTarget: (item.handoffTarget === "app" ? "app" : "site") as GitHubWorkspaceTarget,
      repoLabel: item.repoLabel ? String(item.repoLabel) : null,
    }))
    .slice(0, 16);
}

function extractUpdatedProjectData(response: any, fallback: any): any {
  const item = response?.item || response?.data?.item || response;
  return item?.data ?? fallback;
}

export function GitHubWorkspaceCard({ variant = "full", project = null, projects = [], onProjectDataChange }: Props) {
  const availableProjects = useMemo(() => {
    const single = normalizeProject(project);
    if (single) return [single];
    return projects.map((item) => normalizeProject(item)).filter(Boolean) as GitHubProjectRef[];
  }, [project, projects]);

  const [ready, setReady] = useState(false);
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [identityLabel, setIdentityLabel] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<GitHubWorkspace | null>(null);
  const [draft, setDraft] = useState<WorkspaceDraft>(DEFAULT_DRAFT);
  const [localVersions, setLocalVersions] = useState<GitHubProjectVersion[]>([]);
  const [localExports, setLocalExports] = useState<GitHubProjectExport[]>([]);
  const [projectDataMap, setProjectDataMap] = useState<Record<string, any>>({});
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"connect" | "save" | "clear" | "version" | "export" | null>(null);

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
  const projectSummary = useMemo(
    () =>
      selectedProject
        ? getCanonicalProjectSummary(selectedProjectData, {
            projectKind: selectedProject.kind,
            projectTitle: selectedProject.title,
          })
        : null,
    [selectedProject, selectedProjectData]
  );
  const projectIntegration = selectedProjectCanonical?.integrations.github || null;
  const projectWorkspace = useMemo(() => workspaceFromBinding(projectIntegration?.binding), [projectIntegration?.binding]);
  const activeWorkspace = selectedProject ? projectWorkspace || workspace : workspace;
  const repoLabel = useMemo(() => formatGitHubRepoLabel(activeWorkspace), [activeWorkspace]);
  const canLinkIdentity = useMemo(() => typeof (supabase.auth as any)?.linkIdentity === "function", []);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      const user = data.user;
      const nextAccountKey = accountKeyFromUser(user);
      const connection = resolveGitHubConnection(user);
      const storedWorkspace = nextAccountKey ? readGitHubWorkspace(nextAccountKey) : null;
      const versions = nextAccountKey ? listGitHubProjectVersions(nextAccountKey) : [];
      const exports = nextAccountKey ? listGitHubProjectExports(nextAccountKey) : [];

      setAccountKey(nextAccountKey);
      setConnected(connection.connected);
      setIdentityLabel(connection.label);
      setWorkspace(storedWorkspace);
      setLocalVersions(versions);
      setLocalExports(exports);
      setReady(true);

      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("github") === "connected" && connection.connected) {
          setSuccess("Conta GitHub conectada. Agora defina owner, repositório e branch para preparar o fluxo do app ou site.");
          params.delete("github");
          const nextQuery = params.toString();
          const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
          window.history.replaceState({}, "", nextUrl);
        }
      }
    }

    loadState();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadState();
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    setDraft(draftFromWorkspace(activeWorkspace));
  }, [activeWorkspace, ready]);

  const fallbackProjectVersions = useMemo(
    () => (selectedProject ? localVersions.filter((item) => item.projectId === selectedProject.id) : localVersions),
    [localVersions, selectedProject]
  );
  const fallbackProjectExports = useMemo(
    () => (selectedProject ? localExports.filter((item) => item.projectId === selectedProject.id) : localExports),
    [localExports, selectedProject]
  );
  const canonicalProjectVersions = useMemo(
    () => toProjectVersions(selectedProject, projectIntegration?.versions || []),
    [selectedProject, projectIntegration?.versions]
  );
  const canonicalProjectExports = useMemo(
    () => toProjectExports(selectedProject, projectIntegration?.exports || []),
    [selectedProject, projectIntegration?.exports]
  );
  const effectiveProjectVersions = selectedProject
    ? canonicalProjectVersions.length
      ? canonicalProjectVersions
      : fallbackProjectVersions
    : localVersions;
  const effectiveProjectExports = selectedProject
    ? canonicalProjectExports.length
      ? canonicalProjectExports
      : fallbackProjectExports
    : localExports;
  const versionSummaryLabel = useMemo(() => {
    if (selectedProject) {
      return effectiveProjectVersions.length > 0
        ? `${effectiveProjectVersions.length} versão(ões) locais para este projeto`
        : "Nenhuma versão local salva para este projeto";
    }
    return localVersions.length > 0 ? `${localVersions.length} versão(ões) locais prontas para continuidade` : "Nenhuma versão local salva ainda";
  }, [effectiveProjectVersions.length, localVersions.length, selectedProject]);
  const lastVersionSavedAt = effectiveProjectVersions[0]?.savedAt || null;
  const lastExportedAt = effectiveProjectExports[0]?.exportedAt || null;
  const githubDeliveryStage = useMemo(() => {
    if (effectiveProjectExports.length > 0) {
      return {
        label: "Exported",
        detail: "Snapshot exportado e pronto para handoff beta fora da plataforma.",
      };
    }
    if (activeWorkspace) {
      return {
        label: "Draft",
        detail: "Base do repositório salva. Falta exportar o snapshot para o handoff beta.",
      };
    }
    return {
      label: "Draft",
      detail: "Defina owner, repositório e branch antes de preparar a saída.",
    };
  }, [activeWorkspace, effectiveProjectExports.length]);
  const recentGitHubActivity = useMemo(
    () =>
      [
        ...effectiveProjectVersions.map((item) => ({
          id: `version-${item.id}`,
          ts: item.savedAt,
          title: "Versão local registrada",
          detail: `${selectedProject ? selectedProject.title : item.projectTitle} • ${targetLabel(item.handoffTarget)}${item.repoLabel ? ` • ${item.repoLabel}` : ""}`,
        })),
        ...effectiveProjectExports.map((item) => ({
          id: `export-${item.id}`,
          ts: item.exportedAt,
          title: "Snapshot exportado",
          detail: `${selectedProject ? selectedProject.title : item.projectTitle} • ${targetLabel(item.handoffTarget)}${item.repoLabel ? ` • ${item.repoLabel}` : ""}`,
        })),
      ]
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
        .slice(0, 5),
    [effectiveProjectExports, effectiveProjectVersions, selectedProject]
  );
  const visibleGitHubActivity = useMemo(
    () => (variant === "compact" ? recentGitHubActivity.slice(0, 3) : recentGitHubActivity),
    [recentGitHubActivity, variant]
  );

  function updateDraft(field: keyof WorkspaceDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function persistProjectData(nextData: any) {
    if (!selectedProject) return nextData;
    const response = await api.updateProject(selectedProject.id, { data: nextData });
    const persistedData = extractUpdatedProjectData(response, nextData);
    setProjectDataMap((current) => ({
      ...current,
      [selectedProject.id]: persistedData,
    }));
    onProjectDataChange?.(selectedProject.id, persistedData);
    return persistedData;
  }

  async function handleConnectGitHub() {
    setError(null);
    setSuccess(null);
    setBusyAction("connect");

    try {
      const authClient = supabase.auth as any;
      if (typeof window === "undefined") return;
      if (typeof authClient.linkIdentity !== "function") {
        setError("A conexão direta com a conta GitHub ainda não está habilitada neste ambiente. A base local e os snapshots continuam disponíveis no beta.");
        return;
      }

      const redirectTo = `${window.location.origin}/projects?github=connected#github-workspace`;
      const { data, error: connectError } = await authClient.linkIdentity({
        provider: "github",
        options: {
          redirectTo,
          scopes: "read:user user:email",
        },
      });

      if (connectError) {
        throw connectError;
      }

      if (data?.url) {
        window.location.assign(data.url);
        return;
      }

      setSuccess("Solicitação enviada ao GitHub. Conclua a autorização para continuar.");
    } catch (connectError: any) {
      setError(
        toUserFacingError(
          connectError?.message,
          "Não foi possível iniciar a conexão com o GitHub agora."
        )
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveWorkspace() {
    setError(null);
    setSuccess(null);

    if (!accountKey && !selectedProject) {
      setError("Abra uma sessão válida para salvar a base GitHub deste workspace.");
      return;
    }

    if (!draft.owner.trim() || !draft.repo.trim()) {
      setError("Defina owner e repositório antes de salvar a base GitHub.");
      return;
    }

    setBusyAction("save");
    try {
      const now = new Date().toISOString();
      const nextWorkspace: GitHubWorkspace = {
        provider: "github",
        owner: draft.owner.trim(),
        repo: draft.repo.trim(),
        branch: draft.branch.trim() || "main",
        rootPath: normalizeRootPath(draft.rootPath),
        target: draft.target,
        connectedAt: activeWorkspace?.connectedAt || now,
        updatedAt: now,
        accountLabel: identityLabel,
      };

      if (accountKey) {
        saveGitHubWorkspace(accountKey, nextWorkspace);
      }
      setWorkspace(nextWorkspace);
      setDraft(draftFromWorkspace(nextWorkspace));

      if (selectedProject) {
        const nextData = mergeCanonicalProjectData(selectedProjectData, {
          integrations: {
            github: {
              binding: nextWorkspace,
            },
          },
        });
        await persistProjectData(nextData);
        setSuccess("Base GitHub salva no projeto e espelhada neste navegador. A continuidade do handoff agora fica persistida no próprio projeto.");
      } else {
        setSuccess("Base GitHub salva neste navegador. O editor já pode registrar versões locais e exportar snapshots com owner/repositório definidos.");
      }
    } catch (saveError: any) {
      setError(
        toUserFacingError(saveError?.message, "Não foi possível salvar a base GitHub agora.")
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClearWorkspace() {
    setBusyAction("clear");
    setError(null);
    setSuccess(null);

    try {
      if (accountKey) {
        clearGitHubWorkspace(accountKey);
      }
      setWorkspace(null);
      setDraft(DEFAULT_DRAFT);

      if (selectedProject) {
        const nextData = mergeCanonicalProjectData(selectedProjectData, {
          integrations: {
            github: {
              binding: null,
            },
          },
        });
        await persistProjectData(nextData);
        setSuccess("Base GitHub removida do projeto. O cache local deste navegador também foi limpo.");
      } else {
        setSuccess("Base GitHub removida deste navegador. Se a conta já estiver conectada, ela continua disponível para a próxima configuração.");
      }
    } catch (clearError: any) {
      setError(toUserFacingError(clearError?.message, "Não foi possível limpar a base GitHub agora."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveVersion() {
    if (!selectedProject) {
      setError("Abra um projeto válido antes de registrar uma versão para GitHub.");
      return;
    }

    setBusyAction("version");
    setError(null);
    setSuccess(null);

    try {
      const projectRef = {
        ...selectedProject,
        data: selectedProjectData,
      };
      const fallbackEntry: GitHubProjectVersion = {
        id: createClientId(),
        projectId: selectedProject.id,
        projectTitle: selectedProject.title,
        projectKind: selectedProject.kind,
        savedAt: new Date().toISOString(),
        handoffTarget: activeWorkspace?.target === "app" ? "app" : "site",
        repoLabel: activeWorkspace ? formatGitHubRepoLabel(activeWorkspace) : null,
      };
      const entry = accountKey ? saveGitHubProjectVersion(accountKey, projectRef, activeWorkspace) : fallbackEntry;
      if (accountKey) {
        setLocalVersions(listGitHubProjectVersions(accountKey));
      }

      const nextData = mergeCanonicalProjectData(selectedProjectData, {
        integrations: {
          github: {
            ...(activeWorkspace ? { binding: activeWorkspace } : {}),
            versions: [
              {
                id: entry.id,
                savedAt: entry.savedAt,
                handoffTarget: entry.handoffTarget,
                repoLabel: entry.repoLabel,
              },
              ...(selectedProjectCanonical?.integrations.github.versions || []),
            ].slice(0, 16),
          },
        },
      });

      await persistProjectData(nextData);
      setSuccess("Versão GitHub registrada no projeto. A trilha principal de continuidade agora fica persistida no próprio projeto, com cache local como conveniência.");
    } catch (versionError: any) {
      setError(toUserFacingError(versionError?.message, "Não foi possível registrar a versão local agora."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExportBundle() {
    if (!selectedProject) {
      setError("Abra um projeto antes de exportar o snapshot GitHub beta.");
      return;
    }

    setBusyAction("export");
    setError(null);
    setSuccess(null);

    try {
      const projectRef = {
        ...selectedProject,
        data: selectedProjectData,
      };
      downloadGitHubProjectBundle(projectRef, activeWorkspace);

      const fallbackEntry: GitHubProjectExport = {
        id: createClientId(),
        projectId: selectedProject.id,
        projectTitle: selectedProject.title,
        exportedAt: new Date().toISOString(),
        handoffTarget: activeWorkspace?.target === "app" ? "app" : "site",
        repoLabel: activeWorkspace ? formatGitHubRepoLabel(activeWorkspace) : null,
      };
      const entry = accountKey ? saveGitHubProjectExport(accountKey, projectRef, activeWorkspace) : fallbackEntry;
      if (accountKey) {
        setLocalExports(listGitHubProjectExports(accountKey));
      }

      const currentCanonical = selectedProjectCanonical || ensureCanonicalProjectData(selectedProjectData, {
        projectKind: selectedProject.kind,
        projectTitle: selectedProject.title,
      });
      const nextStage = currentCanonical.delivery.stage === "published" ? "published" : "exported";
      const nextData = mergeCanonicalProjectData(selectedProjectData, {
        delivery: {
          stage: nextStage,
          exportTarget: "connected_storage",
          connectedStorage: "github",
          lastExportedAt: entry.exportedAt,
          history: [
            {
              id: createClientId(),
              ts: entry.exportedAt,
              stage: "exported" as const,
              channel: "github" as const,
              title: "Snapshot GitHub exportado",
              note: `Snapshot beta exportado${entry.repoLabel ? ` para ${entry.repoLabel}` : ""} para continuidade manual fora da plataforma.`,
            },
            ...currentCanonical.delivery.history,
          ].slice(0, 12),
        },
        integrations: {
          github: {
            ...(activeWorkspace ? { binding: activeWorkspace } : {}),
            exports: [
              {
                id: entry.id,
                exportedAt: entry.exportedAt,
                handoffTarget: entry.handoffTarget,
                repoLabel: entry.repoLabel,
              },
              ...(currentCanonical.integrations.github.exports || []),
            ].slice(0, 16),
          },
        },
        deliverable: {
          nextAction:
            nextStage === "published"
              ? "A publicação já foi registrada no projeto. Use GitHub apenas para acompanhar novos handoffs ou iterações locais."
              : "Snapshot GitHub exportado. Continue fora da plataforma e registre novos handoffs quando o projeto pedir uma nova saída.",
        },
      });

      await persistProjectData(nextData);
      setSuccess("Snapshot do projeto baixado. O projeto agora guarda o handoff GitHub como source of truth, com cache local apenas como conveniência beta.");
    } catch (exportError: any) {
      setError(toUserFacingError(exportError?.message, "Não foi possível exportar o snapshot agora."));
    } finally {
      setBusyAction(null);
    }
  }

  if (!ready) {
    return (
      <section className={`premium-card github-workspace-card github-workspace-card-${variant}`}>
        <div className="premium-skeleton premium-skeleton-line" style={{ width: "38%" }} />
        <div className="premium-skeleton premium-skeleton-line" style={{ width: "72%" }} />
        <div className="premium-skeleton premium-skeleton-card" />
      </section>
    );
  }

  if (variant === "compact") {
    return (
      <section className="premium-card-soft github-workspace-card github-workspace-card-compact">
        <div className="section-stack-tight">
          <p className="section-kicker">GitHub beta</p>
          <h4 className="heading-reset">Handoff GitHub do projeto</h4>
          <p className="helper-text-ea">
            Use GitHub como base de continuidade: identidade da conta quando disponível, repositório base e snapshots locais para app ou site.
          </p>
        </div>

        <div className="hero-meta-row github-workspace-meta-row">
          <span className="premium-badge premium-badge-phase">
            {connected ? `Conta conectada${identityLabel ? ` • ${identityLabel}` : ""}` : canLinkIdentity ? "Conta opcional neste beta" : "Base local ativa neste beta"}
          </span>
          <span className="premium-badge premium-badge-soon">{repoLabel || "Base do repositório ainda não definida"}</span>
        </div>

        <div className="github-workspace-status-list github-workspace-status-list-compact">
          <div className="github-workspace-status-item">
            <span className="github-workspace-status-label">Projeto atual</span>
            <strong>{selectedProject?.title || "Abra um projeto para preparar a continuidade"}</strong>
            <small>{selectedProject ? `${selectedProject.kind} • ${projectSummary?.outputStageLabel || "Draft"} • ${versionSummaryLabel}` : "O editor usa essa base para salvar versões e exportar snapshots."}</small>
          </div>
          <div className="github-workspace-status-item">
            <span className="github-workspace-status-label">Handoff GitHub</span>
            <strong>{githubDeliveryStage.label}</strong>
            <small>{githubDeliveryStage.detail}</small>
          </div>
        </div>

        {error ? (
          <div className="state-ea state-ea-error">
            <p className="state-ea-title">GitHub indisponível agora</p>
            <div className="state-ea-text">{error}</div>
          </div>
        ) : null}

        {success ? (
          <div className="state-ea state-ea-success">
            <p className="state-ea-title">GitHub beta atualizado</p>
            <div className="state-ea-text">{success}</div>
          </div>
        ) : null}

        <div className="github-workspace-cta-row">
          <Link href="/projects#github-workspace" className="btn-link-ea btn-secondary btn-sm">
            Configurar base GitHub
          </Link>
          <button onClick={handleSaveVersion} disabled={!selectedProject || busyAction === "version"} className="btn-ea btn-ghost btn-sm">
            {busyAction === "version" ? "Salvando versão..." : "Salvar versão"}
          </button>
          <button onClick={handleExportBundle} disabled={!selectedProject || busyAction === "export"} className="btn-ea btn-primary btn-sm">
            {busyAction === "export" ? "Preparando snapshot..." : "Exportar snapshot .json"}
          </button>
        </div>

        <div className="github-workspace-inline-note">
          <strong>Última versão local</strong>
          <span>{formatDateLabel(lastVersionSavedAt)}</span>
        </div>
        <div className="github-workspace-inline-note">
          <strong>Último snapshot exportado</strong>
          <span>{formatDateLabel(lastExportedAt)}</span>
        </div>
        <div className="github-workspace-activity-list">
          {visibleGitHubActivity.length ? visibleGitHubActivity.map((item) => (
            <div key={item.id} className="github-workspace-activity-item">
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
              <small>{formatDateLabel(item.ts)}</small>
            </div>
          )) : (
            <div className="github-workspace-inline-note">
              <strong>Sem histórico recente</strong>
              <span>Salve uma versão local ou exporte um snapshot para criar uma trilha clara de saída.</span>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id="github-workspace" className="premium-card github-workspace-card github-workspace-card-full github-workspace-anchor">
      <div className="github-workspace-head">
        <div className="section-header-ea">
          <p className="section-kicker">GitHub beta</p>
          <h2 className="heading-reset">Base GitHub para continuidade beta</h2>
          <p className="section-header-copy">
            No beta, GitHub já cobre identidade da conta quando disponível, base owner/repositório/branch, versões locais e snapshot exportável para app ou site.
          </p>
        </div>
        <div className="hero-meta-row github-workspace-meta-row">
          <span className="premium-badge premium-badge-phase">{connected ? "Conta GitHub conectada" : canLinkIdentity ? "Conta opcional neste beta" : "Conexão de conta indisponível aqui"}</span>
          <span className="premium-badge premium-badge-warning">{repoLabel || "Base do repositório ainda não definida"}</span>
          <span className="premium-badge premium-badge-soon">{githubDeliveryStage.label}</span>
        </div>
      </div>

      {availableProjects.length > 1 ? (
        <div className="github-workspace-form-grid">
          <label className="field-label-ea">
            <span>Projeto para handoff GitHub</span>
            <PremiumSelect
              value={selectedProject?.id || ""}
              onChange={setSelectedProjectId}
              options={availableProjects.map((item) => ({ value: item.id, label: item.title }))}
              ariaLabel="Projeto selecionado para handoff GitHub"
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível preparar o GitHub agora</p>
          <div className="state-ea-text">{error}</div>
        </div>
      ) : null}

      {success ? (
        <div className="state-ea state-ea-success">
          <p className="state-ea-title">GitHub beta atualizado</p>
          <div className="state-ea-text">{success}</div>
        </div>
      ) : null}

      <div className="github-workspace-grid">
        <article className="premium-card-soft github-workspace-pane">
          <div className="section-stack-tight">
            <p className="section-kicker">1. Conta da equipe</p>
            <h3 className="heading-reset">Identidade GitHub quando disponível</h3>
            <p className="helper-text-ea">
              Quando este ambiente expõe a conexão da conta, você pode associar sua identidade GitHub. Mesmo sem isso, a base local do repositório e os snapshots continuam disponíveis no beta.
            </p>
          </div>

          <div className="github-workspace-status-list">
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Estado</span>
              <strong>{connected ? "Conta GitHub conectada" : canLinkIdentity ? "Conexão opcional" : "Conexão de conta indisponível"}</strong>
              <small>{connected ? (identityLabel ? `Conta identificada como ${identityLabel}.` : "Identidade disponível para continuidade do projeto.") : canLinkIdentity ? "Você pode seguir com a base local mesmo sem vincular a conta agora." : "Neste ambiente, use a base local e os snapshots para continuar fora da plataforma."}</small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Escopo atual</span>
              <strong>Identidade opcional + handoff por projeto</strong>
              <small>O estado canônico da integração fica no projeto. O navegador guarda só a conveniência local.</small>
            </div>
          </div>

          <div className="github-workspace-cta-row">
            <button onClick={handleConnectGitHub} disabled={busyAction === "connect" || connected || !canLinkIdentity} className="btn-ea btn-primary btn-sm">
              {connected ? "Conta conectada" : busyAction === "connect" ? "Conectando..." : canLinkIdentity ? "Conectar GitHub" : "Conexão indisponível aqui"}
            </button>
            <Link href={selectedProject ? `/editor/${selectedProject.id}` : "/editor/new"} className="btn-link-ea btn-ghost btn-sm">
              {selectedProject ? "Abrir projeto no editor" : "Abrir projeto para app/site"}
            </Link>
          </div>
        </article>

        <article className="premium-card-soft github-workspace-pane">
          <div className="section-stack-tight">
            <p className="section-kicker">2. Base do repositório</p>
            <h3 className="heading-reset">Owner, branch e destino</h3>
            <p className="helper-text-ea">
              Salve uma base por projeto para importar a referência do repositório e usar o editor como ponto de continuidade do app ou site.
            </p>
          </div>

          <div className="github-workspace-form-grid">
            <label className="field-label-ea">
              <span>Owner</span>
              <input className="field-ea" value={draft.owner} onChange={(event) => updateDraft("owner", event.target.value)} placeholder="empresa-ou-usuario" />
            </label>
            <label className="field-label-ea">
              <span>Repositório</span>
              <input className="field-ea" value={draft.repo} onChange={(event) => updateDraft("repo", event.target.value)} placeholder="meu-app-ou-site" />
            </label>
            <label className="field-label-ea">
              <span>Branch base</span>
              <input className="field-ea" value={draft.branch} onChange={(event) => updateDraft("branch", event.target.value)} placeholder="main" />
            </label>
            <label className="field-label-ea">
              <span>Raiz do projeto</span>
              <input className="field-ea" value={draft.rootPath} onChange={(event) => updateDraft("rootPath", event.target.value)} placeholder="/apps/web" />
            </label>
          </div>

          <div className="github-workspace-target-row" role="radiogroup" aria-label="Destino do handoff GitHub">
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

          <div className="github-workspace-cta-row">
            <button onClick={handleSaveWorkspace} disabled={busyAction === "save"} className="btn-ea btn-secondary btn-sm">
              {busyAction === "save" ? "Salvando base..." : selectedProject ? "Salvar base no projeto" : "Salvar base GitHub"}
            </button>
            <button onClick={handleClearWorkspace} disabled={busyAction === "clear" || (!activeWorkspace && !selectedProject)} className="btn-ea btn-ghost btn-sm">
              {busyAction === "clear" ? "Limpando..." : selectedProject ? "Remover base do projeto" : "Remover base local"}
            </button>
          </div>
        </article>

        <article className="premium-card-soft github-workspace-pane">
          <div className="section-stack-tight">
            <p className="section-kicker">3. Continuidade</p>
            <h3 className="heading-reset">Salvar versão e exportar snapshot</h3>
            <p className="helper-text-ea">
              O beta já prepara continuidade fora da plataforma: abra um projeto no editor, registre versões locais e exporte um snapshot para seguir no app ou site com base real de handoff.
            </p>
          </div>

          <div className="github-workspace-status-list">
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Projeto atual</span>
              <strong>{selectedProject?.title || "Selecione ou abra um projeto"}</strong>
              <small>{selectedProject ? `${selectedProject.kind} • ${projectSummary?.outputStageLabel || "Draft"} • ${versionSummaryLabel}` : versionSummaryLabel}</small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Handoff GitHub</span>
              <strong>{githubDeliveryStage.label}</strong>
              <small>{githubDeliveryStage.detail}</small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Último snapshot</span>
              <strong>{lastExportedAt ? formatDateLabel(lastExportedAt) : "Nenhum snapshot exportado"}</strong>
              <small>{activeWorkspace ? `Destino ${targetLabel(activeWorkspace.target)} em ${activeWorkspace.branch}${repoLabel ? ` • ${repoLabel}` : ""}.` : "Configure owner/repositório/branch e depois exporte o snapshot do projeto."}</small>
            </div>
          </div>

          <ol className="github-workspace-checklist">
            <li>Conecte a conta GitHub, quando disponível, ou mantenha a base local salva para este navegador.</li>
            <li>Abra um projeto no editor para consolidar a base canônica da continuidade.</li>
            <li>Salve versões e exporte o snapshot .json enquanto push, PR e CI entram na próxima fase.</li>
          </ol>

          <div className="github-workspace-inline-note">
            <strong>Source of truth por projeto</strong>
            <span>Binding, versões e snapshots GitHub agora ficam persistidos no projeto. O navegador só espelha esse estado como conveniência beta.</span>
          </div>
          <div className="github-workspace-cta-row">
            <button onClick={handleSaveVersion} disabled={!selectedProject || busyAction === "version"} className="btn-ea btn-secondary btn-sm">
              {busyAction === "version" ? "Salvando versão..." : "Salvar versão local"}
            </button>
            <button onClick={handleExportBundle} disabled={!selectedProject || busyAction === "export"} className="btn-ea btn-primary btn-sm">
              {busyAction === "export" ? "Preparando snapshot..." : "Exportar snapshot .json"}
            </button>
          </div>
          <div className="github-workspace-activity-list">
            {visibleGitHubActivity.length ? visibleGitHubActivity.map((item) => (
              <div key={item.id} className="github-workspace-activity-item">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
                <small>{formatDateLabel(item.ts)}</small>
              </div>
            )) : (
              <div className="github-workspace-inline-note">
                <strong>Sem histórico recente</strong>
                <span>Registre versões locais e exporte snapshots para tornar a continuidade do app ou site menos ambígua.</span>
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
