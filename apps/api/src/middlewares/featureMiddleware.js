/**
 * Feature gating baseado no plano.
 *
 * Convenções aceitas (para compatibilidade com seeds/versões):
 * - req.plan.features.<featureKey> === true
 * - req.plan.features.library.<featureKey> === true
 * - req.plan.features.ai.<featureKey> === true
 *
 * Fallback:
 * - Se a feature não existir no JSON, aplicamos `minTierFallback`.
 */

export function requireFeature(featureKey, { minTierFallback = 1 } = {}) {
  return (req, res, next) => {
    const plan = req.plan;
    if (!plan) {
      return res.status(500).json({ error: "Plano não carregado. Use attachPlan antes." });
    }

    const features = plan.features || {};
    const enabled =
      features?.[featureKey] === true ||
      features?.library?.[featureKey] === true ||
      features?.ai?.[featureKey] === true;

    if (enabled) return next();

    // fallback por tier (PRO ou acima por padrão)
    const tier = Number(plan.tier ?? 0);
    if (Number.isFinite(tier) && tier >= minTierFallback) return next();

    return res.status(403).json({
      error: "Recurso não disponível no seu plano",
      feature: featureKey,
      plan: plan.code,
      hint: "Faça upgrade para acessar este recurso."
    });
  };
}
