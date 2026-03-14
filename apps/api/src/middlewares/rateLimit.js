// apps/api/src/middlewares/rateLimit.js
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { resolveLang, t } from "../utils/i18n.js";

/**
 * Rate limit padronizado e seguro (IPv6-safe).
 *
 * Regras:
 * - Se existir req.user.id → limita por usuário
 * - Caso contrário → limita por IP (usando ipKeyGenerator, seguro para IPv6)
 * - Mantém compatibilidade com imports antigos do projeto
 */

export function getRateLimitKey(req) {
  if (req?.user?.id) return String(req.user.id);
  return ipKeyGenerator(req);
}

/**
 * Factory base de limiter
 */
export function createLimiter({
  windowMs = 60_000,
  max = 120,
  name = "global",
} = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getRateLimitKey(req),
    handler: (req, res) => {
      const lang = resolveLang(req);
      res.status(429).json({
        error: "rate_limit_exceeded",
        message: t(lang, "rate_limit_exceeded"),
        limiter: name,
      });
    },
  });
}

/**
 * === LIMITERS LEGADOS (COMPATIBILIDADE) ===
 * ⚠️ NÃO REMOVER — vários arquivos importam esses nomes
 */

// Usado em geração de conteúdo (IA, conversões, etc.)
export const generateLimiter = createLimiter({
  windowMs: 60_000,
  max: 60,
  name: "generate",
});

// Usado em prompts / inputs frequentes
export const promptLimiter = createLimiter({
  windowMs: 60_000,
  max: 120,
  name: "prompt",
});

// Limite global mais permissivo
export const globalLimiter = createLimiter({
  windowMs: 60_000,
  max: 240,
  name: "global",
});
