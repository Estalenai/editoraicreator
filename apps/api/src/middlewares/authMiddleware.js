import supabase from "../config/supabaseClient.js";

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

    return next();
  } catch (err) {
    return res.status(500).json({ error: "Falha ao validar token" });
  }
};
