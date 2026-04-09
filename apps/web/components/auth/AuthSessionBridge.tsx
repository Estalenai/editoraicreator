"use client";

import { useEffect, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import { clearServerSession, getSessionSyncSignature, syncServerSession } from "../../lib/clientSessionSync";
import { normalizeFrontendErrorPayload, reportFrontendEvent } from "../../lib/observability";

export function AuthSessionBridge() {
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    let active = true;

    async function syncFromSession(session: any) {
      const signature = getSessionSyncSignature(session);
      if (lastSignatureRef.current === signature) return;

      try {
        if (session?.access_token) {
          await syncServerSession(session);
        } else {
          await clearServerSession();
        }
        if (active) {
          lastSignatureRef.current = signature;
        }
      } catch (error) {
        reportFrontendEvent("auth_session_sync_failed", normalizeFrontendErrorPayload(error));
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      void syncFromSession(data.session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncFromSession(session);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  return null;
}
