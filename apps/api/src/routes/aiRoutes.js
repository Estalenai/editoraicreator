import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { featureRateLimit } from "../middlewares/featureRateLimit.js";
import { chargeCoins } from "../middlewares/coinsMiddleware.js";

const router = Router();

/**
 * Endpoint provisório (não chama OpenAI ainda).
 * Serve para validar: Auth + RateLimit + Consumo de créditos + pipeline.
 *
 * POST /api/ai/text-generate
 * Body: { prompt: string }
 */
router.post(
  "/text-generate",
  authMiddleware,
  featureRateLimit({ windowMs: 60_000, max: 60 }),
  chargeCoins({
    feature: "ai.text_generate",
    coins: { common: 1, pro: 0, ultra: 0 },
  }),
  async (req, res) => {
    const prompt = req.body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt é obrigatório" });
    }

    // ✅ Resposta mock (só para validar o fluxo sem depender de OpenAI agora)
    return res.json({
      ok: true,
      provider: "mock",
      result: `✅ Pipeline OK. Prompt recebido: ${prompt}`,
      user: { id: req.user.id, email: req.user.email },
      coins: req.coinsCharge || null,
    });
  }
);

export default router;