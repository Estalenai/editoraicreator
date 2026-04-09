import { logger } from "../utils/logger.js";

/**
 * Error handler central (padrão SaaS)
 * - não vaza stack em produção
 * - retorna JSON consistente
 */
export function errorHandler(err, req, res, next) {
  const status = Number(err?.statusCode) || Number(err?.status) || 500;
  const requestId = String(req?.requestId || "").trim() || null;

  logger.error("request_failed", {
    requestId,
    method: req?.method || null,
    path: req?.originalUrl || req?.url || null,
    statusCode: status,
    userId: req?.user?.id || null,
    errorName: err?.name || "Error",
    errorMessage: err?.message || "internal_error",
  });

  const payload = {
    error: err?.publicMessage || err?.message || "Erro interno",
    ...(requestId ? { requestId } : {}),
  };

  // Ajuda em desenvolvimento local
  if (process.env.NODE_ENV !== "production") {
    payload.details = {
      name: err?.name,
      stack: err?.stack,
    };
  }

  res.status(status).json(payload);
}
