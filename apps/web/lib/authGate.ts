export const AUTH_ACCESS_COOKIE = "editor_ai_access_token";
export const AUTH_BETA_STATUS_COOKIE = "editor_ai_beta_status";
export const AUTH_E2E_COOKIE = "editor_ai_e2e_auth";
export const AUTH_E2E_EMAIL_COOKIE = "editor_ai_e2e_email";

const ADMIN_EMAILS = new Set(["desenvolvedordeappsai@gmail.com"]);
const TRUSTED_E2E_HOSTS = new Set(["127.0.0.1", "localhost"]);
const SUPABASE_TIMEOUT_MS = 4000;

type SupabaseUserPayload = {
  id?: string;
  email?: string | null;
};

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function isTrustedE2EHost(hostname: string) {
  return TRUSTED_E2E_HOSTS.has(String(hostname || "").trim().toLowerCase());
}

export function isE2EServerAuthAllowed(hostname?: string) {
  if (isProductionRuntime()) return false;
  if (process.env.NEXT_PUBLIC_E2E_AUTH_MODE !== "1") return false;
  if (!hostname) return true;
  return isTrustedE2EHost(hostname);
}

export function isAdminEmail(email?: string | null) {
  const normalized = String(email || "").trim().toLowerCase();
  return normalized ? ADMIN_EMAILS.has(normalized) : false;
}

export function normalizeNextPath(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  return raw;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getSupabaseAuthUserUrl() {
  const baseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  if (!baseUrl) return null;
  return `${trimTrailingSlash(baseUrl)}/auth/v1/user`;
}

function getSupabaseAnonKey() {
  return String(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
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

function createTimeoutSignal(timeoutMs = SUPABASE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException("Request timed out", "TimeoutError"));
    }
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutId);
    },
  };
}

export async function validateSupabaseAccessToken(accessToken: string) {
  const token = String(accessToken || "").trim();
  const authUserUrl = getSupabaseAuthUserUrl();
  const anonKey = getSupabaseAnonKey();

  if (!token || token.length < 20 || !authUserUrl || !anonKey) {
    return null;
  }

  const { signal, cleanup } = createTimeoutSignal();
  try {
    const response = await fetch(authUserUrl, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal,
    });

    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as SupabaseUserPayload | null;
    if (!payload?.id) return null;
    return {
      id: payload.id,
      email: String(payload.email || "").trim().toLowerCase() || null,
    };
  } catch (error) {
    if (isAbortLikeError(error)) return null;
    return null;
  } finally {
    cleanup();
  }
}

export function buildAuthCookieOptions(maxAge?: number) {
  const resolvedMaxAge = typeof maxAge === "number" && Number.isFinite(maxAge) && maxAge > 0 ? maxAge : undefined;
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProductionRuntime(),
    path: "/",
    ...(resolvedMaxAge ? { maxAge: resolvedMaxAge } : {}),
  };
}
