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

const STORAGE_VERSION = "v1";
const WORKSPACE_PREFIX = `ea:github-workspace:${STORAGE_VERSION}`;
const VERSION_PREFIX = `ea:github-versions:${STORAGE_VERSION}`;
const EXPORT_PREFIX = `ea:github-exports:${STORAGE_VERSION}`;
const VERSION_LIMIT = 16;
const EXPORT_LIMIT = 16;

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
