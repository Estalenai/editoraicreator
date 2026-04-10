"use client";

import type { ProjectVercelPublishMachine, ProjectVercelPublishMachineState } from "./projectModel";

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
  lastDeploymentObservedAt: string | null;
  lastReconciledAt: string | null;
  publishMachine?: ProjectVercelPublishMachine | null;
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

export type VercelPublishMachineMetaTone = "default" | "warning" | "success" | "danger";
export type VercelPublishMachineOperationalKind = "saved" | "syncing" | "success" | "published" | "failed-publish";

type VercelWorkspaceLike = Partial<VercelWorkspace> & {
  publishMachine?: ProjectVercelPublishMachine | null;
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

function normalizeVercelPublishMachineState(value: unknown): ProjectVercelPublishMachineState {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "workspace_verified") return "workspace_verified";
  if (normalized === "deployment_requested") return "deployment_requested";
  if (normalized === "deployment_running") return "deployment_running";
  if (normalized === "deployment_ready") return "deployment_ready";
  if (normalized === "published") return "published";
  if (normalized === "deployment_failed") return "deployment_failed";
  return "idle";
}

function buildFallbackPublishMachine(binding: VercelWorkspaceLike | null | undefined): ProjectVercelPublishMachine {
  const state = normalizeVercelDeploymentState(binding?.lastDeploymentState || null);
  const target = normalizeVercelEnvironment(String(binding?.lastDeploymentTarget || binding?.target || ""));
  const hasWorkspace = Boolean(asText(binding?.projectName));
  const nowRef =
    binding?.lastDeployReadyAt ||
    binding?.lastDeployRequestedAt ||
    binding?.updatedAt ||
    binding?.connectedAt ||
    binding?.lastVerifiedAt ||
    null;

  if (!hasWorkspace) {
    return {
      version: "editor-ai-creator.vercel-publish.v1",
      state: "idle",
      sourceOfTruth: "backend",
      reconcileMode: "provider_polling",
      externalState: null,
      confirmed: false,
      terminal: false,
      retryable: false,
      lastSource: "backend",
      lastEventType: null,
      lastTransitionAt: null,
      lastCheckedAt: null,
      lastWebhookAt: null,
      lastPollAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      nextCheckAt: null,
      note: "Workspace Vercel ainda não salvo no backend.",
    };
  }

  if ((state === "READY" && target === "production") || asText(binding?.productionUrl)) {
    return {
      version: "editor-ai-creator.vercel-publish.v1",
      state: "published",
      sourceOfTruth: "provider",
      reconcileMode: "provider_webhook",
      externalState: state === "UNKNOWN" ? "READY" : state,
      confirmed: true,
      terminal: true,
      retryable: false,
      lastSource: "provider",
      lastEventType: "deployment.ready",
      lastTransitionAt: binding?.lastDeployReadyAt || nowRef,
      lastCheckedAt: binding?.lastDeployReadyAt || nowRef,
      lastWebhookAt: null,
      lastPollAt: null,
      lastSuccessAt: binding?.lastDeployReadyAt || nowRef,
      lastFailureAt: null,
      nextCheckAt: null,
      note: "Deploy de produção confirmado pela Vercel e persistido no projeto.",
    };
  }

  if (state === "READY") {
    return {
      version: "editor-ai-creator.vercel-publish.v1",
      state: "deployment_ready",
      sourceOfTruth: "provider",
      reconcileMode: "provider_webhook",
      externalState: "READY",
      confirmed: true,
      terminal: false,
      retryable: false,
      lastSource: "provider",
      lastEventType: "deployment.ready",
      lastTransitionAt: binding?.lastDeployReadyAt || nowRef,
      lastCheckedAt: binding?.lastDeployReadyAt || nowRef,
      lastWebhookAt: null,
      lastPollAt: null,
      lastSuccessAt: binding?.lastDeployReadyAt || nowRef,
      lastFailureAt: null,
      nextCheckAt: null,
      note: "Preview pronto e confirmado pela Vercel. Falta promover ou seguir para produção.",
    };
  }

  if (state === "ERROR" || state === "CANCELED") {
    return {
      version: "editor-ai-creator.vercel-publish.v1",
      state: "deployment_failed",
      sourceOfTruth: "provider",
      reconcileMode: "provider_webhook",
      externalState: state,
      confirmed: true,
      terminal: true,
      retryable: true,
      lastSource: "provider",
      lastEventType: "deployment.failed",
      lastTransitionAt: nowRef,
      lastCheckedAt: nowRef,
      lastWebhookAt: null,
      lastPollAt: null,
      lastSuccessAt: null,
      lastFailureAt: nowRef,
      nextCheckAt: null,
      note: asText(binding?.lastDeployError) || "A Vercel devolveu falha para o último deploy. O projeto precisa de nova tentativa ou correção.",
    };
  }

  if (state === "BUILDING" || state === "INITIALIZING" || state === "QUEUED") {
    return {
      version: "editor-ai-creator.vercel-publish.v1",
      state: "deployment_running",
      sourceOfTruth: "provider",
      reconcileMode: "provider_polling",
      externalState: state,
      confirmed: true,
      terminal: false,
      retryable: false,
      lastSource: "provider",
      lastEventType: "deployment.running",
      lastTransitionAt: binding?.lastDeployRequestedAt || nowRef,
      lastCheckedAt: nowRef,
      lastWebhookAt: null,
      lastPollAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      nextCheckAt: null,
      note: "Deployment em andamento e aguardando retorno final do provedor.",
    };
  }

  if (binding?.lastDeploymentId) {
    return {
      version: "editor-ai-creator.vercel-publish.v1",
      state: "deployment_requested",
      sourceOfTruth: "backend",
      reconcileMode: "provider_polling",
      externalState: state === "UNKNOWN" ? null : state,
      confirmed: false,
      terminal: false,
      retryable: false,
      lastSource: "backend",
      lastEventType: "deployment.requested",
      lastTransitionAt: binding?.lastDeployRequestedAt || nowRef,
      lastCheckedAt: nowRef,
      lastWebhookAt: null,
      lastPollAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      nextCheckAt: null,
      note: "Deployment solicitado e aguardando retorno do provedor.",
    };
  }

  return {
    version: "editor-ai-creator.vercel-publish.v1",
    state: "workspace_verified",
    sourceOfTruth: "backend",
    reconcileMode: "provider_polling",
    externalState: null,
    confirmed: false,
    terminal: false,
    retryable: false,
    lastSource: "backend",
    lastEventType: "workspace.verified",
    lastTransitionAt: nowRef,
    lastCheckedAt: nowRef,
    lastWebhookAt: null,
    lastPollAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    nextCheckAt: null,
    note: "Workspace verificado e pronto para disparar o primeiro deploy real.",
  };
}

export function resolveVercelPublishMachine(binding: VercelWorkspaceLike | null | undefined): ProjectVercelPublishMachine {
  const fallback = buildFallbackPublishMachine(binding);
  const machine = binding?.publishMachine;
  if (!machine) return fallback;
  return {
    ...fallback,
    ...machine,
    state: normalizeVercelPublishMachineState(machine.state),
    sourceOfTruth: machine.sourceOfTruth === "provider" ? "provider" : fallback.sourceOfTruth,
    confirmed: typeof machine.confirmed === "boolean" ? machine.confirmed : fallback.confirmed,
    terminal: typeof machine.terminal === "boolean" ? machine.terminal : fallback.terminal,
    retryable: typeof machine.retryable === "boolean" ? machine.retryable : fallback.retryable,
    externalState: asText(machine.externalState) || fallback.externalState,
    lastSource: asText(machine.lastSource) || fallback.lastSource,
    lastEventType: asText(machine.lastEventType) || fallback.lastEventType,
    lastTransitionAt: asText(machine.lastTransitionAt) || fallback.lastTransitionAt,
    lastCheckedAt: asText(machine.lastCheckedAt) || fallback.lastCheckedAt,
    lastWebhookAt: asText(machine.lastWebhookAt) || fallback.lastWebhookAt,
    lastPollAt: asText(machine.lastPollAt) || fallback.lastPollAt,
    lastSuccessAt: asText(machine.lastSuccessAt) || fallback.lastSuccessAt,
    lastFailureAt: asText(machine.lastFailureAt) || fallback.lastFailureAt,
    nextCheckAt: asText(machine.nextCheckAt) || fallback.nextCheckAt,
    note: asText(machine.note) || fallback.note,
  };
}

export function vercelPublishMachineLabel(machine: ProjectVercelPublishMachine | null | undefined): string {
  const state = normalizeVercelPublishMachineState(machine?.state);
  if (state === "published") return "Publicado";
  if (state === "deployment_ready") return "Preview pronto";
  if (state === "deployment_running") return "Deploy em andamento";
  if (state === "deployment_requested") return "Deploy solicitado";
  if (state === "deployment_failed") return "Falhou";
  if (state === "workspace_verified") return "Workspace verificado";
  return "Sem trilha";
}

export function vercelPublishMachineMetaTone(machine: ProjectVercelPublishMachine | null | undefined): VercelPublishMachineMetaTone {
  const state = normalizeVercelPublishMachineState(machine?.state);
  if (state === "published" || state === "deployment_ready") return "success";
  if (state === "deployment_failed") return "danger";
  if (state === "deployment_requested" || state === "deployment_running") return "warning";
  return "default";
}

export function vercelPublishMachineOperationalKind(
  machine: ProjectVercelPublishMachine | null | undefined
): VercelPublishMachineOperationalKind {
  const state = normalizeVercelPublishMachineState(machine?.state);
  if (state === "published") return "published";
  if (state === "deployment_ready") return "success";
  if (state === "deployment_requested" || state === "deployment_running") return "syncing";
  if (state === "deployment_failed") return "failed-publish";
  return "saved";
}

export function deriveVercelDeployStatus(binding: VercelWorkspaceLike | null | undefined): VercelDeployStatus {
  const machine = resolveVercelPublishMachine(binding);
  if (machine.state === "published") return "published";
  if (
    machine.state === "deployment_requested" ||
    machine.state === "deployment_running" ||
    machine.state === "deployment_ready" ||
    machine.state === "deployment_failed"
  ) {
    return "ready";
  }
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

export function resolveVercelOutputStage(binding: VercelWorkspaceLike | null | undefined): {
  label: string;
  detail: string;
} {
  const machine = resolveVercelPublishMachine(binding);
  if (machine.state === "published") {
    return {
      label: "Published",
      detail: machine.note || "Deploy de produção confirmado pela Vercel e persistido no projeto.",
    };
  }

  if (machine.state === "deployment_ready") {
    return {
      label: "Exported",
      detail: machine.note || "Preview pronto e confirmado pela Vercel. Falta promover ou seguir para produção.",
    };
  }

  if (machine.state === "deployment_failed") {
    return {
      label: "Failed",
      detail: machine.note || "A Vercel devolveu falha para o último deploy. O projeto precisa de nova tentativa ou correção.",
    };
  }

  if (machine.state === "deployment_requested" || machine.state === "deployment_running") {
    return {
      label: "Exported",
      detail: machine.note || "Deployment solicitado e aguardando retorno do provedor.",
    };
  }

  return {
    label: "Draft",
    detail: machine.note || "Workspace verificado e pronto para disparar o primeiro deploy real.",
  };
}

export function formatVercelProjectLabel(binding: Partial<VercelWorkspace> | null | undefined): string {
  return asText(binding?.projectName) || "Workspace pendente";
}
