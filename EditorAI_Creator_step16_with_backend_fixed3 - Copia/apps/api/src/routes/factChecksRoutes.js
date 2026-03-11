import express from "express";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { attachPlan } from "../middlewares/planMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";

const router = express.Router();

/**
 * PASSO 12 — Histórico de Anti Fake News (Fact-check)
 *
 * GET /api/fact-checks
 * GET /api/fact-checks/:id
 */

router.use(authMiddleware, attachPlan);

router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const sb = createAuthedSupabaseClient(req.access_token);

  const { data, error } = await sb
    .from("fact_checks")
    .select("id, claim, verdict, confidence, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, items: data || [] });
});

router.get("/:id", async (req, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ error: "id inválido" });

  const sb = createAuthedSupabaseClient(req.access_token);

  const { data: fc, error: fcErr } = await sb
    .from("fact_checks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fcErr) return res.status(500).json({ error: fcErr.message });
  if (!fc) return res.status(404).json({ error: "Fact-check não encontrado" });

  const { data: sources, error: sErr } = await sb
    .from("fact_check_sources")
    .select("rank, title, url, snippet, source_name, published_at")
    .eq("fact_check_id", id)
    .order("rank", { ascending: true });

  if (sErr) return res.status(500).json({ error: sErr.message });

  return res.json({ ok: true, fact_check: fc, sources: sources || [] });
});

export default router;
