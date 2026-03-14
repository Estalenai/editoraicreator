import supabase from "../config/supabaseClient.js";
import { isAdminUser } from "../utils/adminAuth.js";
import { getBetaAccessStateForUser, isClosedBetaEnabled } from "../utils/betaAccess.js";
import { logger } from "../utils/logger.js";

function shouldSkipClosedBeta(req) {
  const fullPath = String(req.originalUrl || req.url || "");
  return fullPath.startsWith("/api/beta-access/");
}

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || typeof authHeader !== "string") {
      return res.status(401).json({ error: "Authorization header ausente" });
    }

    const match = authHeader.match(/^\s*Bearer\s+(.+)\s*$/i);
    if (!match) {
      return res.status(401).json({
        error: "Formato inválido. Use: Authorization: Bearer <access_token>",
      });
    }

    const token = match[1];
    if (!token || token.length < 20) {
      return res.status(401).json({ error: "Token vazio ou inválido" });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    req.user = data.user;
    req.access_token = token;

    const closedBetaEnabled = await isClosedBetaEnabled();
    if (closedBetaEnabled && !isAdminUser(data.user) && !shouldSkipClosedBeta(req)) {
      try {
        const state = await getBetaAccessStateForUser({
          userId: data.user.id,
          email: data.user.email,
        });

        if (!state.approved) {
          return res.status(403).json({
            error: "beta_access_required",
            status: state.status,
          });
        }
      } catch (betaError) {
        logger.warn("beta_access_check_failed", {
          userId: data.user.id,
          message: betaError?.message || "unknown_error",
        });
        return res.status(503).json({ error: "beta_access_check_failed" });
      }
    }

    return next();
  } catch (err) {
    return res.status(500).json({ error: "Falha ao validar token" });
  }
};
