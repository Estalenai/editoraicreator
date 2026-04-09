import express from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../utils/adminAuth.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

const CATEGORY_VALUES = ["duvida", "problema_tecnico", "pedido_financeiro", "outro"];
const STATUS_VALUES = ["open", "in_review", "resolved"];

const CreateSupportRequestSchema = z.object({
  category: z.enum(CATEGORY_VALUES),
  subject: z.string().min(3).max(140),
  message: z.string().min(10).max(4000),
  metadata: z.record(z.any()).optional(),
});

const AdminUpdateStatusSchema = z.object({
  status: z.enum(STATUS_VALUES),
  admin_note: z.string().max(1000).optional(),
  resolution_summary: z.string().max(1000).optional(),
  next_step: z.string().max(240).optional(),
  owner_label: z.string().max(120).optional(),
  queue_label: z.string().max(120).optional(),
});

function buildOpsRef(prefix) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
}

function toTrimmedString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeSupportMetadata(input, payload) {
  const base = input && typeof input === "object" && !Array.isArray(input) ? { ...input } : {};
  const supportRef = toTrimmedString(base.support_ref) || buildOpsRef("SUP");
  const queueLabel =
    toTrimmedString(base.queue_label) ||
    (payload?.category === "pedido_financeiro"
      ? "Financeiro"
      : payload?.category === "problema_tecnico"
        ? "Operação"
        : "Atendimento");
  const lifecycle = Array.isArray(base.lifecycle)
    ? base.lifecycle.filter((item) => item && typeof item === "object")
    : [];

  if (payload) {
    lifecycle.push({
      at: payload.nowIso,
      actor: "requester",
      action: "opened",
      status: "open",
      summary: "Solicitação aberta pelo usuário.",
      subject: payload.subject,
      queue_label: queueLabel,
    });
  }

  return {
    ...base,
    support_ref: supportRef,
    queue_label: queueLabel,
    owner_label: toTrimmedString(base.owner_label),
    last_user_update_at: payload?.nowIso || base.last_user_update_at || null,
    last_admin_update_at: base.last_admin_update_at || null,
    resolution_summary: toTrimmedString(base.resolution_summary),
    next_step: toTrimmedString(base.next_step),
    closed_at: base.closed_at || null,
    lifecycle,
  };
}

function parsePositiveInt(value, fallback, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function getAdminClientOr503(res) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    res.status(503).json({ error: "support_admin_unavailable" });
    return null;
  }
  return supabaseAdmin;
}

router.use(authMiddleware);

router.post("/requests", async (req, res) => {
  const parsed = CreateSupportRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  let db;
  try {
    db = createAuthedSupabaseClient(req.access_token);
  } catch {
    return res.status(503).json({ error: "support_unavailable" });
  }

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: req.user.id,
    category: parsed.data.category,
    subject: parsed.data.subject.trim(),
    message: parsed.data.message.trim(),
    status: "open",
    metadata: normalizeSupportMetadata(parsed.data.metadata, {
      category: parsed.data.category,
      subject: parsed.data.subject.trim(),
      nowIso,
    }),
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data, error } = await db
    .from("support_requests")
    .insert(payload)
    .select("id,user_id,category,subject,message,status,admin_note,metadata,created_at,updated_at")
    .maybeSingle();

  if (error) {
    logger.warn("support_request_create_failed", {
      userId: req.user.id,
      category: parsed.data.category,
      status: "error",
      message: error.message || "unknown_error",
    });
    return res.status(500).json({ error: "support_request_create_failed" });
  }

  logger.info("support_request_created", {
    userId: req.user.id,
    requestId: data?.id || null,
    category: parsed.data.category,
    status: "open",
  });

  return res.status(201).json({ ok: true, request: data });
});

router.get("/requests/me", async (req, res) => {
  const limit = parsePositiveInt(req.query.limit, 50, 200);

  let db;
  try {
    db = createAuthedSupabaseClient(req.access_token);
  } catch {
    return res.status(503).json({ error: "support_unavailable" });
  }

  const { data, error } = await db
    .from("support_requests")
    .select("id,user_id,category,subject,message,status,admin_note,metadata,created_at,updated_at")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn("support_request_list_me_failed", {
      userId: req.user.id,
      status: "error",
      message: error.message || "unknown_error",
    });
    return res.status(500).json({ error: "support_request_list_failed" });
  }

  return res.json({ ok: true, items: data || [] });
});

router.get("/admin/requests", adminOnly, async (req, res) => {
  const db = getAdminClientOr503(res);
  if (!db) return;

  const limit = parsePositiveInt(req.query.limit, 100, 500);
  const statusFilter = String(req.query.status || "").trim();
  const categoryFilter = String(req.query.category || "").trim();

  let query = db
    .from("support_requests")
    .select("id,user_id,category,subject,message,status,admin_note,metadata,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (STATUS_VALUES.includes(statusFilter)) query = query.eq("status", statusFilter);
  if (CATEGORY_VALUES.includes(categoryFilter)) query = query.eq("category", categoryFilter);

  const { data, error } = await query;

  if (error) {
    logger.warn("support_request_list_admin_failed", {
      adminUserId: req.user.id,
      status: "error",
      message: error.message || "unknown_error",
    });
    return res.status(500).json({ error: "support_request_list_failed" });
  }

  return res.json({ ok: true, items: data || [] });
});

router.patch("/admin/requests/:id/status", adminOnly, async (req, res) => {
  const db = getAdminClientOr503(res);
  if (!db) return;

  const parsed = AdminUpdateStatusSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const requestId = String(req.params.id || "").trim();
  if (!requestId) return res.status(400).json({ error: "invalid_request_id" });

  const patch = {
    status: parsed.data.status,
    admin_note: toTrimmedString(parsed.data.admin_note),
    updated_at: new Date().toISOString(),
  };

  const currentRequest = await db
    .from("support_requests")
    .select("id,user_id,category,subject,message,status,admin_note,metadata,created_at,updated_at")
    .eq("id", requestId)
    .maybeSingle();

  if (currentRequest.error) {
    logger.warn("support_request_status_read_failed", {
      adminUserId: req.user.id,
      requestId,
      message: currentRequest.error.message || "unknown_error",
    });
    return res.status(500).json({ error: "support_request_update_failed" });
  }

  if (!currentRequest.data) return res.status(404).json({ error: "support_request_not_found" });

  const currentMetadata =
    currentRequest.data.metadata && typeof currentRequest.data.metadata === "object" && !Array.isArray(currentRequest.data.metadata)
      ? { ...currentRequest.data.metadata }
      : {};
  const lifecycle = Array.isArray(currentMetadata.lifecycle)
    ? currentMetadata.lifecycle.filter((item) => item && typeof item === "object")
    : [];
  const nextPatchAt = patch.updated_at;
  const queueLabel = toTrimmedString(parsed.data.queue_label) || toTrimmedString(currentMetadata.queue_label);
  const ownerLabel = toTrimmedString(parsed.data.owner_label) || toTrimmedString(currentMetadata.owner_label);
  const resolutionSummary = toTrimmedString(parsed.data.resolution_summary) || toTrimmedString(currentMetadata.resolution_summary);
  const nextStep = toTrimmedString(parsed.data.next_step) || toTrimmedString(currentMetadata.next_step);
  lifecycle.push({
    at: nextPatchAt,
    actor: "admin",
    action:
      parsed.data.status === "resolved"
        ? "resolved"
        : parsed.data.status === "in_review"
          ? "triaged"
          : "reopened",
    status: parsed.data.status,
    summary:
      parsed.data.status === "resolved"
        ? "Caso resolvido e pronto para encerramento."
        : parsed.data.status === "in_review"
          ? "Caso em análise pela equipe."
          : "Caso reaberto para nova investigação.",
    admin_user_id: req.user.id,
    admin_note: patch.admin_note,
    resolution_summary: resolutionSummary,
    next_step: nextStep,
    owner_label: ownerLabel,
    queue_label: queueLabel,
  });

  patch.metadata = {
    ...currentMetadata,
    support_ref: toTrimmedString(currentMetadata.support_ref) || buildOpsRef("SUP"),
    queue_label: queueLabel,
    owner_label: ownerLabel,
    resolution_summary: resolutionSummary,
    next_step: nextStep,
    last_admin_update_at: nextPatchAt,
    closed_at: parsed.data.status === "resolved" ? nextPatchAt : null,
    lifecycle,
  };

  const { data, error } = await db
    .from("support_requests")
    .update(patch)
    .eq("id", requestId)
    .select("id,user_id,category,subject,message,status,admin_note,metadata,created_at,updated_at")
    .maybeSingle();

  if (error) {
    logger.warn("support_request_status_update_failed", {
      adminUserId: req.user.id,
      requestId,
      status: parsed.data.status,
      message: error.message || "unknown_error",
    });
    return res.status(500).json({ error: "support_request_update_failed" });
  }

  if (!data) return res.status(404).json({ error: "support_request_not_found" });

  logger.info("support_request_status_updated", {
    adminUserId: req.user.id,
    requestId: data.id,
    status: data.status,
  });

  return res.json({ ok: true, request: data });
});

export default router;
