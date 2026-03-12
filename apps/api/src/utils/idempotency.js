import crypto from "crypto";

/**
 * Gera chave de idempotência por request para evitar dupla cobrança.
 * Se o client mandar Idempotency-Key, usamos.
 */
export function getIdempotencyKey(req, { scope = "default" } = {}) {
  const header = req.headers["idempotency-key"];
  if (typeof header === "string" && header.trim().length >= 8) return `${scope}:${header.trim()}`;

  const body = req.body ? JSON.stringify(req.body) : "";
  const raw = `${scope}:${req.method}:${req.originalUrl}:${body}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return `${scope}:${hash}`;
}
