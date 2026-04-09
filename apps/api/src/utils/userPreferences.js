export const DEFAULT_USER_PREFERENCES = {
  prompt_auto_enabled: true,
  prompt_auto_apply: false,
  prompt_auto_dont_ask_again: false,
  ai_execution_mode_preference: "automatic_quality",
  language: "pt-BR",
  notification_inbox_enabled: true,
  notification_toasts_enabled: true,
  notification_support_updates: true,
  notification_financial_updates: true,
  notification_async_updates: true,
};

export function prefsKey(userId) {
  return `prefs:${userId}`;
}

export function mergeUserPreferences(stored) {
  const safeStored =
    stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  return {
    ...DEFAULT_USER_PREFERENCES,
    ...safeStored,
  };
}
