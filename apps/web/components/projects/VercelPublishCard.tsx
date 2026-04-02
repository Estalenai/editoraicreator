"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PremiumSelect } from "../ui/PremiumSelect";
import { OperationalState } from "../ui/OperationalState";
import { api } from "../../lib/api";
import {
  appendVercelProjectEvent,
  buildVercelDeployManifest,
  downloadVercelDeployManifest,
  getVercelProjectBinding,
  readVercelWorkspace,
  recommendedRootDirectory,
  recommendVercelFramework,
  removeVercelProjectBinding,
  resolveVercelOutputStage,
  saveVercelWorkspace,
  upsertVercelProjectBinding,
  vercelDeployStatusLabel,
  vercelFrameworkLabel,
  type VercelDeployStatus,
  type VercelFramework,
  type VercelProjectBinding,
  type VercelProjectEvent,
  type VercelProjectSummary,
  type VercelWorkspaceState,
} from "../../lib/vercelWorkspace";
import { ensureCanonicalProjectData, getCanonicalProjectSummary, mergeCanonicalProjectData } from "../../lib/projectModel";

type ProjectInput = {
  id?: string;
  project_id?: string;
  title?: string;
  name?: string;
  kind?: string;
  type?: string;
  data?: any;
};

type Props = {
  variant?: "full" | "compact";
  project?: ProjectInput | null;
  projects?: ProjectInput[];
  onProjectDataChange?: (projectId: string, data: any) => void;
};

const FRAMEWORK_OPTIONS = [
  { value: "nextjs", label: "Next.js" },
  { value: "vite", label: "Vite" },
  { value: "static", label: "Static" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Rascunho" },
  { value: "ready", label: "Pronto para publicar" },
  { value: "published", label: "Publicado (manual)" },
];

function normalizeProject(project: ProjectInput | null | undefined): VercelProjectSummary | null {
  const id = String(project?.id || project?.project_id || "").trim();
  if (!id) return null;
  return {
    id,
    title: String(project?.title || project?.name || "Projeto sem título").trim(),
    kind: String(project?.kind || project?.type || "").trim(),
    data: project?.data,
  };
}

function buildDefaultProjectName(project: VercelProjectSummary | null): string {
  if (!project) return "";
  return project.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeUrl(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function vercelAppUrl(connected: boolean): string {
  return connected ? "https://vercel.com/dashboard" : "https://vercel.com/new";
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "Ainda não registrado";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return String(value);
  }
}

function extractUpdatedProjectData(response: any, fallback: any): any {
  const item = response?.item || response?.data?.item || response;
  return item?.data ?? fallback;
}

function toCanonicalVercelBinding(binding: VercelProjectBinding | null | undefined): any {
  if (!binding) return null;
  return {
    projectName: binding.vercelProjectName,
    teamSlug: binding.teamSlug,
    framework: binding.framework,
    rootDirectory: binding.rootDirectory,
    deployStatus: binding.deployStatus,
    previewUrl: binding.previewUrl,
    productionUrl: binding.productionUrl,
    updatedAt: binding.updatedAt,
  };
}

function fromCanonicalVercelBinding(project: VercelProjectSummary | null, binding: any, history: VercelProjectEvent[], lastManifestExportedAt: string | null): VercelProjectBinding | null {
  if (!project || !binding || typeof binding !== "object") return null;
  const projectName = String(binding.projectName || "").trim();
  if (!projectName) return null;
  return {
    projectId: project.id,
    projectTitle: project.title,
    projectKind: project.kind,
    vercelProjectName: projectName,
    teamSlug: String(binding.teamSlug || ""),
    framework: binding.framework === "vite" ? "vite" : binding.framework === "static" ? "static" : "nextjs",
    rootDirectory: String(binding.rootDirectory || ""),
    deployStatus: binding.deployStatus === "ready" ? "ready" : binding.deployStatus === "published" ? "published" : "draft",
    previewUrl: String(binding.previewUrl || ""),
    productionUrl: String(binding.productionUrl || ""),
    lastManifestExportedAt: lastManifestExportedAt || undefined,
    history,
    updatedAt: String(binding.updatedAt || new Date().toISOString()),
  };
}

export function VercelPublishCard({ variant = "full", project = null, projects = [], onProjectDataChange }: Props) {
  const availableProjects = useMemo(() => {
    if (project) {
      const normalized = normalizeProject(project);
      return normalized ? [normalized] : [];
    }
    return projects.map(normalizeProject).filter(Boolean) as VercelProjectSummary[];
  }, [project, projects]);

  const [workspace, setWorkspace] = useState<VercelWorkspaceState | null>(null);
  const [projectDataMap, setProjectDataMap] = useState<Record<string, any>>({});
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [vercelProjectName, setVercelProjectName] = useState("");
  const [framework, setFramework] = useState<VercelFramework>("nextjs");
  const [rootDirectory, setRootDirectory] = useState("");
  const [deployStatus, setDeployStatus] = useState<VercelDeployStatus>("draft");
  const [previewUrl, setPreviewUrl] = useState("");
  const [productionUrl, setProductionUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"info" | "success" | "error">("info");
  const hydrationKeyRef = useRef("");

  useEffect(() => {
    setWorkspace(readVercelWorkspace());
  }, []);

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
  const selectedProjectIdValue = selectedProject?.id || "";
  const selectedProjectTitle = selectedProject?.title || "";
  const selectedProjectKind = selectedProject?.kind || "";
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
  const canonicalVercelIntegration = selectedProjectCanonical?.integrations.vercel || null;
  const localBinding = useMemo(
    () => (selectedProject ? getVercelProjectBinding(selectedProject.id) : null),
    [selectedProject]
  );
  const currentBinding = useMemo(() => {
    if (!selectedProject) return null;
    const canonical = fromCanonicalVercelBinding(
      selectedProject,
      selectedProjectCanonical?.integrations.vercel.binding,
      (selectedProjectCanonical?.integrations.vercel.history || []) as VercelProjectEvent[],
      selectedProjectCanonical?.integrations.vercel.lastManifestExportedAt || null
    );
    return canonical || localBinding;
  }, [localBinding, selectedProject, selectedProjectCanonical]);

  useEffect(() => {
    if (!selectedProjectIdValue) return;
    const suggestedFramework = recommendVercelFramework(selectedProjectKind);
    setTeamSlug(currentBinding?.teamSlug || workspace?.defaultTeamSlug || "");
    setVercelProjectName(
      currentBinding?.vercelProjectName ||
        buildDefaultProjectName({
          id: selectedProjectIdValue,
          title: selectedProjectTitle,
          kind: selectedProjectKind,
          data: selectedProjectData,
        })
    );
    setFramework(currentBinding?.framework || suggestedFramework);
    setRootDirectory(currentBinding?.rootDirectory || recommendedRootDirectory(currentBinding?.framework || suggestedFramework));
    setDeployStatus(currentBinding?.deployStatus || "draft");
    setPreviewUrl(currentBinding?.previewUrl || "");
    setProductionUrl(currentBinding?.productionUrl || "");
    setNotice(null);
  }, [
    selectedProjectIdValue,
    selectedProjectTitle,
    selectedProjectKind,
    selectedProjectData,
    currentBinding?.teamSlug,
    currentBinding?.vercelProjectName,
    currentBinding?.framework,
    currentBinding?.rootDirectory,
    currentBinding?.deployStatus,
    currentBinding?.previewUrl,
    currentBinding?.productionUrl,
    workspace?.defaultTeamSlug,
  ]);

  const compact = variant === "compact";
  const connected = Boolean(currentBinding);
  const outputStage = resolveVercelOutputStage(currentBinding);
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
  const outputHistory = useMemo(() => currentBinding?.history || [], [currentBinding]);
  const visibleOutputHistory = useMemo(
    () => (compact ? outputHistory.slice(0, 3) : outputHistory),
    [compact, outputHistory]
  );
  const lastPublishedAt = selectedProjectCanonical?.delivery.lastPublishedAt || currentBinding?.history?.find((item) => item.stage === "published")?.ts || null;

  function persistWorkspace(nextWorkspace: VercelWorkspaceState) {
    saveVercelWorkspace(nextWorkspace);
    setWorkspace(nextWorkspace);
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
    if (!selectedProject || !localBinding) return;
    const needsBindingHydration = !canonicalVercelIntegration?.binding;
    const needsHistoryHydration =
      (canonicalVercelIntegration?.history?.length || 0) === 0 && (localBinding.history?.length || 0) > 0;
    const needsExportMarkerHydration =
      !canonicalVercelIntegration?.lastManifestExportedAt && Boolean(localBinding.lastManifestExportedAt);
    if (!needsBindingHydration && !needsHistoryHydration && !needsExportMarkerHydration) return;

    const nextKey = `${selectedProject.id}:${localBinding.updatedAt}:${localBinding.history?.length || 0}:${localBinding.lastManifestExportedAt || ""}`;
    if (hydrationKeyRef.current === nextKey) return;
    hydrationKeyRef.current = nextKey;

    let cancelled = false;

    void (async () => {
      try {
        const publishedAt =
          localBinding.deployStatus === "published"
            ? localBinding.history?.find((item) => item.stage === "published")?.ts || null
            : null;
        const exportedAt = localBinding.lastManifestExportedAt || null;
        let nextData = mergeCanonicalProjectData(selectedProjectData, {
          integrations: {
            vercel: {
              ...(needsBindingHydration ? { binding: toCanonicalVercelBinding(localBinding) } : {}),
              ...(needsExportMarkerHydration ? { lastManifestExportedAt: exportedAt } : {}),
              ...(needsHistoryHydration ? { history: localBinding.history || [] } : {}),
            },
          },
        });

        if (publishedAt || exportedAt) {
          nextData = mergeCanonicalProjectData(nextData, {
            delivery: {
              stage: publishedAt ? "published" : "exported",
              exportTarget: "connected_storage",
              connectedStorage: "vercel",
              lastExportedAt: exportedAt,
              lastPublishedAt: publishedAt,
            },
          });
        }

        await persistProjectData(nextData);
        if (!cancelled) {
          setNoticeTone("success");
          setNotice("Base local da Vercel migrada para o projeto. O vínculo e o histórico agora deixam de depender só deste navegador.");
        }
      } catch (migrationError: any) {
        if (!cancelled) {
          hydrationKeyRef.current = "";
          setNoticeTone("error");
          setNotice(`Falha ao migrar a base local da Vercel: ${migrationError?.message || "erro desconhecido"}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canonicalVercelIntegration, localBinding, persistProjectData, selectedProject, selectedProjectData]);

  function buildBinding(overrides: Partial<VercelProjectBinding> = {}): VercelProjectBinding {
    if (!selectedProject) {
      throw new Error("Projeto Vercel ausente");
    }
    return {
      projectId: selectedProject.id,
      projectTitle: selectedProject.title,
      projectKind: selectedProject.kind,
      vercelProjectName: vercelProjectName || buildDefaultProjectName(selectedProject),
      teamSlug: teamSlug.trim(),
      framework,
      rootDirectory: rootDirectory.trim() || recommendedRootDirectory(framework),
      deployStatus,
      previewUrl: normalizeUrl(previewUrl),
      productionUrl: normalizeUrl(productionUrl),
      lastManifestExportedAt: currentBinding?.lastManifestExportedAt,
      history: currentBinding?.history || [],
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  async function onSave() {
    if (!selectedProject) return;
    const currentCanonical = selectedProjectCanonical || ensureCanonicalProjectData(selectedProjectData, {
      projectKind: selectedProject.kind,
      projectTitle: selectedProject.title,
    });
    const nextHistory = appendVercelProjectEvent(currentBinding, {
      type:
        deployStatus === "published"
          ? "published_manual"
          : connected
            ? "status_updated"
            : "base_saved",
      stage:
        deployStatus === "published"
          ? "published"
          : currentBinding?.lastManifestExportedAt
            ? "exported"
            : "draft",
      title:
        deployStatus === "published"
          ? "Publicação manual registrada"
          : connected
            ? "Base Vercel atualizada"
            : "Base Vercel salva",
      note:
        deployStatus === "published"
          ? `Status informado como publicado${normalizeUrl(productionUrl) ? ` em ${normalizeUrl(productionUrl)}` : ""}.`
          : `Projeto ${vercelProjectName || buildDefaultProjectName(selectedProject)} com framework ${vercelFrameworkLabel(framework)} e root ${rootDirectory.trim() || recommendedRootDirectory(framework)}.`,
    });
    const nextBinding = buildBinding({ history: nextHistory });
    const nextWorkspace = upsertVercelProjectBinding(nextBinding);
    persistWorkspace(nextWorkspace);

    let nextData = mergeCanonicalProjectData(selectedProjectData, {
      integrations: {
        vercel: {
          binding: toCanonicalVercelBinding(nextBinding),
          lastManifestExportedAt: nextBinding.lastManifestExportedAt || null,
          history: nextHistory,
        },
      },
    });

    if (deployStatus === "published") {
      const publishedAt = new Date().toISOString();
      nextData = mergeCanonicalProjectData(nextData, {
        delivery: {
          stage: "published",
          exportTarget: "connected_storage",
          connectedStorage: "vercel",
          lastExportedAt: currentCanonical.delivery.lastExportedAt,
          lastPublishedAt: publishedAt,
          history: [
            {
              id: currentBinding?.history?.[0]?.id || `${selectedProject.id}-published-${publishedAt}`,
              ts: publishedAt,
              stage: "published" as const,
              channel: "vercel" as const,
              title: "Publicação manual registrada",
              note: normalizeUrl(productionUrl)
                ? `Publicação manual confirmada em ${normalizeUrl(productionUrl)}.`
                : "Publicação manual confirmada para este projeto na Vercel.",
            },
            ...currentCanonical.delivery.history,
          ].slice(0, 12),
        },
        deliverable: {
          nextAction: "Publicação manual registrada. Use o histórico para acompanhar novos handoffs ou atualizações na Vercel.",
        },
      });
    }

    await persistProjectData(nextData);
    setNoticeTone("success");
    setNotice(
      deployStatus === "published"
        ? "Publicação manual registrada no projeto e na base local da Vercel. O estado canônico agora fica persistido no próprio projeto."
        : "Base Vercel salva no projeto e espelhada neste navegador. O handoff manual continua honesto e o estado principal agora fica persistido no projeto."
    );
  }

  async function onDisconnect() {
    if (!selectedProject) return;
    const nextWorkspace = removeVercelProjectBinding(selectedProject.id);
    persistWorkspace(nextWorkspace);
    const nextData = mergeCanonicalProjectData(selectedProjectData, {
      integrations: {
        vercel: {
          binding: null,
        },
      },
    });
    await persistProjectData(nextData);
    setNoticeTone("success");
    setNotice("Base local da Vercel removida deste projeto. O histórico continua salvo no projeto para manter a trilha operacional.");
  }

  async function onExportManifest() {
    if (!selectedProject) return;
    const exportedAt = new Date().toISOString();
    const currentCanonical = selectedProjectCanonical || ensureCanonicalProjectData(selectedProjectData, {
      projectKind: selectedProject.kind,
      projectTitle: selectedProject.title,
    });
    const nextHistory = appendVercelProjectEvent(currentBinding, {
      type: "handoff_exported",
      stage: "exported",
      title: "Manifest exportado",
      note: "Handoff beta gerado para deploy manual na Vercel.",
    });
    const nextBinding = buildBinding({
      lastManifestExportedAt: exportedAt,
      history: nextHistory,
    });

    downloadVercelDeployManifest(
      {
        ...selectedProject,
        data: selectedProjectData,
      },
      nextBinding
    );

    const nextWorkspace = upsertVercelProjectBinding(nextBinding);
    persistWorkspace(nextWorkspace);

    const nextData = mergeCanonicalProjectData(selectedProjectData, {
      delivery: {
        stage: currentCanonical.delivery.stage === "published" ? "published" : "exported",
        exportTarget: "connected_storage",
        connectedStorage: "vercel",
        lastExportedAt: exportedAt,
        lastPublishedAt: currentCanonical.delivery.lastPublishedAt,
        history: [
          {
            id: `${selectedProject.id}-vercel-export-${exportedAt}`,
            ts: exportedAt,
            stage: "exported" as const,
            channel: "vercel" as const,
            title: "Manifest Vercel exportado",
            note: "Handoff beta exportado para deploy manual na Vercel.",
          },
          ...currentCanonical.delivery.history,
        ].slice(0, 12),
      },
      integrations: {
        vercel: {
          binding: toCanonicalVercelBinding(nextBinding),
          lastManifestExportedAt: exportedAt,
          history: nextHistory,
        },
      },
      deliverable: {
        nextAction: "Manifest Vercel exportado. Continue o deploy manual fora da plataforma e registre a publicação quando ela realmente acontecer.",
      },
    });

    await persistProjectData(nextData);
    setNoticeTone("success");
    setNotice("Manifest exportado. O projeto agora guarda o handoff Vercel como source of truth, com base local apenas como conveniência beta.");
  }

  const deployManifest = useMemo(() => {
    if (!selectedProject) return null;
    return buildVercelDeployManifest(
      {
        ...selectedProject,
        data: selectedProjectData,
      },
      {
        projectId: selectedProject.id,
        projectTitle: selectedProject.title,
        projectKind: selectedProject.kind,
        vercelProjectName: vercelProjectName || buildDefaultProjectName(selectedProject),
        teamSlug: teamSlug.trim(),
        framework,
        rootDirectory: rootDirectory.trim() || recommendedRootDirectory(framework),
        deployStatus,
        previewUrl: normalizeUrl(previewUrl),
        productionUrl: normalizeUrl(productionUrl),
        lastManifestExportedAt: currentBinding?.lastManifestExportedAt,
        history: currentBinding?.history || [],
        updatedAt: new Date().toISOString(),
      }
    );
  }, [selectedProject, selectedProjectData, vercelProjectName, teamSlug, framework, rootDirectory, deployStatus, previewUrl, productionUrl, currentBinding?.lastManifestExportedAt, currentBinding?.history]);
  const vercelNoticeState = useMemo(() => {
    if (!notice) return null;
    if (noticeTone === "error") {
      return {
        kind: "failed-publish" as const,
        title: "Status da publicação exige revisão",
        footer: "Revise a base Vercel e a trilha do projeto antes de continuar o handoff.",
      };
    }
    if (noticeTone === "success") {
      return {
        kind: deployStatus === "published" ? ("published" as const) : ("success" as const),
        title: deployStatus === "published" ? "Publicação registrada" : "Base beta atualizada",
        footer:
          deployStatus === "published"
            ? "A publicação foi registrada como concluída e a trilha operacional do projeto foi atualizada."
            : "O projeto agora mantém a base da Vercel como source of truth para o próximo handoff.",
      };
    }
    return {
      kind: currentBinding?.lastManifestExportedAt ? ("syncing" as const) : ("loading" as const),
      title: currentBinding?.lastManifestExportedAt ? "Handoff Vercel em andamento" : "Base Vercel em preparação",
      footer: "O beta continua manual, mas a plataforma já está registrando o estado desta etapa de forma visível.",
    };
  }, [currentBinding?.lastManifestExportedAt, deployStatus, notice, noticeTone]);

  if (!selectedProject) {
    return (
      <section className={`vercel-publish-card layout-contract-card${compact ? " vercel-publish-card-compact" : ""}`}>
        <div className="vercel-publish-head">
          <div className="vercel-publish-copy">
            <p className="section-kicker">Vercel beta</p>
            <h3>{compact ? "Publicação" : "Publicação e deploy"}</h3>
            <p className="helper-text-ea">
              A base inicial da Vercel entra quando houver um projeto salvo para preparar o handoff de publicação no fluxo criar → editar → publicar.
            </p>
          </div>
          <span className="premium-badge premium-badge-soon">Aguardando projeto</span>
        </div>
        <OperationalState
          kind="empty"
          compact={compact}
          title="Nenhum projeto elegível para publicação ainda"
          description="Crie ou salve um projeto primeiro. Depois disso, você já consegue salvar a base de publicação beta e exportar o handoff para a Vercel."
          badge="Vercel beta"
          emphasis="Aguardando projeto"
          meta={[
            { label: "Fluxo", value: "Criar → editar → publicar" },
            { label: "Estado", value: "Sem projeto selecionado" },
          ]}
        />
        <div className="vercel-publish-actions">
          <Link href="/editor/new" className="btn-link-ea btn-primary btn-sm">
            Criar projeto
          </Link>
          <a href="https://vercel.com/new" target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
            Abrir Vercel
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className={`vercel-publish-card layout-contract-card${compact ? " vercel-publish-card-compact" : ""}`} id="vercel-publish">
      <div className="vercel-publish-head">
        <div className="vercel-publish-copy">
          <p className="section-kicker">Vercel beta</p>
          <h3>{compact ? "Base de publicação" : "Base beta de publicação na Vercel"}</h3>
          <p className="helper-text-ea">
            No beta, a Vercel cobre draft, exported e published informado manualmente. OAuth e publicação automática entram na próxima fase.
          </p>
        </div>
        <span className={`premium-badge ${connected ? "premium-badge-phase" : "premium-badge-warning"}`}>
          {connected ? "Base Vercel salva" : "Base Vercel pendente"}
        </span>
      </div>

      {!compact && availableProjects.length > 1 ? (
        <div className="vercel-publish-form">
          <label className="field-label-ea">
            <span>Projeto para publicar</span>
            <PremiumSelect
              value={selectedProject.id}
              onChange={setSelectedProjectId}
              options={availableProjects.map((item) => ({
                value: item.id,
                label: item.title,
              }))}
              ariaLabel="Projeto selecionado para publicação"
            />
          </label>
        </div>
      ) : null}

      <div className="vercel-publish-status-grid">
        <div className="vercel-publish-status-item">
          <span>Projeto atual</span>
          <strong>{selectedProject.title}</strong>
        </div>
        <div className="vercel-publish-status-item">
          <span>Framework sugerido</span>
          <strong>{vercelFrameworkLabel(framework)}</strong>
        </div>
        <div className="vercel-publish-status-item">
          <span>Status acompanhado</span>
          <strong>{vercelDeployStatusLabel(deployStatus)}</strong>
        </div>
        <div className="vercel-publish-status-item">
          <span>Estado do projeto</span>
          <strong>{projectSummary?.outputStageLabel || "Draft"}</strong>
        </div>
        <div className="vercel-publish-status-item">
          <span>Handoff Vercel</span>
          <strong>{outputStage.label}</strong>
        </div>
        <div className="vercel-publish-status-item">
          <span>Fluxo do beta</span>
          <strong>{outputStage.detail}</strong>
        </div>
        <div className="vercel-publish-status-item">
          <span>Último handoff</span>
          <strong>{formatDateLabel(currentBinding?.lastManifestExportedAt || null)}</strong>
        </div>
        <div className="vercel-publish-status-item">
          <span>Última publicação</span>
          <strong>{formatDateLabel(lastPublishedAt)}</strong>
        </div>
      </div>

      <div className="vercel-publish-grid">
        <div className="vercel-publish-form">
          <label className="field-label-ea">
            <span>Projeto na Vercel</span>
            <input
              className="field-ea"
              value={vercelProjectName}
              onChange={(event) => setVercelProjectName(event.target.value)}
              placeholder="meu-site-beta"
            />
          </label>
          <label className="field-label-ea">
            <span>Time ou workspace</span>
            <input
              className="field-ea"
              value={teamSlug}
              onChange={(event) => setTeamSlug(event.target.value)}
              placeholder="time-ou-workspace"
            />
          </label>
          <label className="field-label-ea">
            <span>Framework</span>
            <PremiumSelect
              value={framework}
              onChange={(next) => {
                const nextFramework = next as VercelFramework;
                setFramework(nextFramework);
                setRootDirectory((current) => current.trim() || recommendedRootDirectory(nextFramework));
              }}
              options={FRAMEWORK_OPTIONS}
              ariaLabel="Framework para publicação na Vercel"
            />
          </label>
          <label className="field-label-ea">
            <span>Root directory</span>
            <input
              className="field-ea"
              value={rootDirectory}
              onChange={(event) => setRootDirectory(event.target.value)}
              placeholder={recommendedRootDirectory(framework)}
            />
          </label>
        </div>

        <div className="vercel-publish-form">
          <label className="field-label-ea">
            <span>Status básico do deploy</span>
            <PremiumSelect
              value={deployStatus}
              onChange={(next) => setDeployStatus(next as VercelDeployStatus)}
              options={STATUS_OPTIONS}
              ariaLabel="Status básico do deploy"
            />
          </label>
          <label className="field-label-ea">
            <span>Preview URL</span>
            <input
              className="field-ea"
              value={previewUrl}
              onChange={(event) => setPreviewUrl(event.target.value)}
              placeholder="preview-projeto.vercel.app"
            />
          </label>
          <label className="field-label-ea">
            <span>Production URL</span>
            <input
              className="field-ea"
              value={productionUrl}
              onChange={(event) => setProductionUrl(event.target.value)}
              placeholder="meu-projeto.vercel.app"
            />
          </label>
          <div className="vercel-publish-note">
            No beta, esta integração salva a base local da publicação, separa draft/exported/published e mantém o handoff manual honesto. Domínio, multiambiente e publicação totalmente automatizada entram na próxima fase.
          </div>
        </div>
      </div>

      {(previewUrl || productionUrl) ? (
        <div className="vercel-publish-links">
          {previewUrl ? (
            <div className="vercel-publish-link-card">
              <span>Preview URL</span>
              <strong>{normalizeUrl(previewUrl)}</strong>
              <a href={normalizeUrl(previewUrl)} target="_blank" rel="noreferrer" className="text-link-ea">
                Abrir preview
              </a>
            </div>
          ) : null}
          {productionUrl ? (
            <div className="vercel-publish-link-card">
              <span>Production URL</span>
              <strong>{normalizeUrl(productionUrl)}</strong>
              <a href={normalizeUrl(productionUrl)} target="_blank" rel="noreferrer" className="text-link-ea">
                Abrir produção
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {vercelNoticeState ? (
        <OperationalState
          compact={compact}
          kind={vercelNoticeState.kind}
          title={vercelNoticeState.title}
          description={notice}
          badge="Vercel beta"
          emphasis={selectedProject.title}
          meta={[
            { label: "Projeto", value: selectedProject.title },
            { label: "Handoff", value: outputStage.label },
            { label: "Deploy", value: vercelDeployStatusLabel(deployStatus) },
            { label: "Último handoff", value: formatDateLabel(currentBinding?.lastManifestExportedAt || null) },
          ]}
          footer={vercelNoticeState.footer}
        />
      ) : null}

      <div className="vercel-publish-history">
        <div className="section-stack-tight">
          <p className="section-kicker">Histórico de saída</p>
          <h4 className="heading-reset">Draft, handoff e publicação registrados</h4>
          <p className="helper-text-ea">
            Esta trilha mostra o que já foi salvo como base local, o que já saiu como handoff exported e o que já foi confirmado manualmente como published.
          </p>
        </div>
        <div className="vercel-publish-history-list">
          {visibleOutputHistory.length ? visibleOutputHistory.map((event: VercelProjectEvent) => (
            <div key={event.id} className="vercel-publish-history-item">
              <div className="vercel-publish-history-head">
                <strong>{event.title}</strong>
                <span>{formatDateLabel(event.ts)}</span>
              </div>
              <div className="vercel-publish-history-meta">
                <span>{event.stage}</span>
                <span>{event.type}</span>
              </div>
              <p>{event.note}</p>
            </div>
          )) : (
            <OperationalState
              compact
              kind="empty"
              title="Ainda sem histórico de saída neste projeto"
              description="Salve a base, exporte o handoff ou registre a publicação manual para criar uma trilha operacional mais clara."
              badge="Histórico"
              emphasis={selectedProject.title}
              meta={[
                { label: "Handoff", value: outputStage.label },
                { label: "Deploy", value: vercelDeployStatusLabel(deployStatus) },
              ]}
            />
          )}
        </div>
      </div>

      <div className="vercel-publish-actions">
        <button type="button" onClick={onSave} className="btn-ea btn-primary btn-sm">
          {connected ? "Atualizar base local" : "Salvar base Vercel"}
        </button>
        <button type="button" onClick={onExportManifest} className="btn-ea btn-secondary btn-sm">
          Exportar handoff .json
        </button>
        <a
          href={vercelAppUrl(connected)}
          target="_blank"
          rel="noreferrer"
          className="btn-link-ea btn-ghost btn-sm"
        >
          {connected ? "Abrir painel da Vercel" : "Abrir Vercel"}
        </a>
        {connected ? (
          <button type="button" onClick={onDisconnect} className="btn-ea btn-ghost btn-sm">
            Remover base local
          </button>
        ) : null}
      </div>

      {!compact && deployManifest ? (
        <div className="vercel-publish-note">
          <strong>Draft:</strong> base local salva. <strong>Exported:</strong> manifest exportado para handoff manual. <strong>Published:</strong> status informado manualmente no beta. <strong>O que fica para depois:</strong> OAuth real, importação automática, domínio customizado e deploy sincronizado.
        </div>
      ) : null}
    </section>
  );
}
