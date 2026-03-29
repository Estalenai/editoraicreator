"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabaseClient";

type PromptPrefsPayload = {
  prefs?: {
    prompt_auto_enabled?: unknown;
    prompt_auto_apply?: unknown;
    ai_execution_mode_preference?: unknown;
  };
};

const DEFAULT_PROMPT_PREFS = {
  prompt_auto_enabled: true,
  prompt_auto_apply: false,
  ai_execution_mode_preference: "automatic_quality" as const,
};

type AutomaticExecutionPreference = typeof DEFAULT_PROMPT_PREFS.ai_execution_mode_preference | "automatic_economy";

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

function normalizeExecutionModePreference(
  value: unknown,
  fallback: AutomaticExecutionPreference
): AutomaticExecutionPreference {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "automatic_economy") return "automatic_economy";
  if (normalized === "automatic_quality") return "automatic_quality";
  return fallback;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

export function usePromptPreferences() {
  const [promptEnabled, setPromptEnabled] = useState(DEFAULT_PROMPT_PREFS.prompt_auto_enabled);
  const [autoApply, setAutoApply] = useState(DEFAULT_PROMPT_PREFS.prompt_auto_apply);
  const [executionModePreference, setExecutionModePreference] = useState<AutomaticExecutionPreference>(
    DEFAULT_PROMPT_PREFS.ai_execution_mode_preference
  );
  const [executionModeSaving, setExecutionModeSaving] = useState(false);
  const [executionModeError, setExecutionModeError] = useState<string | null>(null);

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
        const nextExecutionModePreference = normalizeExecutionModePreference(
          prefs.ai_execution_mode_preference,
          DEFAULT_PROMPT_PREFS.ai_execution_mode_preference
        );

        setPromptEnabled(nextPromptEnabled);
        setAutoApply(nextPromptEnabled ? nextAutoApply : false);
        setExecutionModePreference(nextExecutionModePreference);
      } catch {
        // best effort
      }
    }

    loadPrefs();
    return () => {
      mounted = false;
    };
  }, []);

  async function persistPrefs(patch: Record<string, boolean | string>): Promise<boolean> {
    const token = await getAccessToken();
    if (!token) return false;

    try {
      const res = await apiFetch("/api/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      return res.ok;
    } catch {
      return false;
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

  async function updateExecutionModePreference(nextValue: AutomaticExecutionPreference): Promise<void> {
    setExecutionModePreference(nextValue);
    setExecutionModeSaving(true);
    setExecutionModeError(null);
    const ok = await persistPrefs({ ai_execution_mode_preference: nextValue });
    if (!ok) {
      setExecutionModeError("execution_preference_save_failed");
    }
    setExecutionModeSaving(false);
  }

  return {
    promptEnabled,
    autoApply,
    executionModePreference,
    executionModeSaving,
    executionModeError,
    updatePromptEnabled,
    updateAutoApply,
    updateExecutionModePreference,
  };
}
