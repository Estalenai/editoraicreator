const CLIENT_SESSION_STORAGE_KEY = "__editor_ai_creator_observability_session";
const FRONTEND_ERROR_ENDPOINT = "/api/observability/frontend-error";
const RECENT_EVENT_TTL_MS = 7000;

type FrontendEventName =
  | "frontend_runtime_error"
  | "frontend_unhandled_rejection"
  | "frontend_api_failure"
  | "auth_session_sync_failed";

type FrontendEventPayload = Record<string, unknown>;

type RecentEventStore = Map<string, number>;

function getRecentEventStore() {
  const target = window as typeof window & { __editorAiRecentFrontendEvents?: RecentEventStore };
  if (!target.__editorAiRecentFrontendEvents) {
    target.__editorAiRecentFrontendEvents = new Map<string, number>();
  }
  return target.__editorAiRecentFrontendEvents;
}

function cleanupRecentEvents(store: RecentEventStore) {
  const now = Date.now();
  for (const [key, ts] of store.entries()) {
    if (now - ts > RECENT_EVENT_TTL_MS) {
      store.delete(key);
    }
  }
}

function buildUniqueId(prefix: string) {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function sanitizePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePayload);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes("token") ||
      normalizedKey.includes("authorization") ||
      normalizedKey.includes("cookie") ||
      normalizedKey.includes("password")
    ) {
      output[key] = "***";
      continue;
    }

    if (rawValue && typeof rawValue === "object") {
      output[key] = sanitizePayload(rawValue);
    } else {
      output[key] = rawValue;
    }
  }

  return output;
}

export function getClientSessionId() {
  if (typeof window === "undefined") return "server";

  try {
    const stored = window.sessionStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if (stored) return stored;
    const generated = buildUniqueId("sess");
    window.sessionStorage.setItem(CLIENT_SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return buildUniqueId("sess");
  }
}

export function getCurrentClientRoute() {
  if (typeof window === "undefined") return "server";
  return `${window.location.pathname || "/"}${window.location.search || ""}`;
}

export function createClientRequestId() {
  return buildUniqueId("req");
}

function normalizeErrorDetails(value: unknown) {
  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: value.message || "unknown_error",
      stack: String(value.stack || "")
        .split("\n")
        .slice(0, 8)
        .join("\n"),
    };
  }

  return {
    message: String(value || "unknown_error"),
  };
}

export function reportFrontendEvent(event: FrontendEventName, payload: FrontendEventPayload = {}) {
  if (typeof window === "undefined") return;

  const route = getCurrentClientRoute();
  const sessionId = getClientSessionId();
  const requestId = typeof payload.requestId === "string" && payload.requestId.trim() ? payload.requestId.trim() : buildUniqueId("fe");
  const eventPayload = sanitizePayload({
    event,
    requestId,
    route,
    sessionId,
    occurredAt: new Date().toISOString(),
    ...payload,
  }) as Record<string, unknown>;

  const dedupeKey = JSON.stringify([event, eventPayload.route, eventPayload.message, eventPayload.source]);
  const store = getRecentEventStore();
  cleanupRecentEvents(store);
  if (store.has(dedupeKey)) return;
  store.set(dedupeKey, Date.now());

  const body = JSON.stringify(eventPayload);

  try {
    if (typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(FRONTEND_ERROR_ENDPOINT, new Blob([body], { type: "application/json" }));
      if (sent) return;
    }
  } catch {
    // Fall through to fetch-based reporting.
  }

  void fetch(FRONTEND_ERROR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    cache: "no-store",
    keepalive: true,
  }).catch(() => {
    // Avoid recursive error reporting from the observability path itself.
  });
}

export function normalizeFrontendErrorPayload(value: unknown): FrontendEventPayload {
  return sanitizePayload(normalizeErrorDetails(value)) as FrontendEventPayload;
}
