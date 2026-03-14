import express from "express";
import { z } from "zod";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { logger } from "../utils/logger.js";
import { resolveLang, t } from "../utils/i18n.js";
import { getOrCreateStripeCustomer, stripe } from "../utils/stripe.js";
import {
  buildEnterpriseBreakdown,
  centsToMoney,
  getEnterpriseConfig,
  normalizeEnterpriseQuantities,
  validateEnterpriseQuantities,
} from "../utils/enterpriseConfig.js";

const router = express.Router();
router.use(authMiddleware);

const MAX_QTY = 100_000_000;

const EnterpriseQtySchema = z.object({
  common_qty: z.coerce.number().int().min(0).max(MAX_QTY).default(0),
  pro_qty: z.coerce.number().int().min(0).max(MAX_QTY).default(0),
  ultra_qty: z.coerce.number().int().min(0).max(MAX_QTY).default(0),
});

const EnterpriseCheckoutCreateSchema = EnterpriseQtySchema.extend({
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

function clampLimit(value, fallback = 20) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function getCreateIdempotencyKey(req) {
  const raw = req.headers["idempotency-key"];
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  if (normalized.length < 8) return null;
  return normalized;
}

function idPrefix(value) {
  if (!value || typeof value !== "string") return null;
  return value.slice(0, 8);
}

function maskUser(value) {
  if (!value || typeof value !== "string") return null;
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function hasDifferentCreatePayload(row, quantities, breakdown) {
  if (!row) return false;
  const sameQuantities =
    Number(row.common_qty || 0) === Number(quantities.common_qty || 0) &&
    Number(row.pro_qty || 0) === Number(quantities.pro_qty || 0) &&
    Number(row.ultra_qty || 0) === Number(quantities.ultra_qty || 0);
  const sameTotals =
    Number(row.subtotal_cents || 0) === Number(breakdown.subtotal_cents || 0) &&
    Number(row.total_cents || 0) === Number(breakdown.total_cents || 0);
  return !(sameQuantities && sameTotals);
}

function getDefaultWebBase() {
  return String(process.env.WEB_URL || process.env.WEB_APP_URL || "http://localhost:3001").replace(/\/+$/, "");
}

function buildCheckoutUrls(body = {}) {
  const base = getDefaultWebBase();
  return {
    successUrl: body.success_url || `${base}/enterprise?checkout=success`,
    cancelUrl: body.cancel_url || `${base}/enterprise?checkout=cancel`,
  };
}

function buildCheckoutLineItems(quantities, cfg) {
  const labels = {
    common: "Enterprise Common Credits",
    pro: "Enterprise Pro Credits",
    ultra: "Enterprise Ultra Credits",
  };

  const lineItems = [];
  for (const coinType of ["common", "pro", "ultra"]) {
    const qty = Number(quantities?.[`${coinType}_qty`] || 0);
    if (qty <= 0) continue;
    const unitPrice = Number(cfg?.prices_cents?.[coinType] || 0);
    lineItems.push({
      quantity: qty,
      price_data: {
        currency: "brl",
        unit_amount: unitPrice,
        product_data: {
          name: labels[coinType],
          description: `Enterprise credits (${coinType})`,
        },
      },
    });
  }
  return lineItems;
}

function serializeOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    currency: row.currency,
    common_qty: Number(row.common_qty || 0),
    pro_qty: Number(row.pro_qty || 0),
    ultra_qty: Number(row.ultra_qty || 0),
    unit_price_common_cents: Number(row.unit_price_common_cents || 0),
    unit_price_pro_cents: Number(row.unit_price_pro_cents || 0),
    unit_price_ultra_cents: Number(row.unit_price_ultra_cents || 0),
    subtotal_cents: Number(row.subtotal_cents || 0),
    fee_cents: Number(row.fee_cents || 0),
    total_cents: Number(row.total_cents || 0),
    total_brl: centsToMoney(Number(row.total_cents || 0)),
    stripe_checkout_session_id: row.stripe_checkout_session_id || null,
    stripe_payment_intent_id: row.stripe_payment_intent_id || null,
    credits_granted: Boolean(row.credits_granted),
    created_at: row.created_at,
    updated_at: row.updated_at,
    paid_at: row.paid_at,
  };
}

async function requireEnterpriseEnabled(req, res) {
  const lang = resolveLang(req);
  const config = await getEnterpriseConfig();
  if (!config.enabled) {
    return {
      ok: false,
      config,
      handled: res.status(403).json({
        error: "enterprise_not_available",
        message: t(lang, "enterprise_not_available"),
      }),
    };
  }
  return { ok: true, config };
}

function buildValidationErrorPayload(lang, validationResult) {
  const code = validationResult?.error || "invalid_enterprise_quantities";
  const details = validationResult?.details || {};

  if (code === "min_qty_per_type") {
    return {
      status: 400,
      payload: {
        error: code,
        message: t(lang, "min_qty_per_type", {
          min: details.min_qty_per_type,
          coin_type: details.coin_type,
        }),
        details,
      },
    };
  }

  if (code === "invalid_qty_step") {
    return {
      status: 400,
      payload: {
        error: code,
        message: t(lang, "invalid_qty_step", { step: details.qty_step }),
        details,
      },
    };
  }

  return {
    status: 400,
    payload: {
      error: code,
      message: t(lang, "enterprise_qty_required"),
      details,
    },
  };
}

async function findExistingOrderByCreateIdempotency(userId, idempotencyKey) {
  const { data, error } = await supabaseAdmin
    .from("enterprise_orders")
    .select("*")
    .eq("user_id", userId)
    .eq("idempotency_key_create", idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new Error(`enterprise_order_lookup_failed: ${error.message}`);
  }
  return data || null;
}

async function resolveCheckoutUrl(sessionId) {
  if (!sessionId || !stripe) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session?.url || null;
  } catch {
    return null;
  }
}

router.post("/quote", express.json({ limit: "1mb" }), async (req, res) => {
  const lang = resolveLang(req);
  try {
    if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
      return res.status(503).json({ error: "supabase_admin_unavailable" });
    }

    const gate = await requireEnterpriseEnabled(req, res);
    if (!gate.ok) return gate.handled;

    const parsed = EnterpriseQtySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }

    const quantities = normalizeEnterpriseQuantities(parsed.data);
    const validation = validateEnterpriseQuantities(quantities, gate.config);
    if (!validation.ok) {
      const { status, payload } = buildValidationErrorPayload(lang, validation);
      return res.status(status).json(payload);
    }

    const breakdown = buildEnterpriseBreakdown(quantities, gate.config);
    return res.json({
      ok: true,
      currency: breakdown.currency,
      breakdown,
      rules: {
        min_qty_per_type: gate.config.min_qty_per_type,
        qty_step: gate.config.qty_step,
      },
      note: t(lang, "credits_released_after_payment"),
    });
  } catch (error) {
    logger.error("enterprise_quote_failed", {
      userId: maskUser(req.user?.id),
      message: error?.message || String(error),
    });
    return res.status(500).json({ error: "server_error" });
  }
});

router.post("/checkout/create", express.json({ limit: "1mb" }), async (req, res) => {
  const lang = resolveLang(req);
  try {
    if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
      return res.status(503).json({ error: "supabase_admin_unavailable" });
    }
    if (!stripe) {
      return res.status(503).json({ error: "stripe_not_configured" });
    }

    const gate = await requireEnterpriseEnabled(req, res);
    if (!gate.ok) return gate.handled;

    const createIdempotencyKey = getCreateIdempotencyKey(req);
    if (!createIdempotencyKey) {
      return res.status(400).json({
        error: "idempotency_key_required",
        message: t(lang, "idempotency_key_required"),
      });
    }

    const parsed = EnterpriseCheckoutCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }

    const quantities = normalizeEnterpriseQuantities(parsed.data);
    const validation = validateEnterpriseQuantities(quantities, gate.config);
    if (!validation.ok) {
      const { status, payload } = buildValidationErrorPayload(lang, validation);
      return res.status(status).json(payload);
    }

    const breakdown = buildEnterpriseBreakdown(quantities, gate.config);
    const existingOrder = await findExistingOrderByCreateIdempotency(req.user.id, createIdempotencyKey);

    if (existingOrder) {
      if (hasDifferentCreatePayload(existingOrder, quantities, breakdown)) {
        return res.status(409).json({
          error: "idempotency_conflict",
          message: t(lang, "idempotency_conflict"),
        });
      }

      const checkoutUrl = await resolveCheckoutUrl(existingOrder.stripe_checkout_session_id);
      return res.json({
        ok: true,
        replay: true,
        message: t(lang, "checkout_created"),
        order: serializeOrder(existingOrder),
        checkout: {
          id: existingOrder.stripe_checkout_session_id || null,
          url: checkoutUrl,
        },
      });
    }

    const createPayload = {
      user_id: req.user.id,
      status: "pending",
      currency: "BRL",
      common_qty: quantities.common_qty,
      pro_qty: quantities.pro_qty,
      ultra_qty: quantities.ultra_qty,
      unit_price_common_cents: breakdown.per_type.common.unit_price_cents,
      unit_price_pro_cents: breakdown.per_type.pro.unit_price_cents,
      unit_price_ultra_cents: breakdown.per_type.ultra.unit_price_cents,
      subtotal_cents: breakdown.subtotal_cents,
      fee_cents: breakdown.fee_cents,
      total_cents: breakdown.total_cents,
      idempotency_key_create: createIdempotencyKey,
    };

    const insertResult = await supabaseAdmin
      .from("enterprise_orders")
      .insert(createPayload)
      .select("*")
      .maybeSingle();

    let orderRow = insertResult.data || null;

    if (insertResult.error) {
      const duplicate = String(insertResult.error.message || "").toLowerCase().includes("duplicate");
      if (!duplicate) {
        return res.status(400).json({ error: "enterprise_order_create_failed", details: insertResult.error.message });
      }
      const replayOrder = await findExistingOrderByCreateIdempotency(req.user.id, createIdempotencyKey);
      if (!replayOrder) {
        return res.status(409).json({
          error: "idempotency_conflict",
          message: t(lang, "idempotency_conflict"),
        });
      }
      const checkoutUrl = await resolveCheckoutUrl(replayOrder.stripe_checkout_session_id);
      return res.json({
        ok: true,
        replay: true,
        message: t(lang, "checkout_created"),
        order: serializeOrder(replayOrder),
        checkout: {
          id: replayOrder.stripe_checkout_session_id || null,
          url: checkoutUrl,
        },
      });
    }

    const { successUrl, cancelUrl } = buildCheckoutUrls(parsed.data);
    const lineItems = buildCheckoutLineItems(quantities, gate.config);

    const { stripeCustomerId } = await getOrCreateStripeCustomer({ db: supabaseAdmin, user: req.user });
    const metadata = {
      purchase_kind: "enterprise_credits",
      enterprise_order_id: String(orderRow.id),
      user_id: String(req.user.id),
    };

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: req.user.id,
      metadata,
      payment_intent_data: {
        metadata,
      },
    });

    const sessionId = String(session?.id || "").trim();
    const paymentIntentId = typeof session?.payment_intent === "string" ? session.payment_intent : null;

    const updateResult = await supabaseAdmin
      .from("enterprise_orders")
      .update({
        stripe_checkout_session_id: sessionId || null,
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("id", orderRow.id)
      .eq("user_id", req.user.id)
      .select("*")
      .maybeSingle();

    if (updateResult.error || !updateResult.data) {
      logger.error("enterprise_checkout_session_link_failed", {
        userId: maskUser(req.user.id),
        orderId: orderRow.id,
        sessionIdPrefix: idPrefix(sessionId),
        message: updateResult.error?.message || "missing_updated_row",
      });
      return res.status(500).json({ error: "enterprise_checkout_link_failed" });
    }

    orderRow = updateResult.data;

    logger.info("enterprise_checkout_created", {
      userId: maskUser(req.user.id),
      orderId: orderRow.id,
      sessionIdPrefix: idPrefix(sessionId),
      totalCents: orderRow.total_cents,
    });

    return res.json({
      ok: true,
      message: t(lang, "checkout_created"),
      order: serializeOrder(orderRow),
      checkout: {
        id: sessionId,
        url: session?.url || null,
      },
    });
  } catch (error) {
    logger.error("enterprise_checkout_create_failed", {
      userId: maskUser(req.user?.id),
      idempotencyKeyPrefix: idPrefix(getCreateIdempotencyKey(req)),
      message: error?.message || String(error),
    });
    return res.status(500).json({ error: "enterprise_checkout_failed" });
  }
});

router.get("/orders", async (req, res) => {
  try {
    if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
      return res.status(503).json({ error: "supabase_admin_unavailable" });
    }

    const gate = await requireEnterpriseEnabled(req, res);
    if (!gate.ok) return gate.handled;

    const limit = clampLimit(req.query.limit, 20);
    const { data, error } = await supabaseAdmin
      .from("enterprise_orders")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(400).json({ error: "enterprise_orders_list_failed", details: error.message });
    }

    return res.json({
      ok: true,
      items: (data || []).map((row) => serializeOrder(row)),
    });
  } catch (error) {
    logger.error("enterprise_orders_list_exception", {
      userId: maskUser(req.user?.id),
      message: error?.message || String(error),
    });
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
      return res.status(503).json({ error: "supabase_admin_unavailable" });
    }

    const gate = await requireEnterpriseEnabled(req, res);
    if (!gate.ok) return gate.handled;

    const orderId = String(req.params.id || "").trim();
    if (!orderId) {
      return res.status(400).json({ error: "invalid_order_id" });
    }

    const { data, error } = await supabaseAdmin
      .from("enterprise_orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: "enterprise_order_lookup_failed", details: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: "enterprise_order_not_found" });
    }

    return res.json({
      ok: true,
      order: serializeOrder(data),
    });
  } catch (error) {
    logger.error("enterprise_order_detail_exception", {
      userId: maskUser(req.user?.id),
      message: error?.message || String(error),
    });
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
