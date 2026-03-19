const SUPPORTED_LANGS = new Set(["pt-BR", "en-US"]);

const MESSAGES = {
  "pt-BR": {
    rate_limit_exceeded: "Aguarde um pouco e tente novamente.",
    plan_insufficient: "Plano insuficiente.",
    feature_not_available_for_plan: "Recurso não disponível no seu plano.",
    feature_upgrade_hint: "Faça upgrade para acessar este recurso.",
    model_not_allowed: "Modelo de IA não permitido para o seu plano.",
    idempotency_conflict: "Mesma Idempotency-Key com payload diferente.",
    idempotency_already_processed: "Essa requisição já foi processada. Gere uma nova Idempotency-Key.",
    daily_limit_reached: "Limite diário atingido.",
    enterprise_not_available: "Enterprise ainda não está disponível no Beta.",
    enterprise_qty_required: "Informe ao menos um tipo de crédito para cotação.",
    invalid_qty_step: "Quantidade inválida. Use múltiplos de {step}.",
    min_qty_per_type: "Quantidade mínima por tipo selecionado: {min} créditos ({coin_type}).",
    checkout_created: "Checkout criado com sucesso.",
    credits_released_after_payment: "Os créditos são liberados após confirmação do pagamento via webhook Stripe. Isso pode levar alguns minutos.",
    enterprise_order_paid: "Pedido Enterprise pago e créditos liberados.",
    idempotency_key_required: "Idempotency-Key é obrigatório para esta operação.",
    package_total_invalid: "Total inválido. Use mínimo de {min}, em passos de {step}.",
    package_breakdown_step_invalid: "Cada tipo deve usar múltiplos de {step}.",
    package_breakdown_sum_invalid: "A soma dos créditos deve ser exatamente {package_total}.",
    package_breakdown_required: "Informe ao menos um tipo de crédito maior que zero.",
    package_quote_not_found: "Cotação inválida ou expirada. Gere uma nova cotação.",
    pricing_not_available: "Precificação indisponível no momento. Tente novamente em instantes.",
    package_checkout_created: "Checkout de créditos avulsos criado com sucesso.",
    "plans.badge.most_popular": "Mais popular",
    "plans.name.free": "Gratuito",
    "plans.name.editor_free": "Iniciante",
    "plans.name.editor_pro": "Editor Pro",
    "plans.name.editor_ultra": "Editor Ultra",
    "plans.name.enterprise": "Enterprise",
    "plans.name.starter": "Iniciante",
    "plans.name.creator_pro": "Editor Ultra",
    "plans.name.empresarial": "Enterprise",
    "plans.feature.ai_text": "Texto com IA",
    "plans.feature.ai_image": "Imagem com IA",
    "plans.feature.ai_video": "Vídeo com IA",
    "plans.feature.ai_music": "Música com IA",
    "plans.feature.ai_voice": "Voz com IA",
    "plans.feature.ai_slides": "Slides com IA",
    "plans.feature.avatar_preview": "Avatar Preview",
    "plans.feature.docs_manual": "Docs e Manual",
  },
  "en-US": {
    rate_limit_exceeded: "Please wait a bit and try again.",
    plan_insufficient: "Insufficient plan.",
    feature_not_available_for_plan: "Feature not available for your plan.",
    feature_upgrade_hint: "Upgrade your plan to access this feature.",
    model_not_allowed: "AI model is not allowed for your plan.",
    idempotency_conflict: "Same Idempotency-Key with a different payload.",
    idempotency_already_processed: "This request has already been processed. Use a new Idempotency-Key.",
    daily_limit_reached: "Daily limit reached.",
    enterprise_not_available: "Enterprise is not available in Beta yet.",
    enterprise_qty_required: "Provide at least one credit type to request a quote.",
    invalid_qty_step: "Invalid quantity. Use multiples of {step}.",
    min_qty_per_type: "Minimum quantity per selected type is {min} credits ({coin_type}).",
    checkout_created: "Checkout created successfully.",
    credits_released_after_payment: "Credits are released only after Stripe webhook payment confirmation. It may take a few minutes.",
    enterprise_order_paid: "Enterprise order paid and credits released.",
    idempotency_key_required: "Idempotency-Key is required for this operation.",
    package_total_invalid: "Invalid total. Use minimum {min} in steps of {step}.",
    package_breakdown_step_invalid: "Each credit type must use multiples of {step}.",
    package_breakdown_sum_invalid: "Credit sum must be exactly {package_total}.",
    package_breakdown_required: "Provide at least one credit type greater than zero.",
    package_quote_not_found: "Quote is invalid or expired. Generate a new quote.",
    pricing_not_available: "Pricing is temporarily unavailable. Please try again shortly.",
    package_checkout_created: "One-time credits checkout created successfully.",
    "plans.badge.most_popular": "Most popular",
    "plans.name.free": "Free",
    "plans.name.editor_free": "Starter",
    "plans.name.editor_pro": "Editor Pro",
    "plans.name.editor_ultra": "Editor Ultra",
    "plans.name.enterprise": "Enterprise",
    "plans.name.starter": "Starter",
    "plans.name.creator_pro": "Editor Ultra",
    "plans.name.empresarial": "Enterprise",
    "plans.feature.ai_text": "AI text",
    "plans.feature.ai_image": "AI image",
    "plans.feature.ai_video": "AI video",
    "plans.feature.ai_music": "AI music",
    "plans.feature.ai_voice": "AI voice",
    "plans.feature.ai_slides": "AI slides",
    "plans.feature.avatar_preview": "Avatar preview",
    "plans.feature.docs_manual": "Docs and manual",
  },
};

function normalizeLangCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.replace("_", "-");
  if (SUPPORTED_LANGS.has(normalized)) return normalized;
  const lower = normalized.toLowerCase();
  if (lower.startsWith("pt")) return "pt-BR";
  if (lower.startsWith("en")) return "en-US";
  return null;
}

function readAcceptLanguage(headerValue) {
  const raw = String(headerValue || "").trim();
  if (!raw) return null;
  const candidates = raw
    .split(",")
    .map((entry) => entry.split(";")[0].trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    const normalized = normalizeLangCandidate(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export function resolveLang(req, fallback = "pt-BR") {
  const queryLang = normalizeLangCandidate(req?.query?.lang);
  if (queryLang) return queryLang;
  const headerLang = readAcceptLanguage(req?.headers?.["accept-language"]);
  if (headerLang) return headerLang;
  return SUPPORTED_LANGS.has(fallback) ? fallback : "pt-BR";
}

export function t(lang, key, params = {}) {
  const safeLang = SUPPORTED_LANGS.has(lang) ? lang : "pt-BR";
  const template = MESSAGES[safeLang]?.[key] || MESSAGES["pt-BR"]?.[key] || key;
  return String(template).replace(/\{(\w+)\}/g, (_, token) => String(params?.[token] ?? ""));
}
