import express from "express";
import { z } from "zod";

import supabaseAdmin from "../config/supabaseAdmin.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireAdmin } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.use(authMiddleware);
router.use(requireAdmin);

router.get("/health", (req, res) => {
  res.json({ ok: true, admin: true });
});

// --------------------
// CONFIGS
// --------------------
router.get("/configs", async (req, res) => {
  const prefix = typeof req.query.prefix === "string" ? req.query.prefix : null;

  let q = supabaseAdmin.from("configs").select("key,value,updated_at").order("key");
  if (prefix) q = q.ilike("key", `${prefix}%`);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ configs: data || [] });
});

router.put("/configs/:key", async (req, res) => {
  const Params = z.object({ key: z.string().min(1).max(200) });
  const Body = z.object({ value: z.any() });

  const { key } = Params.parse(req.params);
  const { value } = Body.parse(req.body);

  const { data, error } = await supabaseAdmin
    .from("configs")
    .upsert({ key, value }, { onConflict: "key" })
    .select("key,value,updated_at")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin.from("audit_logs").insert({
    user_id: req.user.id,
    action: "admin.configs.upsert",
    meta: { key }
  });

  return res.json({ ok: true, config: data });
});

router.delete("/configs/:key", async (req, res) => {
  const Params = z.object({ key: z.string().min(1).max(200) });
  const { key } = Params.parse(req.params);

  const { error } = await supabaseAdmin.from("configs").delete().eq("key", key);
  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin.from("audit_logs").insert({
    user_id: req.user.id,
    action: "admin.configs.delete",
    meta: { key }
  });

  return res.json({ ok: true });
});

// --------------------
// PLANS
// --------------------
router.get("/plans", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("code,name,tier,features,stripe_price_id,created_at")
    .order("tier", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ plans: data || [] });
});

router.put("/plans/:code", async (req, res) => {
  const Params = z.object({ code: z.string().min(2).max(50) });
  const Body = z.object({
    name: z.string().min(2),
    tier: z.number().int().min(0).max(100),
    stripe_price_id: z.string().min(1).nullable().optional(),
    features: z.record(z.any()).default({})
  });

  const { code } = Params.parse(req.params);
  const body = Body.parse(req.body);

  const payload = {
    code,
    name: body.name,
    tier: body.tier,
    stripe_price_id: body.stripe_price_id ?? null,
    features: body.features
  };

  const { data, error } = await supabaseAdmin
    .from("plans")
    .upsert(payload, { onConflict: "code" })
    .select("code,name,tier,features,stripe_price_id")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin.from("audit_logs").insert({
    user_id: req.user.id,
    action: "admin.plans.upsert",
    meta: { code }
  });

  return res.json({ ok: true, plan: data });
});

router.delete("/plans/:code", async (req, res) => {
  const Params = z.object({ code: z.string().min(2).max(50) });
  const { code } = Params.parse(req.params);

  const { error } = await supabaseAdmin.from("plans").delete().eq("code", code);
  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin.from("audit_logs").insert({
    user_id: req.user.id,
    action: "admin.plans.delete",
    meta: { code }
  });

  return res.json({ ok: true });
});

// --------------------
// USERS (roles)
// --------------------
router.patch("/users/:user_id/role", async (req, res) => {
  const Params = z.object({ user_id: z.string().uuid() });
  const Body = z.object({ role: z.enum(["user", "admin"]) });

  const { user_id } = Params.parse(req.params);
  const { role } = Body.parse(req.body);

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .upsert({ user_id, role }, { onConflict: "user_id" })
    .select("user_id,role")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin.from("audit_logs").insert({
    user_id: req.user.id,
    action: "admin.users.set_role",
    meta: { target_user_id: user_id, role }
  });

  return res.json({ ok: true, profile: data });
});

// --------------------
// AUDIT
// --------------------
router.get("/audit", async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("id,user_id,action,meta,created_at")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ logs: data || [] });
});

export default router;
