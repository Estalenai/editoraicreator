import { getPlanCatalog } from "./stripePlans.js";
import { t } from "./i18n.js";
import { getPlanLimitMatrix, getPlanLimitMatrixEntries, normalizePlanMatrixCode } from "./planLimitsMatrix.js";
import { getPlanStoragePolicySnapshot } from "./storageRuntimePolicy.js";
import {
  CREATOR_COINS_PUBLIC_NAME,
  CREATOR_COINS_SHORT_NAME,
  getCoinUnitPricingSnapshot,
  getCreditBreakdownValueBrl,
} from "./coinsProductRules.js";

const CURRENCY = "BRL";
const PERIOD_MONTH = "month";
const CONVERT_PAIRS = [
  "common->pro",
  "common->ultra",
  "pro->common",
  "pro->ultra",
  "ultra->common",
  "ultra->pro",
];
const BASE_FEATURES = [
  { key: "ai_text", enabled: true },
  { key: "ai_image", enabled: true },
  { key: "ai_video", enabled: true },
  { key: "ai_music", enabled: true },
  { key: "ai_voice", enabled: true },
  { key: "ai_slides", enabled: true },
  { key: "avatar_preview", enabled: true },
  { key: "docs_manual", enabled: true },
];

const FEATURE_MATRIX_KEY_MAP = {
  ai_text: "text",
  ai_image: "image",
  ai_video: "video",
  ai_music: "music",
  ai_voice: "voice",
  ai_slides: "slides",
  avatar_preview: "avatar_preview",
};

const PLAN_COPY = {
  FREE: {
    "pt-BR": {
      shortDescription: "Modo exploratório para conhecer a lógica do produto antes de entrar em operação recorrente.",
      expandedDescription:
        "Rascunho honesto para uma futura camada gratuita fora do beta pago: serve para entender a base de criação, créditos e continuidade de projeto sem prometer operação completa.",
      stripeDescription:
        "Modo exploratório para conhecer a base do produto. Fora do fluxo pago atual do beta.",
      audience: "Uso exploratório para validar encaixe antes da operação com assinatura.",
      highlights: [
        "Ajuda a conhecer o fluxo de criação, projeto e contexto preservado.",
        "Serve como porta de entrada leve quando a camada gratuita estiver aberta.",
        "Não substitui a operação recorrente prevista para os planos pagos.",
      ],
      limits: ["Exploratório", "Fora do beta pago atual"],
      statusNote: "Free deve continuar fora do beta pago/controlado nesta fase.",
    },
    "en-US": {
      shortDescription: "Exploratory mode to understand the product before recurring operation.",
      expandedDescription:
        "Honest draft for a future free layer outside the paid beta: it helps users understand creation, credits, and project continuity without promising full operation.",
      stripeDescription:
        "Exploratory mode to understand the product foundation. Outside the current paid beta flow.",
      audience: "Exploratory usage before subscription-based operation.",
      highlights: [
        "Helps users understand creation flow, projects, and preserved context.",
        "Acts as a light entry point when the free layer is opened.",
        "Does not replace the recurring operation expected from paid plans.",
      ],
      limits: ["Exploratory", "Outside the current paid beta"],
      statusNote: "Free should remain outside the paid/controlled beta for now.",
    },
  },
  EDITOR_FREE: {
    "pt-BR": {
      shortDescription: "Para creators individuais que querem sair da ideia para a primeira entrega com mais clareza operacional.",
      expandedDescription:
        "Entre no fluxo do Editor AI Creator com a base essencial para criar, organizar projetos e evoluir entregas sem perder o fio da produção. E o plano certo para começar com estrutura, validar método e transformar briefing em trabalho real sem complexidade desnecessária.",
      stripeDescription:
        "Plano mensal para creators individuais que querem começar a produzir com mais estrutura, clareza e continuidade.",
      audience: "Creators individuais em início de operação que precisam estruturar a primeira rotina.",
      highlights: [
        "Organiza criação, projeto e continuidade em um fluxo simples.",
        "Dá base para operar por créditos com mais previsibilidade.",
        "Ideal para rotina individual e primeira cadência de produção.",
      ],
      limits: ["Uso individual", "Primeiras entregas", "Cadência leve a moderada"],
      statusNote: null,
    },
    "en-US": {
      shortDescription: "For solo creators moving from idea to first delivery with more operational clarity.",
      expandedDescription:
        "Enter the Editor AI Creator flow with the essential foundation to create, organize projects, and move deliveries forward without losing production clarity. It is the right plan to start with structure, validate a method, and turn briefing into real work without unnecessary complexity.",
      stripeDescription:
        "Monthly plan for solo creators who want to start producing with more structure, clarity, and continuity.",
      audience: "Solo creators starting to structure their first operating rhythm.",
      highlights: [
        "Organizes creation, projects, and continuity in one simple flow.",
        "Provides a clearer base to operate with credits.",
        "Ideal for individual work and a first production cadence.",
      ],
      limits: ["Individual use", "First deliveries", "Light to moderate cadence"],
      statusNote: null,
    },
  },
  EDITOR_PRO: {
    "pt-BR": {
      shortDescription: "Para creators profissionais que precisam de mais controle, mais ritmo e uma operação recorrente mais confiável.",
      expandedDescription:
        "Feito para quem já produz com frequência e precisa de uma base mais forte entre criação, projeto salvo, revisão e próxima ação. E o plano que melhor equilibra capacidade, continuidade e controle para transformar a plataforma em rotina de trabalho de verdade.",
      stripeDescription:
        "Plano mensal para creators profissionais que precisam de mais controle, mais cadência e uma operação recorrente mais forte.",
      audience: "Creators profissionais e operações enxutas que já produzem com frequência.",
      highlights: [
        "Sustenta produção recorrente com mais previsibilidade.",
        "Amplia margem para revisão, refinamento e continuidade.",
        "Melhor equilíbrio entre operação profissional e custo no beta.",
      ],
      limits: ["Uso profissional recorrente", "Produção constante", "Mais controle por ciclo"],
      statusNote: "Editor Pro continua sendo o centro comercial do beta self-serve.",
    },
    "en-US": {
      shortDescription: "For professional creators who need more control, more rhythm, and a stronger recurring operation.",
      expandedDescription:
        "Built for people who already produce frequently and need a stronger layer across creation, saved projects, revision, and next action. It is the plan that best balances capacity, continuity, and control for turning the platform into a real working routine.",
      stripeDescription:
        "Monthly plan for professional creators who need more control, more cadence, and a stronger recurring operation.",
      audience: "Professional creators and lean teams producing on a frequent basis.",
      highlights: [
        "Supports recurring production with stronger predictability.",
        "Creates more margin for revision, refinement, and continuity.",
        "Best balance between professional operation and cost in beta.",
      ],
      limits: ["Recurring professional use", "Consistent production", "More control per cycle"],
      statusNote: "Editor Pro remains the commercial center of the self-serve beta.",
    },
  },
  EDITOR_ULTRA: {
    "pt-BR": {
      shortDescription: "Para creators intensivos, estúdios e operações criativas que precisam escalar sem travar o fluxo.",
      expandedDescription:
        "Pensado para quem já opera em volume maior e precisa de mais fôlego para múltiplas entregas, ciclos de refinamento e produção contínua. E o plano para transformar a plataforma em uma base criativa mais intensa, com mais elasticidade de uso e mais capacidade por mês.",
      stripeDescription:
        "Plano mensal para creators intensivos e estúdios que precisam escalar produção com mais capacidade, continuidade e elasticidade.",
      audience: "Creators intensivos, estúdios e squads criativos com maior volume operacional.",
      highlights: [
        "Suporta múltiplos projetos e entregas em paralelo.",
        "Dá mais margem para uso intenso e refinamento contínuo.",
        "Ideal para creators avançados, estúdios e produção em escala.",
      ],
      limits: ["Uso intensivo", "Escala criativa profissional", "Operação de maior volume"],
      statusNote: null,
    },
    "en-US": {
      shortDescription: "For high-intensity creators, studios, and creative operations that need to scale without slowing the flow.",
      expandedDescription:
        "Designed for teams already operating at higher volume and needing more room for multiple deliveries, refinement cycles, and continuous production. It turns the platform into a more intense creative base, with stronger elasticity of use and more capacity per month.",
      stripeDescription:
        "Monthly plan for intensive creators and studios who need to scale production with more capacity, continuity, and elasticity.",
      audience: "High-intensity creators, studios, and creative squads with larger operational volume.",
      highlights: [
        "Supports multiple projects and deliveries in parallel.",
        "Creates more room for intense usage and continuous refinement.",
        "Ideal for advanced creators, studios, and scaled production.",
      ],
      limits: ["Intensive use", "Professional creative scale", "Higher-volume operation"],
      statusNote: null,
    },
  },
  EMPRESARIAL: {
    "pt-BR": {
      shortDescription: "Para operações criativas em expansão que precisam de ativação assistida, baseline técnico mais alto e acompanhamento dedicado.",
      expandedDescription:
        "Camada assistida para operações que já precisam de mais volume, limites técnicos mais altos e uma ativação acompanhada no beta. Enquanto a camada própria evolui, o plano continua honesto sobre a base técnica herdada do runtime Enterprise.",
      stripeDescription:
        "Camada assistida para operações criativas em expansão. Ativação acompanhada no beta atual.",
      audience: "Operações criativas em expansão que precisam de ativação assistida e baseline técnico mais alto.",
      highlights: [
        "Ativação assistida no beta, sem checkout automático.",
        "Baseline técnico mais alto para fluxos premium e arquivos maiores.",
        "Mantém leitura honesta de disponibilidade enquanto a camada própria evolui.",
      ],
      limits: ["Ativação assistida", "Baseline técnico elevado", "Fora do checkout aberto"],
      statusNote: "Empresarial continua em ativação assistida no beta atual. Enquanto a camada própria evolui, as regras técnicas seguem a base Enterprise.",
    },
    "en-US": {
      shortDescription:
        "For growing creative operations that need assisted activation, a higher technical baseline, and closer follow-up.",
      expandedDescription:
        "Assisted layer for operations that already need more volume, higher technical limits, and guided activation during beta. While its own layer evolves, the plan stays honest about following the Enterprise runtime base.",
      stripeDescription:
        "Assisted layer for growing creative operations. Guided activation in the current beta.",
      audience: "Growing creative operations that need assisted activation and a higher technical baseline.",
      highlights: [
        "Assisted activation in beta, without open checkout.",
        "Higher technical baseline for premium flows and larger files.",
        "Keeps availability honest while its own layer is still evolving.",
      ],
      limits: ["Assisted activation", "Higher technical baseline", "Outside open checkout"],
      statusNote: "Business remains assisted activation in the current beta. Until its own tier is fully defined, technical rules follow the Enterprise layer.",
    },
  },
  ENTERPRISE: {
    "pt-BR": {
      shortDescription: "Para operações de grande escala que precisam de baseline técnico alto, contratação dedicada e condições definidas por contrato.",
      expandedDescription:
        "Camada contratual para operações que ultrapassam o catálogo self-serve. Escopo, volume e overrides seguem a trilha comercial, sem virar promessa automática no catálogo público.",
      stripeDescription:
        "Camada Enterprise por contrato. Não entra no checkout self-serve do beta atual.",
      audience: "Operações de maior escala com contratação dedicada e condições definidas comercialmente.",
      highlights: [
        "Contratação e implantação assistidas, fora do fluxo aberto.",
        "Baseline técnico alto com possibilidade de override por contrato.",
        "Indicado quando a operação ultrapassa o catálogo beta padrão.",
      ],
      limits: ["Contrato sob medida", "Baseline técnico alto", "Fora do catálogo self-serve"],
      statusNote: "Enterprise deve continuar fora do catálogo self-serve durante o beta atual.",
    },
    "en-US": {
      shortDescription:
        "For large-scale operations that need a higher technical baseline, dedicated contracting, and contract-defined conditions.",
      expandedDescription:
        "Contract layer for operations that outgrow the self-serve catalog. Scope, volume, and overrides follow the commercial process without turning into automatic public promises.",
      stripeDescription:
        "Enterprise layer by contract. Not part of the current beta self-serve checkout.",
      audience: "Larger-scale operations with dedicated contracting and commercially defined conditions.",
      highlights: [
        "Assisted contracting and rollout outside the open flow.",
        "High technical baseline with contract-level override room.",
        "Designed for operations that outgrow the standard beta catalog.",
      ],
      limits: ["Custom contract", "High technical baseline", "Outside self-serve catalog"],
      statusNote: "Enterprise should remain outside the self-serve catalog during the current beta.",
    },
  },
};

const PLAN_DEFS = getPlanLimitMatrixEntries().map((plan) => ({
  code: plan.code,
  nameKey: plan.name_key,
  priceAmountBrl: plan.price_amount_brl,
  credits: plan.credits_included,
  visible: plan.storefront_visibility !== false,
  purchasable: plan.purchasable !== false,
  comingSoon: plan.coming_soon === true,
}));

function normalizeLang(lang) {
  return String(lang || "").toLowerCase().startsWith("en") ? "en-US" : "pt-BR";
}

function getPublicPlanCode(planCode) {
  const normalized = normalizePlanMatrixCode(planCode);
  switch (normalized) {
    case "EDITOR_FREE":
      return "INICIANTE";
    case "EDITOR_ULTRA":
      return "CREATOR_PRO";
    default:
      return normalized;
  }
}

export function getPlanCopyByCode(planCode, lang = "pt-BR") {
  const locale = normalizeLang(lang);
  const key = String(planCode || "").trim().toUpperCase();
  const entry = PLAN_COPY[key] || PLAN_COPY.FREE;
  return entry?.[locale] || entry?.["pt-BR"] || null;
}

function uniqueTextItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const text = String(item || "").trim();
    const normalized = text.toLowerCase();
    if (!text || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function buildPublicPlanNotes(planMatrix) {
  const blockedPatterns = [
    /override/i,
    /governan/i,
    /multi[_\s-]?user/i,
    /multiplos usuarios/i,
    /coordena/i,
    /team coordination/i,
    /uso comercial/i,
    /commercial use/i,
  ];
  const candidateNotes = [
    ...(Array.isArray(planMatrix?.internal_status?.public_notes) ? planMatrix.internal_status.public_notes : []),
    ...(Array.isArray(planMatrix?.capability_statuses?.high_resolution_outputs?.public_notes)
      ? planMatrix.capability_statuses.high_resolution_outputs.public_notes
      : []),
    ...(Array.isArray(planMatrix?.honesty_notes) ? planMatrix.honesty_notes : []),
  ];
  return uniqueTextItems(candidateNotes).filter(
    (note) => !blockedPatterns.some((pattern) => pattern.test(String(note || "")))
  );
}

function buildFeaturePublicStatus(featureRule) {
  return {
    runtime_delivery_status:
      featureRule?.runtime_delivery_status || featureRule?.feature_status || featureRule?.availability || "unavailable",
    public_readiness: featureRule?.public_readiness || "internal_only",
    public_notes: uniqueTextItems(featureRule?.public_notes),
  };
}

function buildPublicRuntimeRulesSnapshot(planMatrix) {
  const runtimeRules = planMatrix?.runtime_rules || {};
  return {
    automatic_mode_default: runtimeRules?.automatic_mode_default === true,
    primary_mode_label: runtimeRules?.primary_mode_label || "automatic_recommended",
    quality_default: runtimeRules?.quality_default !== false,
    economy_mode_available: runtimeRules?.economy_mode_available !== false,
    manual_mode_allowed: runtimeRules?.manual_mode_allowed === true,
    manual_mode_level: runtimeRules?.manual_mode_level || null,
    mock_only_features: Array.isArray(runtimeRules?.mock_only_features) ? [...runtimeRules.mock_only_features] : [],
  };
}

function buildPublicStatusSnapshot(planMatrix) {
  const internalStatus = planMatrix?.internal_status || {};
  return {
    runtime_delivery_status: internalStatus?.runtime_delivery_status || "unavailable",
    public_readiness: internalStatus?.public_readiness || "internal_only",
    commercial_readiness: internalStatus?.commercial_readiness || "internal_only",
    inherits_from_other_runtime_layer: internalStatus?.inherits_from_other_runtime_layer === true,
    inherits_from: Array.isArray(internalStatus?.inherits_from) ? [...internalStatus.inherits_from] : [],
    public_notes: uniqueTextItems(internalStatus?.public_notes),
  };
}

function getHighlightInfo(planCode) {
  if (String(planCode).toUpperCase() !== "EDITOR_PRO") return { highlight: null, badgeLabel: null };

  const stripeCatalog = getPlanCatalog();
  const stripePlan = stripeCatalog?.EDITOR_PRO || null;
  const highlight = stripePlan?.highlight || "most_popular";
  const badgeLabel = stripePlan?.badge_label || { "pt-BR": "Mais popular", "en-US": "Most popular" };
  return { highlight, badgeLabel };
}

function buildFeatureEntry(planMatrix, feature, locale) {
  const featureKey = String(feature?.key || "");
  const label = t(locale, `plans.feature.${featureKey}`);

  if (featureKey === "docs_manual") {
    return {
      key: featureKey,
      label,
      enabled: true,
      availability: "real",
      providers: [],
      prepared_providers: [],
      max_tier: null,
      rule_source: "CATALOG",
      mock_only: false,
      runtime_delivery_status: "real",
      public_readiness: "publish_now",
      public_notes: [],
    };
  }

  const matrixKey = FEATURE_MATRIX_KEY_MAP[featureKey];
  const featureRule = planMatrix?.providers?.[matrixKey] || {};
  return {
    key: featureKey,
    label,
    enabled: Boolean(featureRule?.enabled),
    availability: featureRule?.availability || "unavailable",
    providers: Array.isArray(featureRule?.providers) ? [...featureRule.providers] : [],
    prepared_providers: Array.isArray(featureRule?.prepared_providers) ? [...featureRule.prepared_providers] : [],
    max_tier: featureRule?.model_tier_max || planMatrix?.model_tier_max || null,
    rule_source: normalizePlanMatrixCode(planMatrix?.code),
    mock_only: featureRule?.mock_only === true,
    ...buildFeaturePublicStatus(featureRule),
  };
}

function buildProvidersByFeature(planMatrix) {
  const createEntry = (featureKey) => {
    const feature = planMatrix?.providers?.[featureKey] || {};
    return {
      enabled: Boolean(feature?.enabled),
      availability: feature?.availability || "unavailable",
      providers: Array.isArray(feature?.providers) ? [...feature.providers] : [],
      prepared_providers: Array.isArray(feature?.prepared_providers) ? [...feature.prepared_providers] : [],
      provider_status: feature?.provider_status || {},
      max_tier: feature?.model_tier_max || planMatrix?.model_tier_max || null,
      mock_only: feature?.mock_only === true,
      rule_source: normalizePlanMatrixCode(planMatrix?.code),
      ...buildFeaturePublicStatus(feature),
    };
  };

  return {
    text: createEntry("text"),
    image: createEntry("image"),
    video: createEntry("video"),
    music: createEntry("music"),
    voice: createEntry("voice"),
    slides: createEntry("slides"),
    avatar_preview: createEntry("avatar_preview"),
    docs_manual: {
      enabled: true,
      availability: "real",
      providers: [],
      prepared_providers: [],
      provider_status: {},
      max_tier: null,
      mock_only: false,
      rule_source: "CATALOG",
      runtime_delivery_status: "real",
      public_readiness: "publish_now",
      public_notes: [],
    },
  };
}

function buildMonthlyUsageLimits(planMatrix) {
  const usage = planMatrix?.usage_limits || {};
  const monthlyByFeature = usage?.monthly_by_feature || {};
  return {
    creator_post_generate: monthlyByFeature?.creator_post_generate?.monthly ?? null,
    creator_music_generate: monthlyByFeature?.creator_music_generate?.monthly ?? null,
    text_generate: monthlyByFeature?.text_generate?.monthly ?? null,
    image_generate: monthlyByFeature?.image_generate?.monthly ?? null,
    video_generate: monthlyByFeature?.video_generate?.monthly ?? null,
    voice_generate: monthlyByFeature?.voice_generate?.monthly ?? null,
    music_generate: monthlyByFeature?.music_generate?.monthly ?? null,
    slides_generate: monthlyByFeature?.slides_generate?.monthly ?? null,
    avatar_preview_sessions_per_day: Number(usage?.avatar_preview_sessions_per_day || 0),
    avatar_preview_seconds_per_session: Number(usage?.avatar_preview_seconds_per_session || 0),
  };
}

function buildCommerceSnapshot(planMatrix, stripePlan) {
  const commerce = planMatrix?.commerce || {};
  return {
    price_visibility: commerce?.price_visibility !== false,
    storefront_visibility: planMatrix?.storefront_visibility !== false,
    purchasable: planMatrix?.purchasable !== false,
    checkout_supported: Boolean(stripePlan?.price_id) && planMatrix?.purchasable !== false,
    price_id_configured: Boolean(stripePlan?.price_id),
    allowed_coin_types_to_buy: Array.isArray(commerce?.allowed_coin_types) ? [...commerce.allowed_coin_types] : [],
    purchase_fee_percent: Number(commerce?.purchase_fee_percent ?? 0),
    conversion_enabled: commerce?.conversion_fee_percent != null,
    conversion_fee_percent:
      commerce?.conversion_fee_percent != null ? Number(commerce.conversion_fee_percent) : null,
    minimum_purchase_credits_per_type: commerce?.minimum_purchase_credits_per_type || null,
  };
}

function buildAvailabilitySnapshot(planMatrix, stripePlan) {
  const mode = String(planMatrix?.availability || "hidden_beta");
  const publicStatus = buildPublicStatusSnapshot(planMatrix);
  return {
    mode,
    storefront_visible: planMatrix?.storefront_visibility !== false,
    checkout_supported: Boolean(stripePlan?.price_id) && planMatrix?.purchasable !== false,
    assisted: mode === "assisted",
    contract_only: mode === "contract",
    hidden_beta: mode === "hidden_beta",
    runtime_delivery_status: publicStatus.runtime_delivery_status,
    public_readiness: publicStatus.public_readiness,
    commercial_readiness: publicStatus.commercial_readiness,
    inherits_from_other_runtime_layer: publicStatus.inherits_from_other_runtime_layer,
    inherits_from: publicStatus.inherits_from,
    public_notes: publicStatus.public_notes,
  };
}

function buildLimitsSnapshot(planMatrix) {
  const storagePolicy = getPlanStoragePolicySnapshot(planMatrix?.code);
  const qualityStatus = planMatrix?.capability_statuses?.high_resolution_outputs || {};
  return {
    usage: planMatrix?.usage_limits || {},
    upload: planMatrix?.upload_limits || {},
    generation: planMatrix?.generation_limits || {},
    input_media: planMatrix?.input_media_limits || {},
    workflow: planMatrix?.workflow_limits || {},
    context: planMatrix?.context_limits || {},
    storage: storagePolicy,
    quality: {
      outputs: Array.isArray(planMatrix?.quality_outputs) ? [...planMatrix.quality_outputs] : [],
      runtime_delivery_status: qualityStatus?.runtime_delivery_status || "unavailable",
      public_readiness: qualityStatus?.public_readiness || "internal_only",
      public_note: uniqueTextItems(qualityStatus?.public_notes)[0] || null,
    },
    avatar_preview: {
      enabled: Boolean(planMatrix?.providers?.avatar_preview?.enabled),
      sessions_per_day: Number(planMatrix?.usage_limits?.avatar_preview_sessions_per_day || 0),
      seconds_per_session: Number(planMatrix?.usage_limits?.avatar_preview_seconds_per_session || 0),
    },
  };
}

function buildPlanEntry(def, lang) {
  const code = def.code;
  const publicPlanCode = getPublicPlanCode(code);
  const locale = normalizeLang(lang);
  const { highlight, badgeLabel } = getHighlightInfo(code);
  const copy = getPlanCopyByCode(code, locale);
  const planMatrix = getPlanLimitMatrix(code);
  const stripePlan = getPlanCatalog()?.[String(code || "").toUpperCase()] || null;

  const features = BASE_FEATURES.map((feature) => buildFeatureEntry(planMatrix, feature, locale));
  const monthlyUsageLimits = buildMonthlyUsageLimits(planMatrix);
  const providersByFeature = buildProvidersByFeature(planMatrix);
  const commerce = buildCommerceSnapshot(planMatrix, stripePlan);
  const availability = buildAvailabilitySnapshot(planMatrix, stripePlan);
  const limits = buildLimitsSnapshot(planMatrix);
  const publicStatus = buildPublicStatusSnapshot(planMatrix);
  const publicNotes = buildPublicPlanNotes(planMatrix);
  const coinPricing = getCoinUnitPricingSnapshot({ currency: CURRENCY });
  const creditsValueBreakdownBrl = planMatrix?.credits_included
    ? {
        common: Number((Number(planMatrix.credits_included.common || 0) * Number(coinPricing.unit_price_brl.common || 0)).toFixed(2)),
        pro: Number((Number(planMatrix.credits_included.pro || 0) * Number(coinPricing.unit_price_brl.pro || 0)).toFixed(2)),
        ultra: Number((Number(planMatrix.credits_included.ultra || 0) * Number(coinPricing.unit_price_brl.ultra || 0)).toFixed(2)),
      }
    : null;
  const creditsValueBrl = planMatrix?.credits_included ? getCreditBreakdownValueBrl(planMatrix.credits_included) : null;

  return {
    code,
    plan_code: publicPlanCode,
    name: t(locale, def.nameKey),
    visible: planMatrix?.storefront_visibility !== false,
    coming_soon: planMatrix?.coming_soon === true,
    purchasable: planMatrix?.purchasable !== false,
    price: {
      amount_brl: Number.isFinite(planMatrix?.price_amount_brl)
        ? Number(planMatrix.price_amount_brl.toFixed(2))
        : null,
      period: PERIOD_MONTH,
    },
    highlight,
    badge_label: highlight ? badgeLabel?.[locale] || t(locale, "plans.badge.most_popular") : null,
    short_description: copy?.shortDescription || null,
    expanded_description: copy?.expandedDescription || null,
    stripe_description: copy?.stripeDescription || null,
    audience: copy?.audience || null,
    highlights: Array.isArray(copy?.highlights) ? [...copy.highlights] : [],
    limits_summary: Array.isArray(copy?.limits) ? [...copy.limits] : [],
    status_note: copy?.statusNote || null,
    credits: planMatrix?.credits_included ? { ...planMatrix.credits_included } : null,
    credits_public_name: CREATOR_COINS_PUBLIC_NAME,
    credits_short_name: CREATOR_COINS_SHORT_NAME,
    credits_total:
      planMatrix?.credits_included == null
        ? null
        : Number(planMatrix.credits_included.common || 0) +
          Number(planMatrix.credits_included.pro || 0) +
          Number(planMatrix.credits_included.ultra || 0),
    credits_value_breakdown_brl: creditsValueBreakdownBrl,
    credits_value_brl: creditsValueBrl,
    features,
    quality_tier: planMatrix?.quality_tier || null,
    quality_outputs: Array.isArray(planMatrix?.quality_outputs) ? [...planMatrix.quality_outputs] : [],
    model_tier_max: planMatrix?.model_tier_max || null,
    providers_by_feature: providersByFeature,
    monthly_usage_limits: monthlyUsageLimits,
    commerce,
    availability,
    public_status: publicStatus,
    runtime_rules: buildPublicRuntimeRulesSnapshot(planMatrix),
    honesty_notes: publicNotes,
    limits,
    addons: {
      purchase: {
        allowed_coin_types: Array.isArray(planMatrix?.commerce?.allowed_coin_types)
          ? [...planMatrix.commerce.allowed_coin_types]
          : [],
        fee_percent: Number(planMatrix?.commerce?.purchase_fee_percent ?? 0),
      },
      convert: {
        enabled: planMatrix?.commerce?.conversion_fee_percent != null,
        pairs: planMatrix?.commerce?.conversion_fee_percent != null ? [...CONVERT_PAIRS] : [],
        fee_percent: Number(planMatrix?.commerce?.conversion_fee_percent ?? 0),
      },
    },
  };
}

export function getPlansCatalog(lang = "pt-BR") {
  const locale = normalizeLang(lang);
  return {
    ok: true,
    lang: locale,
    currency: CURRENCY,
    coins_public_name: CREATOR_COINS_PUBLIC_NAME,
    coins_short_name: CREATOR_COINS_SHORT_NAME,
    coin_pricing: getCoinUnitPricingSnapshot({ currency: CURRENCY }),
    plans: PLAN_DEFS.map((def) => buildPlanEntry(def, locale)),
  };
}
