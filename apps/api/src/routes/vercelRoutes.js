import crypto from "crypto";
import express from "express";
import { z } from "zod";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { recordProductEvent } from "../utils/eventsStore.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";
import {
  VercelApiError,
  createVercelDeployment,
  getVercelAuthenticatedUser,
  getVercelDeployment,
  getVercelProject,
  resolveVercelTeam,
  listVercelTeams,
} from "../utils/vercelClient.js";
import { decryptVercelToken, encryptVercelToken } from "../utils/vercelCrypto.js";
import { applyPublishSourceOfTruth } from "../utils/publishSourceOfTruth.js";
import { nowIso, resolveVercelPublishMachine } from "../utils/vercelPublishMachine.js";

const router = express.Router();
router.use(authMiddleware);

const CONNECTION_PREFIX = "vercel_connection:";
const DEPLOYMENT_PREFIX = "vercel_deployment:";
const HISTORY_LIMIT = 16;

const ConnectionBodySchema = z.object({
  personalAccessToken: z.string().min(20),
});

const WorkspaceBodySchema = z.object({
  projectName: z.string().min(1),
  teamSlug: z.string().optional().default(""),
  framework: z.enum(["nextjs", "vite", "static"]).default("nextjs"),
  rootDirectory: z.string().optional().default("apps/web"),
  target: z.enum(["preview", "production"]).default("preview"),
});

function configKey(userId) {
  return `${CONNECTION_PREFIX}${String(userId || "").trim()}`;
}

function badRequest(res, message, details) {
  return res.status(400).json({ error: message, details });
}

function notFound(res, message = "Registro não encontrado") {
  return res.status(404).json({ error: message });
}

function localId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProjectName(value) {
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

function normalizeTeamSlug(value) {
  return asText(value).replace(/^@+/, "").replace(/\s+/g, "-");
}

function normalizeRootDirectory(value, framework = "nextjs") {
  const trimmed = asText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
  if (trimmed) return trimmed;
  if (framework === "vite") return "app";
  if (framework === "static") return "export";
  return "apps/web";
}

function cloneJson(value) {
  if (!value || typeof value !== "object") return {};
  return JSON.parse(JSON.stringify(value));
}

function buildProjectUrl(teamSlug, projectName) {
  if (!projectName) return null;
  const teamSegment = asText(teamSlug);
  return teamSegment ? `https://vercel.com/${teamSegment}/${projectName}` : "https://vercel.com/dashboard";
}

function deriveDeployStatus({
  lastDeploymentState,
  lastDeploymentTarget,
  productionUrl,
  previewUrl,
}) {
  const state = asText(lastDeploymentState).toUpperCase();
  const target = asText(lastDeploymentTarget).toLowerCase();
  if ((state === "READY" && target === "production") || productionUrl) return "published";
  if (state && state !== "UNKNOWN") return "ready";
  if (previewUrl) return "ready";
  return "draft";
}

function sortDeploymentsDescending(deployments) {
  return [...deployments].sort((a, b) => {
    const left = Date.parse(a?.createdAt || "") || 0;
    const right = Date.parse(b?.createdAt || "") || 0;
    return right - left;
  });
}

function summarizeDeployments(deployments) {
  const ordered = sortDeploymentsDescending((Array.isArray(deployments) ? deployments : []).filter(Boolean));
  const latest = ordered[0] || null;
  const latestPreview = ordered.find((item) => item.target !== "production") || null;
  const latestProduction = ordered.find((item) => item.target === "production") || null;
  return { latest, latestPreview, latestProduction };
}

function buildVercelEvent(event) {
  return {
    id: localId(),
    ts: nowIso(),
    type: "status_updated",
    stage: "draft",
    title: "Evento Vercel",
    note: "",
    ...event,
  };
}

function ensureVercelState(projectData) {
  const next = cloneJson(projectData);
  if (!next.integrations || typeof next.integrations !== "object") next.integrations = {};
  if (!next.integrations.vercel || typeof next.integrations.vercel !== "object") {
    next.integrations.vercel = { binding: null, lastManifestExportedAt: null, lastDeploymentCheckedAt: null, history: [] };
  }
  if (!Array.isArray(next.integrations.vercel.history)) next.integrations.vercel.history = [];
  if (!next.delivery || typeof next.delivery !== "object") {
    next.delivery = {
      stage: "draft",
      exportTarget: "device",
      connectedStorage: null,
      mediaRetention: "externalized",
      lastExportedAt: null,
      lastPublishedAt: null,
      history: [],
    };
  }
  if (!Array.isArray(next.delivery.history)) next.delivery.history = [];
  if (!next.deliverable || typeof next.deliverable !== "object") next.deliverable = {};
  return next;
}

function sanitizeConnectionRecord(value) {
  const metadata = value && typeof value === "object" ? value : {};
  const teams = Array.isArray(metadata.teams)
    ? metadata.teams
        .map((team) => ({
          id: asText(team?.id) || null,
          slug: asText(team?.slug) || null,
          name: asText(team?.name) || null,
          avatarUrl: asText(team?.avatarUrl) || null,
        }))
        .filter((team) => team.id || team.slug)
    : [];

  return {
    connected: Boolean(metadata.encryptedToken),
    id: asText(metadata.id) || null,
    username: asText(metadata.username) || null,
    email: asText(metadata.email) || null,
    name: asText(metadata.name) || null,
    avatarUrl: asText(metadata.avatarUrl) || null,
    defaultTeamId: asText(metadata.defaultTeamId) || null,
    defaultTeamSlug: asText(metadata.defaultTeamSlug) || null,
    teams,
    updatedAt: asText(metadata.updatedAt) || null,
    mode: metadata.encryptedToken ? "token" : "none",
  };
}

async function requireConnectionRecord(userId) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    throw new Error("supabase_admin_unavailable");
  }

  const { data, error } = await supabaseAdmin
    .from("configs")
    .select("value")
    .eq("key", configKey(userId))
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "vercel_config_read_failed");
  }

  const value = data?.value && typeof data.value === "object" ? data.value : null;
  return {
    value,
    summary: sanitizeConnectionRecord(value),
    token:
      value?.encryptedToken && typeof value.encryptedToken === "object"
        ? decryptVercelToken(value.encryptedToken)
        : null,
  };
}

async function saveConnectionRecord(userId, value) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    throw new Error("supabase_admin_unavailable");
  }

  const { error } = await supabaseAdmin
    .from("configs")
    .upsert(
      {
        key: configKey(userId),
        value,
      },
      { onConflict: "key" }
    );

  if (error) {
    throw new Error(error.message || "vercel_config_write_failed");
  }
}

async function clearConnectionRecord(userId) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    throw new Error("supabase_admin_unavailable");
  }

  const { error } = await supabaseAdmin.from("configs").delete().eq("key", configKey(userId));
  if (error) {
    throw new Error(error.message || "vercel_config_delete_failed");
  }
}

function deploymentKey(deploymentId) {
  return `${DEPLOYMENT_PREFIX}${String(deploymentId || "").trim()}`;
}

async function saveDeploymentRecord(deploymentId, value) {
  if (!deploymentId || !isSupabaseAdminEnabled() || !supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from("configs")
    .upsert(
      {
        key: deploymentKey(deploymentId),
        value,
      },
      { onConflict: "key" }
    );

  if (error) {
    throw new Error(error.message || "vercel_deployment_record_write_failed");
  }
}

async function readProjectForUser(req, projectId) {
  const supabase = createAuthedSupabaseClient(req.access_token);
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "project_read_failed");
  }

  return data || null;
}

async function persistProjectData(req, projectId, nextData) {
  const persistedData = applyPublishSourceOfTruth(nextData);
  const supabase = createAuthedSupabaseClient(req.access_token);
  const { data, error } = await supabase
    .from("projects")
    .update({ data: persistedData })
    .eq("id", projectId)
    .eq("user_id", req.user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "project_save_failed");
  }

  return data || null;
}

function handleVercelError(res, error, defaultMessage) {
  if (error instanceof VercelApiError) {
    const status =
      error.status === 404 ? 404 : error.status === 401 ? 401 : error.status === 403 ? 403 : error.status === 409 ? 409 : 400;
    return res.status(status).json({
      error: error.code || "vercel_request_failed",
      message: error.message || defaultMessage,
      details: error.details || null,
    });
  }

  return res.status(400).json({
    error: defaultMessage,
    details: error?.message || null,
  });
}

function latestExternalState(deployments) {
  const { latest, latestPreview, latestProduction } = summarizeDeployments(deployments);
  const previewUrl = latestPreview?.url || null;
  const productionUrl = latestProduction?.url || null;
  const deployStatus = deriveDeployStatus({
    lastDeploymentState: latest?.readyState,
    lastDeploymentTarget: latest?.target,
    productionUrl,
    previewUrl,
  });

  return {
    latest,
    previewUrl,
    productionUrl,
    deployStatus,
  };
}

function buildBinding({
  previousBinding,
  projectInfo,
  team,
  framework,
  rootDirectory,
  target,
}) {
  const external = latestExternalState(projectInfo.latestDeployments);
  const latest = external.latest;
  const observedAt = nowIso();

  return {
    ...(previousBinding || {}),
    provider: "vercel",
    projectId: projectInfo.id,
    projectName: projectInfo.name,
    teamId: team?.id || null,
    teamSlug: team?.slug || "",
    framework,
    rootDirectory,
    target,
    deployStatus: external.deployStatus,
    previewUrl: external.previewUrl || "",
    productionUrl: external.productionUrl || "",
    projectUrl: buildProjectUrl(team?.slug || "", projectInfo.name),
    connectedAt: previousBinding?.connectedAt || observedAt,
    updatedAt: observedAt,
    lastVerifiedAt: observedAt,
    verificationStatus: "verified",
    tokenConfigured: true,
    linkedRepoId: projectInfo.link?.repoId ? String(projectInfo.link.repoId) : null,
    linkedRepoType: asText(projectInfo.link?.type) || null,
    lastDeploymentId: latest?.id || null,
    lastDeploymentUrl: latest?.url || null,
    lastDeploymentInspectorUrl: latest?.inspectorUrl || null,
    lastDeploymentState: latest?.readyState || null,
    lastDeploymentTarget: latest?.target || null,
    lastDeploymentRef: projectInfo.link?.productionBranch || previousBinding?.lastDeploymentRef || null,
    lastDeployRequestedAt: latest?.createdAt || null,
    lastDeployReadyAt: latest?.readyAt || null,
    lastDeployError: latest?.readyState === "ERROR" ? latest?.errorMessage || "vercel_deployment_failed" : null,
    publishMachine: resolveVercelPublishMachine({
      previousMachine: previousBinding?.publishMachine || null,
      hasWorkspace: true,
      deploymentId: latest?.id || null,
      deploymentState: latest?.readyState || null,
      deploymentTarget: latest?.target || target,
      deploymentUrl: latest?.url || null,
      errorMessage: latest?.readyState === "ERROR" ? latest?.errorMessage || "vercel_deployment_failed" : null,
      source: "workspace_save",
      eventType: "workspace_saved",
      observedAt,
    }),
  };
}

function pushHistory(nextData, event) {
  nextData.integrations.vercel.history = [buildVercelEvent(event), ...nextData.integrations.vercel.history].slice(0, HISTORY_LIMIT);
}

function syncDeliveryFromBinding(nextData, binding, noteTitle, note) {
  const stage =
    binding.lastDeploymentState === "READY" && binding.lastDeploymentTarget === "production"
      ? "published"
      : binding.lastDeploymentId
        ? "exported"
        : "draft";

  nextData.delivery = {
    ...nextData.delivery,
    stage,
    exportTarget: stage === "draft" ? "device" : "connected_storage",
    connectedStorage: stage === "draft" ? null : "vercel",
    lastExportedAt: binding.lastDeployRequestedAt || nextData.delivery.lastExportedAt,
    lastPublishedAt:
      stage === "published"
        ? binding.lastDeployReadyAt || binding.lastDeployRequestedAt || nextData.delivery.lastPublishedAt
        : nextData.delivery.lastPublishedAt,
    history: [
      {
        id: localId(),
        ts: nowIso(),
        stage,
        channel: "vercel",
        title: noteTitle,
        note,
      },
      ...nextData.delivery.history,
    ].slice(0, HISTORY_LIMIT),
  };
}

router.get("/connection", async (req, res) => {
  try {
    const record = await requireConnectionRecord(req.user.id);
    return res.json({ connection: record.summary });
  } catch (error) {
    return res.status(503).json({ error: error?.message || "vercel_connection_unavailable" });
  }
});

router.put("/connection", async (req, res) => {
  try {
    const body = ConnectionBodySchema.parse(req.body || {});
    const vercelUser = await getVercelAuthenticatedUser(body.personalAccessToken);
    const teams = await listVercelTeams(body.personalAccessToken);

    const payload = {
      encryptedToken: encryptVercelToken(body.personalAccessToken),
      id: vercelUser.id,
      username: vercelUser.username,
      email: vercelUser.email,
      name: vercelUser.name,
      avatarUrl: vercelUser.avatarUrl,
      defaultTeamId: teams[0]?.id || null,
      defaultTeamSlug: teams[0]?.slug || null,
      teams,
      updatedAt: nowIso(),
    };

    await saveConnectionRecord(req.user.id, payload);
    recordProductEvent({
      event: "vercel.connection.saved",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "vercel.connection.put", status: "success" },
    });

    return res.json({ connection: sanitizeConnectionRecord(payload) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(res, "Token Vercel inválido", error.flatten());
    }
    if (error instanceof VercelApiError) {
      return handleVercelError(res, error, "Não foi possível validar o token Vercel.");
    }
    return res.status(503).json({ error: error?.message || "vercel_connection_failed" });
  }
});

router.delete("/connection", async (req, res) => {
  try {
    await clearConnectionRecord(req.user.id);
    recordProductEvent({
      event: "vercel.connection.removed",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "vercel.connection.delete", status: "success" },
    });
    return res.json({ ok: true, connection: sanitizeConnectionRecord(null) });
  } catch (error) {
    return res.status(503).json({ error: error?.message || "vercel_connection_delete_failed" });
  }
});

router.post("/projects/:id/workspace", async (req, res) => {
  try {
    const body = WorkspaceBodySchema.parse(req.body || {});
    const project = await readProjectForUser(req, req.params.id);
    if (!project) return notFound(res);

    const connection = await requireConnectionRecord(req.user.id);
    if (!connection.token) {
      return res.status(412).json({
        error: "vercel_connection_required",
        message: "Conecte um token Vercel com acesso ao projeto antes de salvar o workspace pelo backend.",
      });
    }

    const team = await resolveVercelTeam({
      token: connection.token,
      teamSlug: body.teamSlug || "",
    });
    const projectName = normalizeProjectName(body.projectName);
    const framework = body.framework === "vite" ? "vite" : body.framework === "static" ? "static" : "nextjs";
    const rootDirectory = normalizeRootDirectory(body.rootDirectory, framework);
    const target = body.target === "production" ? "production" : "preview";

    const vercelProject = await getVercelProject({
      token: connection.token,
      projectName,
      teamId: team?.id || null,
    });

    const nextData = ensureVercelState(project.data);
    const previousBinding = nextData.integrations.vercel.binding || null;
    const nextBinding = buildBinding({
      previousBinding,
      projectInfo: vercelProject,
      team,
      framework,
      rootDirectory,
      target,
    });

    nextData.integrations.vercel.binding = nextBinding;
    nextData.integrations.vercel.lastDeploymentCheckedAt = nowIso();
    pushHistory(nextData, {
      type: "workspace_saved",
      stage: nextBinding.lastDeploymentId ? "exported" : "draft",
      title: "Workspace Vercel verificado",
      note: `Projeto ${nextBinding.projectName} validado no backend${team?.slug ? ` em ${team.slug}` : ""}.`,
    });
    syncDeliveryFromBinding(
      nextData,
      nextBinding,
      "Workspace Vercel reconciliado",
      nextBinding.lastDeploymentId
        ? `Último deployment ${nextBinding.lastDeploymentState || "desconhecido"} em ${nextBinding.lastDeploymentTarget || "preview"}.`
        : "Workspace salvo sem deployment ativo ainda."
    );
    nextData.deliverable = {
      ...nextData.deliverable,
      nextAction: nextBinding.lastDeploymentId
        ? "Revise o status do deployment na Vercel antes de tratar a saída como concluída."
        : "Solicite o primeiro deployment para transformar a base Vercel em trilha operacional real.",
    };

    const item = await persistProjectData(req, project.id, nextData);
    if (nextBinding.lastDeploymentId) {
      await saveDeploymentRecord(nextBinding.lastDeploymentId, {
        projectId: project.id,
        userId: req.user.id,
        provider: "vercel",
        teamId: nextBinding.teamId || null,
        projectName: nextBinding.projectName,
        target: nextBinding.lastDeploymentTarget || nextBinding.target,
        updatedAt: nowIso(),
      });
    }
    recordProductEvent({
      event: "vercel.workspace.saved",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "vercel.workspace.post", status: "success" },
    });

    return res.json({
      item,
      workspace: nextBinding,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(res, "Workspace Vercel inválido", error.flatten());
    }
    return handleVercelError(res, error, "Não foi possível validar o workspace Vercel.");
  }
});

router.delete("/projects/:id/workspace", async (req, res) => {
  try {
    const project = await readProjectForUser(req, req.params.id);
    if (!project) return notFound(res);

    const nextData = ensureVercelState(project.data);
    nextData.integrations.vercel.binding = null;
    nextData.integrations.vercel.lastDeploymentCheckedAt = nowIso();
    pushHistory(nextData, {
      type: "status_updated",
      stage: "draft",
      title: "Workspace Vercel removido",
      note: "O vínculo com o projeto Vercel foi removido do source of truth do projeto.",
    });

    const item = await persistProjectData(req, project.id, nextData);
    recordProductEvent({
      event: "vercel.workspace.cleared",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "vercel.workspace.delete", status: "success" },
    });

    return res.json({ item });
  } catch (error) {
    return res.status(400).json({ error: error?.message || "vercel_workspace_clear_failed" });
  }
});

router.post("/projects/:id/deploy", async (req, res) => {
  try {
    const project = await readProjectForUser(req, req.params.id);
    if (!project) return notFound(res);

    const nextData = ensureVercelState(project.data);
    const binding = nextData.integrations.vercel.binding;
    if (!binding?.projectName) {
      return badRequest(res, "Salve o workspace Vercel no projeto antes de solicitar um deploy.");
    }

    const connection = await requireConnectionRecord(req.user.id);
    if (!connection.token) {
      return res.status(412).json({
        error: "vercel_connection_required",
        message: "Conecte um token Vercel com acesso ao projeto antes de solicitar o deploy pelo backend.",
      });
    }

    const vercelProject = await getVercelProject({
      token: connection.token,
      projectName: binding.projectName,
      teamId: binding.teamId || null,
    });

    const repoId = vercelProject.link?.repoId;
    if (!repoId || vercelProject.link?.type !== "github") {
      return res.status(412).json({
        error: "vercel_project_link_required",
        message: "O projeto Vercel precisa estar ligado a um repositório GitHub para o backend disparar deployments reais.",
      });
    }

    const githubBinding = nextData.integrations?.github?.binding || null;
    const deployRef =
      asText(githubBinding?.branch) ||
      asText(binding.lastDeploymentRef) ||
      asText(vercelProject.link?.productionBranch);

    if (!deployRef) {
      return res.status(412).json({
        error: "vercel_source_ref_required",
        message: "Não foi possível resolver a branch do deployment. Vincule o projeto ao GitHub ou configure a branch principal na Vercel.",
      });
    }

    const deployment = await createVercelDeployment({
      token: connection.token,
      teamId: binding.teamId || null,
      projectName: binding.projectName,
      target: binding.target === "production" ? "production" : "preview",
      repoId,
      ref: deployRef,
      sha: asText(githubBinding?.lastCommitSha) || asText(githubBinding?.lastResolvedCommitSha) || null,
    });
    const observedAt = nowIso();

    const nextBinding = {
      ...binding,
      deployStatus: deriveDeployStatus({
        lastDeploymentState: deployment?.readyState,
        lastDeploymentTarget: deployment?.target,
        productionUrl: deployment?.target === "production" && deployment?.readyState === "READY" ? deployment?.url : binding.productionUrl,
        previewUrl: deployment?.target !== "production" && deployment?.readyState === "READY" ? deployment?.url : binding.previewUrl,
      }),
      previewUrl:
        deployment?.target === "preview" && deployment?.readyState === "READY"
          ? deployment?.url || binding.previewUrl
          : binding.previewUrl,
      productionUrl:
        deployment?.target === "production" && deployment?.readyState === "READY"
          ? deployment?.url || binding.productionUrl
          : binding.productionUrl,
      updatedAt: observedAt,
      lastDeploymentId: deployment?.id || null,
      lastDeploymentUrl: deployment?.url || null,
      lastDeploymentInspectorUrl: deployment?.inspectorUrl || null,
      lastDeploymentState: deployment?.readyState || "UNKNOWN",
      lastDeploymentTarget: deployment?.target || binding.target,
      lastDeploymentRef: deployRef,
      lastDeployRequestedAt: deployment?.createdAt || observedAt,
      lastDeployReadyAt: deployment?.readyState === "READY" ? deployment?.readyAt || observedAt : null,
      lastDeployError: deployment?.readyState === "ERROR" ? deployment?.errorMessage || "vercel_deployment_failed" : null,
      linkedRepoId: String(repoId),
      linkedRepoType: vercelProject.link?.type || "github",
      lastVerifiedAt: observedAt,
      verificationStatus: "verified",
      tokenConfigured: true,
      publishMachine: resolveVercelPublishMachine({
        previousMachine: binding.publishMachine || null,
        hasWorkspace: true,
        deploymentId: deployment?.id || null,
        deploymentState: deployment?.readyState || null,
        deploymentTarget: deployment?.target || binding.target,
        deploymentUrl: deployment?.url || null,
        errorMessage: deployment?.readyState === "ERROR" ? deployment?.errorMessage || "vercel_deployment_failed" : null,
        source: "deployment_request",
        eventType: "deployment_requested",
        observedAt,
      }),
    };

    nextData.integrations.vercel.binding = nextBinding;
    nextData.integrations.vercel.lastDeploymentCheckedAt = observedAt;
    pushHistory(nextData, {
      type: deployment?.readyState === "READY" ? "deployment_ready" : "deployment_requested",
      stage: deployment?.readyState === "READY" && deployment?.target === "production" ? "published" : "exported",
      title: deployment?.readyState === "READY" ? "Deployment Vercel pronto" : "Deployment Vercel solicitado",
      note:
        deployment?.readyState === "READY"
          ? `Deployment ${deployment.id} pronto em ${deployment.url || "URL pendente"}.`
          : `Deployment ${deployment?.id || "pendente"} iniciado para ${binding.target} usando a branch ${deployRef}.`,
    });
    syncDeliveryFromBinding(
      nextData,
      nextBinding,
      deployment?.readyState === "READY" ? "Deployment Vercel pronto" : "Deployment Vercel solicitado",
      deployment?.readyState === "READY"
        ? `Deployment ${deployment.id} confirmado em ${deployment.url || "URL pendente"}.`
        : `Deployment ${deployment?.id || "pendente"} aguardando retorno da Vercel.`
    );
    nextData.deliverable = {
      ...nextData.deliverable,
      nextAction:
        deployment?.readyState === "READY" && deployment?.target === "production"
          ? "Publicação confirmada pela Vercel. Revise a URL final e siga para a próxima iteração apenas quando necessário."
          : "Acompanhe o status do deployment na Vercel e reconcilie o projeto até o estado READY.",
    };

    const item = await persistProjectData(req, project.id, nextData);
    if (nextBinding.lastDeploymentId) {
      await saveDeploymentRecord(nextBinding.lastDeploymentId, {
        projectId: project.id,
        userId: req.user.id,
        provider: "vercel",
        teamId: nextBinding.teamId || null,
        projectName: nextBinding.projectName,
        target: nextBinding.lastDeploymentTarget || nextBinding.target,
        ref: nextBinding.lastDeploymentRef || null,
        updatedAt: observedAt,
      });
    }
    recordProductEvent({
      event: "vercel.deploy.requested",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "vercel.deploy.post", status: deployment?.readyState === "READY" ? "ready" : "pending" },
    });

    return res.json({
      item,
      deployment,
    });
  } catch (error) {
    return handleVercelError(res, error, "Não foi possível solicitar o deployment na Vercel.");
  }
});

router.post("/projects/:id/reconcile", async (req, res) => {
  try {
    const project = await readProjectForUser(req, req.params.id);
    if (!project) return notFound(res);

    const nextData = ensureVercelState(project.data);
    const binding = nextData.integrations.vercel.binding;
    if (!binding?.projectName || !binding?.lastDeploymentId) {
      return badRequest(res, "Ainda não existe deployment Vercel para reconciliar neste projeto.");
    }

    const connection = await requireConnectionRecord(req.user.id);
    if (!connection.token) {
      return res.status(412).json({
        error: "vercel_connection_required",
        message: "Conecte um token Vercel com acesso ao projeto antes de reconciliar o deployment pelo backend.",
      });
    }

    const deployment = await getVercelDeployment({
      token: connection.token,
      deploymentId: binding.lastDeploymentId,
      teamId: binding.teamId || null,
    });
    const observedAt = nowIso();

    const nextBinding = {
      ...binding,
      deployStatus: deriveDeployStatus({
        lastDeploymentState: deployment?.readyState,
        lastDeploymentTarget: deployment?.target,
        productionUrl:
          deployment?.target === "production" && deployment?.readyState === "READY"
            ? deployment?.url || binding.productionUrl
            : binding.productionUrl,
        previewUrl:
          deployment?.target === "preview" && deployment?.readyState === "READY"
            ? deployment?.url || binding.previewUrl
            : binding.previewUrl,
      }),
      previewUrl:
        deployment?.target === "preview" && deployment?.readyState === "READY"
          ? deployment?.url || binding.previewUrl
          : binding.previewUrl,
      productionUrl:
        deployment?.target === "production" && deployment?.readyState === "READY"
          ? deployment?.url || binding.productionUrl
          : binding.productionUrl,
      updatedAt: observedAt,
      lastDeploymentUrl: deployment?.url || binding.lastDeploymentUrl || null,
      lastDeploymentInspectorUrl: deployment?.inspectorUrl || binding.lastDeploymentInspectorUrl || null,
      lastDeploymentState: deployment?.readyState || binding.lastDeploymentState || "UNKNOWN",
      lastDeploymentTarget: deployment?.target || binding.lastDeploymentTarget || binding.target,
      lastDeployReadyAt:
        deployment?.readyState === "READY"
          ? deployment?.readyAt || observedAt
          : binding.lastDeployReadyAt || null,
      lastDeployError: deployment?.readyState === "ERROR" ? deployment?.errorMessage || "vercel_deployment_failed" : null,
      lastVerifiedAt: observedAt,
      verificationStatus: "verified",
      tokenConfigured: true,
      publishMachine: resolveVercelPublishMachine({
        previousMachine: binding.publishMachine || null,
        hasWorkspace: true,
        deploymentId: binding.lastDeploymentId,
        deploymentState: deployment?.readyState || binding.lastDeploymentState || null,
        deploymentTarget: deployment?.target || binding.lastDeploymentTarget || binding.target,
        deploymentUrl: deployment?.url || binding.lastDeploymentUrl || null,
        errorMessage: deployment?.readyState === "ERROR" ? deployment?.errorMessage || "vercel_deployment_failed" : null,
        source: "provider_poll",
        eventType: "deployment_reconciled",
        observedAt,
      }),
    };

    nextData.integrations.vercel.binding = nextBinding;
    nextData.integrations.vercel.lastDeploymentCheckedAt = observedAt;

    const isFailure = nextBinding.lastDeploymentState === "ERROR" || nextBinding.lastDeploymentState === "CANCELED";
    const isReady = nextBinding.lastDeploymentState === "READY";

    pushHistory(nextData, {
      type: isFailure ? "deployment_failed" : isReady ? "deployment_ready" : "deployment_reconciled",
      stage: isReady && nextBinding.lastDeploymentTarget === "production" ? "published" : nextBinding.lastDeploymentId ? "exported" : "draft",
      title: isFailure ? "Deployment Vercel falhou" : isReady ? "Deployment Vercel confirmado" : "Deployment Vercel reconciliado",
      note: isFailure
        ? nextBinding.lastDeployError || "A Vercel devolveu falha para este deployment."
        : isReady
          ? `Deployment ${nextBinding.lastDeploymentId} confirmado em ${nextBinding.lastDeploymentUrl || "URL pendente"}.`
          : `Deployment ${nextBinding.lastDeploymentId} segue em ${nextBinding.lastDeploymentState || "estado desconhecido"}.`,
    });
    syncDeliveryFromBinding(
      nextData,
      nextBinding,
      isFailure ? "Deployment Vercel falhou" : isReady ? "Deployment Vercel confirmado" : "Deployment Vercel em andamento",
      isFailure
        ? nextBinding.lastDeployError || "A Vercel devolveu falha para este deployment."
        : isReady
          ? `Deployment ${nextBinding.lastDeploymentId} confirmado em ${nextBinding.lastDeploymentUrl || "URL pendente"}.`
          : `Deployment ${nextBinding.lastDeploymentId} segue em ${nextBinding.lastDeploymentState || "estado desconhecido"}.`
    );
    nextData.deliverable = {
      ...nextData.deliverable,
      nextAction: isFailure
        ? "Revise o erro do deployment, ajuste a fonte do projeto e tente novamente."
        : isReady && nextBinding.lastDeploymentTarget === "production"
          ? "Publicação confirmada pela Vercel. Só trate a saída como final quando a URL publicada estiver correta."
          : "O deploy continua em andamento. Reconcile novamente até o estado READY.",
    };

    const item = await persistProjectData(req, project.id, nextData);
    if (nextBinding.lastDeploymentId) {
      await saveDeploymentRecord(nextBinding.lastDeploymentId, {
        projectId: project.id,
        userId: req.user.id,
        provider: "vercel",
        teamId: nextBinding.teamId || null,
        projectName: nextBinding.projectName,
        target: nextBinding.lastDeploymentTarget || nextBinding.target,
        ref: nextBinding.lastDeploymentRef || null,
        updatedAt: observedAt,
      });
    }
    recordProductEvent({
      event: "vercel.deploy.reconciled",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "vercel.reconcile.post", status: nextBinding.lastDeploymentState || "unknown" },
    });

    return res.json({
      item,
      deployment,
    });
  } catch (error) {
    return handleVercelError(res, error, "Não foi possível reconciliar o deployment na Vercel.");
  }
});

export default router;
