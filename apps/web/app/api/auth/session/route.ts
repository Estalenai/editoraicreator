import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_BETA_STATUS_COOKIE,
  AUTH_E2E_COOKIE,
  AUTH_E2E_EMAIL_COOKIE,
  buildAuthCookieOptions,
  isE2EServerAuthAllowed,
  validateSupabaseAccessToken,
} from "../../../../lib/authGate";

export const dynamic = "force-dynamic";

function clearAuthCookies(response: NextResponse) {
  response.cookies.delete(AUTH_ACCESS_COOKIE);
  response.cookies.delete(AUTH_BETA_STATUS_COOKIE);
  response.cookies.delete(AUTH_E2E_COOKIE);
  response.cookies.delete(AUTH_E2E_EMAIL_COOKIE);
}

function normalizeCookieMaxAge(expiresAt?: unknown) {
  const expiresAtNumber = Number(expiresAt || 0);
  if (!Number.isFinite(expiresAtNumber) || expiresAtNumber <= 0) return undefined;
  const diffSeconds = Math.max(1, Math.floor(expiresAtNumber - Date.now() / 1000));
  return diffSeconds;
}

async function resolveBetaStatus(request: Request, accessToken: string) {
  try {
    const response = await fetch(new URL("/api-proxy/beta-access/me", request.url), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 403 && payload?.error === "beta_access_required") {
        return String(payload?.status || "pending");
      }
      return "unknown";
    }

    const approved = payload?.access?.approved === true;
    if (approved) return "approved";
    return String(payload?.access?.status || "pending");
  } catch {
    return "unknown";
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);

  const maxAge = normalizeCookieMaxAge(payload?.expiresAt);
  const cookieOptions = buildAuthCookieOptions(maxAge);

  if (payload?.mode === "e2e") {
    const hostname = new URL(request.url).hostname;
    if (!isE2EServerAuthAllowed(hostname)) {
      return NextResponse.json({ error: "e2e_auth_disabled" }, { status: 403 });
    }

    const normalizedEmail = String(payload?.email || "beta@editorai.test").trim().toLowerCase() || "beta@editorai.test";
    response.cookies.set(AUTH_E2E_COOKIE, "1", cookieOptions);
    response.cookies.set(AUTH_E2E_EMAIL_COOKIE, normalizedEmail, cookieOptions);
    response.cookies.set(AUTH_BETA_STATUS_COOKIE, "approved", cookieOptions);
    return response;
  }

  const accessToken = String(payload?.accessToken || "").trim();
  const user = await validateSupabaseAccessToken(accessToken);
  if (!user?.id) {
    const invalidResponse = NextResponse.json({ error: "invalid_session_token" }, { status: 401 });
    clearAuthCookies(invalidResponse);
    return invalidResponse;
  }

  const betaStatus = await resolveBetaStatus(request, accessToken);
  response.cookies.set(AUTH_ACCESS_COOKIE, accessToken, cookieOptions);
  response.cookies.set(AUTH_BETA_STATUS_COOKIE, betaStatus, cookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
