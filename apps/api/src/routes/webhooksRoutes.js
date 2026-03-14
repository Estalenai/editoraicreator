import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger.js";

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

// ⚠️ webhook precisa de RAW body
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      logger.error("legacy_webhook_invalid_signature", { message: err?.message || "invalid_signature" });
      return res.status(400).send(`Webhook Error`);
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
      // ✅ QUANDO O CHECKOUT FINALIZA
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const userId = session.metadata?.user_id;
        const planCode = session.metadata?.plan_code;
        const subscriptionId = session.subscription;
        const customerId = session.customer;

        if (!userId || !planCode) {
          logger.warn("legacy_webhook_metadata_incomplete", { status: "ignored" });
          return res.json({ received: true });
        }

        // Atualiza assinatura
        const { error: subError } = await supabase
          .from("subscriptions")
          .update({
            status: "active",
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
          })
          .eq("user_id", userId)
          .eq("plan_code", planCode);

        if (subError) {
          logger.error("legacy_webhook_subscription_update_failed", { message: subError.message });
          throw subError;
        }

        // 🚀 Provisiona coins automaticamente
        const { error: fnError } = await supabase.rpc(
          "provision_subscription_and_coins",
          {
            p_user_id: userId,
            p_plan_code: planCode,
          }
        );

        if (fnError) {
          logger.error("legacy_webhook_coins_provision_failed", { message: fnError.message });
          throw fnError;
        }

        logger.info("legacy_webhook_subscription_provisioned", { status: "success" });
      }

      res.json({ received: true });
    } catch (err) {
      logger.error("legacy_webhook_processing_failed", { message: err?.message || "processing_failed" });
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

export default router;
