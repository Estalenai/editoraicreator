import express from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { attachPlan } from "../middlewares/planMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";
import supabaseAdmin from "../config/supabaseAdmin.js";
import { stripe } from "../config/stripe.js";
import { getCoinPacksConfig, computeCoinPackPriceCents } from "../utils/coinPacks.js";

const router = express.Router();
router.use(authMiddleware);
router.use(attachPlan);

const BodyCheckout = z.object({
  plan_code: z.string().min(2),
  success_path: z.string().default("/billing/success"),
  cancel_path: z.string().default("/billing/cancel")
});

/**
 * POST /api/billing/checkout-session
 * Cria uma Checkout Session de assinatura (Stripe).
 *
 * Regras:
 * - Usa access_token (Supabase) para identificar o usuário.
 * - Lê o price_id do plano em `plans.stripe_price_id`.
 * - Garante stripe_customer_id em `billing_customers`.
 */
router.post("/checkout-session", async (req, res) => {
  try {
    const { plan_code, success_path, cancel_path } = BodyCheckout.parse(req.body || {});
    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
    const accessToken = req.access_token;

    const supabase = createAuthedSupabaseClient(accessToken);

    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .select("code,name,stripe_price_id")
      .eq("code", plan_code)
      .maybeSingle();

    if (planErr) return res.status(400).json({ error: planErr.message });
    if (!plan?.stripe_price_id) {
      return res.status(400).json({ error: `Plano ${plan_code} não tem stripe_price_id configurado` });
    }

    const userId = req.user.id;
    const email = req.user.email || undefined;

    // lookup customer mapping (admin, sem depender de RLS do client)
    const { data: custRow } = await supabaseAdmin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = custRow?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { user_id: userId, app: "Editor AI Creator" }
      });
      customerId = customer.id;

      await supabaseAdmin.from("billing_customers").upsert({
        user_id: userId,
        stripe_customer_id: customerId
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url: `${baseUrl}${success_path}`,
      cancel_url: `${baseUrl}${cancel_path}`,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        plan_code: plan.code
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          plan_code: plan.code
        }
      }
    });

    return res.json({ url: session.url });
  } catch (e) {
    return res.status(400).json({ error: e?.message || "Erro ao criar checkout session" });
  }
});

const BodyPortal = z.object({
  return_path: z.string().default("/settings/billing")
});

const BodyCoinPackCheckout = z.object({
  sku: z.string().min(2),
  success_path: z.string().default("/billing/coins/success"),
  cancel_path: z.string().default("/billing/coins/cancel")
});

/**
 * POST /api/billing/portal
 * Retorna URL do Stripe Customer Portal (gerenciar assinatura).
 */
router.post("/portal", async (req, res) => {
  try {
    const { return_path } = BodyPortal.parse(req.body || {});
    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
    const userId = req.user.id;

    const { data: custRow } = await supabaseAdmin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!custRow?.stripe_customer_id) {
      return res.status(400).json({ error: "Usuário não possui customer Stripe ainda" });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: custRow.stripe_customer_id,
      return_url: `${baseUrl}${return_path}`
    });

    return res.json({ url: portal.url });
  } catch (e) {
    return res.status(400).json({ error: e?.message || "Erro ao criar portal" });
  }
});

/**
 * POST /api/billing/coin-pack-checkout
 * Cria uma Checkout Session (pagamento avulso) para compra de pacotes de Creator Coins.
 *
 * Regras:
 * - Pacotes vêm do Supabase (configs.coin_packs). Sem configuração, retorna erro claro.
 * - Usuários FREE pagam +15% (regra do produto).
 * - Ultra só é permitido a partir de tiers mais altos (por padrão tier >= 2).
 * - Crédito é aplicado via webhook (PASSO 11), com idempotência.
 */
router.post("/coin-pack-checkout", async (req, res) => {
  try {
    const { sku, success_path, cancel_path } = BodyCoinPackCheckout.parse(req.body || {});
    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

    const packs = await getCoinPacksConfig();
    const pack = packs.find((p) => p.sku === sku);
    if (!pack) return res.status(400).json({ error: `Pacote inválido: ${sku}` });

    // Restrição Ultra (regra do produto): somente a partir de Editor Pro+.
    // Como os tiers completos ainda não foram seeded aqui, usamos tier >= 2 como default.
    if (pack.coin_type === "ultra" && Number(req.plan?.tier ?? 0) < 2) {
      return res.status(403).json({
        error: "Pacote Ultra indisponível para seu plano",
        current_plan: req.plan?.code || "FREE",
        required_min_tier: 2
      });
    }

    const userId = req.user.id;
    const email = req.user.email || undefined;

    // preço dinâmico (FREE +15%)
    const { unitAmountCents, currency } = computeCoinPackPriceCents({
      pack,
      planCode: req.plan?.code || "FREE"
    });

    // customer
    const { data: custRow } = await supabaseAdmin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = custRow?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { user_id: userId, app: "Editor AI Creator" }
      });
      customerId = customer.id;

      await supabaseAdmin.from("billing_customers").upsert({
        user_id: userId,
        stripe_customer_id: customerId
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmountCents,
            product_data: {
              name: `Creator Coins Pack - ${pack.sku}`,
              description: `${pack.coins} ${pack.coin_type.toUpperCase()} Creator Coins`
            }
          }
        }
      ],
      success_url: `${baseUrl}${success_path}`,
      cancel_url: `${baseUrl}${cancel_path}`,
      client_reference_id: userId,
      metadata: {
        type: "coin_pack",
        user_id: userId,
        plan_code: req.plan?.code || "FREE",
        sku: pack.sku,
        coin_type: pack.coin_type,
        coins: String(pack.coins),
        unit_amount_cents: String(unitAmountCents),
        currency
      }
    });

    return res.json({ url: session.url });
  } catch (e) {
    return res.status(400).json({ error: e?.message || "Erro ao criar checkout de pacote" });
  }
});

/**
 * GET /api/billing/coin-packs
 * Lista pacotes configurados (configs.coin_packs) e calcula preço para o plano atual.
 */
router.get("/coin-packs", async (req, res) => {
  try {
    const packs = await getCoinPacksConfig();
    const planCode = req.plan?.code || "FREE";
    const items = packs.map((pack) => {
      const { unitAmountCents, currency } = computeCoinPackPriceCents({ pack, planCode });
      return {
        sku: pack.sku,
        name: pack.name || `Creator Coins Pack - ${pack.sku}`,
        coin_type: pack.coin_type,
        coins: pack.coins,
        currency,
        unit_amount_cents: unitAmountCents,
        surcharge_applied: String(planCode).toUpperCase() === "FREE"
      };
    });
    return res.json({ plan: planCode, packs: items });
  } catch (e) {
    return res.status(400).json({ error: e?.message || "Falha ao carregar packs" });
  }
});

export default router;

