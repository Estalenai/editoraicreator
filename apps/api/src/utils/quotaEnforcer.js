import { getMonthlyWindow, getUsageLimits, normalizePlanCode } from "./usageLimits.js";

export class QuotaExceededError extends Error {
  constructor(payload) {
    super("quota_exceeded");
    this.name = "QuotaExceededError";
    this.status = 429;
    this.payload = payload;
  }
}

export async function assertWithinQuota({
  db,
  userId,
  planCode,
  feature,
  idempotencyKey,
  idempotencyAction,
  action = "generate",
}) {
  const normalizedPlan = normalizePlanCode(planCode);
  const limits = getUsageLimits(normalizedPlan);
  const featureLimit = limits[feature]?.monthly;
  if (!Number.isFinite(featureLimit) || featureLimit <= 0) {
    return { ok: true, limit: null, used: 0, resetAt: null };
  }

  if (idempotencyKey && idempotencyAction) {
    const { data } = await db
      .from("request_idempotency")
      .select("id")
      .eq("user_id", userId)
      .eq("action", idempotencyAction)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (data?.id) {
      return { ok: true, replay: true, limit: featureLimit, used: 0, resetAt: null };
    }
  }

  const { start, end } = getMonthlyWindow();
  const countQuery = await db
    .from("usage_events")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("action", action)
    .eq("status", "success")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (countQuery.error) {
    throw new Error(`quota_count_failed: ${countQuery.error.message}`);
  }

  const used = Number(countQuery.count || 0);
  if (used >= featureLimit) {
    throw new QuotaExceededError({
      error: "quota_exceeded",
      feature,
      plan_code: normalizedPlan,
      limit: featureLimit,
      used,
      reset_at: end.toISOString(),
    });
  }

  return { ok: true, limit: featureLimit, used, resetAt: end.toISOString() };
}
