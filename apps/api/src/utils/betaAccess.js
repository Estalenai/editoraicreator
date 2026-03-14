import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { getConfig } from "./configCache.js";
import { logger } from "./logger.js";

const STATUS_PENDING = "pending";
const STATUS_APPROVED = "approved";
const STATUS_REJECTED = "rejected";
const VALID_STATUS = new Set([STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED]);

const CONFIG_KEY = "beta.closed_access.enabled";
const CONFIG_TTL_MS = 30_000;
const ACCESS_TTL_MS = 30_000;

let betaEnabledCache = {
  expiresAt: 0,
  value: true,
};

const accessByUserCache = new Map();
const accessByEmailCache = new Map();

function nowMs() {
  return Date.now();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseEnabledConfig(value) {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && typeof value.enabled === "boolean") {
    return value.enabled;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function readCache(cacheMap, key) {
  const hit = cacheMap.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= nowMs()) {
    cacheMap.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(cacheMap, key, value) {
  if (!key) return;
  cacheMap.set(key, {
    value,
    expiresAt: nowMs() + ACCESS_TTL_MS,
  });
}

export function clearBetaAccessCache({ userId = null, email = null } = {}) {
  if (!userId && !email) {
    accessByUserCache.clear();
    accessByEmailCache.clear();
    return;
  }
  if (userId) accessByUserCache.delete(String(userId));
  if (email) accessByEmailCache.delete(normalizeEmail(email));
}

export async function isClosedBetaEnabled() {
  const now = nowMs();
  if (betaEnabledCache.expiresAt > now) {
    return betaEnabledCache.value;
  }

  let enabled = true;

  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    enabled = false;
  } else {
    const configValue = await getConfig(CONFIG_KEY, { ttlMs: CONFIG_TTL_MS }).catch(() => null);
    const parsed = parseEnabledConfig(configValue);
    if (parsed !== null) enabled = parsed;
  }

  betaEnabledCache = {
    value: enabled,
    expiresAt: now + CONFIG_TTL_MS,
  };
  return enabled;
}

async function fetchLatestAccessRequest({ userId, email }) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) return null;

  const safeUserId = String(userId || "").trim();
  const emailNorm = normalizeEmail(email);

  if (safeUserId) {
    const byUser = await supabaseAdmin
      .from("beta_access_requests")
      .select("id,email,email_norm,user_id,status,admin_note,created_at,updated_at,approved_at,approved_by")
      .eq("user_id", safeUserId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!byUser.error && byUser.data) return byUser.data;
    if (byUser.error && byUser.error.code !== "PGRST116") {
      throw new Error(byUser.error.message || "beta_access_lookup_user_failed");
    }
  }

  if (!emailNorm) return null;

  const byEmail = await supabaseAdmin
    .from("beta_access_requests")
    .select("id,email,email_norm,user_id,status,admin_note,created_at,updated_at,approved_at,approved_by")
    .eq("email_norm", emailNorm)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byEmail.error && byEmail.error.code !== "PGRST116") {
    throw new Error(byEmail.error.message || "beta_access_lookup_email_failed");
  }
  return byEmail.data || null;
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (VALID_STATUS.has(status)) return status;
  return STATUS_PENDING;
}

export async function getBetaAccessStateForUser({ userId, email }) {
  const safeUserId = String(userId || "").trim();
  const emailNorm = normalizeEmail(email);

  const cachedByUser = safeUserId ? readCache(accessByUserCache, safeUserId) : null;
  if (cachedByUser) return cachedByUser;

  const cachedByEmail = emailNorm ? readCache(accessByEmailCache, emailNorm) : null;
  if (cachedByEmail) return cachedByEmail;

  const row = await fetchLatestAccessRequest({ userId: safeUserId, email: emailNorm });
  const status = normalizeStatus(row?.status || STATUS_PENDING);
  const state = {
    approved: status === STATUS_APPROVED,
    requested: Boolean(row),
    status,
    requestId: row?.id || null,
    approvedAt: row?.approved_at || null,
  };

  if (row && !row.user_id && safeUserId && row.email_norm === emailNorm) {
    const patch = await supabaseAdmin
      .from("beta_access_requests")
      .update({ user_id: safeUserId, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (patch.error) {
      logger.warn("beta_access_attach_user_failed", {
        requestId: row.id,
        userId: safeUserId,
        message: patch.error.message || "unknown_error",
      });
    }
  }

  if (safeUserId) writeCache(accessByUserCache, safeUserId, state);
  if (emailNorm) writeCache(accessByEmailCache, emailNorm, state);
  return state;
}

export { STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED, normalizeEmail };
