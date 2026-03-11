import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/usage/ai?limit=50
 * Histórico de uso de IA (telemetria).
 */
router.get("/ai", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const supabase = createAuthedSupabaseClient(req.access_token);

    const { data, error } = await supabase
      .from("ai_usage")
      .select("id, provider, model, feature, coins_type, coins_amount, cost_usd, tokens_in, tokens_out, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ usage: data });
  } catch (e) {
    return res.status(500).json({ error: "Falha ao obter histórico de uso" });
  }
});

export default router;
