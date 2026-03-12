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
  title: z.string().min(1),
  kind: z.string().min(1).default("general"),
  data: z.any().optional()
});

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  data: z.any().optional()
});

/**
 * LIST
 * GET /api/projects
 */
router.get("/", async (req, res) => {
  try {
    const supabase = createAuthedSupabaseClient(req.access_token);

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return badRequest(res, error.message);
    return res.json({ items: data || [] });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * GET ONE
 * GET /api/projects/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const supabase = createAuthedSupabaseClient(req.access_token);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) return badRequest(res, error.message);
    if (!data) return notFound(res);
    return res.json({ item: data });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * CREATE
 * POST /api/projects
 */
router.post(
  "/",
  enforcePlanLimit({ resourceKey: "projects", tableName: "projects" }),
  async (req, res) => {
    try {
      const body = CreateSchema.parse(req.body || {});
      const supabase = createAuthedSupabaseClient(req.access_token);

      const insert = {
        user_id: req.user.id,
        title: body.title,
        kind: body.kind,
        data: body.data ?? {}
      };

      const { data, error } = await supabase
        .from("projects")
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

/**
 * UPDATE
 * PATCH /api/projects/:id
 */
router.patch("/:id", async (req, res) => {
  try {
    const body = UpdateSchema.parse(req.body || {});
    const supabase = createAuthedSupabaseClient(req.access_token);

    const { data, error } = await supabase
      .from("projects")
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

/**
 * DELETE
 * DELETE /api/projects/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const supabase = createAuthedSupabaseClient(req.access_token);

    const { data, error } = await supabase
      .from("projects")
      .delete()
      .eq("id", req.params.id)
      .select("id")
      .maybeSingle();

    if (error) return badRequest(res, error.message);
    if (!data) return notFound(res);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
