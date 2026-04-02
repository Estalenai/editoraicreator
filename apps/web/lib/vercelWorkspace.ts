"use client";

export type VercelFramework = "nextjs" | "vite" | "static";
export type VercelDeployStatus = "draft" | "ready" | "published";
export type VercelEnvironment = "preview" | "production";
export type VercelDeploymentState =
  | "QUEUED"
  | "BUILDING"
  | "INITIALIZING"
  | "READY"
  | "ERROR"
  | "CANCELED"
  | "UNKNOWN";

export type VercelProjectEvent = {
  id: string;
  ts: string;
  type:
    | "base_saved"
    | "handoff_exported"
    | "published_manual"
    | "status_updated"
    | "workspace_saved"
    | "deployment_requested"
    | "deployment_ready"
    | "deployment_failed"
    | "deployment_reconciled";
  stage: "draft" | "exported" | "published";
  title: string;
  note: string;
};

export type VercelProjectSummary = {
  id: string;
  title: string;
  kind?: string;
  data?: any;
};

export type VercelConnectionTeam = {
  id: string | null;
  slug: string | null;
  name: string | null;
  avatarUrl?: string | null;
};

export type VercelConnectionSummary = {
  connected: boolean;
  id: string | null;
  username: string | null;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  defaultTeamId: string | null;
  defaultTeamSlug: string | null;
  teams: VercelConnectionTeam[];
  updatedAt: string | null;
  mode: "token" | "none";
};

export type VercelWorkspace = {
  provider?: "vercel";
  projectId: string | null;
  projectName: string;
  teamId: string | null;
  teamSlug: string;
  framework: VercelFramework;
  rootDirectory: string;
  target: VercelEnvironment;
  deployStatus: VercelDeployStatus;
  previewUrl: string;
  productionUrl: string;
  projectUrl: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
  lastVerifiedAt: string | null;
  verificationStatus: string | null;
  tokenConfigured: boolean;
  linkedRepoId: string | null;
  linkedRepoType: string | null;
  lastDeploymentId: string | null;
  lastDeploymentUrl: string | null;
  lastDeploymentInspectorUrl: string | null;
  lastDeploymentState: VercelDeploymentState | string | null;
  lastDeploymentTarget: VercelEnvironment | null;
  lastDeploymentRef: string | null;
  lastDeployRequestedAt: string | null;
  lastDeployReadyAt: string | null;
  lastDeployError: string | null;
};

export type VercelWorkspaceIssue = {
  field: "projectName" | "teamSlug" | "rootDirectory" | "target";
  level: "error" | "warning";
  message: string;
};

export type VercelWorkspaceAssessment = {
  projectName: string;
  teamSlug: string;
  framework: VercelFramework;
  rootDirectory: string;
  target: VercelEnvironment;
  issues: VercelWorkspaceIssue[];
  ready: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
};

const PROJECT_NAME_PATTERN = /^[a-z0-9-]+$/;
const TEAM_SLUG_PATTERN = /^[a-z0-9._-]+$/i;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function recommendVercelFramework(projectKind?: string): VercelFramework {
  const kind = String(projectKind || "").toLowerCase();
  if (kind === "website" || kind === "course") return "nextjs";
  if (kind === "automation") return "vite";
  return "static";
}

export function recommendedRootDirectory(framework: VercelFramework): string {
  if (framework === "nextjs") return "apps/web";
  if (framework === "vite") return "app";
  return "export";
}

export function normalizeVercelProjectName(value: string): string {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 100);
}

export function normalizeVercelTeamSlug(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "-");
}

export function normalizeVercelRootDirectory(value: string, framework: VercelFramework): string {
  const trimmed = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
  return trimmed || recommendedRootDirectory(framework);
}

export function normalizeVercelEnvironment(value: string): VercelEnvironment {
  return value === "production" ? "production" : "preview";
}

function normalizeVercelDeploymentState(value: string | null | undefined): VercelDeploymentState {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "QUEUED") return "QUEUED";
  if (normalized === "BUILDING") return "BUILDING";
  if (normalized === "INITIALIZING") return "INITIALIZING";
  if (normalized === "READY") return "READY";
  if (normalized === "ERROR") return "ERROR";
  if (normalized === "CANCELED") return "CANCELED";
  return "UNKNOWN";
}

export function deriveVercelDeployStatus(binding: Partial<VercelWorkspace> | null | undefined): VercelDeployStatus {
  const state = normalizeVercelDeploymentState(binding?.lastDeploymentState || null);
  const target = normalizeVercelEnvironment(String(binding?.lastDeploymentTarget || ""));
  if ((state === "READY" && target === "production") || asText(binding?.productionUrl)) return "published";
  if (state !== "UNKNOWN" || asText(binding?.previewUrl)) return "ready";
  return "draft";
}

export function assessVercelWorkspaceDraft(input: {
  projectName: string;
  teamSlug: string;
  framework: VercelFramework;
  rootDirectory: string;
  target: VercelEnvironment;
}): VercelWorkspaceAssessment {
  const projectName = normalizeVercelProjectName(input.projectName);
  const teamSlug = normalizeVercelTeamSlug(input.teamSlug);
  const framework = input.framework === "vite" ? "vite" : input.framework === "static" ? "static" : "nextjs";
  const rootDirectory = normalizeVercelRootDirectory(input.rootDirectory, framework);
  const target = normalizeVercelEnvironment(input.target);
  const issues: VercelWorkspaceIssue[] = [];

  if (!projectName) {
    issues.push({
      field: "projectName",
      level: "error",
      message: "Defina o nome do projeto na Vercel antes de salvar o workspace.",
    });
  } else if (!PROJECT_NAME_PATTERN.test(projectName)) {
    issues.push({
      field: "projectName",
      level: "error",
      message: "O nome do projeto na Vercel precisa usar apenas letras minúsculas, números e hífens.",
    });
  }

  if (teamSlug && !TEAM_SLUG_PATTERN.test(teamSlug)) {
    issues.push({
      field: "teamSlug",
      level: "warning",
      message: "O workspace/time contém caracteres incomuns. Revise para evitar erro ao verificar o projeto no backend.",
    });
  }

  if (!rootDirectory) {
    issues.push({
      field: "rootDirectory",
      level: "error",
      message: "Defina o diretório raiz usado pela Vercel antes de salvar o workspace.",
    });
  }

  if (target === "production") {
    issues.push({
      field: "target",
      level: "warning",
      message: "Produção deve ser usada só quando a branch e o projeto já estiverem prontos para um deploy real.",
    });
  }

  return {
    projectName,
    teamSlug,
    framework,
    rootDirectory,
    target,
    issues,
    ready: issues.every((item) => item.level !== "error"),
    hasErrors: issues.some((item) => item.level === "error"),
    hasWarnings: issues.some((item) => item.level === "warning"),
  };
}

export function vercelEnvironmentLabel(environment: VercelEnvironment): string {
  return environment === "production" ? "Produção" : "Preview";
}

export function vercelFrameworkLabel(framework: VercelFramework): string {
  if (framework === "nextjs") return "Next.js";
  if (framework === "vite") return "Vite";
  return "Static";
}

export function vercelDeployStatusLabel(status: VercelDeployStatus): string {
  if (status === "published") return "Publicado";
  if (status === "ready") return "Pronto";
  return "Draft";
}

export function vercelDeploymentStateLabel(state: string | null | undefined): string {
  const normalized = normalizeVercelDeploymentState(state);
  if (normalized === "READY") return "Pronto";
  if (normalized === "BUILDING") return "Buildando";
  if (normalized === "INITIALIZING") return "Inicializando";
  if (normalized === "QUEUED") return "Na fila";
  if (normalized === "ERROR") return "Falhou";
  if (normalized === "CANCELED") return "Cancelado";
  return "Sem deploy";
}

export function resolveVercelOutputStage(binding: Partial<VercelWorkspace> | null | undefined): {
  label: string;
  detail: string;
} {
  if (!binding?.projectName) {
    return {
      label: "Draft",
      detail: "O workspace da Vercel ainda não foi salvo no backend.",
    };
  }

  const state = normalizeVercelDeploymentState(binding.lastDeploymentState || null);
  const target = binding.lastDeploymentTarget === "production" ? "production" : "preview";

  if (state === "READY" && target === "production") {
    return {
      label: "Published",
      detail: "Deploy de produção confirmado pela Vercel e persistido no projeto.",
    };
  }

  if (state === "READY") {
    return {
      label: "Exported",
      detail: "Preview pronto e confirmado pela Vercel. Falta promover ou seguir para produção.",
    };
  }

  if (state === "ERROR" || state === "CANCELED") {
    return {
      label: "Failed",
      detail: "A Vercel devolveu falha para o último deploy. O projeto precisa de nova tentativa ou correção.",
    };
  }

  if (binding.lastDeploymentId) {
    return {
      label: "Exported",
      detail: "Deployment solicitado e aguardando retorno do provedor.",
    };
  }

  return {
    label: "Draft",
    detail: "Workspace verificado e pronto para disparar o primeiro deploy real.",
  };
}

export function formatVercelProjectLabel(binding: Partial<VercelWorkspace> | null | undefined): string {
  return asText(binding?.projectName) || "Workspace pendente";
}
