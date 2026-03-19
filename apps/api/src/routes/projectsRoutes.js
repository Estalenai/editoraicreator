import express from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { attachPlan } from "../middlewares/planMiddleware.js";
import { enforcePlanLimit } from "../middlewares/limitMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";
import { recordProductEvent } from "../utils/eventsStore.js";

const router = express.Router();
router.use(authMiddleware);
router.use(attachPlan);

function badRequest(res, message, details) {
  return res.status(400).json({ error: message, details });
}
function notFound(res, message = "Registro não encontrado") {
  return res.status(404).json({ error: message });
}

function trackProjectEvent(req, event, additional = {}) {
  try {
    recordProductEvent({
      event,
      userId: req.user?.id || null,
      plan: req.plan?.code || null,
      additional,
    });
  } catch {
    // non-blocking telemetry
  }
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
      .eq("user_id", req.user.id)
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
      .eq("user_id", req.user.id)
      .maybeSingle();

      if (error) return badRequest(res, error.message);
      if (!data) return notFound(res);
      trackProjectEvent(req, "project.opened", {
        source: "projects.get",
        status: "success",
      });
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
        kind: (body.kind === "post" || body.kind === "creator_post") ? "text" : body.kind,
        data: body.data ?? {}
      };

      const { data, error } = await supabase
        .from("projects")
        .insert(insert)
        .select("*")
        .maybeSingle();

      if (error) return badRequest(res, error.message);
      trackProjectEvent(req, "project.created", {
        source: "projects.create",
        status: "success",
      });
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
      .eq("user_id", req.user.id)
      .select("*")
      .maybeSingle();

      if (error) return badRequest(res, error.message);
      if (!data) return notFound(res);
      trackProjectEvent(req, "project.saved", {
        source: "projects.update",
        status: "success",
      });
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
      .eq("user_id", req.user.id)
      .select("id")
      .maybeSingle();

      if (error) return badRequest(res, error.message);
      if (!data) return notFound(res);
      trackProjectEvent(req, "project.deleted", {
        source: "projects.delete",
        status: "success",
      });
      return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
