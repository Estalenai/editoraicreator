import { supabase } from "./supabaseClient";
import { createIdempotencyKey } from "./idempotencyKey";
import { extractApiErrorMessage } from "./uiFeedback";
import type { NoCodeRuntimeSnapshot } from "./noCodeRuntime";
import { createClientRequestId, getClientSessionId, getCurrentClientRoute, reportFrontendEvent } from "./observability";

const DEV_DEFAULT_API_URL = "http://127.0.0.1:3000";
const DEV_FALLBACK_API_URL = "http://127.0.0.1:3100";
const PROD_PROXY_API_PREFIX = "/api-proxy";
const API_REQUEST_TIMEOUT_MS = 12000;
const IS_DEV = process.env.NODE_ENV !== "production";
const RAW_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "";

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function resolveDevApiBaseUrl(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  if (!value) return DEV_DEFAULT_API_URL;

  try {
    const parsed = new URL(value);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      return trimTrailingSlash(parsed.toString());
    }
    if (parsed.hostname === "127.0.0.1") {
      return trimTrailingSlash(parsed.toString());
    }
  } catch {
    // Ignore malformed dev overrides and fall back to the local API default.
  }

  return DEV_DEFAULT_API_URL;
}

function buildUrl(path: string, baseUrl: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

function isAbortLikeError(error: unknown) {
  return (
    error instanceof DOMException
      ? error.name === "AbortError" || error.name === "TimeoutError"
      : typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (String((error as { name?: unknown }).name) === "AbortError" ||
          String((error as { name?: unknown }).name) === "TimeoutError")
  );
}

function createRequestSignal(existingSignal?: AbortSignal | null, timeoutMs = API_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let releaseExistingAbort: (() => void) | null = null;

  const abortFromExistingSignal = () => {
    if (!controller.signal.aborted) {
      controller.abort(existingSignal?.reason ?? new DOMException("Request aborted", "AbortError"));
    }
  };

  if (existingSignal) {
    if (existingSignal.aborted) {
      abortFromExistingSignal();
    } else {
      existingSignal.addEventListener("abort", abortFromExistingSignal, { once: true });
      releaseExistingAbort = () => existingSignal.removeEventListener("abort", abortFromExistingSignal);
    }
  }

  timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException("Request timed out", "TimeoutError"));
    }
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      if (timeoutId) clearTimeout(timeoutId);
      releaseExistingAbort?.();
    },
  };
}

const PUBLIC_API_URL = IS_DEV ? resolveDevApiBaseUrl(RAW_PUBLIC_API_URL) : trimTrailingSlash(RAW_PUBLIC_API_URL);

export const API_URL = trimTrailingSlash(PUBLIC_API_URL || (IS_DEV ? DEV_DEFAULT_API_URL : PROD_PROXY_API_PREFIX));

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const method = String(options.method || "GET").toUpperCase();
  const { signal, cleanup } = createRequestSignal(options.signal);
  const requestId = createClientRequestId();
  const startedAt = Date.now();

  headers.set("X-Request-Id", requestId);
  if (typeof window !== "undefined") {
    headers.set("X-Client-Route", getCurrentClientRoute());
    headers.set("X-Client-Session-Id", getClientSessionId());
  }

  const requestOptions: RequestInit = {
    ...options,
    headers,
    signal,
  };
  if (!requestOptions.cache && (method === "GET" || method === "HEAD")) {
    requestOptions.cache = "no-store";
  }

  const primaryUrl = buildUrl(path, API_URL);

  try {
    return await fetch(primaryUrl, requestOptions);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (isAbortLikeError(error)) {
      reportFrontendEvent("frontend_api_failure", {
        requestId,
        path,
        method,
        durationMs,
        message: "A API demorou demais para responder.",
        phase: "primary_timeout",
      });
      throw new Error("A API demorou demais para responder.");
    }

    const canRetryInDev = IS_DEV && API_URL === DEV_DEFAULT_API_URL;
    if (canRetryInDev) {
      const fallbackUrl = buildUrl(path, DEV_FALLBACK_API_URL);
      const fallbackRequestOptions: RequestInit = {
        ...requestOptions,
        signal: undefined,
      };
      const fallbackSignalState = createRequestSignal(options.signal);
      fallbackRequestOptions.signal = fallbackSignalState.signal;
      try {
        return await fetch(fallbackUrl, fallbackRequestOptions);
      } catch (fallbackError) {
        const fallbackDurationMs = Date.now() - startedAt;
        if (isAbortLikeError(fallbackError)) {
          reportFrontendEvent("frontend_api_failure", {
            requestId,
            path,
            method,
            durationMs: fallbackDurationMs,
            message: "A API demorou demais para responder.",
            phase: "fallback_timeout",
          });
          throw new Error("A API demorou demais para responder.");
        }
        reportFrontendEvent("frontend_api_failure", {
          requestId,
          path,
          method,
          durationMs: fallbackDurationMs,
          message: "Não foi possível conectar com a API (3000/3100).",
          phase: "fallback_network_error",
        });
        throw new Error("Não foi possível conectar com a API (3000/3100).");
      } finally {
        fallbackSignalState.cleanup();
      }
    }

    reportFrontendEvent("frontend_api_failure", {
      requestId,
      path,
      method,
      durationMs,
      message: "Não foi possível conectar com a API.",
      phase: "primary_network_error",
    });
    throw new Error("Não foi possível conectar com a API.");
  } finally {
    cleanup();
  }
}

async function readJsonSafe(res: Response) {
  return res.json().catch(() => null);
}

function getSettledErrorMessage(result: PromiseSettledResult<any>, fallback: string) {
  if (result.status === "fulfilled") return "";
  const reason = result.reason;
  if (reason instanceof Error && reason.message.trim()) return reason.message.trim();
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  return fallback;
}

async function apiJson(path: string, options: RequestInit = {}) {
  const res = await apiFetch(path, options);
  const payload = await readJsonSafe(res);
  if (!res.ok) {
    const message = extractApiErrorMessage(payload, "Erro ao comunicar com a API");
    const requestId = res.headers.get("X-Request-Id") || undefined;
    reportFrontendEvent("frontend_api_failure", {
      requestId,
      path,
      method: String(options.method || "GET").toUpperCase(),
      statusCode: res.status,
      responseError: payload?.error || null,
      message,
      phase: "http_error",
    });
    const error = new Error(message) as Error & { requestId?: string; statusCode?: number };
    error.requestId = requestId;
    error.statusCode = res.status;
    throw error;
  }
  return payload;
}

async function getSessionAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function authJson(path: string, options: RequestInit = {}) {
  const token = await getSessionAccessToken();
  if (!token) throw new Error("Not authenticated");

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return apiJson(path, { ...options, headers });
}

async function getRequiredToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return session.access_token;
}

async function downloadWithAuth(path: string, filename: string) {
  const token = await getRequiredToken();
  const res = await apiFetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const payload = await readJsonSafe(res);
    throw new Error(payload?.error || "admin_export_failed");
  }

  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export const api = {
  async getDashboard(sessionOverride?: {
    accessToken?: string | null;
    user?: { id: string; email?: string | null } | null;
  }) {
    let accessToken = String(sessionOverride?.accessToken || "").trim();
    let user = sessionOverride?.user || null;

    if (!accessToken || !user?.id) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      accessToken = session.access_token;
      user = {
        id: session.user.id,
        email: session.user.email || "",
      };
    }

    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
    };

    const [subscription, balance, projects] = await Promise.allSettled([
      apiJson("/api/subscriptions/me", { headers: authHeaders }),
      apiJson("/api/coins/balance", { headers: authHeaders }),
      apiJson("/api/projects", { headers: authHeaders }),
    ]);

    if (projects.status !== "fulfilled") {
      throw new Error(getSettledErrorMessage(projects, "Falha ao carregar projetos."));
    }

    const planCode =
      subscription.status === "fulfilled"
        ? String(subscription.value?.plan_code || "FREE").toUpperCase()
        : "FREE";

    const wallet =
      balance.status === "fulfilled" ? balance.value?.wallet || null : null;

    const items = projects.value?.items || [];

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email || "",
      },
      plan: planCode,
      wallet,
      projects: Array.isArray(items) ? items : [],
    };
  },

  async myPlan() {
    const payload = await authJson("/api/subscriptions/me");
    return { plan_code: String(payload?.plan_code || "FREE").toUpperCase() };
  },

  async coinsBalance() {
    const payload = await authJson("/api/coins/balance");
    return { wallet: payload?.wallet || null };
  },

  async listProjects() {
    const payload = await authJson("/api/projects");
    return { data: Array.isArray(payload?.items) ? payload.items : [] };
  },

  async createProject(body: { title: string; kind: string; data?: any }) {
    return authJson("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async getProject(id: string) {
    return authJson(`/api/projects/${id}`);
  },

  async updateProject(id: string, body: { title?: string; kind?: string; data?: any }) {
    return authJson(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async getGitHubConnection() {
    return authJson("/api/github/connection");
  },

  async saveGitHubConnection(body: { personalAccessToken: string }) {
    return authJson("/api/github/connection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async removeGitHubConnection() {
    return authJson("/api/github/connection", {
      method: "DELETE",
    });
  },

  async saveGitHubWorkspace(
    id: string,
    body: { owner: string; repo: string; branch: string; rootPath: string; target: "app" | "site" }
  ) {
    return authJson(`/api/github/projects/${encodeURIComponent(id)}/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async clearGitHubWorkspace(id: string) {
    return authJson(`/api/github/projects/${encodeURIComponent(id)}/workspace`, {
      method: "DELETE",
    });
  },

  async createGitHubCheckpoint(id: string) {
    return authJson(`/api/github/projects/${encodeURIComponent(id)}/checkpoints`, {
      method: "POST",
    });
  },

  async syncGitHubProject(id: string) {
    return authJson(`/api/github/projects/${encodeURIComponent(id)}/sync`, {
      method: "POST",
    });
  },

  async createGitHubPullRequest(id: string, body?: { title?: string; body?: string; baseBranch?: string }) {
    return authJson(`/api/github/projects/${encodeURIComponent(id)}/pull-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  },

  async getVercelConnection() {
    return authJson("/api/vercel/connection");
  },

  async saveVercelConnection(body: { personalAccessToken: string }) {
    return authJson("/api/vercel/connection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async removeVercelConnection() {
    return authJson("/api/vercel/connection", {
      method: "DELETE",
    });
  },

  async saveVercelWorkspace(
    id: string,
    body: {
      projectName: string;
      teamSlug?: string;
      framework: "nextjs" | "vite" | "static";
      rootDirectory: string;
      target: "preview" | "production";
    }
  ) {
    return authJson(`/api/vercel/projects/${encodeURIComponent(id)}/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async clearVercelWorkspace(id: string) {
    return authJson(`/api/vercel/projects/${encodeURIComponent(id)}/workspace`, {
      method: "DELETE",
    });
  },

  async createVercelDeployment(id: string) {
    return authJson(`/api/vercel/projects/${encodeURIComponent(id)}/deploy`, {
      method: "POST",
    });
  },

  async reconcileVercelDeployment(id: string) {
    return authJson(`/api/vercel/projects/${encodeURIComponent(id)}/reconcile`, {
      method: "POST",
    });
  },

  async aiTextGenerate(body: { prompt: string }) {
    return authJson("/api/ai/text-generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": createIdempotencyKey("editor_ai_text"),
      },
      body: JSON.stringify(body),
    });
  },

  async aiFactCheck(body: { claim: string; query?: string }) {
    return authJson("/api/ai/fact-check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": createIdempotencyKey("editor_ai_fact_check"),
      },
      body: JSON.stringify(body),
    });
  },

  async createCheckoutSession(body: {
    plan_code:
      | "INICIANTE"
      | "EDITOR_PRO"
      | "CREATOR_PRO"
      | "EMPRESARIAL"
      | "EDITOR_FREE"
      | "EDITOR_ULTRA";
    mode?: "subscription" | "payment";
    success_url: string;
    cancel_url: string;
  }) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token || !session?.user?.id) {
      throw new Error("Not authenticated");
    }

    const res = await apiFetch("/api/stripe/checkout/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await readJsonSafe(res);
    if (!res.ok) {
      const errorCode = String(payload?.error || payload?.message || "stripe_checkout_failed");
      const errorReason = String(payload?.reason || "").trim();
      throw new Error(errorReason ? `${errorCode}:${errorReason}` : errorCode);
    }

    return payload;
  },

  async createBillingPortalSession(body: { return_url: string; locale?: string }) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");

    return apiJson("/api/stripe/portal/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
  },

  async getStripeMe() {
    return authJson("/api/stripe/me");
  },

  async getStripePlans() {
    return authJson("/api/stripe/plans");
  },

  async refreshStripeSubscription() {
    return authJson("/api/stripe/subscription/refresh", {
      method: "POST",
    });
  },

  async quoteCoinsPackage(body: {
    package_total: number;
    breakdown: { common: number; pro: number; ultra: number };
  }) {
    return authJson("/api/coins/packages/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async createCoinsPackageCheckout(body: {
    quote_id?: string;
    package_total?: number;
    breakdown?: { common: number; pro: number; ultra: number };
    success_url?: string;
    cancel_url?: string;
    metadata?: Record<string, string | number | boolean>;
  }) {
    return authJson("/api/coins/packages/checkout/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async getUsageLimits() {
    return authJson("/api/usage/limits");
  },

  async getUsageSummary(month?: string) {
    const qs = month ? `?month=${encodeURIComponent(month)}` : "";
    return authJson(`/api/usage/summary${qs}`);
  },

  async getNoCodeRuntime(): Promise<NoCodeRuntimeSnapshot> {
    return authJson("/api/no-code/runtime");
  },

  async getCoinsTransactions(limit = 30) {
    return authJson(`/api/coins/transactions?limit=${encodeURIComponent(String(limit))}`);
  },

  async getCoinsPackageStatus(quoteId: string) {
    return authJson(`/api/coins/packages/status?quote_id=${encodeURIComponent(String(quoteId || "").trim())}`);
  },

  async convertCoins(body: {
    from: "common" | "pro" | "ultra";
    to: "common" | "pro" | "ultra";
    amount: number;
    idempotency_key?: string;
  }) {
    return authJson("/api/coins/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async requestBetaAccess(body: {
    email: string;
    metadata?: Record<string, any>;
  }) {
    return apiJson("/api/beta-access/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async betaAccessMe() {
    return authJson("/api/beta-access/me");
  },

  async adminBetaAccessRequests(params?: { status?: "pending" | "approved" | "rejected"; limit?: number }) {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return authJson(`/api/beta-access/admin/requests${qs ? `?${qs}` : ""}`);
  },

  async adminBetaAccessUpdate(
    requestId: string,
    body: { status: "pending" | "approved" | "rejected"; admin_note?: string }
  ) {
    return authJson(`/api/beta-access/admin/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async supportCreateRequest(body: {
    category: "duvida" | "problema_tecnico" | "pedido_financeiro" | "outro";
    subject: string;
    message: string;
    metadata?: Record<string, any>;
  }) {
    return authJson("/api/support/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async supportMyRequests(limit = 50) {
    return authJson(`/api/support/requests/me?limit=${encodeURIComponent(String(limit))}`);
  },

  async adminSupportRequests(params?: { status?: string; category?: string; limit?: number }) {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.category) search.set("category", params.category);
    if (params?.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return authJson(`/api/support/admin/requests${qs ? `?${qs}` : ""}`);
  },

  async adminSupportUpdateStatus(
    requestId: string,
    body: { status: "open" | "in_review" | "resolved"; admin_note?: string }
  ) {
    return authJson(`/api/support/admin/requests/${encodeURIComponent(requestId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async liveCutsCreateSession(body: {
    source_label?: string;
    mode: "timed" | "continuous";
    requested_duration_minutes?: number;
    estimate_preview_minutes?: number;
    intensity?: "basic" | "balanced" | "aggressive";
    preferred_moments?: Array<"engracado" | "marcante" | "impactante" | "highlights_gerais" | "outro">;
    auto_post_enabled?: boolean;
    notes?: string;
    metadata?: Record<string, any>;
  }) {
    return authJson("/api/live-cuts/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async liveCutsListSessions(limit = 50) {
    return authJson(`/api/live-cuts/sessions?limit=${encodeURIComponent(String(limit))}`);
  },

  async liveCutsGetSession(sessionId: string) {
    return authJson(`/api/live-cuts/sessions/${encodeURIComponent(sessionId)}`);
  },

  async liveCutsUpdateSessionStatus(
    sessionId: string,
    body: { status: "active" | "paused" | "ended" | "canceled"; accepted_estimate?: boolean }
  ) {
    return authJson(`/api/live-cuts/sessions/${encodeURIComponent(sessionId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async adminOverview(days = 7) {
    return authJson(`/api/admin/overview?days=${encodeURIComponent(String(days))}`);
  },

  async healthReady() {
    const res = await apiFetch("/api/health/ready");
    const payload = await readJsonSafe(res);
    if (!payload || typeof payload !== "object") {
      throw new Error("health_ready_unavailable");
    }
    return {
      status: res.status,
      ...payload,
    };
  },

  async adminStatus() {
    return authJson("/api/status");
  },

  async adminRecentEvents(limit = 20, userId?: string) {
    const search = new URLSearchParams();
    search.set("limit", String(limit));
    if (userId) search.set("user_id", userId);
    return authJson(`/api/events/recent?${search.toString()}`);
  },

  async adminDashboardErrors() {
    return authJson("/api/dashboard/errors");
  },

  async adminDashboardRouting() {
    return authJson("/api/dashboard/routing");
  },

  async adminVisibility() {
    return authJson("/api/admin/visibility");
  },

  async adminSearchUsers(q: string) {
    return authJson(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
  },

  async adminUserTimeline(userId: string, days = 30, limit = 200) {
    return authJson(
      `/api/admin/user/${encodeURIComponent(userId)}/timeline?days=${encodeURIComponent(String(days))}&limit=${encodeURIComponent(String(limit))}`
    );
  },

  async adminExportUsageCsv(days = 30, feature?: string) {
    const qs = feature
      ? `?days=${encodeURIComponent(String(days))}&feature=${encodeURIComponent(feature)}`
      : `?days=${encodeURIComponent(String(days))}`;
    return downloadWithAuth(`/api/admin/export/usage.csv${qs}`, `usage-${days}d.csv`);
  },

  async adminExportCoinsCsv(days = 30) {
    return downloadWithAuth(`/api/admin/export/coins.csv?days=${encodeURIComponent(String(days))}`, `coins-${days}d.csv`);
  },
};


