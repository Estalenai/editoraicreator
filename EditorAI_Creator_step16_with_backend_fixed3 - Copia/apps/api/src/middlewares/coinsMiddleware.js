import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || "").trim();
}

function getAuthedSupabaseClient(req) {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anon = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon) throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY");

  const token = getBearerToken(req);
  if (!token) throw new Error("Missing Authorization: Bearer <token>");

  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getDb(req) {
  return isSupabaseAdminEnabled() ? supabaseAdmin : getAuthedSupabaseClient(req);
}

export function chargeCoins({ feature, coins }) {
  const schema = z.object({
    feature: z.string().min(1),
    coins: z.object({
      common: z.number().int().min(0).optional(),
      pro: z.number().int().min(0).optional(),
      ultra: z.number().int().min(0).optional(),
    }),
  });

  const parsed = schema.safeParse({ feature, coins });
  if (!parsed.success) {
    throw new Error(`Invalid chargeCoins config: ${parsed.error.message}`);
  }

  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: "Unauthorized (req.user ausente)" });
      }

      const db = getDb(req);

      // Lê configs usando o mesmo client (admin ou RLS)
      const getConfigValue = async (key) => {
        const { data, error } = await db.from("configs").select("value").eq("key", key).maybeSingle();
        if (error) throw new Error(`Failed to load config ${key}: ${error.message}`);
        return data?.value ?? null;
      };

      const pricing = await getConfigValue(`pricing.${feature}`);
      const apiCostHigh = await getConfigValue("flags.api_cost_high");

      const baseCommon = Number(coins?.common ?? 0);
      const basePro = Number(coins?.pro ?? 0);
      const baseUltra = Number(coins?.ultra ?? 0);

      const cfgCommon = pricing?.common != null ? Number(pricing.common) : baseCommon;
      const cfgPro = pricing?.pro != null ? Number(pricing.pro) : basePro;
      const cfgUltra = pricing?.ultra != null ? Number(pricing.ultra) : baseUltra;

      let commonToCharge = cfgCommon;
      let proToCharge = cfgPro;
      let ultraToCharge = cfgUltra;

      const multiplier =
        apiCostHigh && pricing?.multiplier_when_high_cost != null ? Number(pricing.multiplier_when_high_cost) : 1;

      if (multiplier && multiplier !== 1) {
        commonToCharge = Math.ceil(commonToCharge * multiplier);
        proToCharge = Math.ceil(proToCharge * multiplier);
        ultraToCharge = Math.ceil(ultraToCharge * multiplier);
      }

      if (commonToCharge === 0 && proToCharge === 0 && ultraToCharge === 0) {
        req.coinsCharge = { feature, common: 0, pro: 0, ultra: 0 };
        return next();
      }

      const { data, error } = await db.rpc("coins_debit", {
        p_user_id: req.user.id,
        p_common: commonToCharge,
        p_pro: proToCharge,
        p_ultra: ultraToCharge,
        p_feature: feature,
      });

      if (error) {
        return res.status(400).json({ error: "Falha no consumo de créditos", details: error.message });
      }

      req.coinsCharge = { feature, common: commonToCharge, pro: proToCharge, ultra: ultraToCharge, result: data ?? null };
      return next();
    } catch (err) {
      return res.status(400).json({ error: "Falha no consumo de créditos", details: String(err?.message || err) });
    }
  };
}