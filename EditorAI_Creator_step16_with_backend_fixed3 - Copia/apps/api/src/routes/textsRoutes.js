import express from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { attachPlan } from "../middlewares/planMiddleware.js";
import { enforcePlanLimit } from "../middlewares/limitMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";

const router = express.Router();
router.use(authMiddleware);
router.use(attachPlan);

function badRequest(res, message, details) {
  return res.status(400).json({ error: message, details });
}
function notFound(res, message = "Registro não encontrado") {
  return res.status(404).json({ error: message });
}

const CreateSchema = z.object({
  project_id: z.string().uuid().optional(),
  title: z.string().min(1),
  content: z.string().default(""),
  meta: z.any().optional()
});

const UpdateSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  meta: z.any().optional()
});

router.get("/", async (req, res) => {
  try {
    const supabase = createAuthedSupabaseClient(req.access_token);
    const { data, error } = await supabase
      .from("texts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return badRequest(res, error.message);
    return res.json({ items: data || [] });
  } catch {
    return res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const supabase = createAuthedSupabaseClient(req.access_token);
    const { data, error } = await supabase
      .from("texts")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) return badRequest(res, error.message);
    if (!data) return notFound(res);
    return res.json({ item: data });
  } catch {
    return res.status(500).json({ error: "Erro interno" });
  }
});

router.post(
  "/",
  enforcePlanLimit({ resourceKey: "texts", tableName: "texts" }),
  async (req, res) => {
    try {
      const body = CreateSchema.parse(req.body || {});
      const supabase = createAuthedSupabaseClient(req.access_token);

      const insert = {
        user_id: req.user.id,
        project_id: body.project_id ?? null,
        title: body.title,
        content: body.content,
        meta: body.meta ?? {}
      };

      const { data, error } = await supabase
        .from("texts")
        .insert(insert)
        .select("*")
        .maybeSingle();

      if (error) return badRequest(res, error.message);
      return res.status(201).json({ item: data });
    } catch (e) {
      return badRequest(res, e?.message || "Dados inválidos");
    }
  }
);

router.patch("/:id", async (req, res) => {
  try {
    const body = UpdateSchema.parse(req.body || {});
    const supabase = createAuthedSupabaseClient(req.access_token);

    const { data, error } = await supabase
      .from("texts")
      .update(body)
      .eq("id", req.params.id)
      .select("*")
      .maybeSingle();

    if (error) return badRequest(res, error.message);
    if (!data) return notFound(res);
    return res.json({ item: data });
  } catch (e) {
    return badRequest(res, e?.message || "Dados inválidos");
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const supabase = createAuthedSupabaseClient(req.access_token);
    const { data, error } = await supabase
      .from("texts")
      .delete()
      .eq("id", req.params.id)
      .select("id")
      .maybeSingle();

    if (error) return badRequest(res, error.message);
    if (!data) return notFound(res);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
