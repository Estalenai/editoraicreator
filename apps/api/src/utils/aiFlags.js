function parseBool(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function isRealAIEnabled() {
  return parseBool(process.env.AI_REAL_ENABLED, false);
}

export function isAIDisabled() {
  return parseBool(process.env.AI_DISABLED, false);
}

export function isAIMockForced() {
  return parseBool(process.env.AI_MOCK, true);
}
