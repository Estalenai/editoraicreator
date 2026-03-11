import express from "express";
import supabaseAdmin from "../config/supabaseAdmin.js";
import { stripe, STRIPE_WEBHOOK_SECRET, isStripeWebhookEnabled } from "../config/stripe.js";

const router = express.Router();

/**
 * POST /webhooks/stripe
 * Requer raw body no server.js:
 * app.use("/webhooks", express.raw({ type: "application/json" }), webhooksRoutes)
 */
router.post("/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!isStripeWebhookEnabled()) {
    return res.status(503).json({
      error: "stripe_webhook_disabled",
      message:
        "Stripe webhook não configurado. Defina STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET no .env para habilitar."
    });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.user_id || session.client_reference_id;
        const planCode = session.metadata?.plan_code;
        const metaType = session.metadata?.type;

        if (userId) {
          // Sempre auditar
          await supabaseAdmin.from("audit_logs").insert({
            user_id: userId,
            action: "stripe.checkout.session.completed",
            meta: { sessionId: session.id, planCode, metaType }
          });

          // Compra de pacote de coins
          if (metaType === "coin_pack") {
            const sku = session.metadata?.sku;
            const coinType = session.metadata?.coin_type;
            const coins = Number(session.metadata?.coins || 0);

            if (sku && coinType && coins > 0) {
              // Idempotência: registrar compra pela sessionId (único)
              const { error: insErr } = await supabaseAdmin.from("coin_purchases").upsert(
                {
                  user_id: userId,
                  stripe_session_id: session.id,
                  sku,
                  coin_type: coinType,
                  coins,
                  status: "paid",
                  meta: {
                    amount_total: session.amount_total,
                    currency: session.currency,
                    payment_intent: session.payment_intent
                  }
                },
                { onConflict: "stripe_session_id" }
              );

              if (insErr) {
                await supabaseAdmin.from("audit_logs").insert({
                  user_id: userId,
                  action: "coin_purchases.upsert.failed",
                  meta: { sessionId: session.id, error: insErr.message }
                });
                break;
              }

              const { data: purchase } = await supabaseAdmin
                .from("coin_purchases")
                .select("id,credited")
                .eq("stripe_session_id", session.id)
                .maybeSingle();

              // Se já foi creditado, idempotência
              if (purchase?.credited) break;

              // Creditar via RPC (PASSO 9). Se ainda não executou o SQL, falhará com erro claro.
              const { error: creditErr } = await supabaseAdmin.rpc("coins_credit", {
                  p_user_id: userId,
                  p_coin_type: String(coinType),
                  p_amount: coins,
                  p_reason: `stripe_coin_pack:${sku}`,
                  p_ref_kind: "stripe_checkout_session",
                  p_ref_id: session.id,
                  p_idempotency_key: session.id
                });

              if (!creditErr) {
                await supabaseAdmin
                  .from("coin_purchases")
                  .update({ credited: true, credited_at: new Date().toISOString() })
                  .eq("stripe_session_id", session.id)
                  .eq("credited", false);
              }

              await supabaseAdmin.from("audit_logs").insert({
                user_id: userId,
                action: creditErr ? "coins.credit.failed" : "coins.credit.succeeded",
                meta: {
                  sku,
                  coinType,
                  coins,
                  sessionId: session.id,
                  error: creditErr?.message || null
                }
              });
            }
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id || null;
        const planCode = sub.metadata?.plan_code || null;

        if (userId) {
          await supabaseAdmin.from("subscriptions").upsert(
            {
              user_id: userId,
              stripe_subscription_id: sub.id,
              stripe_customer_id: sub.customer,
              status: sub.status,
              plan_code: planCode,
              current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
              cancel_at_period_end: !!sub.cancel_at_period_end
            },
            { onConflict: "stripe_subscription_id" }
          );

          await supabaseAdmin.from("audit_logs").insert({
            user_id: userId,
            action: `stripe.${event.type}`,
            meta: { subId: sub.id, status: sub.status, planCode }
          });
        }
        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: "Falha ao processar webhook" });
  }
});

export default router;
