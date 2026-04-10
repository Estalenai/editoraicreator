import { nowIso, resolveVercelPublishMachine } from "./vercelPublishMachine.js";

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeIso(value) {
  const text = asText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function pickFirstIso(...values) {
  for (const value of values) {
    const iso = safeIso(value);
    if (iso) return iso;
  }
  return null;
}

function normalizeTarget(value, fallback = "preview") {
  const normalized = asText(value);
  if (normalized === "production") return "production";
  if (normalized === "preview") return "preview";
  return fallback === "production" ? "production" : "preview";
}

export function buildVercelProjectUrl(teamSlug, projectName) {
  const project = asText(projectName);
  if (!project) return null;
  const teamSegment = asText(teamSlug);
  return teamSegment ? `https://vercel.com/${teamSegment}/${project}` : "https://vercel.com/dashboard";
}

export function deriveVercelDeployStatus({
  lastDeploymentState,
  lastDeploymentTarget,
  productionUrl,
  previewUrl,
}) {
  const state = asText(lastDeploymentState).toUpperCase();
  const target = asText(lastDeploymentTarget).toLowerCase();
  if ((state === "READY" && target === "production") || asText(productionUrl)) return "published";
  if (state && state !== "UNKNOWN") return "ready";
  if (asText(previewUrl)) return "ready";
  return "draft";
}

function sortDeploymentsDescending(deployments) {
  return [...deployments].sort((a, b) => {
    const left = Date.parse(a?.createdAt || "") || 0;
    const right = Date.parse(b?.createdAt || "") || 0;
    return right - left;
  });
}

export function summarizeLatestVercelDeployments(deployments) {
  const ordered = sortDeploymentsDescending((Array.isArray(deployments) ? deployments : []).filter(Boolean));
  const latest = ordered[0] || null;
  const latestPreview = ordered.find((item) => item.target !== "production") || null;
  const latestProduction = ordered.find((item) => item.target === "production") || null;
  return {
    latest,
    previewUrl: latestPreview?.url || null,
    productionUrl: latestProduction?.url || null,
  };
}

export function reconcileVercelBinding({
  previousBinding = null,
  deployment = null,
  observedAt = nowIso(),
  source = "provider_poll",
  eventType = null,
  projectId = null,
  projectName = null,
  teamId = null,
  teamSlug = "",
  framework = null,
  rootDirectory = null,
  target = null,
  projectUrl = null,
  linkedRepoId = null,
  linkedRepoType = null,
  deploymentRef = null,
  previewUrl = null,
  productionUrl = null,
}) {
  const previous = previousBinding && typeof previousBinding === "object" ? previousBinding : {};
  const normalizedObservedAt = pickFirstIso(observedAt, nowIso()) || nowIso();
  const hasWorkspace = Boolean(
    asText(projectName) || asText(previous.projectName) || asText(projectId) || asText(previous.projectId)
  );
  const nextTarget = normalizeTarget(
    deployment?.target || target || previous.lastDeploymentTarget || previous.target,
    previous.target || "preview"
  );
  const nextDeploymentId = asText(deployment?.id) || asText(previous.lastDeploymentId) || null;
  const deploymentChanged = Boolean(
    nextDeploymentId && nextDeploymentId !== asText(previous.lastDeploymentId)
  );
  const nextPreviewUrl =
    (nextTarget !== "production" && asText(deployment?.readyState).toUpperCase() === "READY" && asText(deployment?.url)) ||
    asText(previewUrl) ||
    asText(previous.previewUrl) ||
    "";
  const nextProductionUrl =
    (nextTarget === "production" && asText(deployment?.readyState).toUpperCase() === "READY" && asText(deployment?.url)) ||
    asText(productionUrl) ||
    asText(previous.productionUrl) ||
    "";
  const nextDeploymentState =
    asText(deployment?.readyState) || asText(previous.lastDeploymentState) || null;
  const nextDeploymentTarget =
    nextDeploymentId ? normalizeTarget(deployment?.target || previous.lastDeploymentTarget || nextTarget, nextTarget) : null;
  const nextDeploymentUrl =
    asText(deployment?.url) ||
    asText(previous.lastDeploymentUrl) ||
    (nextDeploymentTarget === "production" ? nextProductionUrl : nextPreviewUrl) ||
    null;
  const nextDeploymentInspectorUrl =
    asText(deployment?.inspectorUrl) || asText(previous.lastDeploymentInspectorUrl) || null;
  const nextDeployRequestedAt = nextDeploymentId
    ? pickFirstIso(
        deploymentChanged ? deployment?.createdAt : previous.lastDeployRequestedAt,
        deployment?.createdAt,
        previous.lastDeployRequestedAt,
        normalizedObservedAt
      )
    : null;
  const nextDeployReadyAt =
    asText(deployment?.readyState).toUpperCase() === "READY"
      ? pickFirstIso(deployment?.readyAt, normalizedObservedAt)
      : pickFirstIso(previous.lastDeployReadyAt);
  const nextDeployError =
    asText(deployment?.readyState).toUpperCase() === "ERROR" ||
    asText(deployment?.readyState).toUpperCase() === "CANCELED"
      ? asText(deployment?.errorMessage) || "vercel_deployment_failed"
      : null;
  const nextBinding = {
    ...previous,
    provider: "vercel",
    projectId: asText(projectId) || asText(previous.projectId) || null,
    projectName: asText(projectName) || asText(previous.projectName) || "",
    teamId: asText(teamId) || asText(previous.teamId) || null,
    teamSlug: asText(teamSlug) || asText(previous.teamSlug) || "",
    framework: framework || previous.framework || "nextjs",
    rootDirectory: asText(rootDirectory) || asText(previous.rootDirectory) || "",
    target: normalizeTarget(target || previous.target, previous.target || "preview"),
    deployStatus: deriveVercelDeployStatus({
      lastDeploymentState: nextDeploymentState,
      lastDeploymentTarget: nextDeploymentTarget,
      productionUrl: nextProductionUrl,
      previewUrl: nextPreviewUrl,
    }),
    previewUrl: nextPreviewUrl,
    productionUrl: nextProductionUrl,
    projectUrl:
      asText(projectUrl) ||
      asText(previous.projectUrl) ||
      buildVercelProjectUrl(asText(teamSlug) || asText(previous.teamSlug), asText(projectName) || asText(previous.projectName)),
    connectedAt: pickFirstIso(previous.connectedAt, normalizedObservedAt),
    updatedAt: normalizedObservedAt,
    lastVerifiedAt: normalizedObservedAt,
    lastReconciledAt: normalizedObservedAt,
    verificationStatus: "verified",
    tokenConfigured: true,
    linkedRepoId:
      linkedRepoId === undefined
        ? asText(previous.linkedRepoId) || null
        : asText(linkedRepoId) || null,
    linkedRepoType:
      linkedRepoType === undefined
        ? asText(previous.linkedRepoType) || null
        : asText(linkedRepoType) || null,
    lastDeploymentId: nextDeploymentId,
    lastDeploymentUrl: nextDeploymentUrl,
    lastDeploymentInspectorUrl: nextDeploymentInspectorUrl,
    lastDeploymentState: nextDeploymentState,
    lastDeploymentTarget: nextDeploymentTarget,
    lastDeploymentRef: asText(deploymentRef) || asText(previous.lastDeploymentRef) || null,
    lastDeployRequestedAt: nextDeployRequestedAt,
    lastDeployReadyAt: nextDeployReadyAt,
    lastDeployError: nextDeployError,
    lastDeploymentObservedAt: nextDeploymentId ? normalizedObservedAt : pickFirstIso(previous.lastDeploymentObservedAt),
  };

  nextBinding.publishMachine = resolveVercelPublishMachine({
    previousMachine: previous.publishMachine || null,
    hasWorkspace,
    deploymentId: nextDeploymentId,
    deploymentState: nextDeploymentState,
    deploymentTarget: nextDeploymentTarget || nextBinding.target,
    deploymentUrl: nextDeploymentUrl,
    errorMessage: nextDeployError,
    source,
    eventType,
    observedAt: normalizedObservedAt,
  });

  return nextBinding;
}

export function buildVercelDeploymentRecord({ projectId, userId, binding, observedAt = nowIso() }) {
  const deploymentId = asText(binding?.lastDeploymentId);
  if (!deploymentId) return null;
  const normalizedObservedAt = pickFirstIso(observedAt, nowIso()) || nowIso();
  return {
    projectId,
    userId,
    provider: "vercel",
    teamId: asText(binding?.teamId) || null,
    projectName: asText(binding?.projectName) || null,
    target: asText(binding?.lastDeploymentTarget || binding?.target) || null,
    ref: asText(binding?.lastDeploymentRef) || null,
    deploymentUrl: asText(binding?.lastDeploymentUrl) || null,
    deploymentState: asText(binding?.lastDeploymentState) || null,
    deployStatus: asText(binding?.deployStatus) || null,
    deploymentObservedAt: pickFirstIso(binding?.lastDeploymentObservedAt, normalizedObservedAt),
    reconciledAt: pickFirstIso(binding?.lastReconciledAt, normalizedObservedAt),
    updatedAt: normalizedObservedAt,
  };
}

export function isVercelDeploymentFailure(binding) {
  const state = asText(binding?.lastDeploymentState).toUpperCase();
  return state === "ERROR" || state === "CANCELED";
}

export function isVercelDeploymentReady(binding) {
  return asText(binding?.lastDeploymentState).toUpperCase() === "READY";
}
