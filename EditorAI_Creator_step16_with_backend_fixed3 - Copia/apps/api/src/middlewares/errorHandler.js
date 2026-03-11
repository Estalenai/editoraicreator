/**
 * Error handler central (padrão SaaS)
 * - não vaza stack em produção
 * - retorna JSON consistente
 */
export function errorHandler(err, req, res, next) {
  const status = Number(err?.statusCode) || Number(err?.status) || 500;

  const payload = {
    error: err?.publicMessage || err?.message || "Erro interno",
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
