const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const E2E_AUTH_SESSION_KEY = "__editor_ai_creator_e2e_auth_session";

export type E2EBrowserSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: {
    id: string;
    email: string;
  };
};

export function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function isE2EAuthRuntimeAllowed() {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_E2E_AUTH_MODE === "1";
}

export function isE2EAuthModeEnabled() {
  return isE2EAuthRuntimeAllowed() && canUseBrowserStorage() && window.localStorage.getItem(E2E_AUTH_MODE_KEY) === "1";
}

export function readE2ESession() {
  if (!canUseBrowserStorage()) return null;
  const raw = window.localStorage.getItem(E2E_AUTH_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as E2EBrowserSession;
  } catch {
    return null;
  }
}

export function writeE2ESession(email: string) {
  if (!canUseBrowserStorage()) return null;
  const normalizedEmail = String(email || "beta@editorai.test").trim() || "beta@editorai.test";
  const session: E2EBrowserSession = {
    access_token: `e2e-access-token:${normalizedEmail}`,
    refresh_token: "e2e-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "e2e-user",
      email: normalizedEmail,
    },
  };
  window.localStorage.setItem(E2E_AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearE2ESession() {
  if (!canUseBrowserStorage()) return;
  window.localStorage.removeItem(E2E_AUTH_SESSION_KEY);
}

export { E2E_AUTH_MODE_KEY, E2E_AUTH_SESSION_KEY };
