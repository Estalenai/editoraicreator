import express from "express";
import { z } from "zod";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { adminOnly, isAdminUser } from "../utils/adminAuth.js";
import {
  STATUS_APPROVED,
  STATUS_PENDING,
  STATUS_REJECTED,
  clearBetaAccessCache,
  getBetaAccessStateForUser,
  isClosedBetaEnabled,
  normalizeEmail,
} from "../utils/betaAccess.js";
import { logger } from "../utils/logger.js";
import { sendBetaAccessApprovedEmail } from "../services/betaAccessEmail.js";

const router = express.Router();

const STATUS_VALUES = [STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED];

const CreateWaitlistSchema = z.object({
  email: z.string().email().max(320),
  metadata: z.record(z.any()).optional(),
});

const AdminPatchSchema = z.object({
  status: z.enum(STATUS_VALUES),
  admin_note: z.string().max(1000).optional(),
});

function getAdminClientOr503(res) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    res.status(503).json({ error: "beta_access_unavailable" });
    return null;
  }
  return supabaseAdmin;
}

function parseLimit(value, fallback = 100, max = 500) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function toPublicRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    approved_at: row.approved_at || null,
  };
}

router.post("/request", async (req, res) => {
  const db = getAdminClientOr503(res);
  if (!db) return;

  const parsed = CreateWaitlistSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const nowIso = new Date().toISOString();

  const existing = await db
    .from("beta_access_requests")
    .select("id,email,email_norm,user_id,status,admin_note,metadata,created_at,updated_at,approved_at,approved_by")
    .eq("email_norm", emailNorm)
    .maybeSingle();

  if (existing.error) {
    logger.warn("beta_access_request_lookup_failed", {
      email: emailNorm,
      message: existing.error.message || "unknown_error",
    });
    return res.status(500).json({ error: "beta_access_request_failed" });
  }

  if (existing.data) {
    const patch = await db
      .from("beta_access_requests")
      .update({
        updated_at: nowIso,
        metadata: parsed.data.metadata || existing.data.metadata || {},
      })
      .eq("id", existing.data.id)
      .select("id,email,status,created_at,updated_at,approved_at")
      .maybeSingle();

    if (patch.error || !patch.data) {
      logger.warn("beta_access_request_update_failed", {
        requestId: existing.data.id,
        email: emailNorm,
        message: patch.error?.message || "unknown_error",
      });
      return res.status(500).json({ error: "beta_access_request_failed" });
    }

    clearBetaAccessCache({ email: emailNorm, userId: existing.data.user_id || null });

    return res.status(200).json({
      ok: true,
      request: toPublicRequest(patch.data),
      already_exists: true,
    });
  }

  const created = await db
    .from("beta_access_requests")
    .insert({
      email: emailNorm,
      email_norm: emailNorm,
      status: STATUS_PENDING,
      metadata: parsed.data.metadata || {},
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id,email,status,created_at,updated_at,approved_at")
    .maybeSingle();

  if (created.error || !created.data) {
    logger.warn("beta_access_request_insert_failed", {
      email: emailNorm,
      message: created.error?.message || "unknown_error",
    });
    return res.status(500).json({ error: "beta_access_request_failed" });
  }

  clearBetaAccessCache({ email: emailNorm });
  logger.info("beta_access_request_created", { requestId: created.data.id, email: emailNorm });

  return res.status(201).json({
    ok: true,
    request: toPublicRequest(created.data),
    already_exists: false,
  });
});

router.get("/me", authMiddleware, async (req, res) => {
  const closedBetaEnabled = await isClosedBetaEnabled();
  if (!closedBetaEnabled) {
    return res.json({
      ok: true,
      access: {
        approved: true,
        requested: true,
        status: STATUS_APPROVED,
        request_id: null,
        approved_at: null,
        closed_beta_enabled: false,
      },
    });
  }

  if (isAdminUser(req.user)) {
    return res.json({
      ok: true,
      access: {
        approved: true,
        requested: true,
        status: STATUS_APPROVED,
        request_id: null,
        approved_at: null,
        admin_bypass: true,
        closed_beta_enabled: true,
      },
    });
  }

  try {
    const state = await getBetaAccessStateForUser({
      userId: req.user.id,
      email: req.user.email,
    });
    return res.json({
      ok: true,
      access: {
        approved: state.approved,
        requested: state.requested,
        status: state.status,
        request_id: state.requestId,
        approved_at: state.approvedAt,
        closed_beta_enabled: true,
      },
    });
  } catch (error) {
    logger.warn("beta_access_me_failed", {
      userId: req.user.id,
      message: error?.message || "unknown_error",
    });
    return res.status(500).json({ error: "beta_access_me_failed" });
  }
});

router.get("/admin/requests", authMiddleware, adminOnly, async (req, res) => {
  const db = getAdminClientOr503(res);
  if (!db) return;

  const statusFilter = String(req.query.status || "").trim().toLowerCase();
  const limit = parseLimit(req.query.limit, 200, 500);

  let query = db
    .from("beta_access_requests")
    .select("id,email,email_norm,user_id,status,admin_note,metadata,created_at,updated_at,approved_at,approved_by")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (STATUS_VALUES.includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  const rows = await query;
  if (rows.error) {
    logger.warn("beta_access_admin_list_failed", {
      adminUserId: req.user.id,
      status: statusFilter || "all",
      message: rows.error.message || "unknown_error",
    });
    return res.status(500).json({ error: "beta_access_list_failed" });
  }

  return res.json({ ok: true, items: rows.data || [] });
});

router.patch("/admin/requests/:id", authMiddleware, adminOnly, async (req, res) => {
  const db = getAdminClientOr503(res);
  if (!db) return;

  const requestId = String(req.params.id || "").trim();
  if (!requestId) return res.status(400).json({ error: "invalid_request_id" });

  const parsed = AdminPatchSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const current = await db
    .from("beta_access_requests")
    .select("id,email,email_norm,user_id,status,admin_note,metadata,created_at,updated_at,approved_at,approved_by")
    .eq("id", requestId)
    .maybeSingle();

  if (current.error) {
    return res.status(500).json({ error: "beta_access_update_failed" });
  }
  if (!current.data) {
    return res.status(404).json({ error: "beta_access_request_not_found" });
  }

  const nextStatus = parsed.data.status;
  const nowIso = new Date().toISOString();
  const patch = {
    status: nextStatus,
    admin_note: typeof parsed.data.admin_note === "string" ? parsed.data.admin_note.trim() : null,
    updated_at: nowIso,
    approved_at: nextStatus === STATUS_APPROVED ? nowIso : null,
    approved_by: nextStatus === STATUS_APPROVED ? req.user.id : null,
  };

  const updated = await db
    .from("beta_access_requests")
    .update(patch)
    .eq("id", requestId)
    .select("id,email,email_norm,user_id,status,admin_note,metadata,created_at,updated_at,approved_at,approved_by")
    .maybeSingle();

  if (updated.error || !updated.data) {
    logger.warn("beta_access_admin_update_failed", {
      adminUserId: req.user.id,
      requestId,
      status: nextStatus,
      message: updated.error?.message || "unknown_error",
    });
    return res.status(500).json({ error: "beta_access_update_failed" });
  }

  clearBetaAccessCache({
    userId: updated.data.user_id || null,
    email: updated.data.email_norm || updated.data.email || null,
  });

  let emailNotification = {
    attempted: false,
    sent: false,
    provider: "resend",
    reason: "status_not_approved_transition",
    message_id: null,
    login_url: null,
  };
  if (current.data.status !== STATUS_APPROVED && updated.data.status === STATUS_APPROVED && updated.data.email) {
    try {
      emailNotification = await sendBetaAccessApprovedEmail({
        email: updated.data.email,
      });
    } catch (error) {
      logger.warn("beta_access_approval_email_failed", {
        requestId,
        email_hint: String(updated.data.email || "").slice(0, 3),
        message: error?.message || "unknown_error",
      });
      emailNotification = {
        attempted: true,
        sent: false,
        provider: "resend",
        reason: "send_exception",
        message_id: null,
        login_url: null,
      };
    }
  }

  logger.info("beta_access_admin_updated", {
    adminUserId: req.user.id,
    requestId,
    status: updated.data.status,
    email_notification: {
      attempted: Boolean(emailNotification?.attempted),
      sent: Boolean(emailNotification?.sent),
      provider: emailNotification?.provider || "resend",
      reason: emailNotification?.reason || null,
    },
  });

  return res.json({
    ok: true,
    request: updated.data,
    email_notification: emailNotification,
  });
});

export default router;
