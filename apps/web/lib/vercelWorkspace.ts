"use client";

export type VercelFramework = "nextjs" | "vite" | "static";
export type VercelDeployStatus = "draft" | "ready" | "published";

export type VercelProjectSummary = {
  id: string;
  title: string;
  kind?: string;
};

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
  updatedAt: string;
};

export type VercelWorkspaceState = {
  version: 1;
  defaultTeamSlug: string;
  projectBindings: Record<string, VercelProjectBinding>;
};

const STORAGE_KEY = "ea:vercel:workspace:v1";

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

export function readVercelWorkspace(): VercelWorkspaceState {
  if (!canUseStorage()) return emptyWorkspace();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      defaultTeamSlug: String(parsed?.defaultTeamSlug || ""),
      projectBindings: typeof parsed?.projectBindings === "object" && parsed?.projectBindings
        ? parsed.projectBindings
        : {},
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

export function buildVercelDeployManifest(
  project: VercelProjectSummary,
  binding: Omit<VercelProjectBinding, "updatedAt"> | VercelProjectBinding
) {
  return {
    kind: "editor-ai-creator.vercel-beta",
    version: 1,
    generatedAt: new Date().toISOString(),
    flow: ["criar", "editar", "publicar"],
    project: {
      id: project.id,
      title: project.title,
      kind: project.kind || "general",
    },
    vercel: {
      projectName: binding.vercelProjectName,
      teamSlug: binding.teamSlug || null,
      framework: binding.framework,
      rootDirectory: binding.rootDirectory,
      deployStatus: binding.deployStatus,
      previewUrl: binding.previewUrl || null,
      productionUrl: binding.productionUrl || null,
    },
    publishMode: "beta_manual_handoff",
    notes: [
      "Fluxo beta inicial: preparar o projeto, abrir a Vercel e publicar com base no handoff exportado.",
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
