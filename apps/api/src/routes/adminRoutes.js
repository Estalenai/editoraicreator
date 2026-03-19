import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { adminOnly, isAdminUser } from "../utils/adminAuth.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/visibility", (req, res) => {
  return res.json({
    ok: true,
    is_admin: isAdminUser(req.user),
  });
});
router.use(adminOnly);

function getRange(days) {
  const safeDays = Math.min(Math.max(Number(days || 7), 1), 90);
  const to = new Date();
  const from = new Date(to.getTime() - safeDays * 24 * 60 * 60 * 1000);
  return { from, to, days: safeDays };
}

function asCsvValue(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).replace(/"/g, '""').replace(/\r?\n/g, " ");
  return `"${str}"`;
}

function buildCsv(columns, rows) {
  const head = columns.join(",");
  const body = rows
    .map((row) => columns.map((col) => asCsvValue(row[col])).join(","))
    .join("\n");
  return `${head}\n${body}`;
}

function sumCoins(rows) {
  const out = { common: 0, pro: 0, ultra: 0 };
  for (const row of rows || []) {
    const coinType = String(row.coin_type || "");
    const amount = Number(row.amount || 0);
    if (!Object.prototype.hasOwnProperty.call(out, coinType)) continue;
    out[coinType] += amount;
  }
  return out;
}

function normalizeCoins(value) {
  return {
    common: Number(value?.common || 0),
    pro: Number(value?.pro || 0),
    ultra: Number(value?.ultra || 0),
  };
}

router.get("/overview", async (req, res) => {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    return res.status(503).json({ error: "admin_unavailable" });
  }
  const range = getRange(req.query.days);
  logger.info("admin_overview", { adminUserId: req.user.id, days: range.days });

  try {
    const [usageRes, coinsRes, subsRes, stripeRes] = await Promise.all([
      supabaseAdmin
        .from("usage_events")
        .select("feature,status")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .limit(5000),
      supabaseAdmin
        .from("coins_transactions")
        .select("coin_type,amount")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .limit(5000),
      supabaseAdmin
        .from("subscriptions")
        .select("status,created_at")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .limit(5000),
      supabaseAdmin
        .from("stripe_webhook_events")
        .select("status,received_at")
        .gte("received_at", range.from.toISOString())
        .lte("received_at", range.to.toISOString())
        .limit(5000),
    ]);

    if (usageRes.error || coinsRes.error || subsRes.error || stripeRes.error) {
      return res.status(500).json({
        error:
          usageRes.error?.message ||
          coinsRes.error?.message ||
          subsRes.error?.message ||
          stripeRes.error?.message ||
          "overview_failed",
      });
    }

    const usageRows = usageRes.data || [];
    const byFeatureSuccessMap = {};
    let usageErrors = 0;
    let usageReplays = 0;
    for (const row of usageRows) {
      const status = String(row.status || "");
      if (status === "success") {
        const feature = String(row.feature || "unknown");
        byFeatureSuccessMap[feature] = (byFeatureSuccessMap[feature] || 0) + 1;
      } else if (status === "error") {
        usageErrors += 1;
      } else if (status === "replay") {
        usageReplays += 1;
      }
    }

    const coinRows = coinsRes.data || [];
    const debitRows = coinRows.filter((r) => Number(r.amount || 0) < 0).map((r) => ({
      ...r,
      amount: Math.abs(Number(r.amount || 0)),
    }));
    const creditRows = coinRows.filter((r) => Number(r.amount || 0) > 0);

    const subsCounts = { active: 0, trialing: 0, past_due: 0, canceled: 0 };
    for (const row of subsRes.data || []) {
      const status = String(row.status || "");
      if (Object.prototype.hasOwnProperty.call(subsCounts, status)) {
        subsCounts[status] += 1;
      }
    }

    const stripeCounts = { processed: 0, ignored: 0, failed: 0 };
    for (const row of stripeRes.data || []) {
      const status = String(row.status || "");
      if (Object.prototype.hasOwnProperty.call(stripeCounts, status)) {
        stripeCounts[status] += 1;
      }
    }

    return res.json({
      ok: true,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      usage: {
        total: usageRows.length,
        by_feature_success: Object.entries(byFeatureSuccessMap).map(([feature, count]) => ({ feature, count })),
        errors: usageErrors,
        replays: usageReplays,
      },
      coins: {
        debit: sumCoins(debitRows),
        credit: sumCoins(creditRows),
      },
      subs: subsCounts,
      stripe: stripeCounts,
    });
  } catch (error) {
    return res.status(500).json({ error: "overview_failed" });
  }
});

router.get("/users/search", async (req, res) => {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    return res.status(503).json({ error: "admin_unavailable" });
  }
  const q = String(req.query.q || "").trim();
  logger.info("admin_user_search", { adminUserId: req.user.id, q });
  if (!q) return res.json({ ok: true, items: [] });

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);
    const userIds = new Set();

    if (isUuid) userIds.add(q);

    const customerMatches = await supabaseAdmin
      .from("stripe_customers")
      .select("user_id,email,created_at")
      .ilike("email", `%${q}%`)
      .limit(20);
    if (!customerMatches.error) {
      for (const row of customerMatches.data || []) userIds.add(row.user_id);
    }

    const subsByUser = await supabaseAdmin
      .from("subscriptions")
      .select("user_id,plan_code,status,created_at")
      .in("user_id", Array.from(userIds).slice(0, 20))
      .order("created_at", { ascending: false })
      .limit(200);

    const wallets = await supabaseAdmin
      .from("creator_coins_wallet")
      .select("user_id,common,pro,ultra,common_balance,pro_balance,ultra_balance")
      .in("user_id", Array.from(userIds).slice(0, 20));

    const usage = await supabaseAdmin
      .from("usage_events")
      .select("user_id,created_at")
      .in("user_id", Array.from(userIds).slice(0, 20))
      .order("created_at", { ascending: false })
      .limit(500);

    const latestSubByUser = {};
    for (const row of subsByUser.data || []) {
      if (!latestSubByUser[row.user_id]) latestSubByUser[row.user_id] = row;
    }
    const walletByUser = {};
    for (const row of wallets.data || []) {
      walletByUser[row.user_id] = {
        common: Number(row.common ?? row.common_balance ?? 0),
        pro: Number(row.pro ?? row.pro_balance ?? 0),
        ultra: Number(row.ultra ?? row.ultra_balance ?? 0),
      };
    }
    const lastSeen = {};
    for (const row of usage.data || []) {
      if (!lastSeen[row.user_id]) lastSeen[row.user_id] = row.created_at;
    }
    const emailByUser = {};
    for (const row of customerMatches.data || []) {
      if (!emailByUser[row.user_id]) emailByUser[row.user_id] = row.email || null;
    }

    const items = Array.from(userIds)
      .slice(0, 20)
      .map((userId) => ({
        user_id: userId,
        email: emailByUser[userId] || null,
        plan_code: latestSubByUser[userId]?.plan_code || "FREE",
        coins: walletByUser[userId] || { common: 0, pro: 0, ultra: 0 },
        last_seen_at: lastSeen[userId] || null,
        created_at: latestSubByUser[userId]?.created_at || null,
      }));

    return res.json({ ok: true, items });
  } catch {
    return res.status(500).json({ error: "admin_user_search_failed" });
  }
});

router.get("/user/:userId/timeline", async (req, res) => {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    return res.status(503).json({ error: "admin_unavailable" });
  }
  const userId = String(req.params.userId || "");
  const range = getRange(req.query.days || 30);
  const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);
  logger.info("admin_user_timeline", { adminUserId: req.user.id, userId, days: range.days, limit });

  try {
    const customerRows = await supabaseAdmin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId);
    const customerIds = new Set((customerRows.data || []).map((r) => r.stripe_customer_id));

    const [usageRes, coinsRes, subsRes, stripeRes] = await Promise.all([
      supabaseAdmin
        .from("usage_events")
        .select("feature,status,cost_common,cost_pro,cost_ultra,idempotency_key,created_at")
        .eq("user_id", userId)
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .order("created_at", { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from("coins_transactions")
        .select("coin_type,amount,feature,idempotency_key,created_at,meta")
        .eq("user_id", userId)
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .order("created_at", { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from("subscriptions")
        .select("plan_code,status,stripe_subscription_id,stripe_customer_id,current_period_start,current_period_end,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("stripe_webhook_events")
        .select("event_id,event_type,status,received_at,payload")
        .gte("received_at", range.from.toISOString())
        .lte("received_at", range.to.toISOString())
        .order("received_at", { ascending: false })
        .limit(500),
    ]);

    const usageItems = (usageRes.data || []).map((row) => ({
      type: "usage",
      created_at: row.created_at,
      feature: row.feature,
      status: row.status,
      cost_common: row.cost_common,
      cost_pro: row.cost_pro,
      cost_ultra: row.cost_ultra,
      idempotency_key: row.idempotency_key,
    }));

    const coinItems = (coinsRes.data || []).map((row) => ({
      type: "coins",
      created_at: row.created_at,
      coin_type: row.coin_type,
      amount: row.amount,
      feature: row.feature,
      idempotency_key: row.idempotency_key,
      meta: row.meta || {},
    }));

    const subItems = (subsRes.data || []).map((row) => ({
      type: "subscription",
      created_at: row.created_at,
      plan_code: row.plan_code,
      status: row.status,
      stripe_subscription_id: row.stripe_subscription_id,
      stripe_customer_id: row.stripe_customer_id,
      current_period_start: row.current_period_start,
      current_period_end: row.current_period_end,
    }));

    const stripeItems = (stripeRes.data || [])
      .filter((row) => {
        const payload = row.payload || {};
        const userFromMeta = payload?.data?.object?.metadata?.user_id || null;
        const userFromClientRef = payload?.data?.object?.client_reference_id || null;
        const customer = payload?.data?.object?.customer || null;
        return userFromMeta === userId || userFromClientRef === userId || customerIds.has(customer);
      })
      .map((row) => ({
        type: "stripe",
        created_at: row.received_at,
        event_id: row.event_id,
        event_type: row.event_type,
        status: row.status,
      }));

    const items = [...usageItems, ...coinItems, ...subItems, ...stripeItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    return res.json({ ok: true, items });
  } catch {
    return res.status(500).json({ error: "admin_timeline_failed" });
  }
});

router.get("/export/usage.csv", async (req, res) => {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    return res.status(503).json({ error: "admin_unavailable" });
  }
  const range = getRange(req.query.days || 30);
  const feature = String(req.query.feature || "").trim();
  const maxRows = 5000;
  logger.info("admin_export_usage", { adminUserId: req.user.id, days: range.days, feature: feature || null });

  try {
    let query = supabaseAdmin
      .from("usage_events")
      .select("created_at,user_id,feature,status,idempotency_key,cost_common,meta")
      .gte("created_at", range.from.toISOString())
      .lte("created_at", range.to.toISOString())
      .order("created_at", { ascending: false })
      .limit(maxRows);
    if (feature) query = query.eq("feature", feature);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const csv = buildCsv(
      ["created_at", "user_id", "feature", "status", "idempotency_key", "cost_common", "meta_json"],
      (data || []).map((row) => ({
        created_at: row.created_at,
        user_id: row.user_id,
        feature: row.feature,
        status: row.status,
        idempotency_key: row.idempotency_key,
        cost_common: row.cost_common,
        meta_json: JSON.stringify(row.meta || {}),
      }))
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="usage-${range.days}d.csv"`);
    return res.status(200).send(csv);
  } catch {
    return res.status(500).json({ error: "admin_usage_export_failed" });
  }
});

router.get("/export/coins.csv", async (req, res) => {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    return res.status(503).json({ error: "admin_unavailable" });
  }
  const range = getRange(req.query.days || 30);
  const maxRows = 5000;
  logger.info("admin_export_coins", { adminUserId: req.user.id, days: range.days });

  try {
    const { data, error } = await supabaseAdmin
      .from("coins_transactions")
      .select("created_at,user_id,coin_type,amount,feature,idempotency_key")
      .gte("created_at", range.from.toISOString())
      .lte("created_at", range.to.toISOString())
      .order("created_at", { ascending: false })
      .limit(maxRows);
    if (error) return res.status(500).json({ error: error.message });

    const csv = buildCsv(
      ["created_at", "user_id", "delta_common", "delta_pro", "delta_ultra", "feature", "idempotency_key"],
      (data || []).map((row) => ({
        created_at: row.created_at,
        user_id: row.user_id,
        delta_common: row.coin_type === "common" ? row.amount : 0,
        delta_pro: row.coin_type === "pro" ? row.amount : 0,
        delta_ultra: row.coin_type === "ultra" ? row.amount : 0,
        feature: row.feature,
        idempotency_key: row.idempotency_key,
      }))
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="coins-${range.days}d.csv"`);
    return res.status(200).send(csv);
  } catch {
    return res.status(500).json({ error: "admin_coins_export_failed" });
  }
});

/*
PowerShell smoke:

$token="SEU_ACCESS_TOKEN"
$api="http://127.0.0.1:3000"

curl.exe -s "$api/api/admin/overview?days=7" -H "Authorization: Bearer $token"
curl.exe -s "$api/api/admin/users/search?q=ddeea2" -H "Authorization: Bearer $token"
curl.exe -s "$api/api/admin/user/ddeea2cc-303c-4210-ab44-a9e181bec53d/timeline?days=30" -H "Authorization: Bearer $token"

curl.exe -L "$api/api/admin/export/usage.csv?days=7" -H "Authorization: Bearer $token" -o usage.csv
curl.exe -L "$api/api/admin/export/coins.csv?days=7" -H "Authorization: Bearer $token" -o coins.csv
*/

export default router;
