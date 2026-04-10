import type {
  ProjectGitHubBinding,
  ProjectGitHubExportRecord,
  ProjectGitHubVersionRecord,
} from "./projectModel";

export type GitHubWorkspaceTarget = "app" | "site";

export type GitHubWorkspace = ProjectGitHubBinding;
export type GitHubProjectVersion = ProjectGitHubVersionRecord;
export type GitHubProjectExport = ProjectGitHubExportRecord;

export type GitHubConnectionSummary = {
  connected: boolean;
  login: string | null;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string | null;
  scopes: string[];
  updatedAt: string | null;
  mode: "token" | "none";
};

export type GitHubProjectRef = {
  id: string;
  title: string;
  kind: string;
  data?: any;
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

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]+$/;

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
  return normalized || "workspace";
}

export function formatGitHubRepoLabel(workspace: Pick<GitHubWorkspace, "owner" | "repo"> | null | undefined): string | null {
  if (!workspace?.owner || !workspace?.repo) return null;
  return `${workspace.owner}/${workspace.repo}`;
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
      message: "Defina a branch de trabalho antes de salvar a base GitHub.",
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
      message: "A branch contém um formato inválido para Git. Use algo como ea/meu-projeto.",
    });
  }

  if (rootPath !== "/" && /\s/.test(rootPath)) {
    issues.push({
      field: "rootPath",
      level: "warning",
      message: "A raiz do projeto contém espaços. Isso costuma complicar scripts, builds e automações.",
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

export function githubSyncStatusLabel(value: string | null | undefined): string {
  if (value === "synced") return "Sync concluído";
  if (value === "pr_open") return "PR aberto";
  if (value === "pr_merged") return "PR mergeado";
  if (value === "pr_closed") return "PR fechado";
  if (value === "diverged") return "Branch divergente";
  if (value === "branch_missing") return "Branch ausente";
  if (value === "repo_missing") return "Repositório ausente";
  if (value === "verified" || value === "workspace_verified") return "Workspace verificado";
  if (value === "pending") return "Pendente";
  if (value === "failed") return "Falhou";
  return "Ainda não sincronizado";
}
