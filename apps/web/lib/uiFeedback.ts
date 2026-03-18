export function toUserFacingError(input: unknown, fallback = "Não foi possível concluir essa ação agora. Tente novamente."): string {
  const raw = String(input || "").trim();
  if (!raw) return fallback;

  const normalized = raw.toLowerCase();

  if (
    normalized.includes("not authenticated") ||
    normalized.includes("sessão expirada") ||
    normalized.includes("session expired") ||
    normalized.includes("jwt") ||
    normalized.includes("token")
  ) {
    return "Sua sessão expirou. Faça login novamente para continuar.";
  }

  if (normalized.includes("admin_forbidden")) {
    return "Sua conta não tem permissão para acessar esta área.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha inválidos. Revise os dados e tente novamente.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada e confirme a conta.";
  }

  if (normalized.includes("user already registered")) {
    return "Este e-mail já está cadastrado. Faça login para continuar.";
  }

  if (normalized.includes("beta_access_required")) {
    return "Seu acesso ao beta ainda está em análise. Atualize o status em instantes.";
  }

  if (normalized.includes("insufficient_balance")) {
    return "Saldo insuficiente para esta ação. Ajuste o escopo ou compre créditos para continuar.";
  }

  if (normalized.includes("invalid_body")) {
    return "Alguns campos obrigatórios não foram preenchidos corretamente. Revise os dados e tente novamente.";
  }

  if (normalized.includes("invalid_video_request")) {
    return "Os parâmetros do clipe estão incompletos ou fora do limite permitido. Revise duração, formato e prompt antes de tentar novamente.";
  }

  if (normalized.includes("invalid_music_request")) {
    return "Os parâmetros da música estão incompletos ou fora do limite permitido. Revise tema, duração e idioma antes de tentar novamente.";
  }

  if (normalized.includes("quota_exceeded") || normalized.includes("usage_limit_exceeded")) {
    return "Você atingiu o limite deste recurso no plano atual. Aguarde a renovação ou faça upgrade para continuar.";
  }

  if (normalized.includes("idempotency_conflict") || normalized.includes("idempotency_replay")) {
    return "Essa ação já foi recebida há instantes. Aguarde a conclusão ou atualize a tela antes de tentar de novo.";
  }

  if (normalized.includes("idempotency_storage_failed")) {
    return "Não foi possível confirmar o progresso desta ação com segurança agora. Tente novamente em instantes.";
  }

  if (normalized.includes("coins_debit_failed")) {
    return "Não foi possível debitar os créditos desta ação agora. Tente novamente em instantes.";
  }

  if (normalized.includes("supabase_admin_unavailable_for_financial_rpc")) {
    return "Serviço financeiro temporariamente indisponível. Tente novamente em alguns instantes.";
  }

  if (normalized.includes("provider_unavailable")) {
    return "Serviço de IA indisponível no momento. Tente novamente em instantes.";
  }

  if (normalized.includes("creator_post_prompt_failed")) {
    return "Não foi possível preparar o prompt do Creator Post agora. Tente novamente.";
  }

  if (normalized.includes("creator_post_generate_failed")) {
    return "Não foi possível gerar o post agora. Revise o briefing e tente novamente.";
  }

  if (normalized.includes("creator_music_prompt_failed")) {
    return "Não foi possível preparar o prompt do Creator Music agora. Tente novamente.";
  }

  if (normalized.includes("creator_music_generate_failed")) {
    return "Não foi possível gerar a música agora. Tente novamente em instantes.";
  }

  if (normalized.includes("plan_unavailable")) {
    return "Este plano está indisponível para checkout no ambiente atual. Atualize e tente novamente em instantes.";
  }

  if (normalized.includes("stripe_customer_link_unavailable")) {
    return "Não foi possível preparar seu vínculo de cobrança agora. Tente novamente em instantes.";
  }

  if (normalized.includes("checkout_url_invalid")) {
    return "A configuração de redirecionamento do checkout está incompleta no ambiente atual.";
  }

  if (normalized.includes("invalid_plan_code")) {
    return "Plano inválido para checkout. Atualize o catálogo e tente novamente.";
  }

  if (normalized.includes("stripe_not_configured")) {
    return "Checkout indisponível no momento. Tente novamente em alguns instantes.";
  }

  if (normalized.includes("session_create_failed")) {
    return "A Stripe recusou a criação da sessão de checkout. Tente novamente em instantes.";
  }

  if (normalized.includes("stripe_checkout_failed")) {
    return "Não foi possível abrir o checkout seguro agora. Tente novamente.";
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed") ||
    normalized.includes("nao foi possivel conectar") ||
    normalized.includes("não foi possível conectar")
  ) {
    return "Não foi possível conectar com a plataforma agora. Verifique sua conexão e tente novamente.";
  }

  if (normalized.includes("timeout")) {
    return "A operação demorou mais do que o esperado. Atualize a tela e tente novamente.";
  }

  if (normalized.includes("too many requests") || normalized.includes("429")) {
    return "Muitas tentativas em sequência. Aguarde alguns segundos e tente de novo.";
  }

  return raw;
}

type GenerationSuccessMessageOptions = {
  provider?: string | null;
  model?: string | null;
  replay?: boolean;
  defaultMessage: string;
  mockMessage: string;
  replayMessage?: string;
};

export function toUserFacingGenerationSuccess({
  provider,
  model,
  replay = false,
  defaultMessage,
  mockMessage,
  replayMessage = "Esta execução reaproveitou uma tentativa recente com segurança. Revise o retorno antes de seguir.",
}: GenerationSuccessMessageOptions): string {
  const normalizedProvider = String(provider || "").trim().toLowerCase();

  if (replay || normalizedProvider === "replay") {
    return replayMessage;
  }

  if (normalizedProvider === "mock") {
    return mockMessage;
  }

  if (!normalizedProvider) {
    return defaultMessage;
  }

  return `${defaultMessage} Via ${provider}${model ? ` · ${model}` : ""}.`;
}
