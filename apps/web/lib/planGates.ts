import { normalizePlanCode } from "./planLabel";

const CREATOR_NO_CODE_ALLOWED_PLANS = new Set([
  "FREE",
  "EDITOR_FREE",
  "EDITOR_PRO",
  "EDITOR_ULTRA",
  "ENTERPRISE",
]);

export function isCreatorNoCodeAllowed(planCode: string | null | undefined): boolean {
  const normalized = normalizePlanCode(planCode);
  if (!normalized) return false;
  if (CREATOR_NO_CODE_ALLOWED_PLANS.has(normalized)) return true;
  if (normalized.startsWith("ENTERPRISE")) return true;
  return false;
}
