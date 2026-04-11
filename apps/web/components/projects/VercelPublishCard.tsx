"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PremiumSelect } from "../ui/PremiumSelect";
import { OperationalState, type OperationalStateKind, type OperationalStateMetaItem } from "../ui/OperationalState";
import { EditorRouteLink } from "../ui/EditorRouteLink";
import { api } from "../../lib/api";
import { ensureCanonicalProjectData } from "../../lib/projectModel";
import {
  assessVercelWorkspaceDraft,
  deriveVercelDeployStatus,
  formatVercelProjectLabel,
  normalizeVercelRootDirectory,
  recommendVercelFramework,
  recommendedRootDirectory,
  resolveVercelPublishMachine,
  resolveVercelOutputStage,
  vercelDeploymentStateLabel,
  vercelDeployStatusLabel,
  vercelEnvironmentLabel,
  vercelPublishMachineLabel,
  vercelPublishMachineMetaTone,
  vercelPublishMachineOperationalKind,
  type VercelConnectionSummary,
  type VercelEnvironment,
  type VercelFramework,
  type VercelProjectEvent,
  type VercelProjectSummary,
  type VercelWorkspace,
} from "../../lib/vercelWorkspace";
import { toUserFacingError } from "../../lib/uiFeedback";
import { buildPublishTrustState } from "./publishTrust";

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

type WorkspaceDraft = {
  projectName: string;
  teamSlug: string;
  framework: VercelFramework;
  rootDirectory: string;
  target: VercelEnvironment;
};

type BusyAction = "connect" | "disconnect" | "save" | "clear" | "deploy" | "reconcile" | null;

const FRAMEWORK_OPTIONS = [
  { value: "nextjs", label: "Next.js" },
  { value: "vite", label: "Vite" },
  { value: "static", label: "Static" },
];

const TARGET_OPTIONS = [
  { value: "preview", label: "Preview" },
  { value: "production", label: "Produção" },
];

const EMPTY_CONNECTION: VercelConnectionSummary = {
  connected: false,
  id: null,
  username: null,
  email: null,
  name: null,
  avatarUrl: null,
  defaultTeamId: null,
  defaultTeamSlug: null,
  teams: [],
  updatedAt: null,
  mode: "none",
};

function normalizeProject(project: ProjectInput | null | undefined): VercelProjectSummary | null {
  const id = String(project?.id || project?.project_id || "").trim();
  if (!id) return null;
  return {
    id,
    title: String(project?.title || project?.name || "Projeto").trim() || "Projeto",
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

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "Ainda não registrado";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return String(value);
  }
}

function draftFromWorkspace(workspace: VercelWorkspace | null, project: VercelProjectSummary | null): WorkspaceDraft {
  const framework = workspace?.framework || recommendVercelFramework(project?.kind);
  return {
    projectName: workspace?.projectName || buildDefaultProjectName(project),
    teamSlug: workspace?.teamSlug || "",
    framework,
    rootDirectory: workspace?.rootDirectory || recommendedRootDirectory(framework),
    target: workspace?.target || "preview",
  };
}

function workspaceSignature(workspace: VercelWorkspace | null): string {
  if (!workspace) return "";
  return [workspace.projectName, workspace.teamSlug, workspace.framework, workspace.rootDirectory, workspace.target].join("|");
}

function draftSignature(draft: WorkspaceDraft): string {
  return [
    draft.projectName.trim(),
    draft.teamSlug.trim(),
    draft.framework,
    normalizeVercelRootDirectory(draft.rootDirectory, draft.framework),
    draft.target,
  ].join("|");
}

function actionLabel(action: BusyAction): string | null {
  if (action === "connect") return "Conectando credencial Vercel";
  if (action === "disconnect") return "Removendo credencial Vercel";
  if (action === "save") return "Salvando workspace Vercel";
  if (action === "clear") return "Removendo workspace Vercel";
  if (action === "deploy") return "Solicitando deployment real";
  if (action === "reconcile") return "Reconciliando status do deployment";
  return null;
}

function extractUpdatedProjectData(response: any, fallback: any): any {
  const item = response?.item || response?.data?.item || response;
  return item?.data ?? fallback;
}

export function VercelPublishCard({ variant = "full", project = null, projects = [], onProjectDataChange }: Props) {
  const normalizedProjectsInput = projects.length ? projects : null;
  const availableProjects = useMemo(() => {
    const single = normalizeProject(project);
    if (single) return [single];
    return (normalizedProjectsInput || []).map((item) => normalizeProject(item)).filter(Boolean) as VercelProjectSummary[];
  }, [normalizedProjectsInput, project]);

  const [ready, setReady] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectDataMap, setProjectDataMap] = useState<Record<string, any>>({});
  const [connection, setConnection] = useState<VercelConnectionSummary>(EMPTY_CONNECTION);
  const [tokenDraft, setTokenDraft] = useState("");
  const [draft, setDraft] = useState<WorkspaceDraft>({
    projectName: "",
    teamSlug: "",
    framework: "nextjs",
    rootDirectory: "apps/web",
    target: "preview",
  });
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    async function loadConnection() {
      try {
        const payload = await api.getVercelConnection();
        if (cancelled) return;
        setConnection(payload?.connection || EMPTY_CONNECTION);
      } catch (loadError) {
        if (cancelled) return;
        setConnection(EMPTY_CONNECTION);
        setError(toUserFacingError(loadError, "Não foi possível carregar o estado da Vercel."));
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    loadConnection();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const vercelIntegration = selectedProjectCanonical?.integrations.vercel || null;
  const publish = selectedProjectCanonical?.publish || null;
  const workspace = (vercelIntegration?.binding as VercelWorkspace | null) || null;
  const publishMachine = useMemo(() => resolveVercelPublishMachine(workspace), [workspace]);
  const history = (vercelIntegration?.history || []) as VercelProjectEvent[];
  const latestHistory = history[0] || null;
  const githubBinding = selectedProjectCanonical?.integrations.github?.binding || null;
  const suggestedBranch =
    String(githubBinding?.branch || workspace?.lastDeploymentRef || "").trim() || "branch principal do projeto";

  useEffect(() => {
    setDraft(draftFromWorkspace(workspace, selectedProject));
  }, [workspace, selectedProject]);

  const assessment = useMemo(
    () =>
      assessVercelWorkspaceDraft({
        projectName: draft.projectName,
        teamSlug: draft.teamSlug,
        framework: draft.framework,
        rootDirectory: draft.rootDirectory,
        target: draft.target,
      }),
    [draft]
  );

  const hasUnsavedWorkspaceDraft = Boolean(assessment.ready && draftSignature(draft) !== workspaceSignature(workspace));
  const canDeploy = Boolean(connection.connected && workspace?.projectName && workspace.linkedRepoId && !hasUnsavedWorkspaceDraft);
  const vercelPublish = publish?.providers?.vercel || null;
  const publishDeployment = publish?.deployment || null;
  const effectiveProjectName = String(publishDeployment?.projectName || vercelPublish?.projectName || workspace?.projectName || "").trim();
  const effectiveTeamSlug = String(publishDeployment?.teamSlug || vercelPublish?.teamSlug || workspace?.teamSlug || "").trim();
  const effectiveEnvironment =
    publishDeployment?.environment ||
    vercelPublish?.environment ||
    workspace?.lastDeploymentTarget ||
    workspace?.target ||
    assessment.target;
  const effectiveProjectUrl = String(publishDeployment?.projectUrl || vercelPublish?.projectUrl || workspace?.projectUrl || "").trim() || null;
  const effectiveDeploymentId =
    String(publishDeployment?.deploymentId || vercelPublish?.deploymentId || workspace?.lastDeploymentId || "").trim() || null;
  const effectiveDeploymentUrl =
    String(publishDeployment?.deploymentUrl || vercelPublish?.deploymentUrl || workspace?.lastDeploymentUrl || "").trim() || null;
  const effectiveDeploymentInspectorUrl =
    String(
      publishDeployment?.deploymentInspectorUrl ||
        vercelPublish?.deploymentInspectorUrl ||
        workspace?.lastDeploymentInspectorUrl ||
        ""
    ).trim() || null;
  const effectivePreviewUrl =
    String(publishDeployment?.previewUrl || vercelPublish?.previewUrl || workspace?.previewUrl || "").trim() || null;
  const effectiveProductionUrl =
    String(publishDeployment?.productionUrl || vercelPublish?.productionUrl || workspace?.productionUrl || "").trim() || null;
  const effectivePublishedUrl =
    String(publishDeployment?.publishedUrl || vercelPublish?.publishedUrl || effectiveProductionUrl || effectiveDeploymentUrl || "").trim() || null;
  const effectiveDeployRequestedAt =
    publish?.timestamps?.deploymentRequestedAt ||
    vercelPublish?.timestamps?.deploymentRequestedAt ||
    workspace?.lastDeployRequestedAt ||
    null;
  const effectiveDeployReadyAt =
    publish?.timestamps?.deploymentReadyAt ||
    vercelPublish?.timestamps?.deploymentReadyAt ||
    workspace?.lastDeployReadyAt ||
    null;
  const effectiveDeployCheckedAt =
    publish?.timestamps?.deploymentCheckedAt ||
    vercelPublish?.timestamps?.deploymentCheckedAt ||
    workspace?.lastReconciledAt ||
    workspace?.lastDeploymentObservedAt ||
    vercelIntegration?.lastDeploymentCheckedAt ||
    publishMachine.lastCheckedAt ||
    null;
  const effectiveDeployReconciledAt =
    publish?.timestamps?.deploymentReconciledAt ||
    vercelPublish?.timestamps?.reconciledAt ||
    workspace?.lastReconciledAt ||
    effectiveDeployCheckedAt ||
    null;
  const effectiveDeployObservedAt =
    publish?.timestamps?.deploymentObservedAt ||
    vercelPublish?.timestamps?.deploymentObservedAt ||
    workspace?.lastDeploymentObservedAt ||
    effectiveDeployCheckedAt ||
    null;
  const effectiveDeployError =
    String(publishDeployment?.error || vercelPublish?.error || workspace?.lastDeployError || "").trim() || null;
  const effectiveProjectLabel = formatVercelProjectLabel({
    projectName: effectiveProjectName,
    teamSlug: effectiveTeamSlug,
  } as VercelWorkspace);
  const deployStatus = deriveVercelDeployStatus(workspace);
  const effectiveDeployStatus =
    publishDeployment?.deployStatus === "published" || vercelPublish?.deployStatus === "published"
      ? "published"
      : publishDeployment?.deployStatus === "ready" || vercelPublish?.deployStatus === "ready" || deployStatus === "ready"
        ? "ready"
        : deployStatus === "published"
          ? "published"
          : "draft";
  const canReconcile = Boolean(connection.connected && effectiveDeploymentId);
  const outputStage = resolveVercelOutputStage(workspace);
  const compact = variant === "compact";
  const publishTrustState = useMemo(
    () => (publish ? buildPublishTrustState({ publish, scope: "vercel" }) : null),
    [publish]
  );

  async function refreshConnectionState() {
    const payload = await api.getVercelConnection();
    setConnection(payload?.connection || EMPTY_CONNECTION);
  }

  function persistProjectData(projectId: string, nextData: any) {
    setProjectDataMap((current) => ({ ...current, [projectId]: nextData }));
    onProjectDataChange?.(projectId, nextData);
  }

  const runProjectAction = async (action: Exclude<BusyAction, "connect" | "disconnect">, handler: () => Promise<void>) => {
    setBusyAction(action);
    setError(null);
    setSuccess(null);
    try {
      await handler();
    } catch (actionError) {
      setError(toUserFacingError(actionError, "Não foi possível concluir o fluxo Vercel."));
    } finally {
      setBusyAction(null);
    }
  };

  async function handleConnect() {
    if (!tokenDraft.trim()) {
      setError("Cole um personal access token da Vercel antes de conectar.");
      return;
    }

    setBusyAction("connect");
    setError(null);
    setSuccess(null);
    try {
      const payload = await api.saveVercelConnection({ personalAccessToken: tokenDraft.trim() });
      setConnection(payload?.connection || EMPTY_CONNECTION);
      setTokenDraft("");
      setSuccess("Credencial Vercel validada e armazenada no backend.");
    } catch (connectError) {
      setError(toUserFacingError(connectError, "Não foi possível validar a credencial Vercel."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    setBusyAction("disconnect");
    setError(null);
    setSuccess(null);
    try {
      await api.removeVercelConnection();
      setConnection(EMPTY_CONNECTION);
      setSuccess("Credencial Vercel removida do backend.");
    } catch (disconnectError) {
      setError(toUserFacingError(disconnectError, "Não foi possível remover a credencial Vercel."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveWorkspace() {
    if (!selectedProject) {
      setError("Abra um projeto antes de salvar o workspace Vercel.");
      return;
    }
    if (!assessment.ready) {
      setError("Corrija nome do projeto, root directory e ambiente antes de salvar o workspace Vercel.");
      return;
    }

    await runProjectAction("save", async () => {
      const response = await api.saveVercelWorkspace(selectedProject.id, {
        projectName: assessment.projectName,
        teamSlug: assessment.teamSlug,
        framework: assessment.framework,
        rootDirectory: assessment.rootDirectory,
        target: assessment.target,
      });
      const nextData = extractUpdatedProjectData(response, selectedProjectData);
      persistProjectData(selectedProject.id, nextData);
      setSuccess(`Projeto ${assessment.projectName} verificado pela Vercel e persistido no backend.`);
    });
  }

  async function handleClearWorkspace() {
    if (!selectedProject) {
      setError("Abra um projeto antes de remover o workspace Vercel.");
      return;
    }

    await runProjectAction("clear", async () => {
      const response = await api.clearVercelWorkspace(selectedProject.id);
      const nextData = extractUpdatedProjectData(response, selectedProjectData);
      persistProjectData(selectedProject.id, nextData);
      setSuccess("Workspace Vercel removido do projeto.");
    });
  }

  async function handleDeploy() {
    if (!selectedProject) {
      setError("Abra um projeto antes de solicitar o deployment.");
      return;
    }

    await runProjectAction("deploy", async () => {
      const response = await api.createVercelDeployment(selectedProject.id);
      const nextData = extractUpdatedProjectData(response, selectedProjectData);
      persistProjectData(selectedProject.id, nextData);
      const deploymentId = String(response?.deployment?.id || "").trim();
      setSuccess(
        deploymentId
          ? `Deployment ${deploymentId} solicitado pela Vercel com rastreio persistido no backend.`
          : "Deployment solicitado pela Vercel e persistido no backend."
      );
    });
  }

  async function handleReconcile() {
    if (!selectedProject) {
      setError("Abra um projeto antes de reconciliar o deployment.");
      return;
    }

    await runProjectAction("reconcile", async () => {
      const response = await api.reconcileVercelDeployment(selectedProject.id);
      const nextData = extractUpdatedProjectData(response, selectedProjectData);
      persistProjectData(selectedProject.id, nextData);
      await refreshConnectionState();
      const deploymentState = String(response?.deployment?.readyState || "").trim();
      setSuccess(
        deploymentState
          ? `Deployment reconciliado: ${vercelDeploymentStateLabel(deploymentState)}.`
          : "Deployment reconciliado com a Vercel."
      );
    });
  }

  const busyKind: OperationalStateKind | null =
    busyAction === "reconcile" ? "syncing" : busyAction === "disconnect" ? "retry" : busyAction ? "syncing" : null;

  const trustState = useMemo(() => {
      const meta: OperationalStateMetaItem[] = [
        { label: "Projeto", value: selectedProject?.title || "Abra um projeto" },
        { label: "Vercel", value: connection.connected ? connection.username || connection.name || "Conectado" : "Pendente" },
        { label: "Workspace", value: effectiveProjectLabel },
        { label: "Ambiente", value: vercelEnvironmentLabel(effectiveEnvironment) },
      ];

      if (effectiveDeploymentId) {
        meta.push({ label: "Deployment", value: effectiveDeploymentId });
        meta.push({
          label: "Estado",
          value: vercelPublishMachineLabel(publishMachine),
        tone: vercelPublishMachineMetaTone(publishMachine),
      });
    } else {
      meta.push({ label: "Deployment", value: "Ainda não solicitado" });
      meta.push({ label: "Estado", value: vercelPublishMachineLabel(publishMachine), tone: vercelPublishMachineMetaTone(publishMachine) });
    }

    if (!selectedProject) {
      return {
        kind: "empty" as const,
        title: "Abra um projeto para ativar a Vercel",
        description: "A integração real da Vercel depende de projeto, credencial, workspace validado e deployment rastreável.",
        meta,
        details: ["Selecione um projeto antes de validar workspace, disparar deploy ou reconciliar estado com a Vercel."],
        footer: "A fonte de verdade da Vercel agora fica no backend do projeto, não no navegador.",
      };
    }

    if (!connection.connected) {
      return {
        kind: "retry" as const,
        title: "Credencial Vercel ainda ausente",
        description: "Sem token validado no backend, o produto não consegue verificar projeto, disparar deployment nem reconciliar status real.",
        meta,
        details: [
          "Conecte um personal access token com acesso ao projeto Vercel.",
          "A credencial fica criptografada no backend e deixa de depender do navegador.",
        ],
        footer: "Sem credencial backend-owned, a Vercel volta a ser configuração parcial.",
      };
    }

    if (!workspace) {
      return {
        kind: "unsaved" as const,
        title: "Workspace Vercel ainda não salvo",
        description: "A credencial já existe, mas projeto, time, root directory e ambiente ainda não foram verificados no backend.",
        meta,
        details: ["Salve o workspace do projeto antes de solicitar qualquer deployment."],
        footer: "Sem workspace verificado, não existe deploy confiável.",
      };
    }

    if (!workspace.linkedRepoId) {
      return {
        kind: "failed-publish" as const,
        title: "Projeto Vercel sem repositório utilizável",
        description: "O backend verificou o projeto, mas a Vercel não expôs um vínculo GitHub utilizável para disparar deployment real.",
        meta,
        details: ["Conecte o projeto Vercel a um repositório GitHub antes de tentar deploy pelo produto."],
        footer: "Sem repositório ligado na Vercel, não existe deployment backend-owned de verdade.",
      };
    }

    if (publishMachine.state === "deployment_failed") {
      return {
        kind: "failed-publish" as const,
        title: "Último deployment falhou",
          description: "O estado veio da Vercel e já está persistido no projeto. A falha agora é verificável, não um texto solto no frontend.",
          meta,
          details: [
            publishMachine.note || effectiveDeployError || "A Vercel devolveu falha ou cancelamento para o último deployment.",
            effectiveDeploymentInspectorUrl ? `Inspector: ${effectiveDeploymentInspectorUrl}` : "Abra o deployment e revise o erro no provedor.",
          ],
          footer: "Corrija a origem do projeto e solicite um novo deploy só depois de resolver a causa real.",
        };
    }

    if (publishMachine.state === "published") {
      return {
        kind: "published" as const,
        title: "Produção confirmada pela Vercel",
          description: "Projeto, ambiente, deployment, URL e horário agora vêm do backend e do provedor, não de confirmação manual.",
          meta,
          details: [
            effectivePublishedUrl ? `URL publicada: ${effectivePublishedUrl}` : "URL de produção ainda não registrada.",
            publishMachine.lastSuccessAt
              ? `Confirmado em ${formatDateLabel(publishMachine.lastSuccessAt)}.`
              : effectiveDeployReadyAt
                ? `Confirmado em ${formatDateLabel(effectiveDeployReadyAt)}.`
                : "Deployment pronto e persistido no projeto.",
          ],
          footer: "Se houver nova iteração, abra o editor, sincronize a fonte e gere um novo deploy real.",
      };
    }

    if (publishMachine.state === "deployment_ready") {
      return {
        kind: "success" as const,
        title: "Preview confirmado pela Vercel",
          description: "A Vercel já devolveu READY e o produto mantém preview, ambiente e deployment rastreados no projeto.",
          meta,
          details: [
            effectiveDeploymentUrl ? `Preview: ${effectiveDeploymentUrl}` : "Preview pronta e persistida no backend.",
            `Próxima origem usada: ${suggestedBranch}.`,
          ],
          footer:
            effectiveEnvironment === "production"
              ? "Mude o ambiente para produção e gere um novo deployment quando a branch estiver pronta."
              : "Promova para produção só quando o projeto e a branch estiverem estáveis.",
        };
    }

    if (publishMachine.state === "deployment_requested" || publishMachine.state === "deployment_running") {
      return {
        kind: "syncing" as const,
        title: "Deployment solicitado e aguardando retorno",
        description: publishMachine.note || "O deploy já saiu do produto e agora depende apenas da resposta da Vercel para virar READY ou ERROR.",
        meta,
        details: [
          `Ambiente alvo: ${vercelEnvironmentLabel(effectiveEnvironment)}.`,
          `Branch usada: ${workspace?.lastDeploymentRef || suggestedBranch}.`,
        ],
        footer: "Reconcile novamente até a Vercel devolver READY ou ERROR.",
      };
    }

    return {
      kind: "saved" as const,
      title: "Workspace verificado e pronto para deploy",
        description: publishMachine.note || "Projeto, ambiente e root directory já foram validados no backend. O próximo passo real é disparar o primeiro deployment.",
        meta,
        details: [
          effectiveProjectUrl ? `Projeto Vercel: ${effectiveProjectUrl}` : "Projeto validado no backend.",
          `Branch sugerida: ${suggestedBranch}.`,
        ],
        footer: "Solicite o deployment só quando a fonte do projeto estiver pronta para a Vercel.",
      };
  }, [
    connection.connected,
    connection.name,
    connection.username,
    effectiveDeployError,
    effectiveDeployReadyAt,
    effectiveDeploymentId,
    effectiveDeploymentInspectorUrl,
    effectiveDeploymentUrl,
    effectiveEnvironment,
    effectiveProjectLabel,
    effectiveProjectUrl,
    effectivePublishedUrl,
    publishMachine,
    selectedProject,
    suggestedBranch,
    workspace,
  ]);

  const workspaceState = useMemo(() => {
    if (!assessment.ready) {
      return {
        kind: "error" as const,
        title: "Workspace Vercel inválido",
        description: "Nome do projeto ou diretório raiz ainda não passam na validação local.",
        details: assessment.issues.filter((item) => item.level === "error").map((item) => item.message),
      };
    }
    if (hasUnsavedWorkspaceDraft) {
      return {
        kind: "unsaved" as const,
        title: "Alterações de workspace pendentes",
        description: "O rascunho local não corresponde ao workspace salvo no backend.",
        details: assessment.issues.map((item) => item.message),
      };
    }
    if (workspace) {
      return {
        kind: "saved" as const,
        title: "Workspace persistido no backend",
        description: "Projeto Vercel, ambiente e raiz já foram verificados e gravados no projeto.",
        details: assessment.issues.map((item) => item.message),
      };
    }
    return {
      kind: "empty" as const,
      title: "Workspace ainda não salvo",
      description: "Defina projeto, time, framework, raiz e ambiente antes de registrar a integração da Vercel.",
      details: assessment.issues.map((item) => item.message),
    };
  }, [assessment, hasUnsavedWorkspaceDraft, workspace]);

  if (!ready) {
    return (
      <section className="vercel-publish-card layout-contract-card" id="vercel-publish">
        <OperationalState
          kind="loading"
          title="Carregando integração Vercel"
          description="Buscando credencial, workspace e último deployment persistido do projeto."
          badge="Vercel"
        />
      </section>
    );
  }

  if (!selectedProject) {
    return (
      <section className="vercel-publish-card layout-contract-card" id="vercel-publish">
        <OperationalState
          kind="empty"
          title="Nenhum projeto elegível para Vercel ainda"
          description="Crie ou salve um projeto antes de verificar o workspace e disparar deployments pela Vercel."
          badge="Vercel"
          emphasis="Aguardando projeto"
          meta={[
            { label: "Fluxo", value: "Criar → editar → deploy" },
            { label: "Estado", value: "Sem projeto selecionado" },
          ]}
          actions={
            <div className="vercel-publish-actions">
              <EditorRouteLink href="/editor/new" className="btn-link-ea btn-primary btn-sm">
                Criar projeto
              </EditorRouteLink>
            </div>
          }
        />
      </section>
    );
  }

  return (
    <section className={`vercel-publish-card layout-contract-card${compact ? " vercel-publish-card-compact" : ""}`} id="vercel-publish">
      <div className="vercel-publish-head">
        <div className="vercel-publish-copy">
          <p className="section-kicker">Vercel</p>
          <h3>{compact ? "Deploy real" : "Integração Vercel backend-owned"}</h3>
          <p className="helper-text-ea">
            Projeto, ambiente, deployment, status e retorno agora ficam presos ao backend e reconciliados com a Vercel.
          </p>
        </div>
        <div className="hero-meta-row github-workspace-meta-row">
          <span className={`premium-badge ${connection.connected ? "premium-badge-phase" : "premium-badge-warning"}`}>
            {connection.connected ? "Credencial validada" : "Credencial pendente"}
          </span>
          <span className="premium-badge premium-badge-warning">{formatVercelProjectLabel(workspace)}</span>
          <span className="premium-badge premium-badge-soon">
            {vercelPublishMachineLabel(publishMachine)}
          </span>
        </div>
      </div>

      {availableProjects.length > 1 ? (
        <div className="vercel-publish-form">
          <label className="field-label-ea">
            <span>Projeto</span>
            <PremiumSelect
              value={selectedProject.id}
              onChange={setSelectedProjectId}
              options={availableProjects.map((item) => ({ value: item.id, label: item.title }))}
              ariaLabel="Projeto selecionado para integração Vercel"
            />
          </label>
        </div>
      ) : null}

      {busyKind && busyAction ? (
        <OperationalState
          kind={busyKind}
          title={actionLabel(busyAction) || "Executando ação Vercel"}
          description="A ação está sendo executada pelo backend e o estado do projeto será reconciliado em seguida."
          badge="Vercel operação"
          emphasis={selectedProject.title}
          meta={[
            { label: "Projeto", value: selectedProject.title },
            { label: "Workspace", value: formatVercelProjectLabel(workspace) },
            { label: "Ambiente", value: vercelEnvironmentLabel(workspace?.target || assessment.target) },
          ]}
        />
      ) : null}

      {error ? (
        <OperationalState
          kind="error"
          title="Falha no fluxo Vercel"
          description={error}
          badge="Vercel"
          emphasis={selectedProject.title}
        />
      ) : null}

      {success ? (
        <OperationalState
          kind={vercelPublishMachineOperationalKind(publishMachine)}
          title="Fluxo Vercel atualizado"
          description={success}
          badge="Vercel"
          emphasis={selectedProject.title}
        />
      ) : null}

      {publishTrustState ? (
        <OperationalState
          compact={compact}
          kind={publishTrustState.kind}
          title={publishTrustState.title}
          description={publishTrustState.description}
          badge="Publish reconciliado"
          emphasis={selectedProject.title}
          meta={publishTrustState.meta}
          details={publishTrustState.details}
          footer={publishTrustState.footer}
        />
      ) : null}

      <OperationalState
        compact={compact}
        kind={trustState.kind}
        title={trustState.title}
        description={trustState.description}
        badge="Vercel base"
        emphasis={selectedProject.title}
        meta={trustState.meta}
        details={trustState.details}
        footer={trustState.footer}
        actions={
          <div className="vercel-publish-actions">
            {effectiveProjectUrl ? (
              <a href={effectiveProjectUrl || ""} target="_blank" rel="noreferrer" className="btn-link-ea btn-secondary btn-sm">
                Abrir projeto Vercel
              </a>
            ) : null}
            {effectiveDeploymentInspectorUrl ? (
              <a href={effectiveDeploymentInspectorUrl} target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
                Ver deployment
              </a>
            ) : null}
            {effectiveDeploymentUrl ? (
              <a href={effectiveDeploymentUrl} target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
                Abrir saída
              </a>
            ) : null}
            <EditorRouteLink href={`/editor/${selectedProject.id}`} className="btn-link-ea btn-ghost btn-sm">
              Abrir projeto
            </EditorRouteLink>
          </div>
        }
      />

      <div className="vercel-publish-grid">
        <article className="vercel-publish-form layout-contract-item">
          <div className="section-stack-tight">
            <p className="section-kicker">1. Credencial</p>
            <h4 className="heading-reset">Token validado no backend</h4>
            <p className="helper-text-ea">
              A Vercel deixa de depender de base local. O token agora só existe no servidor e é usado para verificar projeto e deployment.
            </p>
          </div>

          <div className="vercel-publish-status-grid">
            <div className="vercel-publish-status-item">
              <span>Estado</span>
              <strong>{connection.connected ? "Conectado" : "Pendente"}</strong>
              <small>
                {connection.connected
                  ? `${connection.username || connection.name || "Token validado"} • ${formatDateLabel(connection.updatedAt)}`
                  : "Conecte um personal access token da Vercel antes de usar o backend."}
              </small>
            </div>
            <div className="vercel-publish-status-item">
              <span>Workspace padrão</span>
              <strong>{connection.defaultTeamSlug || "Pessoal / default"}</strong>
              <small>{connection.teams.length ? `${connection.teams.length} workspaces visíveis por este token.` : "Sem workspace adicional exposto."}</small>
            </div>
          </div>

          {!connection.connected ? (
            <label className="field-label-ea">
              <span>Personal access token</span>
              <input
                className="field-ea"
                type="password"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                placeholder="vercel_pat_..."
                autoComplete="off"
              />
            </label>
          ) : null}

          <div className="vercel-publish-actions">
            {!connection.connected ? (
              <button onClick={handleConnect} disabled={busyAction === "connect" || !tokenDraft.trim()} className="btn-ea btn-primary btn-sm">
                {busyAction === "connect" ? "Validando..." : "Conectar credencial"}
              </button>
            ) : (
              <button onClick={handleDisconnect} disabled={busyAction === "disconnect"} className="btn-ea btn-ghost btn-sm">
                {busyAction === "disconnect" ? "Removendo..." : "Remover credencial"}
              </button>
            )}
          </div>
        </article>

        <article className="vercel-publish-form layout-contract-item">
          <div className="section-stack-tight">
            <p className="section-kicker">2. Workspace</p>
            <h4 className="heading-reset">Projeto, ambiente e raiz</h4>
            <p className="helper-text-ea">
              O backend verifica o projeto na Vercel antes de aceitar o vínculo. Isso mata o status frouxo no frontend.
            </p>
          </div>

          <label className="field-label-ea">
            <span>Projeto na Vercel</span>
            <input
              className="field-ea"
              value={draft.projectName}
              onChange={(event) => setDraft((current) => ({ ...current, projectName: event.target.value }))}
              placeholder={buildDefaultProjectName(selectedProject)}
            />
          </label>
          <label className="field-label-ea">
            <span>Time ou workspace</span>
            <input
              className="field-ea"
              value={draft.teamSlug}
              onChange={(event) => setDraft((current) => ({ ...current, teamSlug: event.target.value }))}
              placeholder={connection.defaultTeamSlug || "workspace-opcional"}
            />
          </label>
          <label className="field-label-ea">
            <span>Framework</span>
            <PremiumSelect
              value={draft.framework}
              onChange={(next) => {
                const nextFramework = next as VercelFramework;
                setDraft((current) => ({
                  ...current,
                  framework: nextFramework,
                  rootDirectory: current.rootDirectory.trim() || recommendedRootDirectory(nextFramework),
                }));
              }}
              options={FRAMEWORK_OPTIONS}
              ariaLabel="Framework do projeto Vercel"
            />
          </label>
          <label className="field-label-ea">
            <span>Root directory</span>
            <input
              className="field-ea"
              value={draft.rootDirectory}
              onChange={(event) => setDraft((current) => ({ ...current, rootDirectory: event.target.value }))}
              placeholder={recommendedRootDirectory(draft.framework)}
            />
          </label>
          <label className="field-label-ea">
            <span>Ambiente alvo</span>
            <PremiumSelect
              value={draft.target}
              onChange={(next) => setDraft((current) => ({ ...current, target: next as VercelEnvironment }))}
              options={TARGET_OPTIONS}
              ariaLabel="Ambiente alvo do deployment"
            />
          </label>

          <OperationalState
            compact
            kind={workspaceState.kind}
            title={workspaceState.title}
            description={workspaceState.description}
            badge="Workspace"
            meta={[
              { label: "Projeto Vercel", value: assessment.projectName || "Pendente" },
              { label: "Time", value: assessment.teamSlug || "Pessoal / default" },
              { label: "Root", value: assessment.rootDirectory },
              { label: "Ambiente", value: vercelEnvironmentLabel(assessment.target) },
            ]}
            details={workspaceState.details}
          />

          <div className="vercel-publish-actions">
            <button onClick={handleSaveWorkspace} disabled={busyAction === "save" || !selectedProject || !assessment.ready} className="btn-ea btn-secondary btn-sm">
              {busyAction === "save" ? "Salvando..." : "Salvar workspace"}
            </button>
            <button onClick={handleClearWorkspace} disabled={busyAction === "clear" || !selectedProject || !workspace} className="btn-ea btn-ghost btn-sm">
              {busyAction === "clear" ? "Removendo..." : "Remover workspace"}
            </button>
          </div>
        </article>

        <article className="vercel-publish-form layout-contract-item">
          <div className="section-stack-tight">
            <p className="section-kicker">3. Deploy</p>
            <h4 className="heading-reset">Trigger e reconciliação reais</h4>
            <p className="helper-text-ea">
              O produto agora dispara deployment pela API da Vercel e reconcilia o retorno real do provedor no próprio projeto.
            </p>
          </div>

          <div className="vercel-publish-status-grid">
            <div className="vercel-publish-status-item">
              <span>Projeto</span>
              <strong>{effectiveProjectLabel}</strong>
              <small>{effectiveTeamSlug ? `${effectiveTeamSlug} • ${workspace?.framework || draft.framework}` : "Workspace pendente"}</small>
            </div>
            <div className="vercel-publish-status-item">
              <span>Ambiente</span>
              <strong>{vercelEnvironmentLabel(effectiveEnvironment)}</strong>
              <small>{workspace?.linkedRepoId ? "Projeto ligado a repositório verificável." : "Projeto ainda sem repo utilizável."}</small>
            </div>
            <div className="vercel-publish-status-item">
              <span>Branch usada</span>
              <strong>{workspace?.lastDeploymentRef || suggestedBranch}</strong>
              <small>{githubBinding?.owner ? "A Vercel usa a branch rastreada do produto quando ela existe." : "Na falta do GitHub sincronizado, a Vercel usa a branch principal ligada ao projeto."}</small>
            </div>
            <div className="vercel-publish-status-item">
              <span>Deployment</span>
              <strong>{effectiveDeploymentId || "Ainda não solicitado"}</strong>
              <small>{effectiveDeploymentUrl || "Sem URL emitida ainda."}</small>
            </div>
            <div className="vercel-publish-status-item">
              <span>Estado</span>
              <strong>{vercelPublishMachineLabel(publishMachine)}</strong>
              <small>
                {publishMachine.note ||
                  effectiveDeployError ||
                  (effectiveDeployReconciledAt
                    ? `Reconciliado em ${formatDateLabel(effectiveDeployReconciledAt)}.`
                    : outputStage.detail)}
              </small>
            </div>
            <div className="vercel-publish-status-item">
              <span>Status canônico</span>
              <strong>{vercelDeployStatusLabel(effectiveDeployStatus)}</strong>
              <small>
                {effectiveDeployRequestedAt
                  ? `Solicitado em ${formatDateLabel(effectiveDeployRequestedAt)}.`
                  : effectiveDeployObservedAt
                    ? `Observado em ${formatDateLabel(effectiveDeployObservedAt)}.`
                    : "Sem request persistido ainda."}
              </small>
            </div>
          </div>

          <div className="vercel-publish-note">
            <strong>Fonte de verdade</strong>
            <span>
              Projeto Vercel, ambiente, deployment id, deployment URL, inspector URL, estado e erro agora ficam
              consolidados em <code>publish</code> no projeto e atualizados pelo backend.
            </span>
          </div>

          <div className="vercel-publish-actions">
            <button onClick={handleDeploy} disabled={busyAction === "deploy" || !canDeploy} className="btn-ea btn-primary btn-sm">
              {busyAction === "deploy" ? "Solicitando..." : "Solicitar deployment"}
            </button>
            <button onClick={handleReconcile} disabled={busyAction === "reconcile" || !canReconcile} className="btn-ea btn-secondary btn-sm">
              {busyAction === "reconcile" ? "Reconciliando..." : "Reconciliar status"}
            </button>
          </div>
        </article>
      </div>

      {(effectivePreviewUrl || effectiveProductionUrl) ? (
        <div className="vercel-publish-links">
          {effectivePreviewUrl ? (
            <div className="vercel-publish-link-card">
              <span>Preview URL</span>
              <strong>{effectivePreviewUrl}</strong>
              <a href={effectivePreviewUrl} target="_blank" rel="noreferrer" className="text-link-ea">
                Abrir preview
              </a>
            </div>
          ) : null}
          {effectiveProductionUrl ? (
            <div className="vercel-publish-link-card">
              <span>Production URL</span>
              <strong>{effectiveProductionUrl}</strong>
              <a href={effectiveProductionUrl} target="_blank" rel="noreferrer" className="text-link-ea">
                Abrir produção
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="vercel-publish-history">
        <div className="section-stack-tight">
          <p className="section-kicker">Histórico Vercel</p>
          <h4 className="heading-reset">Workspace, deployment e reconciliação</h4>
          <p className="helper-text-ea">
            A trilha abaixo mostra o que saiu do produto, o que voltou da Vercel e o estado que ficou persistido.
          </p>
        </div>
        <div className="vercel-publish-history-list">
          {history.length ? (
            history.map((event) => (
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
            ))
          ) : (
            <OperationalState
              compact
              kind="empty"
              title="Ainda sem histórico Vercel neste projeto"
              description="Salve o workspace ou solicite um deployment para iniciar a trilha operacional."
              badge="Histórico"
              emphasis={selectedProject.title}
              meta={[
                { label: "Workspace", value: formatVercelProjectLabel(workspace) },
                { label: "Deploy", value: vercelPublishMachineLabel(publishMachine) },
              ]}
            />
          )}
        </div>
      </div>

      {latestHistory ? (
        <div className="vercel-publish-note">
          <strong>Último retorno</strong>
          <span>{latestHistory.note}</span>
        </div>
      ) : null}
    </section>
  );
}
