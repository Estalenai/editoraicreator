import { getPlanCatalog } from "./stripePlans.js";
import { canUseAvatarPreview, getConversionFeePercent, getPurchaseFeePercent } from "./coinsProductRules.js";
import { t } from "./i18n.js";

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
const ALL_COIN_TYPES = ["common", "pro", "ultra"];
const FREE_COIN_TYPES = ["common"];
const EDITOR_FREE_COIN_TYPES = ["common", "pro"];

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
      shortDescription: "Para creators individuais que querem sair da ideia para a primeira entrega com contexto preservado.",
      expandedDescription:
        "Plano ideal para começar a criar com mais estrutura, usando a base essencial da plataforma para gerar, organizar projetos, editar com continuidade e operar por créditos sem perder contexto.",
      stripeDescription:
        "Plano mensal para creators individuais que precisam tirar a primeira entrega do papel com contexto preservado e operação por créditos.",
      audience: "Creators individuais em início de operação que precisam estruturar a primeira rotina.",
      highlights: [
        "Organiza briefing, geração, edição e projeto salvo em um fluxo simples.",
        "Entrega base suficiente para operar por créditos sem dispersar contexto.",
        "Ajuda a validar método e continuidade antes de subir a cadência.",
      ],
      limits: ["Uso individual", "Cadência leve a moderada"],
      statusNote: null,
    },
    "en-US": {
      shortDescription: "For solo creators moving from idea to first delivery with preserved context.",
      expandedDescription:
        "A strong starting plan for creators who need structure: generate, organize projects, edit with continuity, and operate with credits without losing context.",
      stripeDescription:
        "Monthly plan for solo creators building their first repeatable delivery flow with preserved context.",
      audience: "Solo creators starting to structure their first operating rhythm.",
      highlights: [
        "Keeps briefing, generation, editing, and saved projects in one simple flow.",
        "Provides the essential credit foundation without losing context.",
        "Helps validate workflow before moving into higher cadence.",
      ],
      limits: ["Individual use", "Light to moderate cadence"],
      statusNote: null,
    },
  },
  EDITOR_PRO: {
    "pt-BR": {
      shortDescription: "Para creators profissionais que precisam de mais controle, mais cadência e mais capacidade de produção.",
      expandedDescription:
        "Plano voltado para quem já produz com frequência e precisa de uma operação mais forte entre briefing, geração, edição e projeto salvo.",
      stripeDescription:
        "Plano mensal para creators profissionais com operação recorrente, contexto preservado e mais previsibilidade por créditos.",
      audience: "Creators profissionais e operações enxutas que já produzem com frequência.",
      highlights: [
        "Sustenta uma rotina recorrente entre criação, projeto e revisão.",
        "Amplia volume mensal sem quebrar continuidade operacional.",
        "Entrega o melhor equilíbrio entre cadência, controle e custo do beta pago.",
      ],
      limits: ["Uso profissional recorrente", "Operação com cadência constante"],
      statusNote: "Editor Pro continua sendo o centro comercial do beta self-serve.",
    },
    "en-US": {
      shortDescription: "For professional creators who need more control, cadence, and production capacity.",
      expandedDescription:
        "Built for users who already create frequently and need a stronger operating layer across briefing, generation, editing, and saved projects.",
      stripeDescription:
        "Monthly plan for professional creators running recurring work with preserved context and stronger credit predictability.",
      audience: "Professional creators and lean teams producing on a frequent basis.",
      highlights: [
        "Supports recurring creation, project continuity, and revision flow.",
        "Expands monthly volume without breaking operational continuity.",
        "Offers the clearest balance of cadence, control, and cost in the paid beta.",
      ],
      limits: ["Recurring professional use", "Consistent operating cadence"],
      statusNote: "Editor Pro remains the commercial center of the self-serve beta.",
    },
  },
  EDITOR_ULTRA: {
    "pt-BR": {
      shortDescription: "Para creators intensivos, estúdios e operações criativas que precisam escalar sem perder contexto.",
      expandedDescription:
        "Plano pensado para fluxos mais intensos, maior volume e uso profissional mais forte da plataforma.",
      stripeDescription:
        "Plano mensal para operações criativas intensivas que precisam escalar produção com contexto preservado e volume ampliado.",
      audience: "Creators intensivos, estúdios e squads criativos com maior volume operacional.",
      highlights: [
        "Amplia capacidade para múltiplas entregas e ciclos de refinamento.",
        "Sustenta uso forte por créditos com mais elasticidade entre formatos.",
        "Mantém continuidade quando a criação já virou operação de escala.",
      ],
      limits: ["Uso intensivo", "Escala criativa profissional"],
      statusNote: null,
    },
    "en-US": {
      shortDescription: "For high-intensity creators, studios, and creative operations scaling without losing context.",
      expandedDescription:
        "Designed for more intense flows, higher volume, and a stronger professional use of the platform.",
      stripeDescription:
        "Monthly plan for creative operations that need to scale production with preserved context and expanded volume.",
      audience: "High-intensity creators, studios, and creative squads with larger operational volume.",
      highlights: [
        "Expands capacity for multiple deliveries and refinement cycles.",
        "Supports heavier credit usage with more elasticity across formats.",
        "Maintains continuity when creation becomes scaled operation.",
      ],
      limits: ["Intensive use", "Professional creative scale"],
      statusNote: null,
    },
  },
  ENTERPRISE: {
    "pt-BR": {
      shortDescription: "Para operações de grande escala com estrutura personalizada, governança e contratação dedicada.",
      expandedDescription:
        "Rascunho honesto para a camada Enterprise fora do catálogo self-serve: escopo, volume, governança e condições definidos por contrato, com implantação assistida.",
      stripeDescription:
        "Camada Enterprise por contrato. Não entra no checkout self-serve do beta atual.",
      audience: "Equipes maiores e operações corporativas com requisitos próprios de escala e governança.",
      highlights: [
        "Contratação e implantação assistidas, fora do fluxo aberto.",
        "Escopo, volume e governança definidos de forma personalizada.",
        "Indicado quando a operação ultrapassa o catálogo beta padrão.",
      ],
      limits: ["Contrato sob medida", "Implantação assistida corporativa"],
      statusNote: "Enterprise deve continuar fora do catálogo self-serve durante o beta atual.",
    },
    "en-US": {
      shortDescription: "For large-scale operations that need custom structure, governance, and dedicated contracting.",
      expandedDescription:
        "Honest draft for the Enterprise layer outside the self-serve catalog: scope, volume, governance, and terms are defined by contract with assisted rollout.",
      stripeDescription:
        "Enterprise layer by contract. Not part of the current beta self-serve checkout.",
      audience: "Larger teams and corporate operations with custom scale and governance requirements.",
      highlights: [
        "Assisted contracting and rollout outside the open flow.",
        "Scope, volume, and governance defined in a custom commercial process.",
        "Designed for operations that outgrow the standard beta catalog.",
      ],
      limits: ["Custom contract", "Assisted enterprise rollout"],
      statusNote: "Enterprise should remain outside the self-serve catalog during the current beta.",
    },
  },
};

const PLAN_DEFS = [
  {
    code: "FREE",
    nameKey: "plans.name.free",
    priceAmountBrl: 0,
    credits: { common: 30, pro: 0, ultra: 0 },
    allowedCoinTypes: FREE_COIN_TYPES,
    avatarSessionsPerDay: 0,
    avatarSecondsPerSession: 0,
    visible: false,
    purchasable: false,
  },
  {
    code: "EDITOR_FREE",
    nameKey: "plans.name.editor_free",
    priceAmountBrl: 19.9,
    credits: { common: 300, pro: 120, ultra: 0 },
    allowedCoinTypes: EDITOR_FREE_COIN_TYPES,
    avatarSessionsPerDay: 0,
    avatarSecondsPerSession: 0,
  },
  {
    code: "EDITOR_PRO",
    nameKey: "plans.name.editor_pro",
    priceAmountBrl: 59.9,
    credits: { common: 700, pro: 350, ultra: 150 },
    allowedCoinTypes: ALL_COIN_TYPES,
    avatarSessionsPerDay: 0,
    avatarSecondsPerSession: 0,
  },
  {
    code: "EDITOR_ULTRA",
    nameKey: "plans.name.editor_ultra",
    priceAmountBrl: 139.9,
    credits: { common: 2000, pro: 1200, ultra: 600 },
    allowedCoinTypes: ALL_COIN_TYPES,
    avatarSessionsPerDay: 1,
    avatarSecondsPerSession: 120,
  },
  {
    code: "ENTERPRISE",
    nameKey: "plans.name.enterprise",
    priceAmountBrl: null,
    credits: null,
    allowedCoinTypes: ALL_COIN_TYPES,
    avatarSessionsPerDay: 1,
    avatarSecondsPerSession: 120,
    conversionFeePercentOverride: 0,
    comingSoon: true,
    purchasable: false,
    visible: false,
  },
];

function normalizeLang(lang) {
  return String(lang || "").toLowerCase().startsWith("en") ? "en-US" : "pt-BR";
}

export function getPlanCopyByCode(planCode, lang = "pt-BR") {
  const locale = normalizeLang(lang);
  const key = String(planCode || "").trim().toUpperCase();
  const entry = PLAN_COPY[key] || PLAN_COPY.FREE;
  return entry?.[locale] || entry?.["pt-BR"] || null;
}

function getHighlightInfo(planCode) {
  if (String(planCode).toUpperCase() !== "EDITOR_PRO") return { highlight: null, badgeLabel: null };

  const stripeCatalog = getPlanCatalog();
  const stripePlan = stripeCatalog?.EDITOR_PRO || null;
  const highlight = stripePlan?.highlight || "most_popular";
  const badgeLabel = stripePlan?.badge_label || { "pt-BR": "Mais popular", "en-US": "Most popular" };
  return { highlight, badgeLabel };
}

function resolveFeatureEnabled(planCode, featureKey) {
  if (featureKey === "avatar_preview") return canUseAvatarPreview(planCode);
  return true;
}

function buildPlanEntry(def, lang) {
  const code = def.code;
  const locale = normalizeLang(lang);
  const conversionFeePercent = def.conversionFeePercentOverride ?? getConversionFeePercent(code);
  const purchaseFeePercent = def.purchaseFeePercentOverride ?? getPurchaseFeePercent(code);
  const { highlight, badgeLabel } = getHighlightInfo(code);
  const copy = getPlanCopyByCode(code, locale);

  const features = BASE_FEATURES.map((feature) => ({
    key: feature.key,
    label: t(locale, `plans.feature.${feature.key}`),
    enabled: feature.enabled && resolveFeatureEnabled(code, feature.key),
  }));

  const avatarEnabled = canUseAvatarPreview(code);

  return {
    code,
    name: t(locale, def.nameKey),
    visible: def.visible !== false,
    coming_soon: def.comingSoon === true,
    purchasable: def.purchasable !== false,
    price: {
      amount_brl: Number.isFinite(def.priceAmountBrl) ? Number(def.priceAmountBrl.toFixed(2)) : null,
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
    credits: def.credits ? { ...def.credits } : null,
    features,
    limits: {
      avatar_preview: {
        enabled: avatarEnabled,
        sessions_per_day: avatarEnabled ? def.avatarSessionsPerDay : 0,
        seconds_per_session: avatarEnabled ? def.avatarSecondsPerSession : 0,
      },
    },
    addons: {
      purchase: {
        allowed_coin_types: [...def.allowedCoinTypes],
        fee_percent: Number(purchaseFeePercent ?? 0),
      },
      convert: {
        enabled: conversionFeePercent != null,
        pairs: conversionFeePercent != null ? [...CONVERT_PAIRS] : [],
        fee_percent: Number(conversionFeePercent ?? 0),
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
    plans: PLAN_DEFS.map((def) => buildPlanEntry(def, locale)),
  };
}
