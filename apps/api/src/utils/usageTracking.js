import crypto from "crypto";

export function buildRequestHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}

export async function trackUsage({
  db,
  userId,
  feature,
  action,
  idempotencyKey,
  requestHash = null,
  costs = {},
  meta = {},
  status = "success",
}) {
  try {
    const costCommon = Number(costs.common || 0);
    const costPro = Number(costs.pro || 0);
    const costUltra = Number(costs.ultra || 0);

    const key = String(idempotencyKey || "").trim() || `usage:${feature}:${action}:${Date.now()}`;

    const row = {
      user_id: userId,
      feature,
      action,
      idempotency_key: key,
      request_hash: requestHash || null,
      cost_common: costCommon,
      cost_pro: costPro,
      cost_ultra: costUltra,
      meta: meta || {},
      status,
    };

    const { data: existing, error: existingError } = await db
      .from("usage_events")
      .select("id,status")
      .eq("user_id", userId)
      .eq("feature", feature)
      .eq("idempotency_key", key)
      .maybeSingle();

    if (existingError) {
      const message = String(existingError.message || "").toLowerCase();
      if (message.includes("usage_events") && (message.includes("does not exist") || message.includes("relation"))) {
        return;
      }
      throw existingError;
    }

    if (existing) {
      // Preserve success once written; replay/error should not downgrade it.
      const nextStatus = existing.status === "success" ? "success" : status;
      if (
        existing.status === nextStatus &&
        nextStatus === "success" &&
        costCommon === 0 &&
        costPro === 0 &&
        costUltra === 0
      ) {
        return;
      }

      await db
        .from("usage_events")
        .update({
          action,
          request_hash: requestHash || null,
          cost_common: costCommon,
          cost_pro: costPro,
          cost_ultra: costUltra,
          meta: meta || {},
          status: nextStatus,
        })
        .eq("id", existing.id);
      return;
    }

    const { error } = await db.from("usage_events").insert(row);
    if (!error) return;

    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return;
    }
    if (msg.includes("usage_events") && (msg.includes("does not exist") || msg.includes("relation"))) {
      return;
    }
    throw error;
  } catch (error) {
    console.error("[trackUsage] failed:", error?.message || error);
  }
}
