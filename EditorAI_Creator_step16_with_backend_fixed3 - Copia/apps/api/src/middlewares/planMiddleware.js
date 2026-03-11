import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";

const cache = new Map();
const TTL_MS = 30_000;

async function loadPlanFromDb(accessToken) {
  const supabase = createAuthedSupabaseClient(accessToken);

  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("plan_code,status,current_period_end")
    .in("status", ["active", "trialing"])
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Se ainda não aplicou o SQL do passo 7, não derruba o app: assume FREE
  if (subErr) {
    return { code: "FREE", tier: 0, features: {} };
  }

  const planCode = sub?.plan_code || "FREE";

  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("code,tier,features")
    .eq("code", planCode)
    .maybeSingle();

  if (planErr || !plan) {
    return { code: planCode, tier: planCode === "FREE" ? 0 : 1, features: {} };
  }

  return { code: plan.code, tier: plan.tier ?? 0, features: plan.features ?? {} };
}

export async function attachPlan(req, res, next) {
  try {
    const userId = req.user?.id;
    const token = req.access_token;

    if (!userId || !token) {
      req.plan = { code: "FREE", tier: 0, features: {} };
      return next();
    }

    const now = Date.now();
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now) {
      req.plan = cached.plan;
      return next();
    }

    const plan = await loadPlanFromDb(token);
    cache.set(userId, { plan, expiresAt: now + TTL_MS });
    req.plan = plan;
    return next();
  } catch (e) {
    req.plan = { code: "FREE", tier: 0, features: {} };
    return next();
  }
}

export function requirePlans(allowedPlanCodes) {
  const allowed = new Set(allowedPlanCodes);
  return (req, res, next) => {
    const code = req.plan?.code || "FREE";
    if (!allowed.has(code)) {
      return res.status(403).json({
        error: "Plano insuficiente",
        required: Array.from(allowed),
        current: code,
      });
    }
    return next();
  };
}

export function requireMinTier(minTier) {
  return (req, res, next) => {
    const tier = Number(req.plan?.tier ?? 0);
    if (tier < minTier) {
      return res.status(403).json({
        error: "Plano insuficiente",
        required_min_tier: minTier,
        current_tier: tier,
        current: req.plan?.code || "FREE",
      });
    }
    return next();
  };
}
