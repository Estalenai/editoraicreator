import { logger } from "./logger.js";
import { metricIncrement } from "./metrics.js";

const MAX_EVENTS = 5000;
const EVENTS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STRING_LEN = 200;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 25;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const recentEvents = [];
const BLOCKED_KEYS = new Set([
  "prompt",
  "authorization",
  "access_token",
  "refresh_token",
  "headers",
  "cookie",
  "raw",
  "email",
  "password",
  "token",
  "secret",
]);
const ALLOWED_ADDITIONAL_KEYS = new Set([
  "feature",
  "mode",
  "provider",
  "status",
  "status_code",
  "code",
  "error",
  "source",
  "from",
  "to",
  "scope",
  "reason",
  "retry_after_seconds",
  "event_type",
]);

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function truncateString(value) {
  const raw = String(value || "");
  if (raw.length <= MAX_STRING_LEN) return raw;
  return `${raw.slice(0, MAX_STRING_LEN)}...`;
}

function sanitizeValue(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 3) return null;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};
    const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
    for (const [rawKey, rawVal] of entries) {
      const key = String(rawKey);
      const lowered = key.toLowerCase();
      if (BLOCKED_KEYS.has(lowered)) continue;
      out[key] = sanitizeValue(rawVal, depth + 1);
    }
    return out;
  }

  return truncateString(value);
}

function sanitizeAdditional(additional) {
  if (!additional || typeof additional !== "object") return {};
  const out = {};
  for (const [rawKey, rawVal] of Object.entries(additional)) {
    const key = String(rawKey);
    const lowered = key.toLowerCase();
    if (BLOCKED_KEYS.has(lowered)) continue;
    if (!ALLOWED_ADDITIONAL_KEYS.has(lowered)) continue;
    out[key] = sanitizeValue(rawVal, 0);
  }
  return out;
}

function pruneExpiredEvents() {
  const cutoff = nowMs() - EVENTS_TTL_MS;
  const filtered = recentEvents.filter((entry) => Number(entry?.ts_ms || 0) >= cutoff);
  if (filtered.length !== recentEvents.length) {
    recentEvents.splice(0, recentEvents.length, ...filtered);
  }
}

function pushEvent(item) {
  pruneExpiredEvents();
  recentEvents.push(item);
  if (recentEvents.length > MAX_EVENTS) {
    recentEvents.splice(0, recentEvents.length - MAX_EVENTS);
  }
}

export function recordProductEvent({
  event,
  userId = null,
  plan = null,
  additional = {},
} = {}) {
  const payload = {
    event: String(event || "unknown_event"),
    userId: userId ? String(userId) : null,
    plan: plan ? String(plan) : null,
    timestamp: nowIso(),
    ts_ms: nowMs(),
    additional: sanitizeAdditional(additional),
  };
  pushEvent(payload);
  logger.info("event", { event: payload });
  metricIncrement("event.recorded", {
    event: payload.event,
    plan: payload.plan || "n/a",
  });
  return payload;
}

export function getRecentProductEvents({ limit = 20, userId = null } = {}) {
  pruneExpiredEvents();
  const safeLimit = Math.min(Math.max(Number(limit || DEFAULT_LIMIT), 1), MAX_LIMIT);
  const filtered = userId
    ? recentEvents.filter((entry) => entry.userId === String(userId))
    : recentEvents;
  return filtered
    .slice(-safeLimit)
    .reverse()
    .map((entry) => ({
      event: entry.event,
      userId: entry.userId,
      plan: entry.plan,
      timestamp: entry.timestamp,
      additional: entry.additional,
    }));
}
