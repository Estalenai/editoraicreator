import express from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { logger } from "../utils/logger.js";
import { stripe, getOrCreateStripeCustomer } from "../utils/stripe.js";
import {
  assertValidPlanCode,
  getPlanCodeByPriceId,
  getPriceIdByPlanCode,
} from "../utils/stripePlans.js";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";

const router = express.Router();

const LegacyCheckoutSchema = z.object({
  mode: z.enum(["subscription", "payment"]).default("subscription"),
  plan_code: z.string().trim().min(1).optional(),
  price_id: z.string().trim().min(1).optional(),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
  quantity: z.coerce.number().int().positive().max(20).default(1),
  metadata: z.record(z.any()).optional(),
});

function setDeprecatedHeaders(res) {
  res.setHeader("X-Deprecated", "true");
}

function buildDeprecatedWarning(extra = {}) {
  return {
    warning: "billing legacy deprecated",
    suggest: "use /api/stripe/checkout/session",
    ...extra,
  };
}

function getDb() {
  return isSupabaseAdminEnabled() && supabaseAdmin ? supabaseAdmin : null;
}

function resolvePlanCode({ plan_code, price_id }) {
  if (plan_code) {
    return { planCode: assertValidPlanCode(plan_code) };
  }

  if (price_id) {
    const mappedPlan = getPlanCodeByPriceId(price_id);
    if (!mappedPlan) return { error: "invalid_plan_code" };
    return { planCode: mappedPlan };
  }

  return { error: "invalid_plan_code" };
}

async function handleLegacyCheckout(req, res) {
  setDeprecatedHeaders(res);
  const db = getDb();
  if (!stripe || !db) {
    return res.status(503).json({
      error: "stripe_not_configured",
      ...buildDeprecatedWarning(),
    });
  }

  const parsed = LegacyCheckoutSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_body",
      details: parsed.error.flatten(),
      ...buildDeprecatedWarning(),
    });
  }

  const body = parsed.data;
  let planCode;
  try {
    const resolved = resolvePlanCode(body);
    if (resolved.error) {
      return res.status(400).json({
        error: resolved.error,
        ...buildDeprecatedWarning(),
      });
    }
    planCode = resolved.planCode;
  } catch {
    return res.status(400).json({
      error: "invalid_plan_code",
      ...buildDeprecatedWarning(),
    });
  }

  const priceId = getPriceIdByPlanCode(planCode);
  if (!priceId) {
    return res.status(400).json({
      error: "plan_unavailable",
      plan_code: planCode,
      ...buildDeprecatedWarning(),
    });
  }

  try {
    const user = req.user;
    const { stripeCustomerId } = await getOrCreateStripeCustomer({ db, user });
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: body.mode,
      line_items: [{ price: priceId, quantity: body.quantity }],
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      client_reference_id: user.id,
      metadata: {
        ...(body.metadata || {}),
        user_id: user.id,
        plan_code: planCode,
        price_id: priceId,
        source: "billing_legacy",
      },
    });

    logger.warn("billing_legacy_checkout_used", {
      userId: user.id ? `${user.id.slice(0, 6)}...${user.id.slice(-4)}` : null,
      planCode,
      mode: body.mode,
      sessionIdPrefix: session?.id?.slice(0, 8) || null,
    });

    return res.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
      ...buildDeprecatedWarning(),
    });
  } catch (error) {
    logger.error("billing_legacy_checkout_failed", {
      message: error?.message || "stripe_checkout_failed",
      userId: req.user?.id ? `${req.user.id.slice(0, 6)}...${req.user.id.slice(-4)}` : null,
    });
    return res.status(500).json({
      error: "stripe_checkout_failed",
      ...buildDeprecatedWarning(),
    });
  }
}

router.post("/checkout-session", express.json({ limit: "1mb" }), authMiddleware, handleLegacyCheckout);
router.post("/checkout/session", express.json({ limit: "1mb" }), authMiddleware, handleLegacyCheckout);

router.all("*", (req, res) => {
  setDeprecatedHeaders(res);
  return res.status(410).json({
    error: "billing_route_deprecated",
    ...buildDeprecatedWarning(),
  });
});

export default router;
