"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { clearServerSession, getSessionSyncSignature, syncServerSession } from "../../lib/clientSessionSync";
import { normalizeFrontendErrorPayload, reportFrontendEvent } from "../../lib/observability";

const PUBLIC_SYNC_EXCLUDED_ROUTES = new Set([
  "/",
  "/login",
  "/how-it-works",
  "/termos",
  "/privacidade",
  "/transparencia-ia",
  "/uso-aceitavel",
  "/cancelamento-e-reembolso",
  "/como-operamos",
]);

function normalizePathname(pathname: string) {
  const normalized = String(pathname || "").trim();
  if (!normalized) return "/";
  return normalized.replace(/\/+$/, "") || "/";
}

function shouldSkipAuthSessionBridge(pathname: string) {
  const current = normalizePathname(pathname);
  if (current === "/") return true;
  if (current.startsWith("/login")) return true;
  return PUBLIC_SYNC_EXCLUDED_ROUTES.has(current);
}

export function AuthSessionBridge() {
  const pathname = usePathname() || "";
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    if (shouldSkipAuthSessionBridge(pathname)) {
      return;
    }

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

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncFromSession(session);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [pathname]);

  return null;
}
