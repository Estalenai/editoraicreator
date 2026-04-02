const VERCEL_API_BASE = "https://api.vercel.com";

export class VercelApiError extends Error {
  constructor(message, { status = 500, code = "vercel_error", details = null } = {}) {
    super(message);
    this.name = "VercelApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildHeaders(token, extra = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "Editor-AI-Creator",
    ...extra,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function normalizeExternalUrl(value) {
  const raw = asText(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

function normalizeDeploymentState(value) {
  const normalized = asText(value).toUpperCase();
  return normalized || "UNKNOWN";
}

async function parsePayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function vercelRequest(path, { token = null, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${VERCEL_API_BASE}${path}`, {
    method,
    headers: buildHeaders(token, headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parsePayload(response);

  if (!response.ok) {
    const fallbackMessage =
      asText(payload?.error?.message) ||
      asText(payload?.message) ||
      asText(payload?.error?.code) ||
      "vercel_request_failed";
    throw new VercelApiError(fallbackMessage, {
      status: response.status,
      code: asText(payload?.error?.code) || fallbackMessage,
      details: payload,
    });
  }

  return {
    data: payload,
    headers: response.headers,
    status: response.status,
  };
}

function normalizeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const text = asText(value);
  return text || null;
}

export function normalizeVercelDeployment(data) {
  if (!data || typeof data !== "object") return null;

  return {
    id: asText(data.id) || null,
    url: normalizeExternalUrl(data.url),
    inspectorUrl: normalizeExternalUrl(data.inspectorUrl || data.inspector_url),
    readyState: normalizeDeploymentState(data.readyState || data.state),
    target: asText(data.target) === "production" ? "production" : "preview",
    createdAt: normalizeTimestamp(data.createdAt),
    readyAt: normalizeTimestamp(data.ready || data.readyAt),
    errorMessage:
      asText(data.errorMessage) ||
      asText(data.readyStateReason) ||
      asText(data.error?.message) ||
      null,
    alias: Array.isArray(data.alias) ? data.alias.map((item) => normalizeExternalUrl(item)).filter(Boolean) : [],
  };
}

export async function getVercelAuthenticatedUser(token) {
  const { data } = await vercelRequest("/v2/user", { token });
  const user = data?.user && typeof data.user === "object" ? data.user : data;
  return {
    id: asText(user?.id) || null,
    username: asText(user?.username || user?.handle) || null,
    email: asText(user?.email) || null,
    name: asText(user?.name || user?.username || user?.email) || null,
    avatarUrl: normalizeExternalUrl(user?.avatar || user?.avatarUrl),
  };
}

export async function listVercelTeams(token) {
  const { data } = await vercelRequest("/v2/teams?limit=100", { token });
  const teams = Array.isArray(data?.teams) ? data.teams : Array.isArray(data) ? data : [];
  return teams
    .map((team) => ({
      id: asText(team?.id) || null,
      slug: asText(team?.slug) || null,
      name: asText(team?.name || team?.slug) || null,
      avatarUrl: normalizeExternalUrl(team?.avatar),
    }))
    .filter((team) => team.id || team.slug);
}

export async function resolveVercelTeam({ token, teamSlug }) {
  const requestedSlug = asText(teamSlug).replace(/^@+/, "");
  if (!requestedSlug) return null;

  const teams = await listVercelTeams(token);
  const match =
    teams.find((team) => String(team.slug || "").toLowerCase() === requestedSlug.toLowerCase()) ||
    teams.find((team) => String(team.name || "").toLowerCase() === requestedSlug.toLowerCase());

  if (!match) {
    throw new VercelApiError("Workspace Vercel não encontrado para este token.", {
      status: 404,
      code: "vercel_team_not_found",
      details: { requestedSlug },
    });
  }

  return match;
}

function normalizeProjectLink(link) {
  if (!link || typeof link !== "object") return null;
  return {
    type: asText(link.type) || null,
    repoId: link.repoId ?? link.projectId ?? null,
    repo: asText(link.repo || link.repoName) || null,
    org: asText(link.org || link.owner) || null,
    productionBranch: asText(link.productionBranch) || null,
  };
}

export async function getVercelProject({ token, projectName, teamId = null }) {
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const { data } = await vercelRequest(`/v9/projects/${encodeURIComponent(projectName)}${qs}`, { token });

  return {
    id: asText(data?.id) || null,
    name: asText(data?.name) || projectName,
    framework: asText(data?.framework) || null,
    rootDirectory: asText(data?.rootDirectory) || null,
    projectUrl: normalizeExternalUrl(data?.latestDeployments?.[0]?.url)
      ? null
      : null,
    link: normalizeProjectLink(data?.link),
    latestDeployments: Array.isArray(data?.latestDeployments)
      ? data.latestDeployments.map((item) => normalizeVercelDeployment(item)).filter(Boolean)
      : [],
  };
}

export async function createVercelDeployment({
  token,
  teamId = null,
  projectName,
  target = "preview",
  repoId,
  ref,
  sha = null,
}) {
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const body = {
    name: projectName,
    project: projectName,
    target,
    gitSource: {
      type: "github",
      projectId: String(repoId),
      ref,
      ...(sha ? { sha } : {}),
    },
  };

  const { data } = await vercelRequest(`/v13/deployments${qs}`, {
    token,
    method: "POST",
    body,
  });

  return normalizeVercelDeployment(data);
}

export async function getVercelDeployment({ token, deploymentId, teamId = null }) {
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const { data } = await vercelRequest(`/v13/deployments/${encodeURIComponent(deploymentId)}${qs}`, {
    token,
  });
  return normalizeVercelDeployment(data);
}
