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

  if (
    normalized.includes("failed_to_load_idempotency") ||
    normalized.includes("failed_to_save_idempotency")
  ) {
    return "Não foi possível registrar ou recuperar o andamento desta execução agora. Aguarde alguns instantes e tente novamente.";
  }

  if (normalized.includes("failed_to_load_wallet") || normalized.includes("wallet_unavailable")) {
    return "Não foi possível consultar seu saldo com segurança agora. Atualize a tela e tente novamente em instantes.";
  }

  if (normalized.includes("coins_debit_failed")) {
    return "Não foi possível debitar os créditos desta ação agora. Tente novamente em instantes.";
  }

  if (normalized.includes("supabase_admin_unavailable_for_financial_rpc")) {
    return "Serviço financeiro temporariamente indisponível. Tente novamente em alguns instantes.";
  }

  if (normalized.includes("mock_requires_explicit_request")) {
    return "Modo simulado nao entra automaticamente no beta pago/controlado. Esta execucao foi bloqueada ate haver provedor real ou solicitacao manual explicita.";
  }

  if (normalized.includes("provider_not_supported_beta")) {
    return "Este fluxo ainda nao esta liberado como caminho principal no beta pago/controlado.";
  }

  if (normalized.includes("provider_unavailable")) {
    return "O provedor real nao respondeu com seguranca. A execucao foi bloqueada em vez de cair em mock.";
  }

  if (normalized.includes("provider_failed")) {
    return "O provedor de IA nao concluiu esta solicitacao agora. Tente novamente em instantes.";
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

  if (normalized.includes("falha ao gerar clipe")) {
    return "Não foi possível gerar o clipe agora. Tente novamente em instantes ou acompanhe o status do job.";
  }

  if (normalized.includes("falha ao consultar status do clipe")) {
    return "Não foi possível consultar o status do clipe agora. Atualize novamente em instantes.";
  }

  if (normalized.includes("falha ao consultar status da música")) {
    return "Não foi possível consultar o status da música agora. Atualize novamente em instantes.";
  }

  if (
    normalized.includes("resposta de geração inválida") ||
    normalized.includes("falha ao interpretar a resposta da música") ||
    normalized.includes("falha ao interpretar o status retornado")
  ) {
    return "O provedor respondeu sem dados suficientes para continuar com segurança. Tente novamente em instantes.";
  }

  if (normalized.includes("falha ao gerar texto")) {
    return "Não foi possível gerar o texto agora. Tente novamente em instantes.";
  }

  if (normalized.includes("falha ao checar a afirmação")) {
    return "Não foi possível concluir a verificação editorial agora. Tente novamente em instantes.";
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

export function extractApiErrorMessage(payload: any, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const primary = [payload?.message, payload?.detail, payload?.details, payload?.reason, payload?.hint]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  if (primary.length) {
    return Array.from(new Set(primary)).join(" | ");
  }

  if (typeof payload?.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  return fallback;
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

type AsyncJobStatusOptions = {
  status?: string | null;
  provider?: string | null;
  replay?: boolean;
  hasResultUrl?: boolean;
};

export function describeAsyncJobStatus({
  status,
  provider,
  replay = false,
  hasResultUrl = false,
}: AsyncJobStatusOptions): {
  label: string;
  detail: string;
  tone: "success" | "warning" | "error";
  isPending: boolean;
} {
  const normalized = String(status || "").trim().toLowerCase();
  const providerName = String(provider || "").trim();

  if (replay || providerName.toLowerCase() === "replay") {
    return {
      label: "Execução anterior recuperada",
      detail: hasResultUrl
        ? "O retorno desta solicitação já existia e foi recuperado com segurança."
        : "Esta solicitação já estava em andamento. Atualize o status para acompanhar o retorno final.",
      tone: "warning",
      isPending: !hasResultUrl,
    };
  }

  if (normalized === "queued" || normalized === "pending") {
    return {
      label: "Na fila do provedor",
      detail: "O job foi aceito e aguarda processamento. Você pode acompanhar o status sem reenviar a solicitação.",
      tone: "warning",
      isPending: true,
    };
  }

  if (normalized === "processing" || normalized === "running" || normalized === "in_progress") {
    return {
      label: "Processando no provedor",
      detail: hasResultUrl
        ? "Há uma prévia disponível enquanto o provedor conclui o resultado final."
        : "O provedor está processando o job. Atualize o status em instantes para buscar o retorno final.",
      tone: "warning",
      isPending: true,
    };
  }

  if (normalized === "succeeded" || normalized === "completed" || normalized === "done" || (hasResultUrl && !normalized)) {
    return {
      label: "Resultado pronto",
      detail: hasResultUrl
        ? "O retorno final já está disponível para revisão, salvamento e continuidade."
        : "O job foi concluído, mas o provedor não devolveu um link final nesta resposta.",
      tone: hasResultUrl ? "success" : "warning",
      isPending: false,
    };
  }

  if (normalized === "failed" || normalized === "error" || normalized === "canceled" || normalized === "cancelled" || normalized === "timeout") {
    return {
      label: "Execução interrompida",
      detail: "O provedor não concluiu o job. Revise o briefing e tente novamente com o mesmo projeto aberto.",
      tone: "error",
      isPending: false,
    };
  }

  if (normalized) {
    return {
      label: `Status do provedor: ${status}`,
      detail: "Acompanhe o retorno e atualize novamente se o resultado final ainda não aparecer.",
      tone: hasResultUrl ? "success" : "warning",
      isPending: !hasResultUrl,
    };
  }

  return {
    label: "Aguardando retorno do provedor",
    detail: "Esta execução ainda não devolveu um status legível. Atualize em instantes para confirmar o andamento.",
    tone: "warning",
    isPending: true,
  };
}

export function shouldAutoRefreshAsyncJob(status?: string | null): boolean {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "queued" || normalized === "pending" || normalized === "processing" || normalized === "running" || normalized === "in_progress";
}
