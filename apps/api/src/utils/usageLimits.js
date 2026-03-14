const PLAN_LIMITS = {
  EDITOR_FREE: {
    creator_post_generate: { monthly: 30 },
    creator_music_generate: { monthly: 10 },
  },
  EDITOR_PRO: {
    creator_post_generate: { monthly: 300 },
    creator_music_generate: { monthly: 100 },
  },
  EDITOR_ULTRA: {
    creator_post_generate: { monthly: 2000 },
    creator_music_generate: { monthly: 500 },
  },
};

const PLAN_ALIASES = new Map([
  ["FREE", "EDITOR_FREE"],
  ["EDITOR_FREE", "EDITOR_FREE"],
  ["INICIANTE", "EDITOR_FREE"],
  ["STARTER", "EDITOR_FREE"],
  ["EDITOR_PRO", "EDITOR_PRO"],
  ["PRO", "EDITOR_PRO"],
  ["EDITOR_ULTRA", "EDITOR_ULTRA"],
  ["CREATOR_PRO", "EDITOR_ULTRA"],
  ["CRIADOR_PRO", "EDITOR_ULTRA"],
  ["ULTRA", "EDITOR_ULTRA"],
  ["EMPRESARIAL", "EDITOR_ULTRA"],
  ["ENTERPRISE", "EDITOR_ULTRA"],
  ["ENTERPRISE_ULTRA", "EDITOR_ULTRA"],
]);

export function normalizePlanCode(planCode) {
  const raw = String(planCode || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  return PLAN_ALIASES.get(raw) || "EDITOR_FREE";
}

export function getUsageLimits(planCode) {
  const normalized = normalizePlanCode(planCode);
  return PLAN_LIMITS[normalized] || PLAN_LIMITS.EDITOR_FREE;
}

export function getMonthlyWindow(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return { start, end };
}
