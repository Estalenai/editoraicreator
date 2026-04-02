"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PremiumSelect } from "../ui/PremiumSelect";
import { OperationalState } from "../ui/OperationalState";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabaseClient";
import { toUserFacingError } from "../../lib/uiFeedback";
import { ensureCanonicalProjectData, getCanonicalProjectSummary, mergeCanonicalProjectData } from "../../lib/projectModel";
import {
  assessGitHubWorkspaceDraft,
  buildGitHubManualWorkflowPlan,
  buildGitHubWorkingBranch,
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

function isWorkspaceDraftComplete(draft: WorkspaceDraft): boolean {
  return Boolean(draft.owner.trim() && draft.repo.trim());
}

function workspaceFromDraft(
  draft: WorkspaceDraft,
  identityLabel: string | null,
  connectedAt?: string | null
): GitHubWorkspace | null {
  if (!isWorkspaceDraftComplete(draft)) return null;
  const now = new Date().toISOString();
  return {
    provider: "github",
    owner: draft.owner.trim(),
    repo: draft.repo.trim(),
    branch: draft.branch.trim() || "main",
    rootPath: normalizeRootPath(draft.rootPath),
    target: draft.target,
    connectedAt: connectedAt || now,
    updatedAt: now,
    accountLabel: identityLabel,
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
  const hydrationKeyRef = useRef("");

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
  const visibleWorkspace = selectedProject ? projectWorkspace : workspace;
  const suggestedWorkspace = useMemo(() => projectWorkspace || workspace, [projectWorkspace, workspace]);
  const inheritedConnectedAt = projectWorkspace
    ? projectWorkspace.connectedAt
    : workspace?.connectedAt || null;
  const actionWorkspace = useMemo(
    () => projectWorkspace || workspaceFromDraft(draft, identityLabel, inheritedConnectedAt),
    [draft, identityLabel, inheritedConnectedAt, projectWorkspace]
  );
  const repoLabel = useMemo(() => formatGitHubRepoLabel(visibleWorkspace), [visibleWorkspace]);
  const workspaceAssessment = useMemo(
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
  const hasDraftInput = useMemo(
    () => Boolean(draft.owner.trim() || draft.repo.trim() || draft.branch.trim() || draft.rootPath.trim()),
    [draft]
  );
  const savedWorkspaceSignature = useMemo(
    () =>
      visibleWorkspace
        ? [visibleWorkspace.owner, visibleWorkspace.repo, visibleWorkspace.branch, visibleWorkspace.rootPath, visibleWorkspace.target].join("|")
        : "",
    [visibleWorkspace]
  );
  const draftWorkspaceSignature = useMemo(
    () =>
      workspaceAssessment.ready
        ? [workspaceAssessment.owner, workspaceAssessment.repo, workspaceAssessment.branch, workspaceAssessment.rootPath, workspaceAssessment.target].join("|")
        : "",
    [workspaceAssessment]
  );
  const hasUnsavedWorkspaceDraft = Boolean(hasDraftInput && draftWorkspaceSignature && draftWorkspaceSignature !== savedWorkspaceSignature);
  const suggestedWorkingBranch = useMemo(() => buildGitHubWorkingBranch(selectedProject), [selectedProject]);
  const manualWorkflowPlan = useMemo(
    () => buildGitHubManualWorkflowPlan(selectedProject, actionWorkspace || visibleWorkspace),
    [actionWorkspace, selectedProject, visibleWorkspace]
  );
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
    setDraft(draftFromWorkspace(suggestedWorkspace));
  }, [ready, suggestedWorkspace]);

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
    if (selectedProjectCanonical?.delivery.stage === "published" && (effectiveProjectExports.length > 0 || projectWorkspace)) {
      return {
        label: "Published",
        detail: "O projeto ja teve a publicacao manual confirmada fora da plataforma. O GitHub continua como trilha de handoff e continuidade.",
      };
    }
    if (effectiveProjectExports.length > 0) {
      return {
        label: "Exported",
        detail: "Snapshot exportado e pronto para handoff beta fora da plataforma.",
      };
    }
    if (projectWorkspace) {
      return {
        label: "Draft",
        detail: "Base do repositório salva. Falta exportar o snapshot para o handoff beta.",
      };
    }
    return {
      label: "Draft",
      detail: "Defina owner, repositório e branch antes de preparar a saída.",
    };
  }, [effectiveProjectExports.length, projectWorkspace, selectedProjectCanonical?.delivery.stage]);
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
  const githubBusyState = useMemo(() => {
    if (!busyAction) return null;
    const projectLabel = selectedProject?.title || "Projeto atual";
    const handoffLabel = repoLabel || "Base do repositório ainda não definida";

    if (busyAction === "connect") {
      return {
        kind: "syncing" as const,
        title: "Conectando identidade GitHub",
        description: "Preparando a continuidade da conta para o handoff do projeto.",
      };
    }

    if (busyAction === "save") {
      return {
        kind: "syncing" as const,
        title: "Salvando base GitHub",
        description: "Persistindo owner, branch e destino para o fluxo de continuidade.",
      };
    }

    if (busyAction === "clear") {
      return {
        kind: "retry" as const,
        title: "Removendo base GitHub",
        description: "Limpando a referência atual para evitar handoff errado no próximo passo.",
      };
    }

    if (busyAction === "version") {
      return {
        kind: "saved" as const,
        title: "Registrando versão local",
        description: "Criando um checkpoint confiável antes do próximo handoff.",
      };
    }

    return {
      kind: "syncing" as const,
      title: "Exportando snapshot GitHub",
      description: "Preparando o pacote beta com branch, snapshot e próximos passos manuais para continuidade fora da plataforma.",
    };
  }, [busyAction, repoLabel, selectedProject]);

  const githubTrustState = useMemo(() => {
    const accountValue = connected
      ? identityLabel || "Conta GitHub conectada"
      : canLinkIdentity
        ? "Opcional neste beta"
        : "Indisponível neste ambiente";
    const checkpointValue = lastVersionSavedAt ? formatDateLabel(lastVersionSavedAt) : "Nenhum checkpoint";
    const snapshotValue = lastExportedAt ? formatDateLabel(lastExportedAt) : "Nenhum snapshot";
    const commonMeta = [
      { label: "Projeto", value: selectedProject?.title || "Abra um projeto" },
      { label: "Conta", value: accountValue },
      { label: "Workspace", value: repoLabel || "Pendente" },
      { label: "Branch", value: visibleWorkspace?.branch || "Pendente" },
      { label: "Checkpoint", value: checkpointValue },
      { label: "Snapshot", value: snapshotValue },
      {
        label: "Push / PR",
        value: visibleWorkspace ? "Manual no beta" : "Ainda nao disponivel",
        hint: "A plataforma ainda nao faz push remoto nem abre PR automaticamente nesta fase.",
        tone: "warning" as const,
      },
    ];

    if (!selectedProject) {
      return {
        kind: "empty" as const,
        title: "Abra um projeto para ativar o fluxo GitHub",
        description: "O GitHub beta so vira parte confiavel do produto quando estiver preso a um projeto real, com base salva e checkpoint visivel.",
        meta: commonMeta,
        details: [
          "Selecione um projeto para registrar branch, checkpoint e snapshot do handoff.",
        ],
        footer: "Sem projeto ativo, o GitHub fica apenas como preparacao de workspace e nao como trilha operacional confiavel.",
      };
    }

    if (!visibleWorkspace) {
      return {
        kind: "empty" as const,
        title: "Base GitHub ainda nao preparada",
        description: "Defina owner, repositorio e branch para transformar o handoff em uma continuidade clara do projeto.",
        meta: commonMeta,
        details: [
          suggestedWorkingBranch
            ? `Branch sugerida para o trabalho manual: ${suggestedWorkingBranch}.`
            : "Defina uma branch base antes do primeiro handoff.",
          "Push e PR ainda continuam manuais nesta fase do beta.",
        ],
        footer: manualWorkflowPlan.nextStep,
      };
    }

    if (lastExportedAt) {
      return {
        kind: "success" as const,
        title: "Snapshot GitHub pronto para handoff",
        description: "O projeto ja tem uma trilha confiavel de continuidade: base salva, checkpoint visivel e snapshot exportado para seguir fora da plataforma.",
        meta: commonMeta,
        details: [
          manualWorkflowPlan.suggestedWorkingBranch
            ? `Branch sugerida para o trabalho manual: ${manualWorkflowPlan.suggestedWorkingBranch}.`
            : `Branch base salva no projeto: ${visibleWorkspace.branch}.`,
          manualWorkflowPlan.commitTitle ? `Commit sugerido: ${manualWorkflowPlan.commitTitle}.` : "Commit manual ainda precisa ser definido fora da plataforma.",
          manualWorkflowPlan.pullRequestTitle ? `PR sugerido: ${manualWorkflowPlan.pullRequestTitle}.` : "PR manual ainda precisa ser aberto fora da plataforma.",
        ],
        footer: `${manualWorkflowPlan.nextStep} O projeto continua guardando o estado principal do handoff.`,
      };
    }

    if (lastVersionSavedAt) {
      return {
        kind: "saved" as const,
        title: "Checkpoint GitHub registrado",
        description: "A base do repositório ja esta salva e existe um checkpoint local confiavel. Falta exportar o snapshot para fechar o handoff beta.",
        meta: commonMeta,
        details: [
          manualWorkflowPlan.suggestedWorkingBranch
            ? `Branch sugerida para o trabalho manual: ${manualWorkflowPlan.suggestedWorkingBranch}.`
            : `Branch base salva no projeto: ${visibleWorkspace.branch}.`,
          "O proximo passo confiavel e exportar o snapshot .json antes de seguir para push ou PR manual.",
        ],
        footer: manualWorkflowPlan.nextStep,
      };
    }

    return {
      kind: "unsaved" as const,
      title: "GitHub preparado, mas sem checkpoint ainda",
      description: "O workspace ja foi salvo, mas ainda falta registrar uma versao local para que o fluxo tenha trilha auditavel antes do handoff.",
      meta: commonMeta,
      details: [
        manualWorkflowPlan.suggestedWorkingBranch
          ? `Branch sugerida para o trabalho manual: ${manualWorkflowPlan.suggestedWorkingBranch}.`
          : `Branch base salva no projeto: ${visibleWorkspace.branch}.`,
        "Salve uma versao local antes de exportar o snapshot para reduzir ambiguidade no handoff.",
      ],
      footer: manualWorkflowPlan.nextStep,
    };
  }, [
    canLinkIdentity,
    connected,
    identityLabel,
    lastExportedAt,
    lastVersionSavedAt,
    manualWorkflowPlan.commitTitle,
    manualWorkflowPlan.nextStep,
    manualWorkflowPlan.pullRequestTitle,
    manualWorkflowPlan.suggestedWorkingBranch,
    repoLabel,
    selectedProject,
    suggestedWorkingBranch,
    visibleWorkspace,
  ]);

  const workspaceDraftState = useMemo(() => {
    if (!hasDraftInput && !visibleWorkspace) {
      return {
        kind: "empty" as const,
        title: "Cole owner/repositorio ou a URL completa do GitHub",
        description: "A base do repositório aceita owner/repositorio, URL do GitHub e branch base. Isso reduz erros antes do primeiro handoff.",
        details: [
          "Exemplo: empresa/repo ou https://github.com/empresa/repo",
        ],
      };
    }

    if (!hasDraftInput) return null;

    if (workspaceAssessment.hasErrors) {
      return {
        kind: "error" as const,
        title: "Base GitHub com erro de configuracao",
        description: "Corrija owner, repositorio ou branch antes de salvar o workspace.",
        details: workspaceAssessment.issues.filter((item) => item.level === "error").map((item) => item.message),
      };
    }

    if (hasUnsavedWorkspaceDraft) {
      return {
        kind: "unsaved" as const,
        title: "Base GitHub pronta para salvar",
        description: "A configuracao atual ja esta consistente e pode ser salva no projeto como source of truth do handoff beta.",
        details: [
          `Repositorio resolvido: ${workspaceAssessment.repoLabel || "Pendente"}.`,
          `Branch base: ${workspaceAssessment.branch}.`,
          `Raiz do projeto: ${workspaceAssessment.rootPath}.`,
          ...(workspaceAssessment.hasWarnings
            ? workspaceAssessment.issues.filter((item) => item.level === "warning").map((item) => item.message)
            : []),
        ],
      };
    }

    if (visibleWorkspace) {
      return {
        kind: "saved" as const,
        title: "Base GitHub ja persistida",
        description: "Owner, repositorio, branch e destino ja estao salvos no projeto. A partir daqui, o foco passa para checkpoint e snapshot.",
        details: [
          `Repositorio salvo: ${repoLabel || "Pendente"}.`,
          `Branch base atual: ${visibleWorkspace.branch}.`,
          `Raiz do projeto: ${visibleWorkspace.rootPath}.`,
        ],
      };
    }

    return null;
  }, [hasDraftInput, hasUnsavedWorkspaceDraft, repoLabel, visibleWorkspace, workspaceAssessment]);

  function updateDraft(field: keyof WorkspaceDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  const persistProjectData = useCallback(
    async (nextData: any) => {
      if (!selectedProject) return nextData;
      const response = await api.updateProject(selectedProject.id, { data: nextData });
      const persistedData = extractUpdatedProjectData(response, nextData);
      setProjectDataMap((current) => ({
        ...current,
        [selectedProject.id]: persistedData,
      }));
      onProjectDataChange?.(selectedProject.id, persistedData);
      return persistedData;
    },
    [onProjectDataChange, selectedProject]
  );

  useEffect(() => {
    if (!selectedProject || !ready) return;
    if (!accountKey) return;
    if (canonicalProjectVersions.length > 0 || canonicalProjectExports.length > 0) return;
    if (fallbackProjectVersions.length === 0 && fallbackProjectExports.length === 0) return;

    const nextKey = `${selectedProject.id}:${fallbackProjectVersions.length}:${fallbackProjectExports.length}`;
    if (hydrationKeyRef.current === nextKey) return;
    hydrationKeyRef.current = nextKey;

    let cancelled = false;

    void (async () => {
      try {
        const nextData = mergeCanonicalProjectData(selectedProjectData, {
          integrations: {
            github: {
              versions: fallbackProjectVersions.map((item) => ({
                id: item.id,
                savedAt: item.savedAt,
                handoffTarget: item.handoffTarget,
                repoLabel: item.repoLabel,
              })),
              exports: fallbackProjectExports.map((item) => ({
                id: item.id,
                exportedAt: item.exportedAt,
                handoffTarget: item.handoffTarget,
                repoLabel: item.repoLabel,
              })),
            },
          },
        });
        await persistProjectData(nextData);
        if (!cancelled) {
          setSuccess("Histórico GitHub local migrado para o projeto. A continuidade agora deixa de depender só deste navegador.");
        }
      } catch (migrationError: any) {
        if (!cancelled) {
          hydrationKeyRef.current = "";
          setError(toUserFacingError(migrationError?.message, "Não foi possível migrar o histórico GitHub local deste projeto."));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accountKey,
    canonicalProjectExports.length,
    canonicalProjectVersions.length,
    fallbackProjectExports,
    fallbackProjectVersions,
    persistProjectData,
    ready,
    selectedProject,
    selectedProjectData,
  ]);

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

    if (!workspaceAssessment.ready) {
      const messages = workspaceAssessment.issues
        .filter((item) => item.level === "error")
        .map((item) => item.message);
      setError(messages.join(" "));
      return;
    }

    setBusyAction("save");
    try {
      const now = new Date().toISOString();
      const existingConnectedAt = projectWorkspace
        ? projectWorkspace.connectedAt
        : workspace?.connectedAt || null;
      const nextWorkspace: GitHubWorkspace = {
        provider: "github",
        owner: workspaceAssessment.owner,
        repo: workspaceAssessment.repo,
        branch: workspaceAssessment.branch,
        rootPath: workspaceAssessment.rootPath,
        target: workspaceAssessment.target,
        connectedAt: existingConnectedAt || now,
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
        setSuccess(
          `Base GitHub salva no projeto com ${workspaceAssessment.owner}/${workspaceAssessment.repo} em ${workspaceAssessment.branch}. A continuidade do handoff agora fica persistida no proprio projeto.`
        );
      } else {
        setSuccess(
          `Base GitHub salva neste navegador com ${workspaceAssessment.owner}/${workspaceAssessment.repo} em ${workspaceAssessment.branch}. O editor ja pode registrar versoes locais e exportar snapshots com owner, repositorio e branch definidos.`
        );
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
      if (accountKey && !selectedProject) {
        clearGitHubWorkspace(accountKey);
      }
      if (!selectedProject) {
        setWorkspace(null);
      }
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
      const workspaceForAction = actionWorkspace;
      if (!workspaceForAction) {
        setError("Salve a base GitHub do projeto com owner e repositório antes de registrar uma versão.");
        return;
      }
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
        handoffTarget: workspaceForAction.target === "app" ? "app" : "site",
        repoLabel: formatGitHubRepoLabel(workspaceForAction),
      };
      const entry = accountKey ? saveGitHubProjectVersion(accountKey, projectRef, workspaceForAction) : fallbackEntry;
      if (accountKey) {
        setLocalVersions(listGitHubProjectVersions(accountKey));
      }

      const nextData = mergeCanonicalProjectData(selectedProjectData, {
        integrations: {
          github: {
            binding: workspaceForAction,
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
      setSuccess(
        `Versao GitHub registrada no projeto. O checkpoint agora fica persistido com base em ${formatGitHubRepoLabel(workspaceForAction) || "uma base GitHub valida"}${manualWorkflowPlan.commitTitle ? ` e ja sugere o commit manual "${manualWorkflowPlan.commitTitle}".` : "."}`
      );
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
      const workspaceForAction = actionWorkspace;
      if (!workspaceForAction) {
        setError("Salve a base GitHub do projeto com owner e repositório antes de exportar o snapshot.");
        return;
      }
      const projectRef = {
        ...selectedProject,
        data: selectedProjectData,
      };
      downloadGitHubProjectBundle(projectRef, workspaceForAction);

      const fallbackEntry: GitHubProjectExport = {
        id: createClientId(),
        projectId: selectedProject.id,
        projectTitle: selectedProject.title,
        exportedAt: new Date().toISOString(),
        handoffTarget: workspaceForAction.target === "app" ? "app" : "site",
        repoLabel: formatGitHubRepoLabel(workspaceForAction),
      };
      const entry = accountKey ? saveGitHubProjectExport(accountKey, projectRef, workspaceForAction) : fallbackEntry;
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
            binding: workspaceForAction,
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
      setSuccess(
        `Snapshot do projeto baixado para ${formatGitHubRepoLabel(workspaceForAction) || "o repositório configurado"}. O handoff agora inclui branch base, checkpoint e proximo passo manual como source of truth do beta.`
      );
    } catch (exportError: any) {
      setError(toUserFacingError(exportError?.message, "Não foi possível exportar o snapshot agora."));
    } finally {
      setBusyAction(null);
    }
  }

  if (!ready) {
    return (
      <section className={`github-workspace-card github-workspace-card-${variant} layout-contract-card`}>
        <div className="premium-skeleton premium-skeleton-line" style={{ width: "38%" }} />
        <div className="premium-skeleton premium-skeleton-line" style={{ width: "72%" }} />
        <div className="premium-skeleton premium-skeleton-card" />
      </section>
    );
  }

  if (variant === "compact") {
    return (
      <section className="github-workspace-card github-workspace-card-compact layout-contract-card">
        <div className="section-stack-tight">
          <p className="section-kicker">GitHub beta</p>
          <h4 className="heading-reset">Handoff GitHub do projeto</h4>
          <p className="helper-text-ea">
            Use GitHub como base de continuidade: identidade quando disponível, repositório e snapshots locais.
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

        {githubBusyState ? (
          <OperationalState
            compact
            kind={githubBusyState.kind}
            title={githubBusyState.title}
            description={githubBusyState.description}
            badge="GitHub beta"
            emphasis={selectedProject?.title || "Sem projeto selecionado"}
            meta={[
              { label: "Projeto", value: selectedProject?.title || "Abra um projeto" },
              { label: "Base", value: repoLabel || "Pendente" },
              { label: "Handoff", value: githubDeliveryStage.label },
            ]}
          />
        ) : null}

        {error ? (
          <OperationalState
            compact
            kind="error"
            title="GitHub indisponível agora"
            description={error}
            badge="GitHub beta"
            emphasis={selectedProject?.title || "Sem projeto selecionado"}
            meta={[
              { label: "Projeto", value: selectedProject?.title || "Abra um projeto" },
              { label: "Base", value: repoLabel || "Pendente" },
            ]}
          />
        ) : null}

        {success ? (
          <OperationalState
            compact
            kind="success"
            title="GitHub beta atualizado"
            description={success}
            badge="GitHub beta"
            emphasis={selectedProject?.title || "Sem projeto selecionado"}
            meta={[
              { label: "Projeto", value: selectedProject?.title || "Abra um projeto" },
              { label: "Última versão", value: formatDateLabel(lastVersionSavedAt) },
              { label: "Último snapshot", value: formatDateLabel(lastExportedAt) },
            ]}
          />
        ) : null}

        <OperationalState
          compact
          kind={githubTrustState.kind}
          title={githubTrustState.title}
          description={githubTrustState.description}
          badge="GitHub status"
          emphasis={selectedProject?.title || "Sem projeto selecionado"}
          meta={githubTrustState.meta}
          details={githubTrustState.details}
          footer={githubTrustState.footer}
        />

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
    <section id="github-workspace" className="github-workspace-card github-workspace-card-full github-workspace-anchor layout-contract-card">
      <div className="github-workspace-head">
        <div className="section-header-ea">
          <p className="section-kicker">GitHub beta</p>
          <h2 className="heading-reset">Base GitHub para continuidade beta</h2>
          <p className="section-header-copy">
            No beta, GitHub cobre identidade quando disponível, owner/repo/branch, versões locais e snapshot exportável.
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

      {githubBusyState ? (
        <OperationalState
          kind={githubBusyState.kind}
          title={githubBusyState.title}
          description={githubBusyState.description}
          badge="GitHub beta"
          emphasis={selectedProject?.title || "Sem projeto selecionado"}
          meta={[
            { label: "Projeto", value: selectedProject?.title || "Abra um projeto" },
            { label: "Base", value: repoLabel || "Pendente" },
            { label: "Handoff", value: githubDeliveryStage.label },
          ]}
          footer="A plataforma está registrando esta etapa para manter a continuidade do handoff legível."
        />
      ) : null}

      {error ? (
        <OperationalState
          kind="error"
          title="Não foi possível preparar o GitHub agora"
          description={error}
          badge="GitHub beta"
          emphasis={selectedProject?.title || "Sem projeto selecionado"}
          meta={[
            { label: "Projeto", value: selectedProject?.title || "Abra um projeto" },
            { label: "Base", value: repoLabel || "Pendente" },
            { label: "Handoff", value: githubDeliveryStage.label },
          ]}
        />
      ) : null}

      {success ? (
        <OperationalState
          kind="success"
          title="GitHub beta atualizado"
          description={success}
          badge="GitHub beta"
          emphasis={selectedProject?.title || "Sem projeto selecionado"}
          meta={[
            { label: "Projeto", value: selectedProject?.title || "Abra um projeto" },
            { label: "Última versão", value: formatDateLabel(lastVersionSavedAt) },
            { label: "Último snapshot", value: formatDateLabel(lastExportedAt) },
            { label: "Handoff", value: githubDeliveryStage.label },
          ]}
          footer="O estado principal do GitHub agora fica persistido no projeto; o cache local permanece só como conveniência."
        />
      ) : null}

      <OperationalState
        kind={githubTrustState.kind}
        title={githubTrustState.title}
        description={githubTrustState.description}
        badge="GitHub status"
        emphasis={selectedProject?.title || "Sem projeto selecionado"}
        meta={githubTrustState.meta}
        details={githubTrustState.details}
        footer={githubTrustState.footer}
        actions={
          <div className="github-workspace-cta-row">
            {manualWorkflowPlan.repositoryUrl ? (
              <a href={manualWorkflowPlan.repositoryUrl} target="_blank" rel="noreferrer" className="btn-link-ea btn-secondary btn-sm">
                Abrir repositório
              </a>
            ) : null}
            <Link href={selectedProject ? `/editor/${selectedProject.id}` : "/editor/new"} className="btn-link-ea btn-ghost btn-sm">
              {selectedProject ? "Abrir projeto no editor" : "Abrir editor"}
            </Link>
          </div>
        }
      />

      <div className="github-workspace-grid">
        <article className="github-workspace-pane layout-contract-item">
          <div className="section-stack-tight">
            <p className="section-kicker">1. Conta da equipe</p>
            <h3 className="heading-reset">Identidade GitHub quando disponível</h3>
            <p className="helper-text-ea">
              Associe sua identidade GitHub quando disponível. Sem isso, a base local e os snapshots continuam.
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

        <article className="github-workspace-pane layout-contract-item">
          <div className="section-stack-tight">
            <p className="section-kicker">2. Base do repositório</p>
            <h3 className="heading-reset">Owner, branch e destino</h3>
            <p className="helper-text-ea">
              Salve owner/repo, branch e destino do projeto. Aceita owner/repo ou URL completa.
            </p>
          </div>

          <div className="github-workspace-form-grid">
            <label className="field-label-ea">
              <span>Owner</span>
              <input className="field-ea" value={draft.owner} onChange={(event) => updateDraft("owner", event.target.value)} placeholder="empresa-ou-usuario" />
            </label>
            <label className="field-label-ea">
              <span>Repositório</span>
              <input className="field-ea" value={draft.repo} onChange={(event) => updateDraft("repo", event.target.value)} placeholder="meu-app-ou-site ou owner/repositorio" />
            </label>
            <label className="field-label-ea">
              <span>Branch base</span>
              <input className="field-ea" value={draft.branch} onChange={(event) => updateDraft("branch", event.target.value)} placeholder={suggestedWorkingBranch || "main"} />
            </label>
            <label className="field-label-ea">
              <span>Raiz do projeto</span>
              <input className="field-ea" value={draft.rootPath} onChange={(event) => updateDraft("rootPath", event.target.value)} placeholder="/apps/web" />
            </label>
          </div>

          {workspaceDraftState ? (
            <OperationalState
              compact
              kind={workspaceDraftState.kind}
              title={workspaceDraftState.title}
              description={workspaceDraftState.description}
              badge="Workspace"
              meta={[
                { label: "Repositorio", value: workspaceAssessment.repoLabel || "Pendente" },
                { label: "Branch", value: workspaceAssessment.branch || "main" },
                { label: "Raiz", value: workspaceAssessment.rootPath },
                { label: "Destino", value: targetLabel(workspaceAssessment.target) },
              ]}
              details={workspaceDraftState.details}
            />
          ) : null}

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
            <button onClick={handleClearWorkspace} disabled={busyAction === "clear" || (!projectWorkspace && !selectedProject && !workspace)} className="btn-ea btn-ghost btn-sm">
              {busyAction === "clear" ? "Limpando..." : selectedProject ? "Remover base do projeto" : "Remover base local"}
            </button>
          </div>
        </article>

        <article className="github-workspace-pane layout-contract-item">
          <div className="section-stack-tight">
            <p className="section-kicker">3. Continuidade</p>
            <h3 className="heading-reset">Salvar versão e exportar snapshot</h3>
            <p className="helper-text-ea">
              Salve versões locais e exporte um snapshot para seguir fora da plataforma.
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
              <small>{projectWorkspace ? `Destino ${targetLabel(projectWorkspace.target)} em ${projectWorkspace.branch}${repoLabel ? ` • ${repoLabel}` : ""}.` : "Salve a base GitHub no projeto antes de exportar o snapshot e manter o vínculo com o repositório."}</small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Próximo branch manual</span>
              <strong>{manualWorkflowPlan.suggestedWorkingBranch || "Defina a base GitHub primeiro"}</strong>
              <small>{visibleWorkspace ? `Push e PR seguem manuais nesta fase. A branch base salva no projeto é ${visibleWorkspace.branch}.` : "A branch sugerida aparece assim que owner, repositório e branch base ficarem consistentes."}</small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Commit / PR sugeridos</span>
              <strong>{manualWorkflowPlan.commitTitle || "Salve a base para gerar a sugestão"}</strong>
              <small>{manualWorkflowPlan.pullRequestTitle || "O título do PR manual aparece junto com o handoff quando a base GitHub estiver pronta."}</small>
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
          <div className="github-workspace-inline-note">
            <strong>Próximo passo manual</strong>
            <span>{manualWorkflowPlan.nextStep}</span>
          </div>
          <div className="github-workspace-cta-row">
            <button onClick={handleSaveVersion} disabled={!selectedProject || busyAction === "version"} className="btn-ea btn-secondary btn-sm">
              {busyAction === "version" ? "Salvando versão..." : "Salvar versão local"}
            </button>
            <button onClick={handleExportBundle} disabled={!selectedProject || busyAction === "export"} className="btn-ea btn-primary btn-sm">
              {busyAction === "export" ? "Preparando snapshot..." : "Exportar snapshot .json"}
            </button>
            {manualWorkflowPlan.repositoryUrl ? (
              <a href={manualWorkflowPlan.repositoryUrl} target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
                Abrir repositório
              </a>
            ) : null}
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
