import { resolveLang, t } from "../utils/i18n.js";

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
    const lang = resolveLang(req);

    return res.status(403).json({
      error: "feature_not_available_for_plan",
      message: t(lang, "feature_not_available_for_plan"),
      feature: featureKey,
      plan: plan.code,
      hint: t(lang, "feature_upgrade_hint"),
    });
  };
}
