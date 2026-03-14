import { z } from "zod";
import { ensureCreditsOrAutoConvert } from "../services/autoConvertService.js";

export function ensureCredits({ tier, amount }) {
  const schema = z.object({
    tier: z.enum(["common", "pro", "ultra"]),
    amount: z.number().int().positive(),
  });

  const parsed = schema.safeParse({ tier, amount });
  if (!parsed.success) {
    throw new Error(`Invalid ensureCredits config: ${parsed.error.message}`);
  }

  return async function ensureCreditsMiddleware(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "missing_user" });
      }

      await ensureCreditsOrAutoConvert({
        userId,
        requiredTier: parsed.data.tier,
        requiredAmount: parsed.data.amount,
        planCode: req.plan?.code,
      });

      return next();
    } catch (err) {
      const status = err?.status || 400;
      const payload = err?.payload || { error: err?.code || "ensure_credits_failed" };
      return res.status(status).json(payload);
    }
  };
}
