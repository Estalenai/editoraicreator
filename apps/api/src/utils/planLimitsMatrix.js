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
        providers: ["openai", "gemini", "deepseek"],
        preparedProviders: ["claude"],
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
        availability: "limited",
        providers: ["openai", "gemini"],
        modelTierMax: "standard",
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
      mock_only_features: [],
      inherits_from: [],
      manual_mode_allowed: true,
      manual_mode_level: "limited",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["claude"],
    },
    honesty_notes: [
      "Upload padrao por trabalho fica em 1 GB; ate 2 GB depende de direct upload para storage.",
      "Claude fica apenas preparado por feature flag e continua desligado nesta etapa.",
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
        providers: ["openai", "gemini", "deepseek"],
        preparedProviders: ["claude"],
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
        availability: "real",
        providers: ["openai", "gemini"],
        modelTierMax: "intermediate",
      }),
      avatar_preview: featureRule({ availability: "unavailable", enabled: false }),
    },
    credits_included: { common: 700, pro: 350, ultra: 150 },
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
      mock_only_features: [],
      inherits_from: [],
      manual_mode_allowed: true,
      manual_mode_level: "full",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["claude"],
    },
    honesty_notes: [
      "Neste tier o credito passa a ser o limitador principal, mas hard caps tecnicos e anti-abuso continuam ativos em paralelo.",
      "Editor Pro fica com baseline profissional de ate 50 GB por trabalho via direct/connected flow, 90 minutos de entrada e 50 arquivos por job.",
      "O degrau de modelos fica abaixo de Creator Pro; mapeamentos especificos de modelo ainda seguem aiModelPolicy ate a adocao completa desta matriz.",
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
        providers: ["openai", "gemini", "deepseek"],
        preparedProviders: ["claude"],
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
        availability: "real",
        providers: ["openai", "gemini"],
        modelTierMax: "pro",
      }),
      avatar_preview: featureRule({
        availability: "real",
        enabled: true,
      }),
    },
    credits_included: { common: 2000, pro: 1200, ultra: 600 },
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
      mock_only_features: [],
      inherits_from: [],
      manual_mode_allowed: true,
      manual_mode_level: "full",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["claude"],
    },
    honesty_notes: [
      "Creator Pro em diante libera a camada Pro de modelos na fonte de verdade do produto.",
      "Creator Pro continua premium, mas nao ilimitado: o baseline tecnico sobe para 100 GB por trabalho, 180 minutos de entrada e 100 arquivos por job.",
      "Avatar Preview fica explicitamente liberado aqui, mas enforcement fino ainda depende das rotas de runtime continuarem consumindo estas regras.",
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
        providers: ["openai", "gemini", "deepseek"],
        preparedProviders: ["claude"],
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
        availability: "real",
        providers: ["openai", "gemini"],
        modelTierMax: "pro",
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
      mock_only_features: [],
      inherits_from: ["ENTERPRISE"],
      manual_mode_allowed: true,
      manual_mode_level: "full",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["claude"],
    },
    honesty_notes: [
      "Empresarial continua em ativacao assistida e ainda herda a base tecnica de Enterprise.",
      "Mesmo assistido, ja recebe baseline interno alto: 200 GB por trabalho, 240 minutos de entrada e 200 arquivos por job.",
      "Nao deve ser tratado como camada tecnica 100% autonoma ate que enforcement, quotas e runtime dedicados sejam separados.",
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
        providers: ["openai", "gemini", "deepseek"],
        preparedProviders: ["claude"],
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
        availability: "real",
        providers: ["openai", "gemini"],
        modelTierMax: "pro",
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
      mock_only_features: [],
      inherits_from: [],
      manual_mode_allowed: true,
      manual_mode_level: "full",
      automatic_mode_default: true,
      primary_mode_label: "automatic_recommended",
      quality_default: true,
      economy_mode_available: true,
      prepared_provider_flags: ["claude"],
    },
    honesty_notes: [
      "Enterprise permanece como camada contratual e rule layer mais alta, mas nao deve ser tratado como ilimitado.",
      "O baseline interno sobe para 500 GB por trabalho, 360 minutos de entrada e 500 arquivos por job antes de qualquer override contratual.",
      "O minimo de compra fica formalizado em 50.000 creditos por tipo.",
      "Overrides contratuais continuam permitidos internamente, sem virar promessa publica automatica.",
    ],
    stripe_env_keys: [],
  },
};

export function normalizePlanMatrixCode(planCode, domain = "public") {
  const raw = normalizeRawCode(planCode);
  const aliases = DOMAIN_ALIASES[domain] || DOMAIN_ALIASES.public;
  const normalized = aliases.get(raw) || raw;
  return PLAN_LIMITS_MATRIX[normalized] ? normalized : "FREE";
}

export function getPlanLimitMatrix(planCode, { domain = "public" } = {}) {
  const normalized = normalizePlanMatrixCode(planCode, domain);
  return cloneValue(PLAN_LIMITS_MATRIX[normalized] || PLAN_LIMITS_MATRIX.FREE);
}

export function getPlanLimitMatrixEntries({ domain = "public" } = {}) {
  return PLAN_ORDER.map((code) => getPlanLimitMatrix(code, { domain }));
}

export function getPlanSelfServeCodes() {
  return PLAN_ORDER.filter((code) => {
    const plan = PLAN_LIMITS_MATRIX[code];
    return plan?.availability === "self_serve" && plan?.purchasable !== false;
  });
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
