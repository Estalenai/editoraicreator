const PLAN_ORDER = ["FREE", "EDITOR_FREE", "EDITOR_PRO", "EDITOR_ULTRA", "EMPRESARIAL", "ENTERPRISE"];

const PUBLIC_PLAN_ALIASES = new Map([
  ["FREE", "FREE"],
  ["EDITOR_FREE", "EDITOR_FREE"],
  ["INICIANTE", "EDITOR_FREE"],
  ["STARTER", "EDITOR_FREE"],
  ["EDITOR_STARTER", "EDITOR_FREE"],
  ["EDITOR_PRO", "EDITOR_PRO"],
  ["PRO", "EDITOR_PRO"],
  ["EDITOR_ULTRA", "EDITOR_ULTRA"],
  ["CREATOR_PRO", "EDITOR_ULTRA"],
  ["CRIADOR_PRO", "EDITOR_ULTRA"],
  ["ULTRA", "EDITOR_ULTRA"],
  ["EMPRESARIAL", "EMPRESARIAL"],
  ["BUSINESS", "EMPRESARIAL"],
  ["ENTERPRISE", "ENTERPRISE"],
  ["ENTERPRISE_ULTRA", "ENTERPRISE"],
]);

const DOMAIN_ALIASES = {
  public: PUBLIC_PLAN_ALIASES,
  usage: new Map([...PUBLIC_PLAN_ALIASES, ["EMPRESARIAL", "ENTERPRISE"], ["BUSINESS", "ENTERPRISE"]]),
  commerce: new Map([...PUBLIC_PLAN_ALIASES, ["EMPRESARIAL", "ENTERPRISE"], ["BUSINESS", "ENTERPRISE"]]),
  stripe: new Map([...PUBLIC_PLAN_ALIASES, ["EMPRESARIAL", "EMPRESARIAL"], ["BUSINESS", "EMPRESARIAL"]]),
};

const PUBLIC_READINESS_STATUS = {
  PUBLISH_NOW: "publish_now",
  PUBLISH_WITH_NOTE: "publish_with_note",
  INTERNAL_ONLY: "internal_only",
  FUTURE_ONLY: "future_only",
  DO_NOT_PROMISE: "do_not_promise",
};

const COMMERCIAL_READINESS_STATUS = {
  SELF_SERVE_READY: "self_serve_ready",
  ASSISTED_ONLY: "assisted_only",
  CONTRACT_ONLY: "contract_only",
  INTERNAL_ONLY: "internal_only",
  FUTURE_ONLY: "future_only",
};

const RUNTIME_DELIVERY_STATUS = {
  REAL: "real",
  LIMITED: "limited",
  PREPARED: "prepared",
  MOCK_ONLY: "mock_only",
  UNAVAILABLE: "unavailable",
  HIDDEN_BETA: "hidden_beta",
  ASSISTED: "assisted",
  CONTRACT: "contract",
  NOT_IMPLEMENTED: "not_implemented",
};

function normalizeRawCode(planCode) {
  return String(planCode || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function cloneValue(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function featureRule({
  availability = "unavailable",
  providers = [],
  preparedProviders = [],
  modelTierMax = null,
  mockOnly = false,
  enabled,
} = {}) {
  return {
    enabled: enabled ?? (availability !== "unavailable" && mockOnly !== true),
    availability,
    providers,
    prepared_providers: preparedProviders,
    model_tier_max: modelTierMax,
    mock_only: mockOnly === true,
  };
}

function monthlyLimit(monthly = null) {
  return { monthly: Number.isFinite(monthly) ? Number(monthly) : null };
}

function statusEntry({
  runtimeDeliveryStatus,
  publicReadiness,
  commercialReadiness,
  inheritsFrom = [],
  publicNotes = [],
} = {}) {
  return {
    runtime_delivery_status: runtimeDeliveryStatus || RUNTIME_DELIVERY_STATUS.UNAVAILABLE,
    public_readiness: publicReadiness || PUBLIC_READINESS_STATUS.INTERNAL_ONLY,
    commercial_readiness: commercialReadiness || COMMERCIAL_READINESS_STATUS.INTERNAL_ONLY,
    inherits_from: Array.isArray(inheritsFrom) ? [...inheritsFrom] : [],
    public_notes: Array.isArray(publicNotes) ? [...publicNotes] : [],
  };
}

function getPlanPublicReadiness(plan) {
  const availability = String(plan?.availability || "hidden_beta");
  if (availability === "self_serve") return PUBLIC_READINESS_STATUS.PUBLISH_NOW;
  if (availability === "assisted") return PUBLIC_READINESS_STATUS.PUBLISH_WITH_NOTE;
  if (availability === "contract") return PUBLIC_READINESS_STATUS.INTERNAL_ONLY;
  return PUBLIC_READINESS_STATUS.INTERNAL_ONLY;
}

function getPlanCommercialReadiness(plan) {
  const availability = String(plan?.availability || "hidden_beta");
  if (availability === "self_serve") return COMMERCIAL_READINESS_STATUS.SELF_SERVE_READY;
  if (availability === "assisted") return COMMERCIAL_READINESS_STATUS.ASSISTED_ONLY;
  if (availability === "contract") return COMMERCIAL_READINESS_STATUS.CONTRACT_ONLY;
  return COMMERCIAL_READINESS_STATUS.INTERNAL_ONLY;
}

function buildProviderStatusMap(rule = {}) {
  const providerStatus = {};
  const runtimeStatus =
    rule?.mock_only === true || rule?.availability === "mock_only"
      ? RUNTIME_DELIVERY_STATUS.MOCK_ONLY
      : rule?.availability === "limited"
        ? RUNTIME_DELIVERY_STATUS.LIMITED
        : rule?.availability === "real"
          ? RUNTIME_DELIVERY_STATUS.REAL
          : RUNTIME_DELIVERY_STATUS.UNAVAILABLE;

  for (const provider of Array.isArray(rule?.providers) ? rule.providers : []) {
    providerStatus[String(provider)] = runtimeStatus;
  }
  for (const provider of Array.isArray(rule?.prepared_providers) ? rule.prepared_providers : []) {
    providerStatus[String(provider)] = RUNTIME_DELIVERY_STATUS.PREPARED;
  }
  return providerStatus;
}

function buildFeatureInternalStatus(rule = {}, plan = {}) {
  const providerStatus = buildProviderStatusMap(rule);
  const hasPreparedProviders = Object.values(providerStatus).includes(RUNTIME_DELIVERY_STATUS.PREPARED);
  const inheritsFrom = Array.isArray(plan?.runtime_rules?.inherits_from) ? plan.runtime_rules.inherits_from : [];

  let runtimeDeliveryStatus = RUNTIME_DELIVERY_STATUS.UNAVAILABLE;
  if (rule?.mock_only === true || rule?.availability === "mock_only") {
    runtimeDeliveryStatus = RUNTIME_DELIVERY_STATUS.MOCK_ONLY;
  } else if (rule?.availability === "limited") {
    runtimeDeliveryStatus = RUNTIME_DELIVERY_STATUS.LIMITED;
  } else if (rule?.availability === "real") {
    runtimeDeliveryStatus = RUNTIME_DELIVERY_STATUS.REAL;
  } else if (hasPreparedProviders) {
    runtimeDeliveryStatus = RUNTIME_DELIVERY_STATUS.PREPARED;
  }

  let publicReadiness = getPlanPublicReadiness(plan);
  if (runtimeDeliveryStatus === RUNTIME_DELIVERY_STATUS.MOCK_ONLY) {
    publicReadiness = PUBLIC_READINESS_STATUS.DO_NOT_PROMISE;
  } else if (runtimeDeliveryStatus === RUNTIME_DELIVERY_STATUS.PREPARED) {
    publicReadiness = PUBLIC_READINESS_STATUS.FUTURE_ONLY;
  } else if (runtimeDeliveryStatus === RUNTIME_DELIVERY_STATUS.LIMITED) {
    publicReadiness =
      plan?.availability === "self_serve"
        ? PUBLIC_READINESS_STATUS.PUBLISH_WITH_NOTE
        : PUBLIC_READINESS_STATUS.INTERNAL_ONLY;
  }

  let commercialReadiness = getPlanCommercialReadiness(plan);
  if (runtimeDeliveryStatus === RUNTIME_DELIVERY_STATUS.MOCK_ONLY) {
    commercialReadiness = COMMERCIAL_READINESS_STATUS.INTERNAL_ONLY;
  } else if (runtimeDeliveryStatus === RUNTIME_DELIVERY_STATUS.PREPARED) {
    commercialReadiness = COMMERCIAL_READINESS_STATUS.FUTURE_ONLY;
  }

  const publicNotes = [];
  if (runtimeDeliveryStatus === RUNTIME_DELIVERY_STATUS.MOCK_ONLY) {
    publicNotes.push("Nao tratar como capacidade publica real enquanto o runtime continuar em mock_only.");
  }
  if (hasPreparedProviders) {
    publicNotes.push("Providers preparados por flag nao devem ser tratados como runtime real.");
  }
  if (plan?.availability === "assisted" && inheritsFrom.length > 0) {
    publicNotes.push("Plano assistido ainda herda parte da camada tecnica de outra runtime layer.");
  }

  return {
    ...statusEntry({
      runtimeDeliveryStatus,
      publicReadiness,
      commercialReadiness,
      inheritsFrom,
      publicNotes,
    }),
    provider_status: providerStatus,
    feature_status: runtimeDeliveryStatus,
  };
}

function buildCapabilityStatus({
  runtimeDeliveryStatus,
  publicReadiness,
  commercialReadiness,
  publicNotes = [],
  inheritsFrom = [],
} = {}) {
  return statusEntry({
    runtimeDeliveryStatus,
    publicReadiness,
    commercialReadiness,
    publicNotes,
    inheritsFrom,
  });
}

function buildSensitiveCapabilityStatuses(plan = {}) {
  const availability = String(plan?.availability || "hidden_beta");
  const planCommercialReadiness = getPlanCommercialReadiness(plan);
  const highestQualityOutput = Array.isArray(plan?.quality_outputs)
    ? plan.quality_outputs[plan.quality_outputs.length - 1] || null
    : null;
  const directUploadConfigured =
    Number(plan?.upload_limits?.direct_upload_max_file_size_mb || 0) >
    Number(plan?.upload_limits?.max_file_size_mb || 0);
  const connectedStorageRecommended =
    String(plan?.storage_policy?.recommended_storage_mode || "") === "connected_or_dedicated" ||
    plan?.storage_policy?.connected_storage_required_when_heavy === true;
  const inheritsFrom = Array.isArray(plan?.runtime_rules?.inherits_from) ? plan.runtime_rules.inherits_from : [];

  return {
    commercial_use: buildCapabilityStatus({
      runtimeDeliveryStatus: RUNTIME_DELIVERY_STATUS.NOT_IMPLEMENTED,
      publicReadiness: PUBLIC_READINESS_STATUS.DO_NOT_PROMISE,
      commercialReadiness: COMMERCIAL_READINESS_STATUS.FUTURE_ONLY,
      publicNotes: ["Nao existe entitlement tecnico de uso comercial implementado no produto."],
    }),
    multi_user: buildCapabilityStatus({
      runtimeDeliveryStatus: RUNTIME_DELIVERY_STATUS.NOT_IMPLEMENTED,
      publicReadiness: PUBLIC_READINESS_STATUS.DO_NOT_PROMISE,
      commercialReadiness: COMMERCIAL_READINESS_STATUS.FUTURE_ONLY,
      publicNotes: ["Nao existe camada real de seats, multiplos usuarios ou permissoes por plano."],
    }),
    governance: buildCapabilityStatus({
      runtimeDeliveryStatus: RUNTIME_DELIVERY_STATUS.NOT_IMPLEMENTED,
      publicReadiness: PUBLIC_READINESS_STATUS.DO_NOT_PROMISE,
      commercialReadiness: COMMERCIAL_READINESS_STATUS.FUTURE_ONLY,
      publicNotes: ["Governanca ainda nao existe como regra fechada do produto."],
    }),
    team_coordination: buildCapabilityStatus({
      runtimeDeliveryStatus: RUNTIME_DELIVERY_STATUS.NOT_IMPLEMENTED,
      publicReadiness: PUBLIC_READINESS_STATUS.DO_NOT_PROMISE,
      commercialReadiness: COMMERCIAL_READINESS_STATUS.FUTURE_ONLY,
      publicNotes: ["Coordenacao de equipe ainda nao existe como capacidade implementada por plano."],
    }),
    enterprise_overrides:
      plan?.contract_policy?.overrides_allowed === true
        ? buildCapabilityStatus({
            runtimeDeliveryStatus: RUNTIME_DELIVERY_STATUS.CONTRACT,
            publicReadiness: PUBLIC_READINESS_STATUS.INTERNAL_ONLY,
            commercialReadiness:
              availability === "assisted"
                ? COMMERCIAL_READINESS_STATUS.ASSISTED_ONLY
                : availability === "contract"
                  ? COMMERCIAL_READINESS_STATUS.CONTRACT_ONLY
                  : COMMERCIAL_READINESS_STATUS.INTERNAL_ONLY,
            publicNotes: ["Overrides contratuais existem como capacidade interna e nao devem virar promessa publica."],
            inheritsFrom,
          })
        : buildCapabilityStatus({
            runtimeDeliveryStatus: RUNTIME_DELIVERY_STATUS.UNAVAILABLE,
            publicReadiness: PUBLIC_READINESS_STATUS.INTERNAL_ONLY,
            commercialReadiness: COMMERCIAL_READINESS_STATUS.INTERNAL_ONLY,
          }),
    storage_connected: buildCapabilityStatus({
      runtimeDeliveryStatus: connectedStorageRecommended ? RUNTIME_DELIVERY_STATUS.PREPARED : RUNTIME_DELIVERY_STATUS.UNAVAILABLE,
      publicReadiness: connectedStorageRecommended
        ? PUBLIC_READINESS_STATUS.DO_NOT_PROMISE
        : PUBLIC_READINESS_STATUS.INTERNAL_ONLY,
      commercialReadiness: connectedStorageRecommended
        ? COMMERCIAL_READINESS_STATUS.FUTURE_ONLY
        : COMMERCIAL_READINESS_STATUS.INTERNAL_ONLY,
      publicNotes: connectedStorageRecommended
        ? ["A politica exige ou recomenda storage conectado em fluxos pesados, mas a infraestrutura ainda nao existe ponta a ponta no repo."]
        : ["Storage conectado nao entra como capacidade deste plano hoje."],
    }),
    direct_upload: buildCapabilityStatus({
      runtimeDeliveryStatus: directUploadConfigured ? RUNTIME_DELIVERY_STATUS.PREPARED : RUNTIME_DELIVERY_STATUS.UNAVAILABLE,
      publicReadiness: directUploadConfigured
        ? PUBLIC_READINESS_STATUS.DO_NOT_PROMISE
        : PUBLIC_READINESS_STATUS.INTERNAL_ONLY,
      commercialReadiness: directUploadConfigured
        ? COMMERCIAL_READINESS_STATUS.FUTURE_ONLY
        : COMMERCIAL_READINESS_STATUS.INTERNAL_ONLY,
      publicNotes: directUploadConfigured
        ? ["A politica de upload maior ja existe, mas o fluxo de direct upload ainda nao esta implementado ponta a ponta."]
        : ["Direct upload nao entra como capacidade deste plano hoje."],
    }),
    high_resolution_outputs: buildCapabilityStatus({
      runtimeDeliveryStatus: Array.isArray(plan?.quality_outputs) && plan.quality_outputs.length > 0
        ? RUNTIME_DELIVERY_STATUS.LIMITED
        : RUNTIME_DELIVERY_STATUS.UNAVAILABLE,
      publicReadiness:
        availability === "self_serve"
          ? PUBLIC_READINESS_STATUS.PUBLISH_WITH_NOTE
          : availability === "assisted"
            ? PUBLIC_READINESS_STATUS.INTERNAL_ONLY
            : PUBLIC_READINESS_STATUS.INTERNAL_ONLY,
      commercialReadiness:
        availability === "self_serve"
          ? COMMERCIAL_READINESS_STATUS.SELF_SERVE_READY
          : planCommercialReadiness,
      publicNotes: highestQualityOutput
        ? [
            `O teto tecnico atual deste plano vai ate ${highestQualityOutput}, mas a entrega depende da rota/provider visual usada.`,
          ]
        : ["Este plano nao formaliza saidas de alta resolucao."],
    }),
  };
}

function buildPlanInternalStatus(plan = {}) {
  const availability = String(plan?.availability || "hidden_beta");
  const inheritsFrom = Array.isArray(plan?.runtime_rules?.inherits_from) ? plan.runtime_rules.inherits_from : [];
  const runtimeDeliveryStatus =
    availability === "self_serve"
      ? RUNTIME_DELIVERY_STATUS.REAL
      : availability === "assisted"
        ? RUNTIME_DELIVERY_STATUS.ASSISTED
        : availability === "contract"
          ? RUNTIME_DELIVERY_STATUS.CONTRACT
          : RUNTIME_DELIVERY_STATUS.HIDDEN_BETA;
  const publicNotes = [];
  if (availability === "assisted") {
    publicNotes.push("Plano assistido: nao tratar como self-serve.");
  }
  if (availability === "contract") {
    publicNotes.push("Plano contratual: nao tratar como oferta aberta de storefront.");
  }
  if (availability === "hidden_beta") {
    publicNotes.push("Plano oculto: nao entra na camada publica do beta.");
  }
  if (inheritsFrom.length > 0) {
    publicNotes.push("Este plano ainda herda runtime layer tecnica de outro plano.");
  }
  if (plan?.coming_soon === true) {
    publicNotes.push("O plano nao deve ser tratado como checkout aberto nesta etapa.");
  }

  return {
    availability_status: availability,
    inherits_from_other_runtime_layer: inheritsFrom.length > 0,
    ...statusEntry({
      runtimeDeliveryStatus,
      publicReadiness: getPlanPublicReadiness(plan),
      commercialReadiness: getPlanCommercialReadiness(plan),
      inheritsFrom,
      publicNotes,
    }),
  };
}

function enrichPlanMatrixWithInternalStatus(matrix) {
  return Object.fromEntries(
    Object.entries(matrix).map(([planCode, plan]) => {
      const providers = Object.fromEntries(
        Object.entries(plan?.providers || {}).map(([featureKey, rule]) => [
          featureKey,
          {
            ...rule,
            ...buildFeatureInternalStatus(rule, plan),
          },
        ])
      );

      return [
        planCode,
        {
          ...plan,
          providers,
          internal_status: buildPlanInternalStatus(plan),
          capability_statuses: buildSensitiveCapabilityStatuses(plan),
        },
      ];
    })
  );
}

const BASE_STORAGE_POLICY = {
  onboarding_required: false,
  platform_temporary_storage_allowed: true,
  direct_upload_required_when_large: true,
  connected_storage_required_when_heavy: true,
  connected_storage_required_for_long_retention: true,
  recommended_storage_mode: "platform_temporary",
};

const PLAN_LIMITS_MATRIX = {
  FREE: {
    code: "FREE",
    name_key: "plans.name.free",
    price_amount_brl: 0,
    availability: "hidden_beta",
    storefront_visibility: false,
    purchasable: false,
    coming_soon: false,
    quality_tier: "basic",
    quality_outputs: ["720p", "1080p"],
    model_tier_max: "basic",
    providers: {
      text: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        preparedProviders: ["claude"],
        modelTierMax: "basic",
      }),
      image: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        modelTierMax: "basic",
      }),
      video: featureRule({ availability: "mock_only", mockOnly: true }),
      voice: featureRule({ availability: "mock_only", mockOnly: true }),
      music: featureRule({ availability: "mock_only", mockOnly: true }),
      slides: featureRule({ availability: "mock_only", mockOnly: true }),
      avatar_preview: featureRule({ availability: "unavailable", enabled: false }),
    },
    credits_included: { common: 30, pro: 0, ultra: 0 },
    commerce: {
      allowed_coin_types: ["common"],
      conversion_fee_percent: null,
      purchase_fee_percent: 3,
      price_visibility: false,
      storefront_visibility: false,
      minimum_purchase_credits_per_type: null,
    },
    upload_limits: {
      max_file_size_mb: 50,
      direct_upload_max_file_size_mb: 50,
      files_per_job: 1,
      files_per_day: 3,
    },
    generation_limits: {
      max_generated_video_seconds: 10,
      max_generated_audio_seconds: 30,
    },
    input_media_limits: {
      max_input_video_minutes: null,
      max_input_audio_minutes: null,
    },
    usage_limits: {
      jobs_per_day: 3,
      avatar_preview_sessions_per_day: 0,
      avatar_preview_seconds_per_session: 0,
      monthly_by_feature: {
        creator_post_generate: monthlyLimit(30),
        creator_music_generate: monthlyLimit(10),
        text_generate: monthlyLimit(null),
        image_generate: monthlyLimit(null),
        video_generate: monthlyLimit(null),
        voice_generate: monthlyLimit(null),
        music_generate: monthlyLimit(null),
        slides_generate: monthlyLimit(null),
      },
    },
    workflow_limits: {
      max_functions_per_job: 1,
      can_combine_functions: false,
      pipeline_level: "none",
      automation_level: "none",
      presets_level: "basic_or_none",
    },
    context_limits: {
      context_depth: "short",
      project_memory_level: "minimal",
    },
    storage_policy: {
      ...BASE_STORAGE_POLICY,
      direct_upload_required_when_large: true,
      connected_storage_required_when_heavy: true,
      recommended_storage_mode: "platform_temporary",
    },
    runtime_rules: {
      mock_only_features: ["video", "voice", "music", "slides"],
      inherits_from: [],
      manual_mode_allowed: false,
      manual_mode_level: "none",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["claude"],
    },
    honesty_notes: [
      "Plano oculto no beta e fora do storefront aberto.",
      "Video, voz, musica e slides ficam em camada exploratoria e nao devem ser tratados como pipeline pesado real.",
      "Os campos desta matriz formalizam o limite alvo; enforcement detalhado ainda depende das camadas de runtime consumirem esta fonte.",
    ],
    stripe_env_keys: [],
  },
  EDITOR_FREE: {
    code: "EDITOR_FREE",
    name_key: "plans.name.editor_free",
    price_amount_brl: 19.9,
    availability: "self_serve",
    storefront_visibility: true,
    purchasable: true,
    coming_soon: false,
    quality_tier: "standard",
    quality_outputs: ["720p", "1080p", "1440p"],
    model_tier_max: "standard",
    providers: {
      text: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        preparedProviders: ["deepseek", "claude"],
        modelTierMax: "standard",
      }),
      image: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        modelTierMax: "standard",
      }),
      video: featureRule({
        availability: "limited",
        providers: ["runway"],
        modelTierMax: "standard",
      }),
      voice: featureRule({
        availability: "real",
        providers: ["elevenlabs"],
        modelTierMax: "standard",
      }),
      music: featureRule({
        availability: "limited",
        providers: ["suno"],
        modelTierMax: "standard",
      }),
      slides: featureRule({
        availability: "mock_only",
        preparedProviders: ["openai", "gemini"],
        modelTierMax: "standard",
        mockOnly: true,
      }),
      avatar_preview: featureRule({ availability: "unavailable", enabled: false }),
    },
    credits_included: { common: 300, pro: 120, ultra: 0 },
    commerce: {
      allowed_coin_types: ["common", "pro"],
      conversion_fee_percent: 8,
      purchase_fee_percent: 0,
      price_visibility: true,
      storefront_visibility: true,
      minimum_purchase_credits_per_type: null,
    },
    upload_limits: {
      max_file_size_mb: 1024,
      direct_upload_max_file_size_mb: 2048,
      files_per_job: 3,
      files_per_day: 10,
    },
    generation_limits: {
      max_generated_video_seconds: 120,
      max_generated_audio_seconds: 180,
    },
    input_media_limits: {
      max_input_video_minutes: null,
      max_input_audio_minutes: null,
    },
    usage_limits: {
      jobs_per_day: null,
      avatar_preview_sessions_per_day: 0,
      avatar_preview_seconds_per_session: 0,
      monthly_by_feature: {
        creator_post_generate: monthlyLimit(30),
        creator_music_generate: monthlyLimit(10),
        text_generate: monthlyLimit(null),
        image_generate: monthlyLimit(null),
        video_generate: monthlyLimit(null),
        voice_generate: monthlyLimit(null),
        music_generate: monthlyLimit(null),
        slides_generate: monthlyLimit(null),
      },
    },
    workflow_limits: {
      max_functions_per_job: 2,
      can_combine_functions: true,
      pipeline_level: "simple",
      automation_level: "limited",
      presets_level: "intermediate",
    },
    context_limits: {
      context_depth: "medium",
      project_memory_level: "standard",
    },
    storage_policy: {
      ...BASE_STORAGE_POLICY,
      direct_upload_required_when_large: true,
      connected_storage_required_when_heavy: true,
      recommended_storage_mode: "platform_temporary",
    },
    runtime_rules: {
      mock_only_features: ["slides"],
      inherits_from: [],
      manual_mode_allowed: true,
      manual_mode_level: "limited",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["deepseek", "claude"],
    },
    honesty_notes: [
      "Upload padrao por trabalho fica em 1 GB; ate 2 GB depende de direct upload para storage.",
      "DeepSeek e Claude continuam apenas preparados por feature flag nesta etapa; OpenAI, Gemini e ElevenLabs seguem como providers reais do plano.",
      "Slides continuam em camada exploratoria/mock ate existir um provedor real conectado ao runtime.",
      "Os limites de combinacao simples, upload e quality outputs estao formalizados aqui, mas outras camadas ainda precisam consumir esta matriz para enforcement completo.",
    ],
    stripe_env_keys: [
      "STRIPE_PRICE_EDITOR_FREE",
      "STRIPE_PRICE_INICIANTE",
      "STRIPE_PRICE_EDITOR_STARTER",
      "STRIPE_PRICE_STARTER",
      "STRIPE_PRICE_FREE",
    ],
  },
  EDITOR_PRO: {
    code: "EDITOR_PRO",
    name_key: "plans.name.editor_pro",
    price_amount_brl: 59.9,
    availability: "self_serve",
    storefront_visibility: true,
    purchasable: true,
    coming_soon: false,
    quality_tier: "intermediate",
    quality_outputs: ["720p", "1080p", "1440p", "2160p"],
    model_tier_max: "intermediate",
    providers: {
      text: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        preparedProviders: ["deepseek", "claude"],
        modelTierMax: "intermediate",
      }),
      image: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        modelTierMax: "intermediate",
      }),
      video: featureRule({
        availability: "real",
        providers: ["runway"],
        modelTierMax: "intermediate",
      }),
      voice: featureRule({
        availability: "real",
        providers: ["elevenlabs"],
        modelTierMax: "intermediate",
      }),
      music: featureRule({
        availability: "real",
        providers: ["suno"],
        modelTierMax: "intermediate",
      }),
      slides: featureRule({
        availability: "mock_only",
        preparedProviders: ["openai", "gemini"],
        modelTierMax: "intermediate",
        mockOnly: true,
      }),
      avatar_preview: featureRule({ availability: "unavailable", enabled: false }),
    },
    credits_included: { common: 500, pro: 250, ultra: 100 },
    commerce: {
      allowed_coin_types: ["common", "pro", "ultra"],
      conversion_fee_percent: 4,
      purchase_fee_percent: 0,
      price_visibility: true,
      storefront_visibility: true,
      minimum_purchase_credits_per_type: null,
    },
    upload_limits: {
      max_file_size_mb: 10240,
      direct_upload_max_file_size_mb: 51200,
      files_per_job: 50,
      files_per_day: null,
    },
    generation_limits: {
      max_generated_video_seconds: null,
      max_generated_audio_seconds: null,
    },
    input_media_limits: {
      max_input_video_minutes: 90,
      max_input_audio_minutes: 90,
    },
    usage_limits: {
      jobs_per_day: null,
      avatar_preview_sessions_per_day: 0,
      avatar_preview_seconds_per_session: 0,
      monthly_by_feature: {
        creator_post_generate: monthlyLimit(300),
        creator_music_generate: monthlyLimit(100),
        text_generate: monthlyLimit(null),
        image_generate: monthlyLimit(null),
        video_generate: monthlyLimit(null),
        voice_generate: monthlyLimit(null),
        music_generate: monthlyLimit(null),
        slides_generate: monthlyLimit(null),
      },
    },
    workflow_limits: {
      max_functions_per_job: null,
      can_combine_functions: true,
      pipeline_level: "moderate",
      automation_level: "intermediate",
      presets_level: "advanced",
    },
    context_limits: {
      context_depth: "deep",
      project_memory_level: "strong",
    },
    storage_policy: {
      ...BASE_STORAGE_POLICY,
      direct_upload_required_when_large: true,
      connected_storage_required_when_heavy: true,
      recommended_storage_mode: "hybrid",
    },
    runtime_rules: {
      mock_only_features: ["slides"],
      inherits_from: [],
      manual_mode_allowed: true,
      manual_mode_level: "full",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["deepseek", "claude"],
    },
    honesty_notes: [
      "Neste tier o credito passa a ser o limitador principal, mas hard caps tecnicos e anti-abuso continuam ativos em paralelo.",
      "Editor Pro fica com baseline profissional de ate 50 GB por trabalho via direct/connected flow, 90 minutos de entrada e 50 arquivos por job.",
      "O degrau de modelos fica abaixo de Creator Pro; DeepSeek e Claude permanecem preparados, nao liberados como rota real nesta etapa.",
      "Slides continuam em camada exploratoria/mock ate existir um provedor real conectado ao runtime.",
      "Quality outputs em 2160p ja estao formalizados aqui como limite de plano, nao como promessa comercial isolada.",
    ],
    stripe_env_keys: [
      "STRIPE_PRICE_EDITOR_PRO",
      "STRIPE_PRICE_PRO",
      "STRIPE_PRICE_EDITORPRO",
    ],
  },
  EDITOR_ULTRA: {
    code: "EDITOR_ULTRA",
    name_key: "plans.name.editor_ultra",
    price_amount_brl: 149.9,
    availability: "self_serve",
    storefront_visibility: true,
    purchasable: true,
    coming_soon: false,
    quality_tier: "pro",
    quality_outputs: ["720p", "1080p", "1440p", "2160p"],
    model_tier_max: "pro",
    providers: {
      text: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        preparedProviders: ["deepseek", "claude"],
        modelTierMax: "pro",
      }),
      image: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        modelTierMax: "pro",
      }),
      video: featureRule({
        availability: "real",
        providers: ["runway"],
        modelTierMax: "pro",
      }),
      voice: featureRule({
        availability: "real",
        providers: ["elevenlabs"],
        modelTierMax: "pro",
      }),
      music: featureRule({
        availability: "real",
        providers: ["suno"],
        modelTierMax: "pro",
      }),
      slides: featureRule({
        availability: "mock_only",
        preparedProviders: ["openai", "gemini"],
        modelTierMax: "pro",
        mockOnly: true,
      }),
      avatar_preview: featureRule({
        availability: "real",
        enabled: true,
      }),
    },
    credits_included: { common: 1000, pro: 600, ultra: 300 },
    commerce: {
      allowed_coin_types: ["common", "pro", "ultra"],
      conversion_fee_percent: 2,
      purchase_fee_percent: 0,
      price_visibility: true,
      storefront_visibility: true,
      minimum_purchase_credits_per_type: null,
    },
    upload_limits: {
      max_file_size_mb: 20480,
      direct_upload_max_file_size_mb: 102400,
      files_per_job: 100,
      files_per_day: null,
    },
    generation_limits: {
      max_generated_video_seconds: null,
      max_generated_audio_seconds: null,
    },
    input_media_limits: {
      max_input_video_minutes: 180,
      max_input_audio_minutes: 180,
    },
    usage_limits: {
      jobs_per_day: null,
      avatar_preview_sessions_per_day: 1,
      avatar_preview_seconds_per_session: 120,
      monthly_by_feature: {
        creator_post_generate: monthlyLimit(2000),
        creator_music_generate: monthlyLimit(500),
        text_generate: monthlyLimit(null),
        image_generate: monthlyLimit(null),
        video_generate: monthlyLimit(null),
        voice_generate: monthlyLimit(null),
        music_generate: monthlyLimit(null),
        slides_generate: monthlyLimit(null),
      },
    },
    workflow_limits: {
      max_functions_per_job: null,
      can_combine_functions: true,
      pipeline_level: "complex",
      automation_level: "advanced",
      presets_level: "advanced",
    },
    context_limits: {
      context_depth: "deep_plus",
      project_memory_level: "strong_plus",
    },
    storage_policy: {
      ...BASE_STORAGE_POLICY,
      direct_upload_required_when_large: true,
      connected_storage_required_when_heavy: true,
      recommended_storage_mode: "hybrid",
    },
    runtime_rules: {
      mock_only_features: ["slides"],
      inherits_from: [],
      manual_mode_allowed: true,
      manual_mode_level: "full",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["deepseek", "claude"],
    },
    honesty_notes: [
      "Creator Pro em diante libera a camada Pro de modelos na fonte de verdade do produto.",
      "Creator Pro continua premium, mas nao ilimitado: o baseline tecnico sobe para 100 GB por trabalho, 180 minutos de entrada e 100 arquivos por job.",
      "Avatar Preview fica explicitamente liberado aqui, mas enforcement fino ainda depende das rotas de runtime continuarem consumindo estas regras.",
      "DeepSeek e Claude permanecem preparados, nao liberados como rota real nesta etapa. Slides continuam em camada exploratoria/mock ate existir um provedor real conectado ao runtime.",
      "Hard caps tecnicos altos para Pro+ continuam formais nesta matriz e nao devem ser removidos por copy ou UX.",
    ],
    stripe_env_keys: [
      "STRIPE_PRICE_EDITOR_ULTRA",
      "STRIPE_PRICE_ULTRA",
      "STRIPE_PRICE_CREATOR_PRO",
    ],
  },
  EMPRESARIAL: {
    code: "EMPRESARIAL",
    name_key: "plans.name.empresarial",
    price_amount_brl: 499.9,
    availability: "assisted",
    storefront_visibility: true,
    purchasable: false,
    coming_soon: true,
    quality_tier: "pro",
    quality_outputs: ["720p", "1080p", "1440p", "2160p"],
    model_tier_max: "pro",
    providers: {
      text: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        preparedProviders: ["deepseek", "claude"],
        modelTierMax: "pro",
      }),
      image: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        modelTierMax: "pro",
      }),
      video: featureRule({
        availability: "real",
        providers: ["runway"],
        modelTierMax: "pro",
      }),
      voice: featureRule({
        availability: "real",
        providers: ["elevenlabs"],
        modelTierMax: "pro",
      }),
      music: featureRule({
        availability: "real",
        providers: ["suno"],
        modelTierMax: "pro",
      }),
      slides: featureRule({
        availability: "mock_only",
        preparedProviders: ["openai", "gemini"],
        modelTierMax: "pro",
        mockOnly: true,
      }),
      avatar_preview: featureRule({
        availability: "real",
        enabled: true,
      }),
    },
    credits_included: null,
    commerce: {
      allowed_coin_types: ["common", "pro", "ultra"],
      conversion_fee_percent: 0,
      purchase_fee_percent: 0,
      price_visibility: true,
      storefront_visibility: true,
      minimum_purchase_credits_per_type: null,
    },
    contract_policy: {
      overrides_allowed: true,
    },
    upload_limits: {
      max_file_size_mb: 51200,
      direct_upload_max_file_size_mb: 204800,
      files_per_job: 200,
      files_per_day: null,
    },
    generation_limits: {
      max_generated_video_seconds: null,
      max_generated_audio_seconds: null,
    },
    input_media_limits: {
      max_input_video_minutes: 240,
      max_input_audio_minutes: 240,
    },
    usage_limits: {
      jobs_per_day: null,
      avatar_preview_sessions_per_day: 1,
      avatar_preview_seconds_per_session: 120,
      monthly_by_feature: {
        creator_post_generate: monthlyLimit(2000),
        creator_music_generate: monthlyLimit(500),
        text_generate: monthlyLimit(null),
        image_generate: monthlyLimit(null),
        video_generate: monthlyLimit(null),
        voice_generate: monthlyLimit(null),
        music_generate: monthlyLimit(null),
        slides_generate: monthlyLimit(null),
      },
    },
    workflow_limits: {
      max_functions_per_job: null,
      can_combine_functions: true,
      pipeline_level: "complex",
      automation_level: "advanced",
      presets_level: "contract_inherited",
    },
    context_limits: {
      context_depth: "contract_inherited",
      project_memory_level: "contract_inherited",
    },
    storage_policy: {
      ...BASE_STORAGE_POLICY,
      direct_upload_required_when_large: true,
      connected_storage_required_when_heavy: true,
      recommended_storage_mode: "connected_or_dedicated",
    },
    runtime_rules: {
      mock_only_features: ["slides"],
      inherits_from: ["ENTERPRISE"],
      manual_mode_allowed: true,
      manual_mode_level: "full",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["deepseek", "claude"],
    },
    honesty_notes: [
      "Empresarial continua em ativacao assistida e ainda herda a base tecnica de Enterprise.",
      "Mesmo assistido, ja recebe baseline interno alto: 200 GB por trabalho, 240 minutos de entrada e 200 arquivos por job.",
      "Nao deve ser tratado como camada tecnica 100% autonoma ate que enforcement, quotas e runtime dedicados sejam separados.",
      "DeepSeek e Claude permanecem preparados, nao liberados como rota real nesta etapa. Slides continuam em camada exploratoria/mock ate existir um provedor real conectado ao runtime.",
      "Governanca, multiplos usuarios e coordenacao de equipe continuam fora desta matriz enquanto nao virarem regra implementada.",
    ],
    stripe_env_keys: [],
  },
  ENTERPRISE: {
    code: "ENTERPRISE",
    name_key: "plans.name.enterprise",
    price_amount_brl: null,
    availability: "contract",
    storefront_visibility: false,
    purchasable: false,
    coming_soon: true,
    quality_tier: "pro",
    quality_outputs: ["720p", "1080p", "1440p", "2160p"],
    model_tier_max: "pro",
    providers: {
      text: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        preparedProviders: ["deepseek", "claude"],
        modelTierMax: "pro",
      }),
      image: featureRule({
        availability: "real",
        providers: ["openai", "gemini"],
        modelTierMax: "pro",
      }),
      video: featureRule({
        availability: "real",
        providers: ["runway"],
        modelTierMax: "pro",
      }),
      voice: featureRule({
        availability: "real",
        providers: ["elevenlabs"],
        modelTierMax: "pro",
      }),
      music: featureRule({
        availability: "real",
        providers: ["suno"],
        modelTierMax: "pro",
      }),
      slides: featureRule({
        availability: "mock_only",
        preparedProviders: ["openai", "gemini"],
        modelTierMax: "pro",
        mockOnly: true,
      }),
      avatar_preview: featureRule({
        availability: "real",
        enabled: true,
      }),
    },
    credits_included: null,
    commerce: {
      allowed_coin_types: ["common", "pro", "ultra"],
      conversion_fee_percent: 0,
      purchase_fee_percent: 0,
      price_visibility: false,
      storefront_visibility: false,
      minimum_purchase_credits_per_type: {
        common: 50000,
        pro: 50000,
        ultra: 50000,
      },
    },
    contract_policy: {
      overrides_allowed: true,
    },
    upload_limits: {
      max_file_size_mb: 102400,
      direct_upload_max_file_size_mb: 512000,
      files_per_job: 500,
      files_per_day: null,
    },
    generation_limits: {
      max_generated_video_seconds: null,
      max_generated_audio_seconds: null,
    },
    input_media_limits: {
      max_input_video_minutes: 360,
      max_input_audio_minutes: 360,
    },
    usage_limits: {
      jobs_per_day: null,
      avatar_preview_sessions_per_day: 1,
      avatar_preview_seconds_per_session: 120,
      monthly_by_feature: {
        creator_post_generate: monthlyLimit(2000),
        creator_music_generate: monthlyLimit(500),
        text_generate: monthlyLimit(null),
        image_generate: monthlyLimit(null),
        video_generate: monthlyLimit(null),
        voice_generate: monthlyLimit(null),
        music_generate: monthlyLimit(null),
        slides_generate: monthlyLimit(null),
      },
    },
    workflow_limits: {
      max_functions_per_job: null,
      can_combine_functions: true,
      pipeline_level: "enterprise_or_advanced",
      automation_level: "enterprise_or_advanced",
      presets_level: "contract",
    },
    context_limits: {
      context_depth: "contract",
      project_memory_level: "contract",
    },
    storage_policy: {
      ...BASE_STORAGE_POLICY,
      direct_upload_required_when_large: true,
      connected_storage_required_when_heavy: true,
      recommended_storage_mode: "connected_or_dedicated",
    },
    runtime_rules: {
      mock_only_features: ["slides"],
      inherits_from: [],
      manual_mode_allowed: true,
      manual_mode_level: "full",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["deepseek", "claude"],
    },
    honesty_notes: [
      "Enterprise permanece como camada contratual e rule layer mais alta, mas nao deve ser tratado como ilimitado.",
      "O baseline interno sobe para 500 GB por trabalho, 360 minutos de entrada e 500 arquivos por job antes de qualquer override contratual.",
      "O minimo de compra fica formalizado em 50.000 creditos por tipo.",
      "DeepSeek e Claude permanecem preparados, nao liberados como rota real nesta etapa. Slides continuam em camada exploratoria/mock ate existir um provedor real conectado ao runtime.",
      "Overrides contratuais continuam permitidos internamente, sem virar promessa publica automatica.",
    ],
    stripe_env_keys: [],
  },
};

const PLAN_LIMITS_MATRIX_ENRICHED = enrichPlanMatrixWithInternalStatus(PLAN_LIMITS_MATRIX);

export function normalizePlanMatrixCode(planCode, domain = "public") {
  const raw = normalizeRawCode(planCode);
  const aliases = DOMAIN_ALIASES[domain] || DOMAIN_ALIASES.public;
  const normalized = aliases.get(raw) || raw;
  return PLAN_LIMITS_MATRIX_ENRICHED[normalized] ? normalized : "FREE";
}

export function getPlanLimitMatrix(planCode, { domain = "public" } = {}) {
  const normalized = normalizePlanMatrixCode(planCode, domain);
  return cloneValue(PLAN_LIMITS_MATRIX_ENRICHED[normalized] || PLAN_LIMITS_MATRIX_ENRICHED.FREE);
}

export function getPlanLimitMatrixEntries({ domain = "public" } = {}) {
  return PLAN_ORDER.map((code) => getPlanLimitMatrix(code, { domain }));
}

export function getPlanSelfServeCodes() {
  return PLAN_ORDER.filter((code) => {
    const plan = PLAN_LIMITS_MATRIX_ENRICHED[code];
    return plan?.availability === "self_serve" && plan?.purchasable !== false;
  });
}

export function getPlanInternalStatus(planCode, { domain = "public" } = {}) {
  return cloneValue(getPlanLimitMatrix(planCode, { domain }).internal_status || {});
}

export function getPlanCapabilityStatuses(planCode, { domain = "public" } = {}) {
  return cloneValue(getPlanLimitMatrix(planCode, { domain }).capability_statuses || {});
}

export function getPlanProviderInternalStatus(planCode, featureKey, { domain = "public" } = {}) {
  const plan = getPlanLimitMatrix(planCode, { domain });
  return cloneValue(plan?.providers?.[featureKey]?.provider_status || {});
}

export function getPlanStripeEnvKeys(planCode) {
  return [...(getPlanLimitMatrix(planCode).stripe_env_keys || [])];
}

export function getPlanCreditsIncluded(planCode) {
  return cloneValue(getPlanLimitMatrix(planCode).credits_included || null);
}

export function getPlanMonthlyUsageConfig(planCode, { domain = "usage" } = {}) {
  return cloneValue(getPlanLimitMatrix(planCode, { domain }).usage_limits || {});
}

export function getPlanCommerceConfig(planCode, { domain = "commerce" } = {}) {
  return cloneValue(getPlanLimitMatrix(planCode, { domain }).commerce || {});
}
