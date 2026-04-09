import { createClient } from "@supabase/supabase-js";
import { clearE2ESession, isE2EAuthModeEnabled, isE2EAuthRuntimeAllowed, readE2ESession, writeE2ESession } from "./e2eAuth";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url) throw new Error("supabaseUrl is required.");
if (!anon) throw new Error("supabaseAnonKey is required.");

const supabaseClient = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

if (typeof window !== "undefined" && isE2EAuthRuntimeAllowed()) {
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
      clearE2ESession();
      return { error: null };
    }
    return originalSignOut();
  };
}

export const supabase = supabaseClient;
