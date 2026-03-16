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
const STARTER_COIN_TYPES = ["common", "pro"];

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
    code: "INICIANTE",
    nameKey: "plans.name.starter",
    priceAmountBrl: 19.9,
    credits: { common: 300, pro: 120, ultra: 0 },
    allowedCoinTypes: STARTER_COIN_TYPES,
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
    code: "CREATOR_PRO",
    nameKey: "plans.name.creator_pro",
    priceAmountBrl: 139.9,
    credits: { common: 2000, pro: 1200, ultra: 600 },
    allowedCoinTypes: ALL_COIN_TYPES,
    avatarSessionsPerDay: 1,
    avatarSecondsPerSession: 120,
  },
  {
    code: "EMPRESARIAL",
    nameKey: "plans.name.empresarial",
    priceAmountBrl: 499.9,
    credits: { common: 6000, pro: 3500, ultra: 1800 },
    allowedCoinTypes: ALL_COIN_TYPES,
    avatarSessionsPerDay: 1,
    avatarSecondsPerSession: 120,
    purchaseFeePercentOverride: 1,
    conversionFeePercentOverride: 0,
    comingSoon: true,
    purchasable: false,
  },
];

function normalizeLang(lang) {
  return String(lang || "").toLowerCase().startsWith("en") ? "en-US" : "pt-BR";
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
      amount_brl: Number(def.priceAmountBrl.toFixed(2)),
      period: PERIOD_MONTH,
    },
    highlight,
    badge_label: highlight ? badgeLabel?.[locale] || t(locale, "plans.badge.most_popular") : null,
    credits: { ...def.credits },
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
