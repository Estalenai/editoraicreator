const ACTIVE_PROVIDER_STATES = new Set(["QUEUED", "INITIALIZING", "BUILDING"]);
const FAILURE_PROVIDER_STATES = new Set(["ERROR", "CANCELED"]);
const SUCCESS_PROVIDER_STATE = "READY";
const MACHINE_VERSION = "vercel.publish-machine.v1";
const ACTIVE_CHECK_DELAY_MS = 15_000;

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeIso(value) {
  const text = asText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeVercelProviderState(value) {
  const normalized = asText(value).toUpperCase();
  if (normalized === "QUEUED") return "QUEUED";
  if (normalized === "INITIALIZING") return "INITIALIZING";
  if (normalized === "BUILDING") return "BUILDING";
  if (normalized === "READY") return "READY";
  if (normalized === "ERROR") return "ERROR";
  if (normalized === "CANCELED") return "CANCELED";
  return "UNKNOWN";
}

function buildNote({ state, target, deploymentId, deploymentUrl, errorMessage }) {
  if (state === "workspace_verified") {
    return "Workspace Vercel validado e pronto para o primeiro deployment.";
  }
  if (state === "deployment_requested") {
    return `Deployment ${deploymentId || "pendente"} solicitado e aguardando retorno externo.`;
  }
  if (state === "deployment_running") {
    return `Deployment ${deploymentId || "pendente"} segue em processamento na Vercel.`;
  }
  if (state === "deployment_ready") {
    return `Preview confirmado pela Vercel${deploymentUrl ? ` em ${deploymentUrl}` : ""}.`;
  }
  if (state === "published") {
    return `${target === "production" ? "Produção" : "Deployment"} confirmado pela Vercel${deploymentUrl ? ` em ${deploymentUrl}` : ""}.`;
  }
  if (state === "deployment_failed") {
    return errorMessage || "A Vercel devolveu falha para o último deployment.";
  }
  return "Sem publish ativo reconciliado ainda.";
}

function computeState({ hasWorkspace, deploymentId, providerState, target }) {
  if (!hasWorkspace) return "idle";
  if (!deploymentId) return "workspace_verified";
  if (FAILURE_PROVIDER_STATES.has(providerState)) return "deployment_failed";
  if (providerState === SUCCESS_PROVIDER_STATE && target === "production") return "published";
  if (providerState === SUCCESS_PROVIDER_STATE) return "deployment_ready";
  if (ACTIVE_PROVIDER_STATES.has(providerState)) return "deployment_running";
  return "deployment_requested";
}

function nextCheckAt(state, observedAt) {
  if (state !== "deployment_requested" && state !== "deployment_running") return null;
  const parsed = Date.parse(observedAt || "");
  const base = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(base + ACTIVE_CHECK_DELAY_MS).toISOString();
}

export function resolveVercelPublishMachine({
  previousMachine = null,
  hasWorkspace = false,
  deploymentId = null,
  deploymentState = null,
  deploymentTarget = null,
  deploymentUrl = null,
  errorMessage = null,
  source = "provider_poll",
  eventType = null,
  observedAt = nowIso(),
} = {}) {
  const externalState = normalizeVercelProviderState(deploymentState);
  const target = asText(deploymentTarget) === "production" ? "production" : "preview";
  const state = computeState({
    hasWorkspace,
    deploymentId: asText(deploymentId) || null,
    providerState: externalState,
    target,
  });

  const previous = previousMachine && typeof previousMachine === "object" ? previousMachine : {};
  const normalizedObservedAt = safeIso(observedAt) || nowIso();
  const lastTransitionAt =
    previous.state && previous.state === state
      ? safeIso(previous.lastTransitionAt) || normalizedObservedAt
      : normalizedObservedAt;

  return {
    version: MACHINE_VERSION,
    state,
    sourceOfTruth: state === "workspace_verified" || state === "idle" ? "backend" : "provider",
    reconcileMode: "webhook+poll",
    externalState: externalState === "UNKNOWN" ? null : externalState,
    confirmed: state === "deployment_ready" || state === "published" || state === "deployment_failed",
    terminal: state === "workspace_verified" || state === "deployment_ready" || state === "published" || state === "deployment_failed",
    retryable: state === "deployment_failed",
    lastSource: asText(source) || "provider_poll",
    lastEventType: asText(eventType) || null,
    lastTransitionAt,
    lastCheckedAt: normalizedObservedAt,
    lastWebhookAt:
      source === "provider_webhook" ? normalizedObservedAt : safeIso(previous.lastWebhookAt) || null,
    lastPollAt:
      source === "provider_poll" ? normalizedObservedAt : safeIso(previous.lastPollAt) || null,
    lastSuccessAt:
      state === "deployment_ready" || state === "published"
        ? normalizedObservedAt
        : safeIso(previous.lastSuccessAt) || null,
    lastFailureAt:
      state === "deployment_failed" ? normalizedObservedAt : safeIso(previous.lastFailureAt) || null,
    nextCheckAt: nextCheckAt(state, normalizedObservedAt),
    note: buildNote({
      state,
      target,
      deploymentId: asText(deploymentId) || null,
      deploymentUrl: asText(deploymentUrl) || null,
      errorMessage: asText(errorMessage) || null,
    }),
  };
}

export function isVercelPublishFailure(machine) {
  return asText(machine?.state) === "deployment_failed";
}

export function isVercelPublishPublished(machine) {
  return asText(machine?.state) === "published";
}

export function isVercelPublishReady(machine) {
  const state = asText(machine?.state);
  return state === "deployment_ready" || state === "published";
}

export function isVercelPublishActive(machine) {
  const state = asText(machine?.state);
  return state === "deployment_requested" || state === "deployment_running";
}
