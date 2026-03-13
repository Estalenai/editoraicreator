"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabaseClient";

type PromptPrefsPayload = {
  prefs?: {
    prompt_auto_enabled?: unknown;
    prompt_auto_apply?: unknown;
  };
};

const DEFAULT_PROMPT_PREFS = {
  prompt_auto_enabled: true,
  prompt_auto_apply: false,
};

function normalizeBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return fallback;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

export function usePromptPreferences() {
  const [promptEnabled, setPromptEnabled] = useState(DEFAULT_PROMPT_PREFS.prompt_auto_enabled);
  const [autoApply, setAutoApply] = useState(DEFAULT_PROMPT_PREFS.prompt_auto_apply);

  useEffect(() => {
    let mounted = true;

    async function loadPrefs() {
      const token = await getAccessToken();
      if (!token) return;

      try {
        const res = await apiFetch("/api/preferences", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const payload = (await res.json().catch(() => null)) as PromptPrefsPayload | null;
        const prefs = payload?.prefs || {};
        if (!mounted) return;

        const nextPromptEnabled = normalizeBool(
          prefs.prompt_auto_enabled,
          DEFAULT_PROMPT_PREFS.prompt_auto_enabled
        );
        const nextAutoApply = normalizeBool(
          prefs.prompt_auto_apply,
          DEFAULT_PROMPT_PREFS.prompt_auto_apply
        );

        setPromptEnabled(nextPromptEnabled);
        setAutoApply(nextPromptEnabled ? nextAutoApply : false);
      } catch {
        // best effort
      }
    }

    loadPrefs();
    return () => {
      mounted = false;
    };
  }, []);

  async function persistPrefs(patch: Record<string, boolean>): Promise<void> {
    const token = await getAccessToken();
    if (!token) return;

    try {
      await apiFetch("/api/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
    } catch {
      // best effort
    }
  }

  async function updatePromptEnabled(nextValue: boolean): Promise<void> {
    setPromptEnabled(nextValue);
    if (!nextValue) {
      setAutoApply(false);
      await persistPrefs({ prompt_auto_enabled: false, prompt_auto_apply: false });
      return;
    }
    await persistPrefs({ prompt_auto_enabled: true });
  }

  async function updateAutoApply(nextValue: boolean): Promise<void> {
    if (!promptEnabled) return;
    setAutoApply(nextValue);
    await persistPrefs({ prompt_auto_apply: nextValue });
  }

  return {
    promptEnabled,
    autoApply,
    updatePromptEnabled,
    updateAutoApply,
  };
}
