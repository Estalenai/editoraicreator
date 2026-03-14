import express from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

const MODE_VALUES = ["timed", "continuous"];
const STATUS_VALUES = ["draft", "active", "paused", "ended", "canceled"];
const INTENSITY_VALUES = ["basic", "balanced", "aggressive"];
const MOMENT_VALUES = ["engracado", "marcante", "impactante", "highlights_gerais", "outro"];

const CreateLiveCutSessionSchema = z.object({
  source_label: z.string().max(120).optional(),
  mode: z.enum(MODE_VALUES),
  requested_duration_minutes: z.coerce.number().int().min(15).max(720).optional(),
  estimate_preview_minutes: z.coerce.number().int().min(30).max(720).optional(),
  intensity: z.enum(INTENSITY_VALUES).default("balanced"),
  preferred_moments: z.array(z.enum(MOMENT_VALUES)).max(5).default(["highlights_gerais"]),
  auto_post_enabled: z.boolean().optional().default(false),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.any()).optional(),
});

const UpdateLiveCutStatusSchema = z.object({
  status: z.enum(["active", "paused", "ended", "canceled"]),
  accepted_estimate: z.boolean().optional(),
});

function parsePositiveInt(value, fallback, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function getAuthedDbOr503(req, res) {
  try {
    return createAuthedSupabaseClient(req.access_token);
  } catch {
    res.status(503).json({ error: "live_cuts_unavailable" });
    return null;
  }
}

function buildEstimate({ mode, requestedDurationMinutes, previewMinutes, intensity }) {
  const blockMinutes = 30;
  const horizonMinutes =
    mode === "timed" ? Number(requestedDurationMinutes || previewMinutes) : Number(previewMinutes || 120);
  const blocks = Math.max(1, Math.ceil(horizonMinutes / blockMinutes));

  let creditType = "pro";
  let creditAmount = blocks;
  if (intensity === "balanced") {
    creditType = "pro";
    creditAmount = blocks * 2;
  } else if (intensity === "aggressive") {
    creditType = "ultra";
    creditAmount = blocks;
  }

  const note =
    mode === "continuous"
      ? `Estimativa para ${horizonMinutes} minutos de operacao continua.`
      : `Estimativa para ${horizonMinutes} minutos no modo com tempo definido.`;

  return {
    horizon_minutes: horizonMinutes,
    block_minutes: blockMinutes,
    credit_type: creditType,
    credit_amount: creditAmount,
    note,
  };
}

router.use(authMiddleware);

router.post("/sessions", async (req, res) => {
  const parsed = CreateLiveCutSessionSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const db = getAuthedDbOr503(req, res);
  if (!db) return;

  const mode = parsed.data.mode;
  const requestedDurationMinutes =
    mode === "timed" ? Number(parsed.data.requested_duration_minutes || 0) || null : null;

  if (mode === "timed" && !requestedDurationMinutes) {
    return res.status(400).json({
      error: "invalid_body",
      details: { requested_duration_minutes: "required_when_mode_is_timed" },
    });
  }

  const estimatePreviewMinutes =
    mode === "timed"
      ? Number(requestedDurationMinutes)
      : Number(parsed.data.estimate_preview_minutes || 120);

  const estimate = buildEstimate({
    mode,
    requestedDurationMinutes,
    previewMinutes: estimatePreviewMinutes,
    intensity: parsed.data.intensity,
  });

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: req.user.id,
    source_label: parsed.data.source_label?.trim() || null,
    mode,
    requested_duration_minutes: requestedDurationMinutes,
    estimate_preview_minutes: estimatePreviewMinutes,
    status: "draft",
    intensity: parsed.data.intensity,
    preferred_moments: parsed.data.preferred_moments || ["highlights_gerais"],
    target_style: {
      preferred_moments: parsed.data.preferred_moments || ["highlights_gerais"],
      notes: parsed.data.notes?.trim() || null,
    },
    estimated_credit_type: estimate.credit_type,
    estimated_credit_amount: estimate.credit_amount,
    accepted_estimate: false,
    auto_post_enabled: Boolean(parsed.data.auto_post_enabled),
    metadata: parsed.data.metadata || {},
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data, error } = await db
    .from("live_cut_sessions")
    .insert(payload)
    .select(
      "id,user_id,source_label,mode,requested_duration_minutes,estimate_preview_minutes,status,intensity,preferred_moments,target_style,estimated_credit_type,estimated_credit_amount,accepted_estimate,auto_post_enabled,metadata,created_at,updated_at,started_at,ended_at"
    )
    .maybeSingle();

  if (error) {
    logger.warn("live_cuts_create_failed", {
      userId: req.user.id,
      mode,
      status: "error",
      message: error.message || "unknown_error",
    });
    return res.status(500).json({ error: "live_cut_session_create_failed" });
  }

  logger.info("live_cuts_session_created", {
    userId: req.user.id,
    sessionId: data?.id || null,
    mode,
    status: "draft",
  });

  return res.status(201).json({
    ok: true,
    session: data,
    estimate,
  });
});

router.get("/sessions", async (req, res) => {
  const db = getAuthedDbOr503(req, res);
  if (!db) return;

  const limit = parsePositiveInt(req.query.limit, 50, 200);
  const { data, error } = await db
    .from("live_cut_sessions")
    .select(
      "id,user_id,source_label,mode,requested_duration_minutes,estimate_preview_minutes,status,intensity,preferred_moments,target_style,estimated_credit_type,estimated_credit_amount,accepted_estimate,auto_post_enabled,metadata,created_at,updated_at,started_at,ended_at"
    )
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn("live_cuts_list_failed", {
      userId: req.user.id,
      status: "error",
      message: error.message || "unknown_error",
    });
    return res.status(500).json({ error: "live_cut_session_list_failed" });
  }

  return res.json({ ok: true, items: data || [] });
});

router.get("/sessions/:id", async (req, res) => {
  const db = getAuthedDbOr503(req, res);
  if (!db) return;

  const sessionId = String(req.params.id || "").trim();
  if (!sessionId) return res.status(400).json({ error: "invalid_session_id" });

  const { data, error } = await db
    .from("live_cut_sessions")
    .select(
      "id,user_id,source_label,mode,requested_duration_minutes,estimate_preview_minutes,status,intensity,preferred_moments,target_style,estimated_credit_type,estimated_credit_amount,accepted_estimate,auto_post_enabled,metadata,created_at,updated_at,started_at,ended_at"
    )
    .eq("id", sessionId)
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error) {
    logger.warn("live_cuts_detail_failed", {
      userId: req.user.id,
      sessionId,
      status: "error",
      message: error.message || "unknown_error",
    });
    return res.status(500).json({ error: "live_cut_session_detail_failed" });
  }

  if (!data) return res.status(404).json({ error: "live_cut_session_not_found" });

  return res.json({ ok: true, session: data });
});

router.patch("/sessions/:id/status", async (req, res) => {
  const parsed = UpdateLiveCutStatusSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const db = getAuthedDbOr503(req, res);
  if (!db) return;

  const sessionId = String(req.params.id || "").trim();
  if (!sessionId) return res.status(400).json({ error: "invalid_session_id" });

  const { data: existing, error: existingError } = await db
    .from("live_cut_sessions")
    .select(
      "id,user_id,status,accepted_estimate,estimated_credit_type,estimated_credit_amount,requested_duration_minutes,estimate_preview_minutes"
    )
    .eq("id", sessionId)
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (existingError) {
    return res.status(500).json({ error: "live_cut_session_detail_failed" });
  }
  if (!existing) return res.status(404).json({ error: "live_cut_session_not_found" });

  const nextStatus = parsed.data.status;
  const acceptedEstimate = parsed.data.accepted_estimate === true || existing.accepted_estimate === true;

  if (nextStatus === "active" && !acceptedEstimate) {
    return res.status(400).json({
      error: "estimate_not_accepted",
      message: "Confirme a estimativa antes de ativar a sessao.",
    });
  }

  const nowIso = new Date().toISOString();
  const patch = {
    status: nextStatus,
    accepted_estimate: acceptedEstimate,
    updated_at: nowIso,
    started_at: nextStatus === "active" && !existing.started_at ? nowIso : existing.started_at || null,
    ended_at: nextStatus === "ended" || nextStatus === "canceled" ? nowIso : existing.ended_at || null,
  };

  const { data, error } = await db
    .from("live_cut_sessions")
    .update(patch)
    .eq("id", sessionId)
    .eq("user_id", req.user.id)
    .select(
      "id,user_id,source_label,mode,requested_duration_minutes,estimate_preview_minutes,status,intensity,preferred_moments,target_style,estimated_credit_type,estimated_credit_amount,accepted_estimate,auto_post_enabled,metadata,created_at,updated_at,started_at,ended_at"
    )
    .maybeSingle();

  if (error) {
    logger.warn("live_cuts_status_update_failed", {
      userId: req.user.id,
      sessionId,
      status: nextStatus,
      message: error.message || "unknown_error",
    });
    return res.status(500).json({ error: "live_cut_session_update_failed" });
  }

  logger.info("live_cuts_status_updated", {
    userId: req.user.id,
    sessionId,
    status: nextStatus,
  });

  return res.json({ ok: true, session: data });
});

/*
PowerShell quick tests:

$token = "SEU_ACCESS_TOKEN"
$api = "http://127.0.0.1:3000"

@'
{
  "source_label":"Live semanal YouTube",
  "mode":"timed",
  "requested_duration_minutes":120,
  "intensity":"balanced",
  "preferred_moments":["marcante","impactante"],
  "auto_post_enabled":false
}
'@ | Set-Content .\live-cuts-create.json

curl.exe -s -X POST "$api/api/live-cuts/sessions" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  --data-binary "@live-cuts-create.json"

curl.exe -s "$api/api/live-cuts/sessions" -H "Authorization: Bearer $token"
*/

export default router;
