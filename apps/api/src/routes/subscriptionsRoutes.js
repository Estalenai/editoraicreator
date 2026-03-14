import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";

const router = express.Router();
const ACTIVE_LIKE_STATUSES = ["active", "trialing", "past_due"];

router.use(authMiddleware);

/**
 * GET /api/subscriptions/me
 */
router.get("/me", async (req, res) => {
  try {
    if (!req.access_token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const supabase = createAuthedSupabaseClient(req.access_token);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", req.user.id)
      .in("status", ACTIVE_LIKE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });

    if (!data) {
      return res.json({ plan_code: "FREE", status: "inactive", subscription: null });
    }

    return res.json({
      plan_code: data.plan_code || "FREE",
      status: data.status || "active",
      subscription: data,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
