// apps/api/src/middlewares/featureRateLimit.js
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { resolveLang, t } from "../utils/i18n.js";

/**
 * Rate limit por feature (SaaS).
 * Regras:
 * - Se autenticado, limita por user id.
 * - Caso contrário, limita por IP com helper IPv6-safe do express-rate-limit.
 */
export function featureRateLimit({ windowMs = 60_000, max = 120 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req?.user?.id ? String(req.user.id) : ipKeyGenerator(req)),
    handler: (req, res) => {
      const lang = resolveLang(req);
      res.status(429).json({
        error: "rate_limit_exceeded",
        message: t(lang, "rate_limit_exceeded"),
      });
    },
  });
}
