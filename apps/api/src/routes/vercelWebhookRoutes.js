import crypto from "crypto";
import express from "express";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { recordProductEvent } from "../utils/eventsStore.js";
import { applyPublishSourceOfTruth } from "../utils/publishSourceOfTruth.js";
import { nowIso } from "../utils/vercelPublishMachine.js";
import {
  buildVercelDeploymentRecord,
  isVercelDeploymentFailure,
  isVercelDeploymentReady,
  reconcileVercelBinding,
} from "../utils/vercelReconciliation.js";

const router = express.Router();

const DEPLOYMENT_PREFIX = "vercel_deployment:";
const EVENT_PREFIX = "vercel_webhook_event:";
const HISTORY_LIMIT = 16;

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function localId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function cloneJson(value) {
  if (!value || typeof value !== "object") return {};
  return JSON.parse(JSON.stringify(value));
}

function normalizeExternalUrl(value) {
  const raw = asText(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

function normalizeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  const text = asText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeTarget(value) {
  return asText(value) === "production" ? "production" : "preview";
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

function eventKey(eventId) {
  return `${EVENT_PREFIX}${String(eventId || "").trim()}`;
}

function deploymentKey(deploymentId) {
  return `${DEPLOYMENT_PREFIX}${String(deploymentId || "").trim()}`;
}

function getWebhookSecret() {
  return asText(process.env.VERCEL_WEBHOOK_SECRET || process.env.VERCEL_INTEGRATION_SECRET);
}

function timingSafeMatch(expected, candidate) {
  const left = Buffer.from(expected);
  const right = Buffer.from(candidate);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  const incoming = asText(signatureHeader);
  if (!incoming || !secret) return false;
  const digest = crypto.createHmac("sha1", secret).update(rawBody).digest("hex");
  return (
    timingSafeMatch(incoming, digest) ||
    timingSafeMatch(incoming, `sha1=${digest}`)
  );
}

function readJsonBuffer(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer || "");
  return JSON.parse(text);
}

function webhookDeploymentState(eventType, explicitState) {
  const normalized = asText(explicitState).toUpperCase();
  if (normalized) return normalized;

  const type = asText(eventType).toLowerCase();
  if (type.includes("deployment.error")) return "ERROR";
  if (type.includes("deployment.canceled")) return "CANCELED";
  if (type.includes("deployment.ready") || type.includes("deployment.succeeded") || type.includes("deployment.promoted")) return "READY";
  if (type.includes("deployment.created")) return "QUEUED";
  return "UNKNOWN";
}

function extractWebhookObservation(body) {
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : body;
  const deploymentSource = payload?.deployment && typeof payload.deployment === "object" ? payload.deployment : payload;
  const eventType = asText(body?.type || body?.event || payload?.type);
  const deploymentId = asText(
    deploymentSource?.id ||
      payload?.deploymentId ||
      payload?.deployment_id
  );
  const target = normalizeTarget(
    deploymentSource?.target ||
      payload?.target ||
      payload?.environment
  );
  const deploymentUrl =
    normalizeExternalUrl(deploymentSource?.url) ||
    normalizeExternalUrl(payload?.url) ||
    null;
  const inspectorUrl =
    normalizeExternalUrl(deploymentSource?.inspectorUrl || deploymentSource?.inspector_url) ||
    normalizeExternalUrl(payload?.inspectorUrl) ||
    null;
  const state = webhookDeploymentState(eventType, deploymentSource?.readyState || deploymentSource?.state || payload?.readyState || payload?.state);
  const observedAt =
    normalizeTimestamp(body?.createdAt) ||
    normalizeTimestamp(payload?.createdAt) ||
    normalizeTimestamp(deploymentSource?.readyAt) ||
    normalizeTimestamp(deploymentSource?.createdAt) ||
    nowIso();

  return {
    eventId: asText(body?.id || payload?.id),
    eventType,
    deployment: {
      id: deploymentId || null,
      url: deploymentUrl,
      inspectorUrl,
      readyState: state,
      target,
      createdAt: normalizeTimestamp(deploymentSource?.createdAt) || observedAt,
      readyAt: normalizeTimestamp(deploymentSource?.readyAt || payload?.readyAt) || (state === "READY" ? observedAt : null),
      errorMessage:
        asText(deploymentSource?.errorMessage) ||
        asText(deploymentSource?.error?.message) ||
        asText(payload?.errorMessage) ||
        null,
    },
    project: {
      id: asText(payload?.project?.id || deploymentSource?.projectId),
      name: asText(payload?.project?.name || deploymentSource?.name || payload?.name),
      teamId: asText(payload?.team?.id || payload?.teamId),
      teamSlug: asText(payload?.team?.slug || payload?.teamSlug),
    },
    observedAt,
  };
}

async function readConfigValue(key) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) throw new Error("supabase_admin_unavailable");
  const { data, error } = await supabaseAdmin.from("configs").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message || "config_read_failed");
  return data?.value ?? null;
}

async function saveConfigValue(key, value) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) throw new Error("supabase_admin_unavailable");
  const { error } = await supabaseAdmin
    .from("configs")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw new Error(error.message || "config_write_failed");
}

async function findProjectByDeploymentId(deploymentId) {
  if (!deploymentId) return null;

  const mapped = await readConfigValue(deploymentKey(deploymentId));
  const mappedProjectId = asText(mapped?.projectId);
  if (mappedProjectId) {
    const { data, error } = await supabaseAdmin.from("projects").select("*").eq("id", mappedProjectId).maybeSingle();
    if (!error && data) return data;
  }

  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) throw new Error(error.message || "project_scan_failed");

  return (data || []).find((project) => {
    const binding = project?.data?.integrations?.vercel?.binding;
    return asText(binding?.lastDeploymentId) === deploymentId;
  }) || null;
}

async function persistProject(projectId, nextData) {
  const persistedData = applyPublishSourceOfTruth(nextData);
  const { data, error } = await supabaseAdmin
    .from("projects")
    .update({ data: persistedData })
    .eq("id", projectId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message || "project_save_failed");
  return data || null;
}

router.post("/deployment", express.raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = getWebhookSecret();
  if (!webhookSecret) {
    return res.status(503).json({ error: "vercel_webhook_not_configured" });
  }

  const signature = typeof req.headers["x-vercel-signature"] === "string" ? req.headers["x-vercel-signature"] : "";
  if (!verifyWebhookSignature(req.body, signature, webhookSecret)) {
    return res.status(400).json({ error: "vercel_webhook_invalid_signature" });
  }

  let parsed;
  try {
    parsed = readJsonBuffer(req.body);
  } catch {
    return res.status(400).json({ error: "vercel_webhook_invalid_json" });
  }

  const observation = extractWebhookObservation(parsed);
  if (!observation.deployment.id) {
    return res.status(400).json({ error: "vercel_webhook_missing_deployment_id" });
  }

  const dedupeId = observation.eventId || `${observation.eventType}:${observation.deployment.id}:${observation.observedAt}`;

  try {
    const existingEvent = await readConfigValue(eventKey(dedupeId));
    if (existingEvent) {
      return res.status(200).json({ ok: true, replay: true });
    }

    const project = await findProjectByDeploymentId(observation.deployment.id);
    if (!project) {
      await saveConfigValue(eventKey(dedupeId), {
        deploymentId: observation.deployment.id,
        eventType: observation.eventType,
        status: "ignored",
        reason: "deployment_mapping_not_found",
        processedAt: nowIso(),
      });
      return res.status(202).json({ ok: true, ignored: "deployment_mapping_not_found" });
    }

    const nextData = ensureVercelState(project.data);
    const binding = nextData.integrations.vercel.binding;
    if (!binding?.projectName) {
      await saveConfigValue(eventKey(dedupeId), {
        deploymentId: observation.deployment.id,
        eventType: observation.eventType,
        status: "ignored",
        reason: "vercel_binding_missing",
        processedAt: nowIso(),
        projectId: project.id,
      });
      return res.status(202).json({ ok: true, ignored: "vercel_binding_missing" });
    }

    const nextBinding = reconcileVercelBinding({
      previousBinding: binding,
      deployment: observation.deployment,
      observedAt: observation.observedAt,
      source: "provider_webhook",
      eventType: observation.eventType || "deployment.webhook",
      projectId: binding.projectId || observation.project.id || null,
      projectName: binding.projectName || observation.project.name || "",
      teamId: binding.teamId || observation.project.teamId || null,
      teamSlug: binding.teamSlug || observation.project.teamSlug || "",
      framework: binding.framework,
      rootDirectory: binding.rootDirectory,
      target: binding.target,
      projectUrl: binding.projectUrl || null,
      linkedRepoId: binding.linkedRepoId || null,
      linkedRepoType: binding.linkedRepoType || null,
      deploymentRef: binding.lastDeploymentRef || null,
      previewUrl: binding.previewUrl,
      productionUrl: binding.productionUrl,
    });

    nextData.integrations.vercel.binding = nextBinding;
    nextData.integrations.vercel.lastDeploymentCheckedAt = observation.observedAt;

    const isFailure = isVercelDeploymentFailure(nextBinding);
    const isReady = isVercelDeploymentReady(nextBinding);
    nextData.integrations.vercel.history = [
      buildVercelEvent({
        type: isFailure ? "deployment_failed" : isReady ? "deployment_ready" : "deployment_reconciled",
        stage: isReady && nextBinding.lastDeploymentTarget === "production" ? "published" : "exported",
        title: isFailure
          ? "Deployment Vercel falhou via webhook"
          : isReady
            ? "Deployment Vercel confirmado via webhook"
            : "Deployment Vercel reconciliado via webhook",
        note: nextBinding.publishMachine?.note || "Webhook Vercel processado.",
      }),
      ...nextData.integrations.vercel.history,
    ].slice(0, HISTORY_LIMIT);

    syncDeliveryFromBinding(
      nextData,
      nextBinding,
      isFailure ? "Deployment Vercel falhou" : isReady ? "Deployment Vercel confirmado" : "Deployment Vercel em progresso",
      nextBinding.publishMachine?.note || "Webhook Vercel processado."
    );

    nextData.deliverable = {
      ...nextData.deliverable,
      nextAction: isFailure
        ? "A Vercel confirmou falha. Corrija a fonte do projeto e dispare novo deployment só depois do ajuste."
        : isReady && nextBinding.lastDeploymentTarget === "production"
          ? "Publicação confirmada externamente pela Vercel. Trate a URL final como source of truth."
          : isReady
            ? "Preview confirmado pela Vercel. Promova para produção só quando o resultado final estiver correto."
            : "O deployment continua ativo. Use polling como fallback até a Vercel devolver um estado terminal.",
    };

    await persistProject(project.id, nextData);
    const deploymentRecord = buildVercelDeploymentRecord({
      projectId: project.id,
      userId: project.user_id,
      binding: nextBinding,
      observedAt: observation.observedAt,
    });
    if (deploymentRecord) {
      await saveConfigValue(deploymentKey(observation.deployment.id), deploymentRecord);
    }
    await saveConfigValue(eventKey(dedupeId), {
      deploymentId: observation.deployment.id,
      eventType: observation.eventType || "deployment.webhook",
      status: "processed",
      processedAt: nowIso(),
      projectId: project.id,
      machineState: nextBinding.publishMachine?.state || null,
    });

    recordProductEvent({
      event: "vercel.deploy.webhook_reconciled",
      userId: project.user_id || null,
      plan: null,
      additional: {
        source: "vercel.webhook.deployment",
        status: nextBinding.publishMachine?.state || nextBinding.lastDeploymentState || "unknown",
      },
    });

    return res.status(200).json({
      ok: true,
      projectId: project.id,
      deploymentId: observation.deployment.id,
      publishState: nextBinding.publishMachine?.state || null,
    });
  } catch (error) {
    await saveConfigValue(eventKey(dedupeId), {
      deploymentId: observation.deployment.id,
      eventType: observation.eventType || "deployment.webhook",
      status: "failed",
      processedAt: nowIso(),
      error: error?.message || "vercel_webhook_processing_failed",
    }).catch(() => {});

    return res.status(500).json({
      error: "vercel_webhook_processing_failed",
      details: error?.message || null,
    });
  }
});

export default router;
