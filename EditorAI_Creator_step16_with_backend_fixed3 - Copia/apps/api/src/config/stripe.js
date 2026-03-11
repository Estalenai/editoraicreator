// apps/api/src/config/stripe.js
import Stripe from "stripe";

export const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || "").trim();
export const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
export const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || "2024-06-20";

/**
 * Stripe é opcional em ambiente dev/teste.
 * - Se STRIPE_SECRET_KEY não estiver setada, exportamos stripe=null
 * - As rotas Stripe/webhooks devem checar as flags abaixo.
 */
export const stripe =
  STRIPE_SECRET_KEY.length > 0
    ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION })
    : null;

export const isStripeEnabled = () => stripe !== null;
export const isStripeWebhookEnabled = () =>
  STRIPE_SECRET_KEY.length > 0 && STRIPE_WEBHOOK_SECRET.length > 0;
