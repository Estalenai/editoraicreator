import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";
import { getUserPlanCode } from "../utils/planResolver.js";
import { getMonthlyWindow, getUsageLimits, normalizePlanCode } from "../utils/usageLimits.js";
import { getUsageSummary as getMetricsUsageSummary } from "../utils/metrics.js";

const router = express.Router();
router.use(authMiddleware);

function parseMonthWindow(monthParam) {
  if (!monthParam) return getMonthlyWindow();
  const raw = String(monthParam);
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

router.get("/me", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const supabase = createAuthedSupabaseClient(req.access_token);

    const { data, error } = await supabase
      .from("usage_events")
      .select("id,feature,action,idempotency_key,request_hash,cost_common,cost_pro,cost_ultra,meta,status,created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ items: data || [] });
  } catch (e) {
    return res.status(500).json({ error: "Falha ao obter uso" });
  }
});

router.get("/limits", async (req, res) => {
  try {
    const db = createAuthedSupabaseClient(req.access_token);
    const planCode = normalizePlanCode(await getUserPlanCode(db, req.user.id));
    const limits = getUsageLimits(planCode);

    return res.json({
      ok: true,
      plan_code: planCode,
      limits,
    });
  } catch (error) {
    return res.status(500).json({ error: "usage_limits_failed" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const groupBy = String(req.query.group_by || "").trim().toLowerCase();
    if (groupBy === "feature" || groupBy === "plan" || groupBy === "date") {
      const items = getMetricsUsageSummary({
        groupBy,
        userId: req.user.id,
      });
      return res.json({
        ok: true,
        group_by: groupBy,
        items,
      });
    }

    const db = createAuthedSupabaseClient(req.access_token);
    const window = parseMonthWindow(req.query.month);
    if (!window) {
      return res.status(400).json({ error: "invalid_month", details: "Use YYYY-MM" });
    }

    const planCode = normalizePlanCode(await getUserPlanCode(db, req.user.id));
    const limits = getUsageLimits(planCode);

    const { data, error } = await db
      .from("usage_events")
      .select("feature")
      .eq("user_id", req.user.id)
      .eq("status", "success")
      .eq("action", "generate")
      .gte("created_at", window.start.toISOString())
      .lt("created_at", window.end.toISOString());

    if (error) return res.status(400).json({ error: error.message });

    const counts = {};
    for (const row of data || []) {
      const key = row.feature;
      counts[key] = (counts[key] || 0) + 1;
    }

    const knownFeatures = Object.keys(limits);
    const items = knownFeatures.map((feature) => ({
      feature,
      used: Number(counts[feature] || 0),
      limit: Number(limits[feature]?.monthly ?? 0),
    }));

    return res.json({
      ok: true,
      month_start: window.start.toISOString(),
      month_end: window.end.toISOString(),
      items,
    });
  } catch (error) {
    return res.status(500).json({ error: "usage_summary_failed" });
  }
});

router.get("/ai", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const supabase = createAuthedSupabaseClient(req.access_token);

    const { data, error } = await supabase
      .from("ai_usage")
      .select("id, provider, model, feature, coins_type, coins_amount, cost_usd, tokens_in, tokens_out, meta, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ usage: data });
  } catch (e) {
    return res.status(500).json({ error: "Falha ao obter historico de uso" });
  }
});

export default router;
