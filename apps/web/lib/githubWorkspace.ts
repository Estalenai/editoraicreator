import { ensureCanonicalProjectData } from "./projectModel";

export type GitHubWorkspaceTarget = "app" | "site";

export type GitHubWorkspace = {
  provider: "github";
  owner: string;
  repo: string;
  branch: string;
  rootPath: string;
  target: GitHubWorkspaceTarget;
  connectedAt: string;
  updatedAt: string;
  accountLabel?: string | null;
};

export type GitHubProjectRef = {
  id: string;
  title: string;
  kind: string;
  data?: any;
};

export type GitHubProjectVersion = {
  id: string;
  projectId: string;
  projectTitle: string;
  projectKind: string;
  savedAt: string;
  handoffTarget: GitHubWorkspaceTarget;
  repoLabel: string | null;
};

export type GitHubProjectExport = {
  id: string;
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  handoffTarget: GitHubWorkspaceTarget;
  repoLabel: string | null;
};

export type GitHubWorkspaceIssue = {
  field: "owner" | "repo" | "branch" | "rootPath";
  level: "error" | "warning";
  message: string;
};

export type GitHubWorkspaceAssessment = {
  owner: string;
  repo: string;
  branch: string;
  rootPath: string;
  target: GitHubWorkspaceTarget;
  repoLabel: string | null;
  issues: GitHubWorkspaceIssue[];
  ready: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
};

export type GitHubManualWorkflowPlan = {
  repositoryUrl: string | null;
  suggestedWorkingBranch: string | null;
  commitTitle: string | null;
  commitBody: string | null;
  pullRequestTitle: string | null;
  pullRequestBody: string | null;
  pushStatus: "manual_beta";
  pullRequestStatus: "manual_beta";
  nextStep: string;
};

const STORAGE_VERSION = "v1";
const WORKSPACE_PREFIX = `ea:github-workspace:${STORAGE_VERSION}`;
const VERSION_PREFIX = `ea:github-versions:${STORAGE_VERSION}`;
const EXPORT_PREFIX = `ea:github-exports:${STORAGE_VERSION}`;
const VERSION_LIMIT = 16;
const EXPORT_LIMIT = 16;
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]+$/;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeAccountKey(accountKey: string): string {
  return String(accountKey || "anonymous").trim().toLowerCase();
}

function workspaceStorageKey(accountKey: string): string {
  return `${WORKSPACE_PREFIX}:${normalizeAccountKey(accountKey)}`;
}

function versionStorageKey(accountKey: string): string {
  return `${VERSION_PREFIX}:${normalizeAccountKey(accountKey)}`;
}

function exportStorageKey(accountKey: string): string {
  return `${EXPORT_PREFIX}:${normalizeAccountKey(accountKey)}`;
}

export function normalizeRootPath(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "/";
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function normalizeGitHubOwner(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "");
}

function normalizeGitHubRepoName(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
}

function normalizeGitHubBranchName(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^refs\/heads\//i, "")
    .replace(/\/+/g, "/");
}

function parseRepositoryInput(repoInput: string): { owner: string | null; repo: string } | null {
  const trimmed = String(repoInput || "").trim();
  if (!trimmed) return null;

  const githubUrlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (githubUrlMatch) {
    return {
      owner: normalizeGitHubOwner(githubUrlMatch[1]),
      repo: normalizeGitHubRepoName(githubUrlMatch[2]),
    };
  }

  const shorthand = normalizeGitHubRepoName(trimmed);
  const parts = shorthand.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return {
      owner: normalizeGitHubOwner(parts[0]),
      repo: normalizeGitHubRepoName(parts[1]),
    };
  }

  return {
    owner: null,
    repo: shorthand,
  };
}

function slugifyGitHubToken(value: string): string {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalized || "handoff";
}

function formatRepoUrl(workspace: Pick<GitHubWorkspace, "owner" | "repo"> | null | undefined): string | null {
  if (!workspace?.owner || !workspace?.repo) return null;
  return `https://github.com/${workspace.owner}/${workspace.repo}`;
}

export function buildGitHubWorkingBranch(project: GitHubProjectRef | null | undefined): string | null {
  if (!project?.id && !project?.title) return null;
  const projectToken = slugifyGitHubToken(project?.title || project?.id || "projeto");
  return `ea/${projectToken}`.slice(0, 80);
}

export function assessGitHubWorkspaceDraft(
  draft: Pick<GitHubWorkspace, "owner" | "repo" | "branch" | "rootPath" | "target">
): GitHubWorkspaceAssessment {
  const repoInput = parseRepositoryInput(draft.repo);
  const owner = normalizeGitHubOwner(draft.owner || repoInput?.owner || "");
  const repo = normalizeGitHubRepoName(repoInput?.repo || draft.repo || "");
  const branch = normalizeGitHubBranchName(draft.branch || "main") || "main";
  const rootPath = normalizeRootPath(draft.rootPath || "/");
  const issues: GitHubWorkspaceIssue[] = [];

  if (!owner) {
    issues.push({
      field: "owner",
      level: "error",
      message: "Defina o owner GitHub ou cole owner/repositório diretamente no campo de repositório.",
    });
  } else if (!OWNER_PATTERN.test(owner)) {
    issues.push({
      field: "owner",
      level: "error",
      message: "O owner GitHub precisa usar apenas letras, números ou hífen, sem espaços.",
    });
  }

  if (!repo) {
    issues.push({
      field: "repo",
      level: "error",
      message: "Defina o nome do repositório ou cole a URL completa do GitHub.",
    });
  } else if (!REPO_PATTERN.test(repo)) {
    issues.push({
      field: "repo",
      level: "error",
      message: "O repositório GitHub precisa evitar espaços e barras. Use apenas letras, números, ponto, hífen ou underscore.",
    });
  }

  if (!branch) {
    issues.push({
      field: "branch",
      level: "error",
      message: "Defina a branch base antes de salvar a base GitHub.",
    });
  } else if (
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.startsWith(".") ||
    branch.endsWith(".") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{") ||
    /[\s\\~^:?*\[]/.test(branch)
  ) {
    issues.push({
      field: "branch",
      level: "error",
      message: "A branch contém um formato inválido para Git. Use algo como main, develop ou ea/meu-projeto.",
    });
  }

  if (rootPath !== "/" && /\s/.test(rootPath)) {
    issues.push({
      field: "rootPath",
      level: "warning",
      message: "A raiz do projeto contém espaços. Isso costuma complicar handoffs e scripts fora da plataforma.",
    });
  }

  return {
    owner,
    repo,
    branch,
    rootPath,
    target: draft.target === "app" ? "app" : "site",
    repoLabel: owner && repo ? `${owner}/${repo}` : null,
    issues,
    ready: issues.every((item) => item.level !== "error"),
    hasErrors: issues.some((item) => item.level === "error"),
    hasWarnings: issues.some((item) => item.level === "warning"),
  };
}

export function buildGitHubManualWorkflowPlan(
  project: GitHubProjectRef | null | undefined,
  workspace: GitHubWorkspace | null | undefined
): GitHubManualWorkflowPlan {
  const repositoryUrl = formatRepoUrl(workspace);
  const suggestedWorkingBranch = buildGitHubWorkingBranch(project);
  const projectTitle = String(project?.title || "Projeto").trim() || "Projeto";
  const projectKind = String(project?.kind || "projeto").trim() || "projeto";
  const projectToken = slugifyGitHubToken(projectTitle);
  const baseBranch = workspace?.branch || "main";
  const targetLabel = workspace?.target === "app" ? "app" : "site";

  return {
    repositoryUrl,
    suggestedWorkingBranch,
    commitTitle: workspace ? `chore: handoff ${projectToken}` : null,
    commitBody: workspace
      ? [
          `Projeto: ${projectTitle}`,
          `Tipo: ${projectKind}`,
          `Base: ${workspace.owner}/${workspace.repo}`,
          `Branch base: ${baseBranch}`,
          `Destino: ${targetLabel}`,
          "Origem: snapshot beta exportado no Editor AI Creator",
        ].join("\n")
      : null,
    pullRequestTitle: workspace ? `Handoff ${projectTitle}` : null,
    pullRequestBody: workspace
      ? [
          `## Handoff ${projectTitle}`,
          "",
          `- Base do repositório: \`${workspace.owner}/${workspace.repo}\``,
          `- Branch base: \`${baseBranch}\``,
          `- Branch sugerida: \`${suggestedWorkingBranch || baseBranch}\``,
          `- Destino: ${targetLabel}`,
          "",
          "Este fluxo ainda está em beta manual: faça push e PR fora da plataforma usando o snapshot exportado como source of truth.",
        ].join("\n")
      : null,
    pushStatus: "manual_beta",
    pullRequestStatus: "manual_beta",
    nextStep: workspace
      ? `Continue manualmente em ${workspace.owner}/${workspace.repo} usando a branch base ${baseBranch} e o snapshot exportado como referência confiável.`
      : "Salve owner, repositório e branch para transformar o handoff GitHub em uma base confiável do projeto.",
  };
}

export function readGitHubWorkspace(accountKey: string): GitHubWorkspace | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey(accountKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GitHubWorkspace>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.owner || !parsed.repo) return null;

    return {
      provider: "github",
      owner: String(parsed.owner).trim(),
      repo: String(parsed.repo).trim(),
      branch: String(parsed.branch || "main").trim() || "main",
      rootPath: normalizeRootPath(String(parsed.rootPath || "/")),
      target: parsed.target === "app" ? "app" : "site",
      connectedAt: String(parsed.connectedAt || new Date().toISOString()),
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      accountLabel: parsed.accountLabel ? String(parsed.accountLabel) : null,
    };
  } catch {
    return null;
  }
}

export function saveGitHubWorkspace(accountKey: string, workspace: GitHubWorkspace): GitHubWorkspace {
  const next: GitHubWorkspace = {
    provider: "github",
    owner: String(workspace.owner || "").trim(),
    repo: String(workspace.repo || "").trim(),
    branch: String(workspace.branch || "main").trim() || "main",
    rootPath: normalizeRootPath(workspace.rootPath || "/"),
    target: workspace.target === "app" ? "app" : "site",
    connectedAt: String(workspace.connectedAt || new Date().toISOString()),
    updatedAt: String(workspace.updatedAt || new Date().toISOString()),
    accountLabel: workspace.accountLabel ? String(workspace.accountLabel) : null,
  };

  if (isBrowser()) {
    window.localStorage.setItem(workspaceStorageKey(accountKey), JSON.stringify(next));
  }

  return next;
}

export function clearGitHubWorkspace(accountKey: string) {
  if (!isBrowser()) return;
  window.localStorage.removeItem(workspaceStorageKey(accountKey));
}

export function listGitHubProjectVersions(accountKey: string): GitHubProjectVersion[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(versionStorageKey(accountKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id || ""),
        projectId: String(item.projectId || ""),
        projectTitle: String(item.projectTitle || "Projeto"),
        projectKind: String(item.projectKind || "projeto"),
        savedAt: String(item.savedAt || new Date().toISOString()),
        handoffTarget: (item.handoffTarget === "app" ? "app" : "site") as GitHubWorkspaceTarget,
        repoLabel: item.repoLabel ? String(item.repoLabel) : null,
      }))
      .filter((item) => item.id && item.projectId);
  } catch {
    return [];
  }
}

export function listGitHubProjectExports(accountKey: string): GitHubProjectExport[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(exportStorageKey(accountKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id || ""),
        projectId: String(item.projectId || ""),
        projectTitle: String(item.projectTitle || "Projeto"),
        exportedAt: String(item.exportedAt || new Date().toISOString()),
        handoffTarget: (item.handoffTarget === "app" ? "app" : "site") as GitHubWorkspaceTarget,
        repoLabel: item.repoLabel ? String(item.repoLabel) : null,
      }))
      .filter((item) => item.id && item.projectId);
  } catch {
    return [];
  }
}

function localId() {
  try {
    return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export function saveGitHubProjectVersion(
  accountKey: string,
  project: GitHubProjectRef,
  workspace: GitHubWorkspace | null
): GitHubProjectVersion {
  const entry: GitHubProjectVersion = {
    id: localId(),
    projectId: String(project.id),
    projectTitle: String(project.title || "Projeto"),
    projectKind: String(project.kind || "projeto"),
    savedAt: new Date().toISOString(),
    handoffTarget: workspace?.target === "app" ? "app" : "site",
    repoLabel: workspace ? formatGitHubRepoLabel(workspace) : null,
  };

  const next = [entry, ...listGitHubProjectVersions(accountKey)].slice(0, VERSION_LIMIT);
  if (isBrowser()) {
    window.localStorage.setItem(versionStorageKey(accountKey), JSON.stringify(next));
  }

  return entry;
}

export function saveGitHubProjectExport(
  accountKey: string,
  project: GitHubProjectRef,
  workspace: GitHubWorkspace | null
): GitHubProjectExport {
  const entry: GitHubProjectExport = {
    id: localId(),
    projectId: String(project.id),
    projectTitle: String(project.title || "Projeto"),
    exportedAt: new Date().toISOString(),
    handoffTarget: workspace?.target === "app" ? "app" : "site",
    repoLabel: workspace ? formatGitHubRepoLabel(workspace) : null,
  };

  const next = [entry, ...listGitHubProjectExports(accountKey)].slice(0, EXPORT_LIMIT);
  if (isBrowser()) {
    window.localStorage.setItem(exportStorageKey(accountKey), JSON.stringify(next));
  }

  return entry;
}

export function formatGitHubRepoLabel(workspace: Pick<GitHubWorkspace, "owner" | "repo"> | null | undefined): string | null {
  if (!workspace?.owner || !workspace?.repo) return null;
  return `${workspace.owner}/${workspace.repo}`;
}

export function resolveGitHubConnection(user: any): { connected: boolean; label: string | null } {
  const providers = Array.isArray(user?.app_metadata?.providers)
    ? user.app_metadata.providers.map((item: unknown) => String(item))
    : user?.app_metadata?.provider
      ? [String(user.app_metadata.provider)]
      : [];

  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const githubIdentity = identities.find((item: any) => item?.provider === "github");
  const connected = providers.includes("github") || Boolean(githubIdentity);
  const identityData = githubIdentity?.identity_data || user?.user_metadata || {};
  const rawLabel =
    identityData?.user_name ||
    identityData?.preferred_username ||
    identityData?.name ||
    identityData?.email ||
    null;

  return {
    connected,
    label: rawLabel ? String(rawLabel) : null,
  };
}

function buildStarterStructure(target: GitHubWorkspaceTarget): string[] {
  if (target === "app") {
    return [
      "src/app/",
      "src/screens/",
      "src/components/",
      "src/lib/",
      "assets/media/",
    ];
  }

  return [
    "app/layout.tsx",
    "app/page.tsx",
    "components/sections/",
    "styles/globals.css",
    "public/media/",
  ];
}

export function buildGitHubProjectBundle(project: GitHubProjectRef, workspace: GitHubWorkspace | null) {
  const handoffTarget = workspace?.target === "app" ? "app" : "site";
  const canonical = ensureCanonicalProjectData(project.data, {
    projectKind: project.kind,
    projectTitle: project.title,
  });
  const manualWorkflow = buildGitHubManualWorkflowPlan(project, workspace);

  return {
    schema: "editor-ai-creator.github-beta.v1",
    exportedAt: new Date().toISOString(),
    product: "Editor AI Creator",
    handoff: {
      stage: canonical.delivery.stage === "published" ? "published" : "exported",
      target: handoffTarget,
      steps: ["gerar", "editar", "salvar", "exportar"],
      starterStructure: buildStarterStructure(handoffTarget),
      note: "Fluxo beta: este bundle representa o estado exported do projeto para continuidade fora da plataforma. Push, branches e PRs entram na próxima fase.",
    },
    github: workspace
      ? {
          provider: workspace.provider,
          owner: workspace.owner,
          repo: workspace.repo,
          branch: workspace.branch,
          rootPath: workspace.rootPath,
          target: workspace.target,
          accountLabel: workspace.accountLabel || null,
        }
      : null,
    manualWorkflow,
    project: {
      id: project.id,
      title: project.title,
      kind: project.kind,
      source: canonical.source,
      output: canonical.output,
      deliverable: canonical.deliverable,
      delivery: canonical.delivery,
      integrations: canonical.integrations,
      data: project.data ?? null,
    },
  };
}

export function downloadGitHubProjectBundle(project: GitHubProjectRef, workspace: GitHubWorkspace | null) {
  if (typeof window === "undefined") return;
  const bundle = buildGitHubProjectBundle(project, workspace);
  const slug = String(project.title || project.id || "projeto")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "projeto";
  const fileName = `${slug}-github-beta.json`;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
