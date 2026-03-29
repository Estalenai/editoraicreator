import { getPlanMonthlyUsageConfig, normalizePlanMatrixCode } from "./planLimitsMatrix.js";

export function normalizePlanCode(planCode) {
  return normalizePlanMatrixCode(planCode, "usage");
}

export function getUsageLimits(planCode) {
  const usageConfig = getPlanMonthlyUsageConfig(planCode, { domain: "usage" });
  return usageConfig?.monthly_by_feature || {};
}

export function getMonthlyWindow(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return { start, end };
}
