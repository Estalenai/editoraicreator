const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    details: {},
  },
};

const replayFlagSchema = {
  type: "object",
  properties: {
    replay: { type: "boolean" },
  },
};

const routingSchema = {
  type: "object",
  properties: {
    routing: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["quality", "economy", "manual"] },
        selected_provider: { type: "string" },
        selected_model: { type: "string" },
        fallback_used: { type: "boolean" },
        fallback_reason: { type: "string" },
      },
      required: ["mode", "selected_provider", "selected_model", "fallback_used"],
    },
  },
};

const I18N = {
  "pt-BR": {
    infoTitle: "Editor AI Creator API",
    infoDescription:
      "Documentação pública da API (V1 Beta). Providers reais são controlados por flags de configuração por feature. Mult AI fica ativo por padrão no modo quality (recomendado), com modos economy e manual sujeitos à policy de plano. Em ambiente Beta/no_keys, quality/economy podem fazer fallback automático para mock quando provider real estiver indisponível. DeepSeek e Claude permanecem preparados, não públicos como providers reais. Slides permanecem em camada exploratória/mock_only no beta atual. O endpoint /api/plans/catalog retorna os valores vigentes no Beta, incluindo status públicos por feature e notas técnicas de qualidade máxima por plano; preços e disponibilidade podem mudar em releases futuras. Endpoints /api/enterprise/* podem retornar 403 enquanto enterprise.enabled estiver desativado.",
    providerModeDescription:
      "A resposta inclui `provider` e pode retornar `mock` ou provider real conforme flags de rollout e disponibilidade de API key. Em Mult AI, `quality`/`economy` podem fazer downgrade por policy (fallback_reason=`policy_downgrade`) e fallback automático para mock quando o provider real estiver indisponível (fallback_reason=`provider_unavailable_fallback`), enquanto `manual` valida provider/model de forma estrita.",
    providerModeHeader: "Modo efetivo do provider para esta resposta (`mock`, `real` ou `n/a`).",
    routingModeHeader: "Modo efetivo do Mult AI para esta resposta (`quality`, `economy` ou `manual`).",
    abuseRiskHeader: "Nível de risco anti-abuso calculado para a requisição (`low`, `medium`, `high`).",
    tags: {
      aiText: "Texto e raciocínio",
      aiImage: "Imagem",
      aiVideo: "Vídeo",
      aiMusic: "Música",
      aiVoice: "Voz",
      aiSlides: "Slides exploratórios",
      aiAvatar: "Avatar Preview",
      coins: "Créditos e conversão",
      enterprise: "Enterprise",
      plans: "Catálogo de planos",
      status: "Status e saúde",
      usage: "Uso e métricas",
      dashboard: "Dashboard",
      events: "Eventos",
      onboarding: "Onboarding",
      admin: "Admin/Debug",
    },
    summary: {
      textGenerate: "Gerar texto",
      factCheck: "Verificar afirmação",
      imageGenerate: "Gerar imagem",
      imageVariation: "Gerar variação de imagem",
      videoGenerate: "Gerar vídeo",
      videoStatus: "Consultar status de vídeo",
      musicGenerate: "Gerar música",
      musicStatus: "Consultar status de música",
      voiceGenerate: "Gerar voz",
      voiceStatus: "Consultar status de voz",
      slidesGenerate: "Gerar slides (exploratório)",
      slidesStatus: "Consultar status de slides (exploratório)",
      avatarStart: "Iniciar sessão de avatar preview",
      avatarMessage: "Enviar mensagem para sessão de avatar",
      avatarEnd: "Encerrar sessão de avatar",
      coinsConvert: "Converter créditos (common/pro/ultra, origem != destino)",
      purchaseQuote: "Cotação de compra avulsa",
      purchaseCreate: "Criar intent de compra avulsa",
      purchaseConfirm: "Confirmar intent de compra avulsa (mock)",
      packageQuote: "Cotação de pacote de créditos avulsos com mix",
      packageCheckoutCreate: "Criar checkout Stripe para pacote de créditos avulsos",
      enterpriseQuote: "Cotação de compra Enterprise",
      enterpriseCheckoutCreate: "Criar checkout Enterprise",
      enterpriseOrders: "Listar pedidos Enterprise do usuário",
      enterpriseOrderDetail: "Detalhar pedido Enterprise",
      plansCatalog: "Catálogo público de planos (Beta)",
      status: "Status interno da API e guardrails",
      healthz: "Health check simples (200 sem body)",
      usageSummary: "Resumo de uso agregado por feature/plano/data",
      dashboardUsage: "Dashboard de uso (24h/7d/30d)",
      dashboardErrors: "Dashboard de erros frequentes",
      dashboardRouting: "Dashboard de roteamento Mult AI",
      eventsRecent: "Eventos recentes do usuário",
      onboardingSchema: "Schema JSON de onboarding",
      helpManual: "Manual interno do usuário em JSON",
    },
  },
  "en-US": {
    infoTitle: "Editor AI Creator API",
    infoDescription:
      "Public API documentation (V1 Beta). Real providers are controlled by per-feature rollout flags. Mult AI is enabled by default in quality mode (recommended), with economy/manual options constrained by plan policy. In Beta/no_keys environments, quality/economy can automatically fall back to mock when real providers are unavailable. DeepSeek and Claude remain prepared, not public real providers. Slides remain exploratory/mock_only in the current beta. The /api/plans/catalog endpoint returns current Beta values, including public feature statuses and technical notes for max quality per plan; prices and availability may change in future releases. /api/enterprise/* endpoints may return 403 while enterprise.enabled is disabled.",
    providerModeDescription:
      "Response includes `provider` and may return `mock` or a real provider depending on rollout flags and API key availability. In Mult AI, `quality`/`economy` may auto-downgrade by plan policy (fallback_reason=`policy_downgrade`) and automatically fall back to mock when real providers are unavailable (fallback_reason=`provider_unavailable_fallback`), while `manual` strictly validates provider/model.",
    providerModeHeader: "Effective provider mode for this response (`mock`, `real`, or `n/a`).",
    routingModeHeader: "Effective Mult AI routing mode for this response (`quality`, `economy`, or `manual`).",
    abuseRiskHeader: "Computed anti-abuse risk level for the request (`low`, `medium`, `high`).",
    tags: {
      aiText: "Text and reasoning",
      aiImage: "Image",
      aiVideo: "Video",
      aiMusic: "Music",
      aiVoice: "Voice",
      aiSlides: "Exploratory slides",
      aiAvatar: "Avatar Preview",
      coins: "Credits and conversion",
      enterprise: "Enterprise",
      plans: "Plans catalog",
      status: "Status and health",
      usage: "Usage and metrics",
      dashboard: "Dashboard",
      events: "Events",
      onboarding: "Onboarding",
      admin: "Admin/Debug",
    },
    summary: {
      textGenerate: "Generate text",
      factCheck: "Fact check",
      imageGenerate: "Generate image",
      imageVariation: "Generate image variation",
      videoGenerate: "Generate video",
      videoStatus: "Get video status",
      musicGenerate: "Generate music",
      musicStatus: "Get music status",
      voiceGenerate: "Generate voice",
      voiceStatus: "Get voice status",
      slidesGenerate: "Generate slides (exploratory)",
      slidesStatus: "Get slides status (exploratory)",
      avatarStart: "Start avatar preview session",
      avatarMessage: "Send message to avatar session",
      avatarEnd: "End avatar session",
      coinsConvert: "Convert credits (common/pro/ultra, source != destination)",
      purchaseQuote: "One-time purchase quote",
      purchaseCreate: "Create one-time purchase intent",
      purchaseConfirm: "Confirm one-time purchase intent (mock)",
      packageQuote: "Quote one-time credits package with mix",
      packageCheckoutCreate: "Create Stripe checkout for one-time credits package",
      enterpriseQuote: "Enterprise purchase quote",
      enterpriseCheckoutCreate: "Create Enterprise checkout",
      enterpriseOrders: "List current user's Enterprise orders",
      enterpriseOrderDetail: "Get Enterprise order details",
      plansCatalog: "Public plans catalog (Beta)",
      status: "Internal API status and guardrails",
      healthz: "Simple health check (200 with empty body)",
      usageSummary: "Aggregated usage summary by feature/plan/date",
      dashboardUsage: "Usage dashboard (24h/7d/30d)",
      dashboardErrors: "Most common errors dashboard",
      dashboardRouting: "Mult AI routing dashboard",
      eventsRecent: "Recent user events",
      onboardingSchema: "Onboarding JSON schema",
      helpManual: "Internal user manual as JSON",
    },
  },
};

function normalizeLang(lang) {
  const raw = String(lang || "").toLowerCase();
  if (raw.startsWith("en")) return "en-US";
  return "pt-BR";
}

function aiOperation({ locale, summary, tag, requestBodyRef, successExample }) {
  const isEnLocale = locale?.summary?.textGenerate === "Generate text";
  return {
    tags: [tag],
    summary,
    description: locale.providerModeDescription,
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 8 },
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: requestBodyRef },
        },
      },
    },
    responses: {
      200: {
        description: "OK",
        headers: {
          "X-AI-Provider-Mode": {
            description: locale.providerModeHeader,
            schema: { type: "string", enum: ["mock", "real", "n/a"] },
          },
          "X-Abuse-Risk": {
            description: locale.abuseRiskHeader,
            schema: { type: "string", enum: ["low", "medium", "high"] },
          },
          "X-AI-Routing-Mode": {
            description: locale.routingModeHeader,
            schema: { type: "string", enum: ["quality", "economy", "manual"] },
          },
        },
        content: {
          "application/json": {
            schema: { allOf: [{ type: "object" }, replayFlagSchema, routingSchema] },
            example: successExample,
          },
        },
      },
      401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
      403: {
        description: "Forbidden (including model_not_allowed in manual mode)",
        content: {
          "application/json": {
            schema: errorResponseSchema,
            example: {
              error: "model_not_allowed",
              message: isEnLocale ? "AI model is not allowed for your plan." : "Modelo de IA não permitido para o seu plano.",
              routing: {
                mode: "manual",
                requested: { provider: "openai", model: "openai-pro", tier: "pro" },
                selected_provider: null,
                selected_model: null,
                fallback_used: false,
                fallback_reason: "model_not_allowed",
              },
            },
          },
        },
      },
      409: { description: "Idempotency conflict", content: { "application/json": { schema: errorResponseSchema } } },
      429: { description: "Rate limited", content: { "application/json": { schema: errorResponseSchema } } },
      503: { description: "Feature temporarily disabled", content: { "application/json": { schema: errorResponseSchema } } },
      502: { description: "Provider failed", content: { "application/json": { schema: errorResponseSchema } } },
    },
  };
}

export function getOpenApiSpec(lang = "pt-BR", { serverUrl = "/api" } = {}) {
  const locale = I18N[normalizeLang(lang)];
  return {
    openapi: "3.0.3",
    info: {
      title: locale.infoTitle,
      version: "1.0.0-beta",
      description: locale.infoDescription,
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: "AI Text", description: locale.tags.aiText },
      { name: "AI Image", description: locale.tags.aiImage },
      { name: "AI Video", description: locale.tags.aiVideo },
      { name: "AI Music", description: locale.tags.aiMusic },
      { name: "AI Voice", description: locale.tags.aiVoice },
      { name: "AI Slides", description: locale.tags.aiSlides },
      { name: "AI Avatar", description: locale.tags.aiAvatar },
      { name: "Coins", description: locale.tags.coins },
      { name: "Enterprise", description: locale.tags.enterprise },
      { name: "Plans", description: locale.tags.plans },
      { name: "Status", description: locale.tags.status },
      { name: "Usage", description: locale.tags.usage },
      { name: "Dashboard", description: locale.tags.dashboard },
      { name: "Events", description: locale.tags.events },
      { name: "Onboarding", description: locale.tags.onboarding },
      { name: "Admin/Debug", description: locale.tags.admin },
    ],
    paths: {
      "/ai/text-generate": {
        post: aiOperation({
          locale,
          summary: locale.summary.textGenerate,
          tag: "AI Text",
          requestBodyRef: "#/components/schemas/TextGenerateRequest",
          successExample: {
            ok: true,
            text: normalizeLang(lang) === "en-US" ? "Generated text" : "Texto gerado",
            provider: "mock",
            model: "mock-text-v1",
            routing: {
              mode: "quality",
              selected_provider: "openai",
              selected_model: "openai-standard",
              fallback_used: false,
            },
            replay: false,
          },
        }),
      },
      "/ai/fact-check": {
        post: aiOperation({
          locale,
          summary: locale.summary.factCheck,
          tag: "AI Text",
          requestBodyRef: "#/components/schemas/FactCheckRequest",
          successExample: {
            ok: true,
            verdict: "SUPPORTED",
            confidence: 86,
            provider: "mock",
            model: "mock-fact-v1",
            routing: { mode: "quality", selected_provider: "openai", selected_model: "openai-standard", fallback_used: false },
            replay: false,
          },
        }),
      },
      "/ai/image-generate": {
        post: aiOperation({
          locale,
          summary: locale.summary.imageGenerate,
          tag: "AI Image",
          requestBodyRef: "#/components/schemas/ImageGenerateRequest",
          successExample: {
            ok: true,
            images: ["https://example.com/mock-image.png"],
            provider: "mock",
            model: "mock-image-v1",
            routing: { mode: "quality", selected_provider: "openai", selected_model: "openai-standard", fallback_used: false },
            replay: false,
          },
        }),
      },
      "/ai/image-variation": {
        post: aiOperation({
          locale,
          summary: locale.summary.imageVariation,
          tag: "AI Image",
          requestBodyRef: "#/components/schemas/ImageVariationRequest",
          successExample: {
            ok: true,
            images: ["https://example.com/mock-variation.png"],
            provider: "mock",
            model: "mock-image-v1",
            routing: { mode: "quality", selected_provider: "openai", selected_model: "openai-intermediate", fallback_used: false },
            replay: false,
          },
        }),
      },
      "/ai/video-generate": {
        post: aiOperation({
          locale,
          summary: locale.summary.videoGenerate,
          tag: "AI Video",
          requestBodyRef: "#/components/schemas/VideoGenerateRequest",
          successExample: { ok: true, jobId: "vid_123", status: "queued", provider: "mock", model: "mock-video-v1", replay: false },
        }),
      },
      "/ai/video-status": {
        post: aiOperation({
          locale,
          summary: locale.summary.videoStatus,
          tag: "AI Video",
          requestBodyRef: "#/components/schemas/JobStatusRequest",
          successExample: { ok: true, jobId: "vid_123", status: "succeeded", output: { video_url: "https://example.com/mock-video.mp4" }, replay: false },
        }),
      },
      "/ai/music-generate": {
        post: aiOperation({
          locale,
          summary: locale.summary.musicGenerate,
          tag: "AI Music",
          requestBodyRef: "#/components/schemas/MusicGenerateRequest",
          successExample: { ok: true, jobId: "mus_123", status: "queued", provider: "mock", model: "mock-music-v1", replay: false },
        }),
      },
      "/ai/music-status": {
        post: aiOperation({
          locale,
          summary: locale.summary.musicStatus,
          tag: "AI Music",
          requestBodyRef: "#/components/schemas/JobStatusRequest",
          successExample: { ok: true, jobId: "mus_123", status: "succeeded", output: { audio_url: "https://example.com/mock-output.mp3" }, replay: false },
        }),
      },
      "/ai/voice-generate": {
        post: aiOperation({
          locale,
          summary: locale.summary.voiceGenerate,
          tag: "AI Voice",
          requestBodyRef: "#/components/schemas/VoiceGenerateRequest",
          successExample: { ok: true, jobId: "vce_123", status: "queued", provider: "mock", model: "mock-voice-v1", replay: false },
        }),
      },
      "/ai/voice-status": {
        post: aiOperation({
          locale,
          summary: locale.summary.voiceStatus,
          tag: "AI Voice",
          requestBodyRef: "#/components/schemas/JobStatusRequest",
          successExample: { ok: true, jobId: "vce_123", status: "succeeded", output: { audio_url: "https://example.com/mock-voice.mp3" }, replay: false },
        }),
      },
      "/ai/slides-generate": {
        post: aiOperation({
          locale,
          summary: locale.summary.slidesGenerate,
          tag: "AI Slides",
          requestBodyRef: "#/components/schemas/SlidesGenerateRequest",
          successExample: { ok: true, jobId: "sld_123", status: "queued", provider: "mock", model: "mock-slides-v1", replay: false },
        }),
      },
      "/ai/slides-status": {
        post: aiOperation({
          locale,
          summary: locale.summary.slidesStatus,
          tag: "AI Slides",
          requestBodyRef: "#/components/schemas/JobStatusRequest",
          successExample: { ok: true, jobId: "sld_123", status: "succeeded", output: { slides_url: "https://example.com/slides", pdf_url: "https://example.com/slides.pdf" }, replay: false },
        }),
      },
      "/ai/avatar/start": {
        post: aiOperation({
          locale,
          summary: locale.summary.avatarStart,
          tag: "AI Avatar",
          requestBodyRef: "#/components/schemas/AvatarStartRequest",
          successExample: { ok: true, session: { id: "uuid", avatar_id: "ava_01", voice_enabled: false, seconds_limit: 120, seconds_used: 0, status: "active" }, replay: false },
        }),
      },
      "/ai/avatar/message": {
        post: aiOperation({
          locale,
          summary: locale.summary.avatarMessage,
          tag: "AI Avatar",
          requestBodyRef: "#/components/schemas/AvatarMessageRequest",
          successExample: { ok: true, session: { id: "uuid", status: "active", seconds_limit: 120, seconds_used: 15, remaining_seconds: 105 }, snapshot: { last_message: "Oi" }, replay: false },
        }),
      },
      "/ai/avatar/end": {
        post: aiOperation({
          locale,
          summary: locale.summary.avatarEnd,
          tag: "AI Avatar",
          requestBodyRef: "#/components/schemas/AvatarEndRequest",
          successExample: { ok: true, session: { id: "uuid", status: "ended" }, replay: false },
        }),
      },
      "/coins/balance": {
        get: {
          tags: ["Coins"],
          summary: normalizeLang(lang) === "en-US" ? "Get credits balance" : "Consultar saldo de créditos",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PlansCatalogResponse" },
                  example: {
                    wallet: {
                      user_id: "00000000-0000-0000-0000-000000000000",
                      common: 120,
                      pro: 45,
                      ultra: 10,
                    },
                  },
                },
              },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            429: { description: "Rate limited", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/coins/convert": {
        post: {
          tags: ["Coins"],
          summary: locale.summary.coinsConvert,
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 8 } }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CoinsConvertRequest" } } } },
          responses: {
            200: { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
            400: { description: "Invalid", content: { "application/json": { schema: errorResponseSchema } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden", content: { "application/json": { schema: errorResponseSchema } } },
            409: { description: "Conflict", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/coins/purchase/quote": {
        post: {
          tags: ["Coins"],
          summary: locale.summary.purchaseQuote,
          security: [{ BearerAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PurchaseQuoteRequest" } } } },
          responses: {
            200: { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
            400: { description: "Invalid", content: { "application/json": { schema: errorResponseSchema } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/coins/purchase/create": {
        post: {
          tags: ["Coins"],
          summary: locale.summary.purchaseCreate,
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 8 } }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PurchaseCreateRequest" } } } },
          responses: {
            200: { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
            400: { description: "Invalid", content: { "application/json": { schema: errorResponseSchema } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden", content: { "application/json": { schema: errorResponseSchema } } },
            409: { description: "Conflict", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/coins/purchase/confirm": {
        post: {
          tags: ["Coins"],
          summary: locale.summary.purchaseConfirm,
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 8 } }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PurchaseConfirmRequest" } } } },
          responses: {
            200: { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
            400: { description: "Invalid", content: { "application/json": { schema: errorResponseSchema } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            404: { description: "Not found", content: { "application/json": { schema: errorResponseSchema } } },
            409: { description: "Conflict", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/coins/packages/quote": {
        post: {
          tags: ["Coins"],
          summary: locale.summary.packageQuote,
          description:
            normalizeLang(lang) === "en-US"
              ? "Supports preset package totals (300/1200/3000) and free custom totals starting at 100 in steps of 10. Purchase fee is 3% for FREE and 0% for paid plans."
              : "Aceita totais de pacote pré-definidos (300/1200/3000) e total personalizado livre a partir de 100 em passos de 10. Fee de compra é 3% no FREE e 0% nos planos pagos.",
          security: [{ BearerAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CoinsPackageQuoteRequest" } } } },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CoinsPackageQuoteResponse" },
                },
              },
            },
            400: { description: "Invalid", content: { "application/json": { schema: errorResponseSchema } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden", content: { "application/json": { schema: errorResponseSchema } } },
            503: { description: "Service unavailable", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/coins/packages/checkout/create": {
        post: {
          tags: ["Coins"],
          summary: locale.summary.packageCheckoutCreate,
          description:
            normalizeLang(lang) === "en-US"
              ? "Creates Stripe checkout from a quote_id, or from direct package_total + breakdown (same validation as quote)."
              : "Cria checkout Stripe a partir de quote_id, ou por package_total + breakdown direto (mesma validação da cotação).",
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 8 } }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CoinsPackageCheckoutCreateRequest" } } } },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CoinsPackageCheckoutCreateResponse" },
                },
              },
            },
            400: { description: "Invalid", content: { "application/json": { schema: errorResponseSchema } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden", content: { "application/json": { schema: errorResponseSchema } } },
            404: { description: "Not found", content: { "application/json": { schema: errorResponseSchema } } },
            409: { description: "Conflict", content: { "application/json": { schema: errorResponseSchema } } },
            503: { description: "Stripe unavailable", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/enterprise/quote": {
        post: {
          tags: ["Enterprise"],
          summary: locale.summary.enterpriseQuote,
          description:
            normalizeLang(lang) === "en-US"
              ? "Enterprise flow is blocked by default in Beta (enterprise.enabled=false). When enabled, backend validates minimum quantity per selected type and quantity step."
              : "O fluxo Enterprise inicia bloqueado no Beta (enterprise.enabled=false). Quando habilitado, o backend valida mínimo por tipo selecionado e step de quantidade.",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EnterpriseQuoteRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    currency: "BRL",
                    breakdown: {
                      per_type: {
                        common: { qty: 50000, unit_price_cents: 15, subtotal_cents: 750000 },
                        pro: { qty: 0, unit_price_cents: 45, subtotal_cents: 0 },
                        ultra: { qty: 0, unit_price_cents: 150, subtotal_cents: 0 },
                      },
                      subtotal_cents: 750000,
                      fee_cents: 0,
                      total_cents: 750000,
                      total_brl: 7500,
                    },
                    rules: { min_qty_per_type: 50000, qty_step: 1000 },
                    note:
                      normalizeLang(lang) === "en-US"
                        ? "Credits are released only after Stripe webhook payment confirmation."
                        : "Créditos são liberados somente após confirmação de pagamento via webhook Stripe.",
                  },
                },
              },
            },
            400: { description: "Invalid quantities", content: { "application/json": { schema: errorResponseSchema } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Enterprise disabled", content: { "application/json": { schema: errorResponseSchema } } },
            503: { description: "Service unavailable", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/enterprise/checkout/create": {
        post: {
          tags: ["Enterprise"],
          summary: locale.summary.enterpriseCheckoutCreate,
          description:
            normalizeLang(lang) === "en-US"
              ? "Creates an Enterprise Stripe Checkout session. Frontend values are never trusted; server recalculates all prices."
              : "Cria sessão Stripe Checkout Enterprise. Valores do frontend nunca são fonte de verdade; o backend recalcula tudo.",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: true,
              schema: { type: "string", minLength: 8 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EnterpriseCheckoutCreateRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    message: normalizeLang(lang) === "en-US" ? "Checkout created successfully." : "Checkout criado com sucesso.",
                    order: {
                      id: "00000000-0000-0000-0000-000000000000",
                      status: "pending",
                      currency: "BRL",
                      common_qty: 50000,
                      pro_qty: 0,
                      ultra_qty: 0,
                      total_cents: 750000,
                      total_brl: 7500,
                      credits_granted: false,
                    },
                    checkout: {
                      id: "cs_test_123",
                      url: "https://checkout.stripe.com/c/pay/cs_test_123",
                    },
                  },
                },
              },
            },
            400: { description: "Invalid body or missing idempotency key", content: { "application/json": { schema: errorResponseSchema } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Enterprise disabled", content: { "application/json": { schema: errorResponseSchema } } },
            409: { description: "Idempotency conflict", content: { "application/json": { schema: errorResponseSchema } } },
            503: { description: "Stripe or DB unavailable", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/enterprise/orders": {
        get: {
          tags: ["Enterprise"],
          summary: locale.summary.enterpriseOrders,
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    items: [
                      {
                        id: "00000000-0000-0000-0000-000000000000",
                        status: "paid",
                        currency: "BRL",
                        common_qty: 50000,
                        pro_qty: 0,
                        ultra_qty: 0,
                        total_cents: 750000,
                        total_brl: 7500,
                        credits_granted: true,
                      },
                    ],
                  },
                },
              },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Enterprise disabled", content: { "application/json": { schema: errorResponseSchema } } },
            503: { description: "Service unavailable", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/enterprise/orders/{id}": {
        get: {
          tags: ["Enterprise"],
          summary: locale.summary.enterpriseOrderDetail,
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            200: { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
            400: { description: "Invalid order id", content: { "application/json": { schema: errorResponseSchema } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Enterprise disabled", content: { "application/json": { schema: errorResponseSchema } } },
            404: { description: "Not found", content: { "application/json": { schema: errorResponseSchema } } },
            503: { description: "Service unavailable", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/healthz": {
        get: {
          tags: ["Status"],
          summary: locale.summary.healthz,
          responses: {
            200: { description: "OK (empty body)" },
          },
        },
      },
      "/status": {
        get: {
          tags: ["Status"],
          summary: locale.summary.status,
          description:
            normalizeLang(lang) === "en-US"
              ? "Internal admin-only launch status endpoint."
              : "Endpoint interno de status de lançamento (somente admin).",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    uptime_seconds: 153.7,
                    plan: {
                      code: "EDITOR_PRO",
                      tier: 1,
                      limits: { avatar_preview: { enabled: false, sessions_per_day: 0, seconds_per_session: 0 } },
                    },
                    internal_cost_totals: {
                      user: { total_cost_score: 8.3, last24h_cost_score: 2.4, last7d_cost_score: 5.1 },
                      global: { total_cost_score: 120.9, last24h_cost_score: 44.7, last7d_cost_score: 98.2 },
                    },
                    abuse_guards: {
                      kill_switch: {
                        by_feature: { ai_video: false, ai_music: false },
                        by_provider: { runway: false, suno: false },
                      },
                      budget_limits: { user_daily_internal_cost_score: 250, global_daily_internal_cost_score: 25000 },
                    },
                    routing_defaults: {
                      mult_ai_enabled: true,
                      default_mode: "quality",
                      available_modes: ["quality", "economy", "manual"],
                      recommended_mode: "quality",
                    },
                  },
                },
              },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden (adminOnly)", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/usage/summary": {
        get: {
          tags: ["Usage"],
          summary: locale.summary.usageSummary,
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "group_by",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["feature", "plan", "date"] },
            },
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    group_by: "feature",
                    items: [
                      { feature: "text_generate", plan: "FREE", count: 12, totalCostScore: 12 },
                      { feature: "image_generate", plan: "EDITOR_PRO", count: 5, totalCostScore: 7.5 },
                    ],
                  },
                },
              },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/dashboard/usage": {
        get: {
          tags: ["Dashboard"],
          summary: locale.summary.dashboardUsage,
          description:
            normalizeLang(lang) === "en-US"
              ? "Internal admin-only dashboard endpoint."
              : "Endpoint interno de dashboard (somente admin).",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    usage: {
                      last24h: { total: 9 },
                      last7d: { total: 23 },
                      last30d: { total: 51 },
                      by_feature: [{ feature: "text_generate", count: 18, totalCostScore: 18 }],
                    },
                  },
                },
              },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden (adminOnly)", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/dashboard/errors": {
        get: {
          tags: ["Dashboard"],
          summary: locale.summary.dashboardErrors,
          description:
            normalizeLang(lang) === "en-US"
              ? "Internal admin-only dashboard endpoint."
              : "Endpoint interno de dashboard (somente admin).",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    errors: {
                      items: [{ error: "429", count: 3 }, { error: "budget_limit_reached", count: 2 }],
                    },
                  },
                },
              },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden (adminOnly)", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/dashboard/routing": {
        get: {
          tags: ["Dashboard"],
          summary: locale.summary.dashboardRouting,
          description:
            normalizeLang(lang) === "en-US"
              ? "Internal admin-only dashboard endpoint."
              : "Endpoint interno de dashboard (somente admin).",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    routing: {
                      modes: { quality: 22, economy: 8, manual: 3, unknown: 0 },
                      providers: [{ provider: "mock", count: 20 }, { provider: "openai", count: 13 }],
                    },
                  },
                },
              },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden (adminOnly)", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/events/recent": {
        get: {
          tags: ["Events"],
          summary: locale.summary.eventsRecent,
          description:
            normalizeLang(lang) === "en-US"
              ? "Internal admin-only recent events stream."
              : "Stream interno de eventos recentes (somente admin).",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: "user_id",
              in: "query",
              required: false,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    items: [
                      {
                        event: "user.login",
                        userId: "00000000-0000-0000-0000-000000000000",
                        plan: "FREE",
                        timestamp: "2026-02-18T12:00:00.000Z",
                        additional: { source: "auth.login" },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden (adminOnly)", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/events/test": {
        post: {
          tags: ["Events"],
          summary: normalizeLang(lang) === "en-US" ? "Emit internal test event" : "Emitir evento interno de teste",
          description:
            normalizeLang(lang) === "en-US"
              ? "Internal admin-only endpoint. In production, returns 404 unless launch.events_test is enabled."
              : "Endpoint interno somente admin. Em produção retorna 404 por padrão, salvo toggle launch.events_test.",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    event: { type: "string", enum: ["user.signup", "user.login", "user.language_select", "user.plan_change"] },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
            403: { description: "Forbidden (adminOnly)", content: { "application/json": { schema: errorResponseSchema } } },
            404: { description: "Not found (disabled in production)", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
      "/onboarding/schema": {
        get: {
          tags: ["Onboarding"],
          summary: locale.summary.onboardingSchema,
          parameters: [
            {
              name: "lang",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["pt-BR", "en-US"] },
            },
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    lang: normalizeLang(lang),
                    onboarding: {
                      version: "v1-beta",
                      steps: [
                        {
                          step: 1,
                          title: normalizeLang(lang) === "en-US" ? "Check platform status" : "Verificar status da plataforma",
                          description:
                            normalizeLang(lang) === "en-US"
                              ? "Call /api/status and validate uptime and guardrails."
                              : "Chame /api/status e valide uptime e guardrails.",
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/plans/catalog": {
        get: {
          tags: ["Plans"],
          summary: locale.summary.plansCatalog,
          parameters: [
            {
              name: "lang",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["pt-BR", "en-US"] },
            },
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "object" },
                  example: {
                    ok: true,
                    lang: normalizeLang(lang),
                    currency: "BRL",
                    plans: [
                      {
                        code: "FREE",
                        name: normalizeLang(lang) === "en-US" ? "Free" : "Gratuito",
                        visible: false,
                        coming_soon: false,
                        purchasable: false,
                        price: { amount_brl: 0, period: "month" },
                        highlight: null,
                        badge_label: null,
                        credits: { common: 30, pro: 0, ultra: 0 },
                        features: [
                          {
                            key: "ai_text",
                            label: normalizeLang(lang) === "en-US" ? "AI text" : "Texto com IA",
                            enabled: true,
                            runtime_delivery_status: "real",
                            public_readiness: "publish_now",
                          },
                          {
                            key: "ai_slides",
                            label: normalizeLang(lang) === "en-US" ? "AI slides" : "Slides com IA",
                            enabled: false,
                            runtime_delivery_status: "mock_only",
                            public_readiness: "do_not_promise",
                          },
                        ],
                        limits: {
                          quality: {
                            outputs: ["720p", "1080p"],
                            runtime_delivery_status: "limited",
                            public_readiness: "publish_with_note",
                            public_note:
                              normalizeLang(lang) === "en-US"
                                ? "Read max quality as a technical cap, not as a universal delivery guarantee."
                                : "Leia a qualidade máxima como teto técnico, não como promessa universal de entrega.",
                          },
                          avatar_preview: { enabled: false, sessions_per_day: 0, seconds_per_session: 0 },
                        },
                        addons: {
                          purchase: { allowed_coin_types: ["common"], fee_percent: 3 },
                          convert: { enabled: false, pairs: [], fee_percent: 0 },
                        },
                      },
                      {
                        code: "EDITOR_FREE",
                        name: normalizeLang(lang) === "en-US" ? "Starter" : "Iniciante",
                        visible: true,
                        coming_soon: false,
                        purchasable: true,
                        price: { amount_brl: 19.9, period: "month" },
                        highlight: null,
                        badge_label: null,
                        credits: { common: 300, pro: 120, ultra: 0 },
                        features: [
                          { key: "ai_text", label: normalizeLang(lang) === "en-US" ? "AI text" : "Texto com IA", enabled: true },
                          { key: "avatar_preview", label: normalizeLang(lang) === "en-US" ? "Avatar preview" : "Avatar Preview", enabled: false },
                        ],
                        limits: {
                          avatar_preview: { enabled: false, sessions_per_day: 0, seconds_per_session: 0 },
                        },
                        addons: {
                          purchase: { allowed_coin_types: ["common", "pro"], fee_percent: 0 },
                          convert: { enabled: true, pairs: ["common->pro", "common->ultra", "pro->common", "pro->ultra", "ultra->common", "ultra->pro"], fee_percent: 8 },
                        },
                      },
                      {
                        code: "EDITOR_PRO",
                        name: "Editor Pro",
                        visible: true,
                        coming_soon: false,
                        purchasable: true,
                        price: { amount_brl: 59.9, period: "month" },
                        highlight: "most_popular",
                        badge_label: normalizeLang(lang) === "en-US" ? "Most popular" : "Mais popular",
                        credits: { common: 500, pro: 250, ultra: 100 },
                        features: [
                          { key: "ai_text", label: normalizeLang(lang) === "en-US" ? "AI text" : "Texto com IA", enabled: true },
                          { key: "ai_image", label: normalizeLang(lang) === "en-US" ? "AI image" : "Imagem com IA", enabled: true },
                        ],
                        limits: {
                          avatar_preview: { enabled: false, sessions_per_day: 0, seconds_per_session: 0 },
                        },
                        addons: {
                          purchase: { allowed_coin_types: ["common", "pro", "ultra"], fee_percent: 0 },
                          convert: { enabled: true, pairs: ["common->pro", "common->ultra", "pro->common", "pro->ultra", "ultra->common", "ultra->pro"], fee_percent: 4 },
                        },
                      },
                      {
                        code: "EDITOR_ULTRA",
                        name: "Creator Pro",
                        visible: true,
                        coming_soon: false,
                        purchasable: true,
                        price: { amount_brl: 149.9, period: "month" },
                        highlight: null,
                        badge_label: null,
                        credits: { common: 1000, pro: 600, ultra: 300 },
                        features: [
                          { key: "ai_text", label: normalizeLang(lang) === "en-US" ? "AI text" : "Texto com IA", enabled: true },
                          { key: "avatar_preview", label: normalizeLang(lang) === "en-US" ? "Avatar preview" : "Avatar Preview", enabled: true },
                        ],
                        limits: {
                          avatar_preview: { enabled: true, sessions_per_day: 1, seconds_per_session: 120 },
                        },
                        addons: {
                          purchase: { allowed_coin_types: ["common", "pro", "ultra"], fee_percent: 0 },
                          convert: { enabled: true, pairs: ["common->pro", "common->ultra", "pro->common", "pro->ultra", "ultra->common", "ultra->pro"], fee_percent: 2 },
                        },
                      },
                      {
                        code: "EMPRESARIAL",
                        name: normalizeLang(lang) === "en-US" ? "Business" : "Empresarial",
                        visible: true,
                        coming_soon: true,
                        purchasable: false,
                        price: { amount_brl: 499.9, period: "month" },
                        highlight: null,
                        badge_label: null,
                        credits: null,
                        features: [
                          { key: "ai_text", label: normalizeLang(lang) === "en-US" ? "AI text" : "Texto com IA", enabled: true },
                          { key: "avatar_preview", label: normalizeLang(lang) === "en-US" ? "Avatar preview" : "Avatar Preview", enabled: true },
                        ],
                        limits: {
                          avatar_preview: { enabled: true, sessions_per_day: 1, seconds_per_session: 120 },
                        },
                        addons: {
                          purchase: { allowed_coin_types: ["common", "pro", "ultra"], fee_percent: 0 },
                          convert: { enabled: true, pairs: ["common->pro", "common->ultra", "pro->common", "pro->ultra", "ultra->common", "ultra->pro"], fee_percent: 0 },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      "/help/manual": {
        get: {
          tags: ["Admin/Debug"],
          summary: locale.summary.helpManual,
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "lang",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["pt-BR", "en-US"] },
            },
          ],
          responses: {
            200: { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: errorResponseSchema } } },
          },
        },
      },
    },
    components: {
      securitySchemes: { BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: {
        PlanCatalogFeature: {
          type: "object",
          required: ["key", "label", "enabled"],
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            enabled: { type: "boolean" },
            availability: { type: "string" },
            runtime_delivery_status: { type: "string" },
            public_readiness: { type: "string" },
            public_notes: { type: "array", items: { type: "string" } },
          },
        },
        PlanCatalogQualityLimit: {
          type: "object",
          properties: {
            outputs: { type: "array", items: { type: "string" } },
            runtime_delivery_status: { type: "string" },
            public_readiness: { type: "string" },
            public_note: { type: ["string", "null"] },
          },
        },
        PlanCatalogAvatarPreviewLimit: {
          type: "object",
          required: ["enabled", "sessions_per_day", "seconds_per_session"],
          properties: {
            enabled: { type: "boolean" },
            sessions_per_day: { type: "integer", minimum: 0 },
            seconds_per_session: { type: "integer", minimum: 0 },
          },
        },
        PlanCatalogPlan: {
          type: "object",
          required: ["code", "name", "price", "credits", "features", "limits", "addons"],
          properties: {
            code: { type: "string" },
            name: { type: "string" },
            visible: { type: "boolean" },
            coming_soon: { type: "boolean" },
            purchasable: { type: "boolean" },
            highlight: { type: ["string", "null"] },
            badge_label: { type: ["string", "null"] },
            price: {
              type: "object",
              required: ["amount_brl", "period"],
              properties: {
                amount_brl: { type: "number" },
                period: { type: "string", enum: ["month"] },
              },
            },
            credits: {
              type: ["object", "null"],
              properties: {
                common: { type: "integer", minimum: 0 },
                pro: { type: "integer", minimum: 0 },
                ultra: { type: "integer", minimum: 0 },
              },
            },
            features: {
              type: "array",
              items: { $ref: "#/components/schemas/PlanCatalogFeature" },
            },
            limits: {
              type: "object",
              required: ["avatar_preview"],
              properties: {
                quality: { $ref: "#/components/schemas/PlanCatalogQualityLimit" },
                avatar_preview: { $ref: "#/components/schemas/PlanCatalogAvatarPreviewLimit" },
              },
            },
            quality_outputs: {
              type: "array",
              items: { type: "string" },
            },
            providers_by_feature: {
              type: "object",
              additionalProperties: true,
            },
            availability: {
              type: "object",
              additionalProperties: true,
            },
            public_status: {
              type: "object",
              additionalProperties: true,
            },
            runtime_rules: {
              type: "object",
              additionalProperties: true,
            },
            honesty_notes: {
              type: "array",
              items: { type: "string" },
            },
            addons: {
              type: "object",
              required: ["purchase", "convert"],
              properties: {
                purchase: {
                  type: "object",
                  required: ["allowed_coin_types", "fee_percent"],
                  properties: {
                    allowed_coin_types: {
                      type: "array",
                      items: { type: "string", enum: ["common", "pro", "ultra"] },
                    },
                    fee_percent: { type: "number" },
                  },
                },
                convert: {
                  type: "object",
                  required: ["enabled", "pairs", "fee_percent"],
                  properties: {
                    enabled: { type: "boolean" },
                    pairs: { type: "array", items: { type: "string" } },
                    fee_percent: { type: "number" },
                  },
                },
              },
            },
          },
        },
        PlansCatalogResponse: {
          type: "object",
          required: ["ok", "lang", "currency", "plans"],
          properties: {
            ok: { type: "boolean" },
            lang: { type: "string", enum: ["pt-BR", "en-US"] },
            currency: { type: "string", enum: ["BRL"] },
            plans: {
              type: "array",
              items: { $ref: "#/components/schemas/PlanCatalogPlan" },
            },
          },
        },
        TextGenerateRequest: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: { type: "string", minLength: 1, maxLength: 5000 },
            language: { type: "string", example: normalizeLang(lang) === "en-US" ? "en-US" : "pt-BR" },
            max_tokens: { type: "integer", minimum: 1 },
            mult_ai: { $ref: "#/components/schemas/MultAIRoutingRequest" },
          },
        },
        FactCheckRequest: {
          type: "object",
          required: ["claim"],
          properties: { claim: { type: "string" }, query: { type: "string" }, language: { type: "string" }, mult_ai: { $ref: "#/components/schemas/MultAIRoutingRequest" } },
        },
        ImageGenerateRequest: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: { type: "string", maxLength: 500 },
            style: { type: "string" },
            aspectRatio: { type: "string", enum: ["1:1", "16:9", "9:16"] },
            quality: { type: "string", enum: ["low", "medium", "high"] },
            count: { type: "integer", minimum: 1, maximum: 3 },
            mult_ai: { $ref: "#/components/schemas/MultAIRoutingRequest" },
          },
        },
        ImageVariationRequest: {
          type: "object",
          required: ["imageUrl", "prompt"],
          properties: {
            imageUrl: { type: "string", format: "uri" },
            prompt: { type: "string", maxLength: 500 },
            strength: { type: "number", minimum: 0, maximum: 1 },
            mult_ai: { $ref: "#/components/schemas/MultAIRoutingRequest" },
          },
        },
        MultAIRoutingRequest: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["quality", "economy", "manual"], default: "quality" },
            requested: {
              type: "object",
              properties: {
                provider: { type: "string", example: "openai" },
                model: { type: "string", example: "openai-pro" },
                tier: { type: "string", enum: ["basic", "standard", "intermediate", "pro"] },
              },
            },
          },
        },
        VideoGenerateRequest: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: { type: "string", maxLength: 800 },
            imageUrl: { type: "string", format: "uri" },
            durationSec: { type: "integer", minimum: 4, maximum: 20 },
            aspectRatio: { type: "string", enum: ["16:9", "9:16", "1:1"] },
            quality: { type: "string", enum: ["low", "medium", "high"] },
            mult_ai: { $ref: "#/components/schemas/MultAIRoutingRequest" },
          },
        },
        MusicGenerateRequest: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: { type: "string", maxLength: 800 },
            lyrics: { type: "string", maxLength: 3000 },
            style: { type: "string", maxLength: 200 },
            durationSec: { type: "integer", minimum: 10, maximum: 180 },
            quality: { type: "string", enum: ["low", "medium", "high"] },
            mult_ai: { $ref: "#/components/schemas/MultAIRoutingRequest" },
          },
        },
        VoiceGenerateRequest: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string", minLength: 1, maxLength: 2000 },
            language: { type: "string" },
            voiceId: { type: "string" },
            stability: { type: "number", minimum: 0, maximum: 1 },
            similarityBoost: { type: "number", minimum: 0, maximum: 1 },
            style: { type: "number", minimum: 0, maximum: 1 },
            format: { type: "string", enum: ["mp3", "wav"] },
            quality: { type: "string", enum: ["low", "medium", "high"] },
            mult_ai: { $ref: "#/components/schemas/MultAIRoutingRequest" },
          },
        },
        SlidesGenerateRequest: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            outline: { type: "string" },
            theme: { type: "string" },
            language: { type: "string" },
            slideCount: { type: "integer", minimum: 1, maximum: 30 },
            quality: { type: "string", enum: ["low", "medium", "high"] },
            mult_ai: { $ref: "#/components/schemas/MultAIRoutingRequest" },
          },
        },
        JobStatusRequest: {
          type: "object",
          required: ["jobId"],
          properties: {
            jobId: { type: "string" },
            mult_ai: { $ref: "#/components/schemas/MultAIRoutingRequest" },
          },
        },
        AvatarStartRequest: {
          type: "object",
          required: ["avatar_id"],
          properties: { avatar_id: { type: "string", enum: ["ava_01", "ava_02", "ava_03"] }, voice_enabled: { type: "boolean", default: false } },
        },
        AvatarMessageRequest: {
          type: "object",
          required: ["session_id", "message"],
          properties: {
            session_id: { type: "string", format: "uuid" },
            message: { type: "string", maxLength: 2000 },
            seconds_increment: { type: "integer", minimum: 1, maximum: 30 },
            state: { type: "object" },
          },
        },
        AvatarEndRequest: {
          type: "object",
          required: ["session_id"],
          properties: { session_id: { type: "string", format: "uuid" }, final_state: { type: "object" } },
        },
        CoinsConvertRequest: {
          type: "object",
          required: ["from", "to", "amount"],
          properties: { from: { type: "string", enum: ["common", "pro"] }, to: { type: "string", enum: ["pro", "ultra"] }, amount: { type: "integer", minimum: 1 } },
        },
        PurchaseQuoteRequest: {
          type: "object",
          required: ["coin_type", "amount"],
          properties: { coin_type: { type: "string", enum: ["common", "pro", "ultra"] }, amount: { type: "integer", minimum: 1 } },
        },
        PurchaseCreateRequest: {
          type: "object",
          required: ["coin_type", "amount"],
          properties: { coin_type: { type: "string", enum: ["common", "pro", "ultra"] }, amount: { type: "integer", minimum: 1 }, metadata: { type: "object" } },
        },
        PurchaseConfirmRequest: {
          type: "object",
          required: ["intent_id"],
          properties: { intent_id: { type: "string", format: "uuid" } },
        },
        CoinsPackageBreakdown: {
          type: "object",
          required: ["common", "pro", "ultra"],
          properties: {
            common: { type: "integer", minimum: 0, multipleOf: 10 },
            pro: { type: "integer", minimum: 0, multipleOf: 10 },
            ultra: { type: "integer", minimum: 0, multipleOf: 10 },
          },
        },
        CoinsPackageTotal: {
          type: "integer",
          minimum: 100,
          maximum: 2147483640,
          multipleOf: 10,
          example: 350,
          description:
            normalizeLang(lang) === "en-US"
              ? "Preset totals: 300/1200/3000. Custom totals are accepted from 100 upward (step 10)."
              : "Totais preset: 300/1200/3000. Totais personalizados são aceitos a partir de 100 (step 10).",
        },
        CoinsPackageQuoteRequest: {
          type: "object",
          required: ["package_total", "breakdown"],
          properties: {
            package_total: { $ref: "#/components/schemas/CoinsPackageTotal" },
            breakdown: { $ref: "#/components/schemas/CoinsPackageBreakdown" },
          },
        },
        CoinsPackageCheckoutCreateRequest: {
          type: "object",
          properties: {
            quote_id: { type: "string", minLength: 8 },
            package_total: { $ref: "#/components/schemas/CoinsPackageTotal" },
            breakdown: { $ref: "#/components/schemas/CoinsPackageBreakdown" },
            success_url: { type: "string", format: "uri" },
            cancel_url: { type: "string", format: "uri" },
            metadata: { type: "object" },
          },
          anyOf: [{ required: ["quote_id"] }, { required: ["package_total", "breakdown"] }],
        },
        CoinsPackageLineItemPreview: {
          type: "object",
          required: ["coin_type", "quantity", "unit_amount", "amount"],
          properties: {
            coin_type: { type: "string", enum: ["common", "pro", "ultra"] },
            quantity: { type: "integer", minimum: 1 },
            unit_amount: { type: "integer", minimum: 0, description: "Amount in cents per credit unit." },
            amount: { type: "integer", minimum: 0, description: "Line subtotal in cents." },
          },
        },
        CoinsPackagePricing: {
          type: "object",
          required: ["unit_amounts", "subtotal_base", "fees_total", "total_amount", "currency", "pricing_version"],
          properties: {
            unit_amounts: {
              type: "object",
              required: ["common", "pro", "ultra"],
              properties: {
                common: { type: "integer", minimum: 0 },
                pro: { type: "integer", minimum: 0 },
                ultra: { type: "integer", minimum: 0 },
              },
            },
            subtotal_base: { type: "integer", minimum: 0, description: "Base subtotal in cents." },
            purchase_fee_percent: { type: "number", minimum: 0 },
            purchase_fee_amount: { type: "integer", minimum: 0, description: "Purchase fee amount in cents." },
            conversion_fee_percent: { type: "number", minimum: 0, nullable: true },
            conversion_fee_amount: { type: "integer", minimum: 0, description: "Conversion fee amount in cents (0 for package purchase)." },
            fees_total: { type: "integer", minimum: 0, description: "Total fee amount in cents." },
            total_amount: { type: "integer", minimum: 0, description: "Total amount in cents." },
            currency: { type: "string", example: "BRL" },
            pricing_version: { type: "string", example: "sale_price_cents_v1" },
          },
        },
        CoinsPackageQuote: {
          type: "object",
          required: ["quote_id", "package_total", "breakdown", "pricing", "line_items_preview", "currency", "expires_at"],
          properties: {
            quote_id: { type: "string", format: "uuid" },
            plan_code: { type: "string" },
            normalized_plan: { type: "string" },
            package_total: { $ref: "#/components/schemas/CoinsPackageTotal" },
            breakdown: { $ref: "#/components/schemas/CoinsPackageBreakdown" },
            line_items_preview: {
              type: "array",
              items: { $ref: "#/components/schemas/CoinsPackageLineItemPreview" },
            },
            pricing: { $ref: "#/components/schemas/CoinsPackagePricing" },
            pricing_version: { type: "string" },
            subtotal_cents: { type: "integer", minimum: 0 },
            fee_percent: { type: "number", minimum: 0 },
            fee_cents: { type: "integer", minimum: 0 },
            total_cents: { type: "integer", minimum: 0 },
            currency: { type: "string", example: "BRL" },
            expires_at: { type: "string", format: "date-time" },
          },
        },
        CoinsPackageQuoteResponse: {
          type: "object",
          required: ["ok", "quote", "rules"],
          properties: {
            ok: { type: "boolean", example: true },
            quote: { $ref: "#/components/schemas/CoinsPackageQuote" },
            rules: {
              type: "object",
              properties: {
                package_totals: { type: "array", items: { type: "integer", enum: [300, 1200, 3000] } },
                qty_step: { type: "integer", example: 10 },
                custom_enabled: { type: "boolean", example: true },
                min_total: { type: "integer", example: 100 },
                max_total: { type: "integer", example: 2147483640 },
                step: { type: "integer", example: 10 },
              },
            },
          },
        },
        CoinsPackageCheckoutCreateResponse: {
          type: "object",
          required: ["ok", "message", "quote", "checkout"],
          properties: {
            ok: { type: "boolean", example: true },
            replay: { type: "boolean", nullable: true },
            message: { type: "string" },
            quote: { $ref: "#/components/schemas/CoinsPackageQuote" },
            checkout: {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string", nullable: true },
                url: { type: "string", nullable: true },
              },
            },
          },
        },
        EnterpriseQuoteRequest: {
          type: "object",
          properties: {
            common_qty: { type: "integer", minimum: 0, default: 0 },
            pro_qty: { type: "integer", minimum: 0, default: 0 },
            ultra_qty: { type: "integer", minimum: 0, default: 0 },
          },
          additionalProperties: false,
        },
        EnterpriseCheckoutCreateRequest: {
          allOf: [
            { $ref: "#/components/schemas/EnterpriseQuoteRequest" },
            {
              type: "object",
              properties: {
                success_url: { type: "string", format: "uri" },
                cancel_url: { type: "string", format: "uri" },
              },
            },
          ],
        },
      },
    },
  };
}

export function buildOpenApiSpec({ serverUrl = "/api" } = {}) {
  return getOpenApiSpec("pt-BR", { serverUrl });
}
