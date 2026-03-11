import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";

const router = express.Router();

router.use(authMiddleware);

/**
 * GET /api/coins/balance
 */
router.get("/balance", async (req, res) => {
  try {
    const supabase = createAuthedSupabaseClient(req.access_token);
    const { data, error } = await supabase
      .from("creator_coins_wallet")
      .select("user_id, common, pro, ultra, updated_at")
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });

    // Se ainda não existir wallet (antes do SQL), retorna zeros
    return res.json({
      wallet: data || { user_id: req.user.id, common: 0, pro: 0, ultra: 0 }
    });
  } catch (e) {
    return res.status(500).json({ error: "Falha ao obter saldo" });
  }
});

/**
 * GET /api/coins/transactions?limit=50
 */
router.get("/transactions", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const supabase = createAuthedSupabaseClient(req.access_token);

    const { data, error } = await supabase
      .from("coins_transactions")
      .select("id, coin_type, amount, reason, feature, ref_kind, ref_id, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ transactions: data });
  } catch (e) {
    return res.status(500).json({ error: "Falha ao obter transações" });
  }
});

export default router;
