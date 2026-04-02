"use client";

import { ensureCanonicalProjectData } from "./projectModel";

export type VercelFramework = "nextjs" | "vite" | "static";
export type VercelDeployStatus = "draft" | "ready" | "published";
export type VercelOutputStage = "draft" | "exported" | "published";

export type VercelProjectEvent = {
  id: string;
  ts: string;
  type: "base_saved" | "handoff_exported" | "published_manual" | "status_updated";
  stage: VercelOutputStage;
  title: string;
  note: string;
};

export type VercelProjectSummary = {
  id: string;
  title: string;
  kind?: string;
  data?: any;
};

export type VercelEnvironment = "preview" | "production";

export type VercelProjectBinding = {
  projectId: string;
  projectTitle: string;
  projectKind?: string;
  vercelProjectName: string;
  teamSlug: string;
  framework: VercelFramework;
  rootDirectory: string;
  deployStatus: VercelDeployStatus;
  previewUrl: string;
  productionUrl: string;
  lastManifestExportedAt?: string;
  history?: VercelProjectEvent[];
  updatedAt: string;
};

export type VercelWorkspaceState = {
  version: 1;
  defaultTeamSlug: string;
  projectBindings: Record<string, VercelProjectBinding>;
};

export type VercelBindingIssue = {
  field: "projectName" | "teamSlug" | "rootDirectory" | "previewUrl" | "productionUrl" | "deployStatus";
  level: "error" | "warning";
  message: string;
};

export type VercelBindingAssessment = {
  projectName: string;
  teamSlug: string;
  framework: VercelFramework;
  rootDirectory: string;
  deployStatus: VercelDeployStatus;
  previewUrl: string;
  productionUrl: string;
  preferredEnvironment: VercelEnvironment;
  issues: VercelBindingIssue[];
  ready: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
};

export type VercelManualWorkflowPlan = {
  dashboardUrl: string;
  preferredEnvironment: VercelEnvironment;
  manifestStatus: "manual_beta";
  deployConfirmationStatus: "manual_beta";
  previewUrl: string | null;
  productionUrl: string | null;
  deployChecklist: string[];
  nextStep: string;
};

const STORAGE_KEY = "ea:vercel:workspace:v1";
const PROJECT_NAME_PATTERN = /^[a-z0-9-]+$/;
const TEAM_SLUG_PATTERN = /^[a-z0-9._-]+$/i;

function emptyWorkspace(): VercelWorkspaceState {
  return {
    version: 1,
    defaultTeamSlug: "",
    projectBindings: {},
  };
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function localId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function normalizeHistory(history: unknown): VercelProjectEvent[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && typeof item === "object")
    .map((item: any): VercelProjectEvent => {
      const type: VercelProjectEvent["type"] =
        item.type === "handoff_exported" || item.type === "published_manual" || item.type === "status_updated"
          ? item.type
          : "base_saved";
      const stage: VercelOutputStage =
        item.stage === "published" ? "published" : item.stage === "exported" ? "exported" : "draft";
      return {
        id: String(item.id || localId()),
        ts: String(item.ts || new Date().toISOString()),
        type,
        stage,
        title: String(item.title || "Evento Vercel"),
        note: String(item.note || ""),
      };
    })
    .slice(0, 12);
}

export function readVercelWorkspace(): VercelWorkspaceState {
  if (!canUseStorage()) return emptyWorkspace();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    const parsed = JSON.parse(raw);
    const rawBindings = typeof parsed?.projectBindings === "object" && parsed?.projectBindings ? parsed.projectBindings : {};
    const projectBindings = Object.fromEntries(
      Object.entries(rawBindings).map(([projectId, value]: [string, any]) => [
        projectId,
        {
          projectId: String(value?.projectId || projectId),
          projectTitle: String(value?.projectTitle || "Projeto"),
          projectKind: String(value?.projectKind || ""),
          vercelProjectName: String(value?.vercelProjectName || ""),
          teamSlug: String(value?.teamSlug || ""),
          framework: value?.framework === "vite" ? "vite" : value?.framework === "static" ? "static" : "nextjs",
          rootDirectory: String(value?.rootDirectory || ""),
          deployStatus: value?.deployStatus === "ready" ? "ready" : value?.deployStatus === "published" ? "published" : "draft",
          previewUrl: String(value?.previewUrl || ""),
          productionUrl: String(value?.productionUrl || ""),
          lastManifestExportedAt: value?.lastManifestExportedAt ? String(value.lastManifestExportedAt) : undefined,
          history: normalizeHistory(value?.history),
          updatedAt: String(value?.updatedAt || new Date().toISOString()),
        } satisfies VercelProjectBinding,
      ])
    ) as Record<string, VercelProjectBinding>;
    return {
      version: 1,
      defaultTeamSlug: String(parsed?.defaultTeamSlug || ""),
      projectBindings,
    };
  } catch {
    return emptyWorkspace();
  }
}

export function saveVercelWorkspace(next: VercelWorkspaceState): VercelWorkspaceState {
  if (!canUseStorage()) return next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function getVercelProjectBinding(projectId: string): VercelProjectBinding | null {
  const workspace = readVercelWorkspace();
  return workspace.projectBindings[projectId] || null;
}

export function upsertVercelProjectBinding(
  binding: Omit<VercelProjectBinding, "updatedAt">
): VercelWorkspaceState {
  const current = readVercelWorkspace();
  const next: VercelWorkspaceState = {
    ...current,
    defaultTeamSlug: binding.teamSlug || current.defaultTeamSlug,
    projectBindings: {
      ...current.projectBindings,
      [binding.projectId]: {
        ...binding,
        history: normalizeHistory(binding.history),
        updatedAt: new Date().toISOString(),
      },
    },
  };
  return saveVercelWorkspace(next);
}

export function removeVercelProjectBinding(projectId: string): VercelWorkspaceState {
  const current = readVercelWorkspace();
  const nextBindings = { ...current.projectBindings };
  delete nextBindings[projectId];
  return saveVercelWorkspace({
    ...current,
    projectBindings: nextBindings,
  });
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

export function normalizeVercelUrl(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function vercelEnvironmentLabel(environment: VercelEnvironment): string {
  return environment === "production" ? "Produção" : "Preview";
}

export function assessVercelBindingDraft(input: {
  projectName: string;
  teamSlug: string;
  framework: VercelFramework;
  rootDirectory: string;
  deployStatus: VercelDeployStatus;
  previewUrl: string;
  productionUrl: string;
}): VercelBindingAssessment {
  const projectName = normalizeVercelProjectName(input.projectName);
  const teamSlug = normalizeVercelTeamSlug(input.teamSlug);
  const framework = input.framework === "vite" ? "vite" : input.framework === "static" ? "static" : "nextjs";
  const rootDirectory = normalizeVercelRootDirectory(input.rootDirectory, framework);
  const deployStatus =
    input.deployStatus === "ready" ? "ready" : input.deployStatus === "published" ? "published" : "draft";
  const previewUrl = normalizeVercelUrl(input.previewUrl);
  const productionUrl = normalizeVercelUrl(input.productionUrl);
  const preferredEnvironment: VercelEnvironment = deployStatus === "published" ? "production" : "preview";
  const issues: VercelBindingIssue[] = [];

  if (!projectName) {
    issues.push({
      field: "projectName",
      level: "error",
      message: "Defina o nome do projeto na Vercel antes de salvar a base de deploy.",
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
      message: "O workspace/time contém caracteres incomuns. Revise para evitar erro ao continuar o handoff fora da plataforma.",
    });
  }

  for (const [field, value, label] of [
    ["previewUrl", previewUrl, "preview URL"],
    ["productionUrl", productionUrl, "production URL"],
  ] as const) {
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (!/^https?:$/i.test(parsed.protocol)) {
        issues.push({
          field,
          level: "error",
          message: `A ${label} precisa usar http ou https.`,
        });
      }
    } catch {
      issues.push({
        field,
        level: "error",
        message: `A ${label} informada não é válida.`,
      });
    }
  }

  if (deployStatus === "published" && !productionUrl) {
    issues.push({
      field: "productionUrl",
      level: "error",
      message: "Informe a production URL antes de registrar a publicação manual como concluída.",
    });
  }

  if (deployStatus === "ready" && !previewUrl && !productionUrl) {
    issues.push({
      field: "deployStatus",
      level: "warning",
      message: "Você marcou o deploy como pronto, mas ainda não registrou preview ou production URL para acompanhar o retorno.",
    });
  }

  if (previewUrl && productionUrl && previewUrl === productionUrl) {
    issues.push({
      field: "productionUrl",
      level: "warning",
      message: "Preview e production URL estão idênticas. Revise se o ambiente realmente mudou antes de registrar a publicação.",
    });
  }

  return {
    projectName,
    teamSlug,
    framework,
    rootDirectory,
    deployStatus,
    previewUrl,
    productionUrl,
    preferredEnvironment,
    issues,
    ready: issues.every((item) => item.level !== "error"),
    hasErrors: issues.some((item) => item.level === "error"),
    hasWarnings: issues.some((item) => item.level === "warning"),
  };
}

export function buildVercelManualWorkflowPlan(
  project: VercelProjectSummary | null | undefined,
  binding: Pick<VercelProjectBinding, "vercelProjectName" | "teamSlug" | "deployStatus" | "previewUrl" | "productionUrl"> | null | undefined
): VercelManualWorkflowPlan {
  const preferredEnvironment: VercelEnvironment =
    binding?.deployStatus === "published" ? "production" : "preview";
  const previewUrl = binding?.previewUrl ? normalizeVercelUrl(binding.previewUrl) : null;
  const productionUrl = binding?.productionUrl ? normalizeVercelUrl(binding.productionUrl) : null;
  const projectLabel = String(project?.title || "projeto").trim() || "projeto";
  const targetProject = binding?.vercelProjectName || "o projeto configurado";

  return {
    dashboardUrl: "https://vercel.com/dashboard",
    preferredEnvironment,
    manifestStatus: "manual_beta",
    deployConfirmationStatus: "manual_beta",
    previewUrl,
    productionUrl,
    deployChecklist: [
      `Salvar a base do deploy com projeto Vercel, framework e root directory de ${projectLabel}.`,
      "Exportar o handoff .json para carregar o contexto fora da plataforma.",
      preferredEnvironment === "production"
        ? `Conferir o deploy de produção de ${targetProject} manualmente na Vercel.`
        : `Conferir o deploy de preview de ${targetProject} manualmente na Vercel.`,
      previewUrl
        ? `Validar o preview registrado em ${previewUrl}.`
        : "Registrar a preview URL assim que o deploy de preview existir.",
      productionUrl
        ? `Confirmar a produção registrada em ${productionUrl}.`
        : "Registrar a production URL quando a publicação realmente acontecer.",
    ],
    nextStep: binding
      ? preferredEnvironment === "production"
        ? `Abra o painel da Vercel, confirme a produção de ${targetProject} e só então mantenha o status como publicado no produto.`
        : `Abra o painel da Vercel, confirme o deploy de preview de ${targetProject} e registre a URL para manter a trilha do produto confiável.`
      : "Salve a base Vercel do projeto antes de exportar o handoff ou registrar qualquer publicação manual.",
  };
}

export function vercelFrameworkLabel(framework: VercelFramework): string {
  if (framework === "nextjs") return "Next.js";
  if (framework === "vite") return "Vite";
  return "Static";
}

export function vercelDeployStatusLabel(status: VercelDeployStatus): string {
  if (status === "draft") return "Rascunho";
  if (status === "ready") return "Pronto para publicar";
  return "Publicado (informado)";
}

export function resolveVercelOutputStage(binding: Pick<VercelProjectBinding, "deployStatus" | "lastManifestExportedAt"> | null | undefined): {
  label: string;
  detail: string;
} {
  if (!binding) {
    return {
      label: "Draft",
      detail: "A base de publicação ainda não foi salva para este projeto.",
    };
  }

  if (binding.deployStatus === "published") {
    return {
      label: "Published",
      detail: "Publicação marcada manualmente como concluída neste beta.",
    };
  }

  if (binding.lastManifestExportedAt) {
    return {
      label: "Exported",
      detail: "Manifest exportado para handoff beta de deploy manual.",
    };
  }

  return {
    label: "Draft",
    detail: "A base local existe, mas o handoff de publicação ainda não foi exportado.",
  };
}

export function appendVercelProjectEvent(
  binding: VercelProjectBinding | null | undefined,
  event: Omit<VercelProjectEvent, "id" | "ts">
): VercelProjectEvent[] {
  const nextEvent: VercelProjectEvent = {
    id: localId(),
    ts: new Date().toISOString(),
    ...event,
  };
  return [nextEvent, ...normalizeHistory(binding?.history)].slice(0, 12);
}

export function buildVercelDeployManifest(
  project: VercelProjectSummary,
  binding: Omit<VercelProjectBinding, "updatedAt"> | VercelProjectBinding
) {
  const canonical = ensureCanonicalProjectData(project.data, {
    projectKind: project.kind,
    projectTitle: project.title,
  });

  const manualWorkflow = buildVercelManualWorkflowPlan(project, binding);

  return {
    kind: "editor-ai-creator.vercel-beta",
    version: 1,
    generatedAt: new Date().toISOString(),
    flow: ["criar", "editar", "publicar"],
    project: {
      id: project.id,
      title: project.title,
      kind: project.kind || "general",
      source: canonical.source,
      output: canonical.output,
      deliverable: canonical.deliverable,
      delivery: canonical.delivery,
      integrations: canonical.integrations,
    },
    vercel: {
      projectName: binding.vercelProjectName,
      teamSlug: binding.teamSlug || null,
      framework: binding.framework,
      rootDirectory: binding.rootDirectory,
      deployStatus: binding.deployStatus,
      previewUrl: binding.previewUrl || null,
      productionUrl: binding.productionUrl || null,
      lastManifestExportedAt: binding.lastManifestExportedAt || null,
      history: normalizeHistory(binding.history),
    },
    publishMode: "beta_manual_handoff",
    manualWorkflow,
    notes: [
      "Fluxo beta inicial: draft local, exported via manifest e published apenas como confirmação manual.",
      "Domínio customizado, multiambiente e sincronização automática entram na próxima fase.",
    ],
  };
}

export function downloadVercelDeployManifest(
  project: VercelProjectSummary,
  binding: Omit<VercelProjectBinding, "updatedAt"> | VercelProjectBinding
) {
  if (typeof window === "undefined") return;
  const payload = buildVercelDeployManifest(project, binding);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${project.title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "project"}-vercel-beta.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
