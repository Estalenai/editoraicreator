import { AIProviderError, ProviderNotConfiguredError } from "../ai/providers/providerBase.js";

const CONTRACT_ERROR_META = {
  mock_requires_explicit_request: {
    status: 503,
    message: "Modo simulado nao entra automaticamente no beta pago/controlado.",
    hint: "Ative um provedor real ou use o modo mock apenas por solicitacao manual explicita.",
  },
  provider_unavailable: {
    status: 502,
    message: "O provedor real nao respondeu com seguranca. A execucao foi bloqueada em vez de cair em mock.",
    hint: "Tente novamente em instantes com o mesmo briefing ou projeto aberto.",
  },
  provider_not_supported_beta: {
    status: 503,
    message: "Este fluxo beta ainda nao aceita esse provedor como caminho principal.",
    hint: "Use um fluxo hero suportado ou aguarde a fase de integracoes desta capacidade.",
  },
  model_not_allowed: {
    status: 403,
    message: "O modelo solicitado nao esta liberado para este plano.",
    hint: "Escolha um modelo compativel ou remova a selecao manual.",
  },
  manual_mode_not_allowed: {
    status: 403,
    message: "A selecao manual nao esta liberada para este plano.",
    hint: "Use Automatico (Recomendado) ou Economico, quando disponivel.",
  },
};

export function isExplicitMockProvider(provider) {
  return String(provider || "").trim().toLowerCase() === "mock";
}

export function isExplicitMockRouting(routing) {
  return isExplicitMockProvider(routing?.selected_provider);
}

export function getAiContractErrorCode(errorOrCode) {
  if (typeof errorOrCode === "string") return String(errorOrCode).trim().toLowerCase() || null;
  if (!errorOrCode || typeof errorOrCode !== "object") return null;
  return String(errorOrCode.code || errorOrCode.message || "").trim().toLowerCase() || null;
}

export function getAiContractErrorMeta(errorOrCode) {
  const code = getAiContractErrorCode(errorOrCode);
  return code ? CONTRACT_ERROR_META[code] || null : null;
}

export function getAiContractErrorStatus(errorOrCode, fallback = 502) {
  const meta = getAiContractErrorMeta(errorOrCode);
  if (meta?.status) return meta.status;
  const status = Number(errorOrCode?.status || errorOrCode?.details?.status || 0);
  return Number.isFinite(status) && status > 0 ? status : fallback;
}

export function buildAiContractErrorPayload(errorOrCode, { routing = null, detail = null, message = null, hint = null } = {}) {
  const code = getAiContractErrorCode(errorOrCode) || "provider_failed";
  const meta = getAiContractErrorMeta(errorOrCode);
  const rawMessage = typeof errorOrCode?.message === "string" ? errorOrCode.message.trim() : "";
  const messageFromError = rawMessage && rawMessage.toLowerCase() !== code ? rawMessage : null;
  const payload = {
    error: code,
    message: message || messageFromError || meta?.message || "Nao foi possivel concluir a execucao de IA agora.",
  };
  const detailValue = detail || errorOrCode?.detail || errorOrCode?.details?.reason || errorOrCode?.reason || null;
  if (detailValue) payload.detail = String(detailValue);
  const hintValue = hint || errorOrCode?.hint || meta?.hint || null;
  if (hintValue) payload.hint = String(hintValue);
  if (routing && typeof routing === "object") payload.routing = routing;
  return payload;
}

function createContractError({ code, feature, provider, reason, hint = null, status = null }) {
  const meta = getAiContractErrorMeta(code) || {};
  const error = new AIProviderError(code, {
    feature,
    provider,
    reason: reason || null,
    status: status || meta.status || 502,
  });
  error.code = code;
  error.status = status || meta.status || 502;
  error.feature = feature || null;
  error.provider = provider || null;
  error.reason = reason || null;
  error.hint = hint || meta.hint || null;
  return error;
}

export function createMockRequiresExplicitRequestError({ feature, provider, reason }) {
  return createContractError({
    code: "mock_requires_explicit_request",
    feature,
    provider,
    reason: reason || "mock_requires_explicit_request",
  });
}

export function createProviderUnavailableError({ feature, provider, reason }) {
  return createContractError({
    code: "provider_unavailable",
    feature,
    provider,
    reason: reason || "provider_unavailable",
  });
}

export function createProviderNotSupportedBetaError({ feature, provider, reason = "provider_not_supported_beta" }) {
  return createContractError({
    code: "provider_not_supported_beta",
    feature,
    provider,
    reason,
    status: 503,
  });
}

export function assertRealProviderMode(mode, { feature, provider }) {
  if (mode?.useReal) return;
  throw createMockRequiresExplicitRequestError({
    feature,
    provider,
    reason: mode?.reason || "mock_requires_explicit_request",
  });
}

export function isProviderUnavailableLike(error) {
  if (error instanceof ProviderNotConfiguredError) return false;
  const code = getAiContractErrorCode(error);
  if (code === "provider_unavailable") return true;
  if (error instanceof AIProviderError) {
    const status = Number(error?.details?.status || 0);
    if (status === 401 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500) {
      return true;
    }
  }
  const message = String(error?.message || "").trim().toLowerCase();
  if (!message) return false;
  return (
    message.includes("provider_unavailable") ||
    message.includes("unauthorized") ||
    message.includes("upstream_http_error") ||
    message.includes("upstream_timeout") ||
    message.includes("upstream_request_failed") ||
    message.includes("provider_response_empty") ||
    message.includes("timeout")
  );
}

export function rethrowProviderContractError({ error, feature, provider }) {
  const code = getAiContractErrorCode(error);
  if (code === "mock_requires_explicit_request" || code === "provider_unavailable" || code === "provider_not_supported_beta") {
    throw error;
  }
  if (error instanceof ProviderNotConfiguredError) {
    throw createMockRequiresExplicitRequestError({ feature, provider, reason: "missing_api_key" });
  }
  if (isProviderUnavailableLike(error)) {
    throw createProviderUnavailableError({ feature, provider, reason: code || "provider_unavailable" });
  }
  throw error;
}
