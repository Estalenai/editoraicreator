import { normalizePlanCode } from "./usageLimits.js";

const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

export async function getUserPlanCode(db, userId) {
  if (!db || !userId) return "FREE";

  const { data, error } = await db
    .from("subscriptions")
    .select("plan_code,status,created_at")
    .eq("user_id", userId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return "FREE";
  return normalizePlanCode(data.plan_code);
}
