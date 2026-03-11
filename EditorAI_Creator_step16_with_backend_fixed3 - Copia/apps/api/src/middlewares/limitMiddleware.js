import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";

/**
 * Enforce limits based on req.plan.features.limits.<resourceKey>
 *
 * resourceKey examples: "projects", "texts", "prompts"
 * tableName examples: "projects"
 */
export function enforcePlanLimit({ resourceKey, tableName }) {
  return async (req, res, next) => {
    try {
      const limits = req.plan?.features?.limits || req.plan?.features || {};
      const limit = limits?.[resourceKey];

      // Se não existir limite definido, não bloqueia (compatibilidade)
      if (limit === undefined || limit === null) return next();

      const numericLimit = Number(limit);
      if (!Number.isFinite(numericLimit) || numericLimit < 0) return next();

      // limit 0: bloqueia criação
      if (numericLimit === 0) {
        return res.status(403).json({
          error: "Limite do plano atingido",
          resource: resourceKey,
          limit: numericLimit
        });
      }

      const supabase = createAuthedSupabaseClient(req.access_token);

      const { count, error } = await supabase
        .from(tableName)
        .select("id", { count: "exact", head: true });

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      if ((count || 0) >= numericLimit) {
        return res.status(403).json({
          error: "Limite do plano atingido",
          resource: resourceKey,
          limit: numericLimit,
          current: count || 0
        });
      }

      return next();
    } catch (e) {
      return res.status(500).json({ error: "Falha ao validar limite do plano" });
    }
  };
}
