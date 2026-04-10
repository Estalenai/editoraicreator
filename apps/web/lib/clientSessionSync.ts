"use client";

import { isE2EAuthModeEnabled } from "./e2eAuth";

type ClientSessionLike = {
  access_token?: string;
  expires_at?: number;
  user?: {
    email?: string | null;
  } | null;
} | null;

const SESSION_SYNC_TIMEOUT_MS = 5000;
const inFlightSyncs = new Map<string, Promise<void>>();
let lastCompletedSignature = "";

function buildSessionSignature(session: ClientSessionLike) {
  if (!session?.access_token) return "signed-out";
  return [
    String(session.access_token || ""),
    String(session.expires_at || ""),
    String(session.user?.email || ""),
  ].join(":");
}

async function requestServerSession(method: "POST" | "DELETE", body?: Record<string, unknown>) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, SESSION_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch("/api/auth/session", {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(body || {}) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(String(payload?.error || "server_session_sync_failed"));
    }
  } catch (error) {
    if (
      error instanceof DOMException
        ? error.name === "AbortError" || error.name === "TimeoutError"
        : typeof error === "object" &&
          error !== null &&
          "name" in error &&
          (String((error as { name?: unknown }).name) === "AbortError" ||
            String((error as { name?: unknown }).name) === "TimeoutError")
    ) {
      throw new Error("server_session_sync_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getSessionSyncSignature(session: ClientSessionLike) {
  return buildSessionSignature(session);
}

function getSyncKey(method: "POST" | "DELETE", signature: string) {
  return `${method}:${signature}`;
}

function trackSync(key: string, work: () => Promise<void>) {
  if (inFlightSyncs.has(key)) {
    return inFlightSyncs.get(key)!;
  }

  const promise = work().finally(() => {
    inFlightSyncs.delete(key);
  });
  inFlightSyncs.set(key, promise);
  return promise;
}

export async function syncServerSession(session: ClientSessionLike) {
  const signature = buildSessionSignature(session);
  if (!session?.access_token) {
    const clearKey = getSyncKey("DELETE", signature);
    await trackSync(clearKey, async () => {
      await requestServerSession("DELETE");
      lastCompletedSignature = signature;
    });
    return;
  }

  if (lastCompletedSignature === signature) return;

  if (isE2EAuthModeEnabled()) {
    const syncKey = getSyncKey("POST", signature);
    await trackSync(syncKey, async () => {
      await requestServerSession("POST", {
        mode: "e2e",
        email: session.user?.email || "beta@editorai.test",
        expiresAt: session.expires_at || null,
      });
      lastCompletedSignature = signature;
    });
    return;
  }

  const syncKey = getSyncKey("POST", signature);
  await trackSync(syncKey, async () => {
    await requestServerSession("POST", {
      mode: "supabase",
      accessToken: session.access_token,
      expiresAt: session.expires_at || null,
    });
    lastCompletedSignature = signature;
  });
}

export async function clearServerSession() {
  const signature = "signed-out";
  if (lastCompletedSignature === signature) return;
  const clearKey = getSyncKey("DELETE", signature);
  await trackSync(clearKey, async () => {
    await requestServerSession("DELETE");
    lastCompletedSignature = signature;
  });
}
