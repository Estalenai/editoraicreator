import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const E2E_AUTH_ENABLED = process.env.NEXT_PUBLIC_E2E_AUTH_MODE === "1";
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const E2E_AUTH_SESSION_KEY = "__editor_ai_creator_e2e_auth_session";

if (!url) throw new Error("supabaseUrl is required.");
if (!anon) throw new Error("supabaseAnonKey is required.");

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isE2EAuthModeEnabled() {
  return E2E_AUTH_ENABLED && canUseBrowserStorage() && window.localStorage.getItem(E2E_AUTH_MODE_KEY) === "1";
}

function readE2ESession() {
  if (!canUseBrowserStorage()) return null;
  const raw = window.localStorage.getItem(E2E_AUTH_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeE2ESession(email: string) {
  if (!canUseBrowserStorage()) return null;
  const normalizedEmail = String(email || "beta@editorai.test").trim() || "beta@editorai.test";
  const session = {
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

const supabaseClient = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

if (typeof window !== "undefined") {
  const auth = supabaseClient.auth as any;
  const originalGetSession = auth.getSession.bind(auth);
  const originalSignInWithPassword = auth.signInWithPassword.bind(auth);
  const originalSignUp = auth.signUp.bind(auth);
  const originalSignOut = auth.signOut.bind(auth);

  auth.getSession = async () => {
    if (isE2EAuthModeEnabled()) {
      return {
        data: { session: readE2ESession() },
        error: null,
      };
    }
    return originalGetSession();
  };

  auth.signInWithPassword = async (credentials: { email: string; password: string }) => {
    if (isE2EAuthModeEnabled()) {
      const session = writeE2ESession(credentials?.email);
      return {
        data: {
          session,
          user: session?.user || null,
        },
        error: null,
      };
    }
    return originalSignInWithPassword(credentials);
  };

  auth.signUp = async (credentials: { email: string; password: string }) => {
    if (isE2EAuthModeEnabled()) {
      return {
        data: {
          session: null,
          user: {
            id: "e2e-user",
            email: String(credentials?.email || "beta@editorai.test").trim() || "beta@editorai.test",
          },
        },
        error: null,
      };
    }
    return originalSignUp(credentials);
  };

  auth.signOut = async () => {
    if (isE2EAuthModeEnabled()) {
      window.localStorage.removeItem(E2E_AUTH_SESSION_KEY);
      return { error: null };
    }
    return originalSignOut();
  };
}

export const supabase = supabaseClient;
