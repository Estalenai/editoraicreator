import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Rate limit por feature (seguro para IPv6).
 */
export function featureRateLimit({ windowMs = 60_000, max = 120 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req), // ✅ obrigatório para IPv6
    handler: (req, res) => {
      res.status(429).json({
        error: "Rate limit excedido",
        message: "Aguarde um pouco e tente novamente.",
      });
    },
  });
}