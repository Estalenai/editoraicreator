// apps/api/src/middlewares/coinsMiddleware.js
import { z } from "zod";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { getIdempotencyKey } from "../utils/idempotency.js";

/**
 * Extrai access_token do header Authorization
 */
function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || "").trim();
}

/**
 * Escolhe client DB:
 * - Sempre Service Role para RPC financeira.
 */
function getDbClient(req) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    throw new Error("supabase_admin_unavailable_for_financial_rpc");
  }
  return supabaseAdmin;
}

/**
 * Middleware SaaS para debitar Creator Coins antes de executar uma ação.
 * Espera JWT válido (Authorization: Bearer <access_token>).
 */
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

  return async function chargeCoinsMiddleware(req, res, next) {
    try {
      // Seu projeto já usa JWT Supabase; normalmente req.user é setado pelo authMiddleware.
      // Fallback: tenta pegar sub do token, se req.user não existir.
      const userId =
        req.user?.id ||
        (() => {
          const token = getBearerToken(req);
          if (!token) return null;
          // Decodificar JWT manualmente não é ideal; então exigimos req.user.
          // Se req.user não existir, retornamos erro.
          return null;
        })();

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized: user not found in request (missing auth middleware?)" });
      }

      const db = getDbClient(req);

      // ✅ Configs via DB client atual (admin ou RLS)
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
        req.coinsCharge = { common: 0, pro: 0, ultra: 0, feature };
        return next();
      }

      // ✅ Debita via RPC coins_debit_v1
      const idempotencyKey = getIdempotencyKey(req, { scope: `coins_debit:${feature}` });
      const { data, error } = await db.rpc("coins_debit_v1", {
        p_user_id: userId,
        p_common: commonToCharge,
        p_pro: proToCharge,
        p_ultra: ultraToCharge,
        p_feature: feature,
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        console.error("[chargeCoins] coins_debit_v1 error:", error);
        return res.status(400).json({ error: "Falha no consumo de créditos", details: error.message });
      }

      req.coinsCharge = {
        feature,
        common: commonToCharge,
        pro: proToCharge,
        ultra: ultraToCharge,
        result: data ?? null,
      };

      return next();
    } catch (err) {
      console.error("[chargeCoins] unexpected error:", err);
      return res.status(400).json({ error: "Falha no consumo de créditos", details: String(err?.message || err) });
    }
  };
}
