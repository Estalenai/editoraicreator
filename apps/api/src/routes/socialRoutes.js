import express from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";

const router = express.Router();

router.use(authMiddleware);

const PublishSchema = z.object({
  platform: z.string().min(2),
  kind: z.string().min(2),
  payload: z.any(),
  project_id: z.string().uuid().optional(),
});

router.post("/publish", async (req, res) => {
  try {
    if (!req.access_token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const body = PublishSchema.parse(req.body || {});
    const supabase = createAuthedSupabaseClient(req.access_token);
    const insert = {
      user_id: req.user.id,
      platform: body.platform,
      kind: body.kind,
      payload: body.payload,
      status: "queued",
      error: null,
    };

    const { data, error } = await supabase
      .from("social_publish_jobs")
      .insert(insert)
      .select("id,status")
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ ok: true, job_id: data?.id, status: data?.status || "queued" });
  } catch (e) {
    return res.status(400).json({ error: e?.message || "Dados invalidos" });
  }
});

export default router;
