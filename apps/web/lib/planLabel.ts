const PLAN_ALIASES = new Map<string, string>([
  ["FREE", "FREE"],
  ["EDITOR_FREE", "EDITOR_FREE"],
  ["INICIANTE", "EDITOR_FREE"],
  ["STARTER", "EDITOR_FREE"],
  ["EDITOR_STARTER", "EDITOR_FREE"],
  ["EDITOR_PRO", "EDITOR_PRO"],
  ["PRO", "EDITOR_PRO"],
  ["EDITOR_ULTRA", "EDITOR_ULTRA"],
  ["CREATOR_PRO", "EDITOR_ULTRA"],
  ["CRIADOR_PRO", "EDITOR_ULTRA"],
  ["ULTRA", "EDITOR_ULTRA"],
  ["EMPRESARIAL", "ENTERPRISE"],
  ["ENTERPRISE", "ENTERPRISE"],
  ["ENTERPRISE_ULTRA", "ENTERPRISE"],
]);

export function normalizePlanCode(planCodeOrLabel: string | null | undefined): string {
  const code = String(planCodeOrLabel || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  if (!code) return "FREE";
  return PLAN_ALIASES.get(code) || code;
}

export function resolvePlanLabel(planCodeOrLabel: string | null | undefined): string {
  const code = normalizePlanCode(planCodeOrLabel);
  if (code === "FREE") return "Gratuito";
  if (code === "EDITOR_FREE") return "Iniciante";
  if (code === "EDITOR_PRO") return "Editor Pro";
  if (code === "EDITOR_ULTRA") return "Editor Ultra";
  if (code === "ENTERPRISE") return "Enterprise";
  return String(planCodeOrLabel || code);
}
