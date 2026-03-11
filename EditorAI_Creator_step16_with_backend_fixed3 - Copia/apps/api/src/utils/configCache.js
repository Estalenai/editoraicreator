import supabaseAdmin from "../config/supabaseAdmin.js";

const _cache = new Map();
/**
 * Cache simples em memória (process-local).
 * Em produção multi-instância: trocar por Redis.
 */
const DEFAULT_TTL_MS = 30_000;

export async function getConfig(key, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const { data, error } = await supabaseAdmin
    .from("configs")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(`Failed to load config ${key}: ${error.message}`);
  const value = data?.value ?? null;

  _cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function clearConfigCache(key) {
  if (!key) _cache.clear();
  else _cache.delete(key);
}
