"use client";

import { isE2EAuthModeEnabled } from "./e2eAuth";

type ClientSessionLike = {
  access_token?: string;
  expires_at?: number;
  user?: {
    email?: string | null;
  } | null;
} | null;

function buildSessionSignature(session: ClientSessionLike) {
  if (!session?.access_token) return "signed-out";
  return [
    String(session.access_token || ""),
    String(session.expires_at || ""),
    String(session.user?.email || ""),
  ].join(":");
}

async function requestServerSession(method: "POST" | "DELETE", body?: Record<string, unknown>) {
  const response = await fetch("/api/auth/session", {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(body || {}) : undefined,
    credentials: "same-origin",
    cache: "no-store",
    keepalive: true,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(String(payload?.error || "server_session_sync_failed"));
  }
}

export function getSessionSyncSignature(session: ClientSessionLike) {
  return buildSessionSignature(session);
}

export async function syncServerSession(session: ClientSessionLike) {
  if (!session?.access_token) {
    await requestServerSession("DELETE");
    return;
  }

  if (isE2EAuthModeEnabled()) {
    await requestServerSession("POST", {
      mode: "e2e",
      email: session.user?.email || "beta@editorai.test",
      expiresAt: session.expires_at || null,
    });
    return;
  }

  await requestServerSession("POST", {
    mode: "supabase",
    accessToken: session.access_token,
    expiresAt: session.expires_at || null,
  });
}

export async function clearServerSession() {
  await requestServerSession("DELETE");
}
