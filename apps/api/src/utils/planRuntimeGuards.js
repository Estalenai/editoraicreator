import { getPlanLimitMatrix, normalizePlanMatrixCode } from "./planLimitsMatrix.js";
import { getPlanStoragePolicySnapshot } from "./storageRuntimePolicy.js";

const FEATURE_TO_MATRIX_KEY = {
  text_generate: "text",
  fact_check: "text",
  image_generate: "image",
  image_variation: "image",
  video_generate: "video",
  music_generate: "music",
  voice_generate: "voice",
  slides_generate: "slides",
  avatar_start: "avatar_preview",
  avatar_message: "avatar_preview",
  avatar_end: "avatar_preview",
};

const OUTPUT_QUALITY_ALIASES = new Map([
  ["720", "720p"],
  ["720p", "720p"],
  ["hd", "720p"],
  ["1080", "1080p"],
  ["1080p", "1080p"],
  ["fhd", "1080p"],
  ["fullhd", "1080p"],
  ["1440", "1440p"],
  ["1440p", "1440p"],
  ["2k", "1440p"],
  ["qhd", "1440p"],
  ["2160", "2160p"],
  ["2160p", "2160p"],
  ["4k", "2160p"],
  ["uhd", "2160p"],
]);

const QUALITY_PROFILE_ALIASES = new Map([
  ["low", "low"],
  ["economy", "low"],
  ["medium", "medium"],
  ["balanced", "medium"],
  ["quality", "high"],
  ["high", "high"],
  ["max", "high"],
]);

const PIPELINE_LEVEL_ORDER = {
  none: 0,
  simple: 1,
  moderate: 2,
  complex: 3,
  enterprise_or_advanced: 4,
};

const AUTOMATION_LEVEL_ORDER = {
  none: 0,
  limited: 1,
  light: 1,
  simple: 1,
  light_or_intermediate: 2,
  intermediate: 2,
  advanced: 3,
  enterprise_or_advanced: 4,
};

const DAILY_GENERATE_BASE_FEATURES = [
  "image_generate",
  "video_generate",
  "music_generate",
  "voice_generate",
  "slides_generate",
  "creator_post_generate",
  "creator_music_generate",
];
const DAILY_GENERATE_USAGE_FEATURES = Array.from(
  new Set(
    DAILY_GENERATE_BASE_FEATURES.flatMap((feature) => {
      const normalized = String(feature || "").trim().toLowerCase();
      return normalized ? [normalized, `ai_${normalized}`] : [];
    })
  )
);

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeFeatureKey(feature) {
  const normalized = String(feature || "").trim().toLowerCase();
  if (normalized.endsWith("_status")) return normalized.replace(/_status$/, "_generate");
  return normalized;
}

function extractFirstNumber(source, keys) {
  for (const key of keys) {
    const numeric = toFiniteNumber(source?.[key]);
    if (numeric != null) return numeric;
  }
  return null;
}

function extractFirstString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractFileCount(parsedInput, body) {
  const explicit =
    extractFirstNumber(parsedInput, ["fileCount", "file_count", "filesCount", "files_count"]) ??
    extractFirstNumber(body, ["fileCount", "file_count", "filesCount", "files_count"]);
  if (explicit != null) return explicit;

  const collections = [
    parsedInput?.files,
    parsedInput?.inputFiles,
    body?.files,
    body?.inputFiles,
    body?.media,
    body?.assets,
  ];
  for (const collection of collections) {
    if (Array.isArray(collection)) return collection.length;
  }
  return null;
}

function extractFunctionCount(parsedInput, body) {
  const explicit =
    extractFirstNumber(parsedInput, ["functionCount", "function_count", "functionsCount", "functions_count"]) ??
    extractFirstNumber(body, ["functionCount", "function_count", "functionsCount", "functions_count"]);
  if (explicit != null) return explicit;

  const collections = [
    parsedInput?.functions,
    body?.functions,
    body?.steps,
    body?.operations,
    body?.workflow?.functions,
    body?.pipeline?.functions,
  ];
  for (const collection of collections) {
    if (Array.isArray(collection)) return collection.length;
  }
  return null;
}

function normalizeStorageMode(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["direct", "direct_upload", "direct-upload", "signed_upload", "signed-url", "upload_url"].includes(normalized)) {
    return "direct_upload";
  }
  if (
    ["connected", "connected_storage", "connected-storage", "external_storage", "external-storage", "s3", "bucket"].includes(
      normalized
    )
  ) {
    return "connected_storage";
  }
  if (["platform", "temporary", "platform_temporary", "inline", "device", "local"].includes(normalized)) {
    return "platform_temporary";
  }
  return normalized;
}

function normalizeRetentionMode(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["long", "long_term", "long-term", "extended", "persistent", "retain"].includes(normalized)) {
    return "long_term";
  }
  if (["temporary", "temp", "short", "short_term", "short-term"].includes(normalized)) {
    return "temporary";
  }
  return normalized;
}

function normalizeRequestedQualityProfile(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return null;
  return QUALITY_PROFILE_ALIASES.get(normalized) || null;
}

function normalizePipelineLevel(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "advanced") return "complex";
  if (normalized === "enterprise") return "enterprise_or_advanced";
  return Object.prototype.hasOwnProperty.call(PIPELINE_LEVEL_ORDER, normalized) ? normalized : null;
}

function normalizeAutomationLevel(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "automatic") return "limited";
  if (normalized === "manual") return "none";
  return Object.prototype.hasOwnProperty.call(AUTOMATION_LEVEL_ORDER, normalized) ? normalized : null;
}

function resolveOutputQualityFromProfile(qualityProfile, allowedOutputs = []) {
  const outputs = Array.isArray(allowedOutputs) ? allowedOutputs.filter(Boolean) : [];
  if (outputs.length === 0) return null;
  if (qualityProfile === "low") return outputs[0] || null;
  if (qualityProfile === "medium") return outputs[Math.min(1, outputs.length - 1)] || outputs[0] || null;
  if (qualityProfile === "high") return outputs[outputs.length - 1] || null;
  return null;
}

function extractBooleanFlag(source, keys) {
  for (const key of keys) {
    if (source?.[key] === true) return true;
  }
  return false;
}

function getUtcDayStartIso(reference = new Date()) {
  const start = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), 0, 0, 0, 0)
  );
  return start.toISOString();
}

function toUsageFeatureKeys(feature) {
  const normalized = normalizeFeatureKey(feature);
  if (!normalized) return [];
  return Array.from(new Set([normalized, normalized.startsWith("ai_") ? normalized : `ai_${normalized}`]));
}

async function hasSuccessfulUsageRecorded({ db, userId, feature, idempotencyKey }) {
  if (!db || !userId || !idempotencyKey) return false;
  const featureKeys = toUsageFeatureKeys(feature);
  if (featureKeys.length === 0) return false;

  const { data, error } = await db
    .from("usage_events")
    .select("id")
    .eq("user_id", userId)
    .in("feature", featureKeys)
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "success")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`usage_replay_check_failed: ${error.message}`);
  return Boolean(data?.id);
}

async function countGenerateJobsToday({ db, userId }) {
  if (!db || !userId) return null;
  const startIso = getUtcDayStartIso();
  const { count, error } = await db
    .from("usage_events")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("action", "generate")
    .eq("status", "success")
    .in("feature", DAILY_GENERATE_USAGE_FEATURES)
    .gte("created_at", startIso);

  if (error) throw new Error(`daily_jobs_count_failed: ${error.message}`);
  return Number(count || 0);
}

async function countUploadedFilesToday({ db, userId }) {
  if (!db || !userId) return null;
  const startIso = getUtcDayStartIso();
  const { data, error } = await db
    .from("usage_events")
    .select("meta")
    .eq("user_id", userId)
    .eq("action", "generate")
    .eq("status", "success")
    .in("feature", DAILY_GENERATE_USAGE_FEATURES)
    .gte("created_at", startIso);

  if (error) throw new Error(`daily_files_count_failed: ${error.message}`);
  return (data || []).reduce((total, row) => {
    const fileCount = toFiniteNumber(row?.meta?.file_count);
    return total + (fileCount != null ? fileCount : 0);
  }, 0);
}

function buildViolation({ status = 403, error, message, planCode, feature, details = null }) {
  return {
    ok: false,
    status,
    error,
    message,
    plan: normalizePlanMatrixCode(planCode, "usage"),
    feature: normalizeFeatureKey(feature),
    details,
  };
}

export function normalizeRequestedOutputQuality(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return null;
  return OUTPUT_QUALITY_ALIASES.get(normalized) || null;
}

export function extractPlanUsageTelemetry({ body = {}, parsedInput = {} } = {}) {
  const fileCount = extractFileCount(parsedInput, body);
  const fileSizeMb =
    extractFirstNumber(parsedInput, ["fileSizeMb", "file_size_mb", "maxFileSizeMb", "max_file_size_mb"]) ??
    extractFirstNumber(body, ["fileSizeMb", "file_size_mb", "maxFileSizeMb", "max_file_size_mb"]);
  const inputVideoMinutes =
    extractFirstNumber(parsedInput, ["inputVideoMinutes", "input_video_minutes", "videoMinutes", "video_minutes"]) ??
    extractFirstNumber(body, ["inputVideoMinutes", "input_video_minutes", "videoMinutes", "video_minutes"]);
  const inputAudioMinutes =
    extractFirstNumber(parsedInput, ["inputAudioMinutes", "input_audio_minutes", "audioMinutes", "audio_minutes"]) ??
    extractFirstNumber(body, ["inputAudioMinutes", "input_audio_minutes", "audioMinutes", "audio_minutes"]);

  const requestedOutputQualityRaw =
    parsedInput?.outputQuality ??
    parsedInput?.output_quality ??
    body?.outputQuality ??
    body?.output_quality ??
    body?.quality_output ??
    body?.qualityOutput ??
    body?.resolution ??
    body?.output_resolution ??
    body?.outputResolution ??
    null;
  const outputQuality = requestedOutputQualityRaw != null ? normalizeRequestedOutputQuality(requestedOutputQualityRaw) : null;
  const qualityProfileRaw =
    parsedInput?.qualityProfile ??
    parsedInput?.quality_profile ??
    body?.qualityProfile ??
    body?.quality_profile ??
    body?.quality ??
    null;
  const qualityProfile = qualityProfileRaw != null ? normalizeRequestedQualityProfile(qualityProfileRaw) : null;
  const requestedPipelineLevel = normalizePipelineLevel(
    extractFirstString(parsedInput, ["requestedPipelineLevel", "requested_pipeline_level"]) ??
      extractFirstString(body, ["requestedPipelineLevel", "requested_pipeline_level", "pipelineLevel", "pipeline_level"])
  );
  const requestedAutomationLevel = normalizeAutomationLevel(
    extractFirstString(parsedInput, ["requestedAutomationLevel", "requested_automation_level"]) ??
      extractFirstString(body, ["requestedAutomationLevel", "requested_automation_level", "automationLevel", "automation_level"])
  );
  const requestedStorageMode = normalizeStorageMode(
    parsedInput?.storageMode ??
      parsedInput?.storage_mode ??
      body?.storageMode ??
      body?.storage_mode ??
      body?.uploadTransport ??
      body?.upload_transport ??
      body?.exportTarget ??
      body?.export_target
  );
  const retentionMode = normalizeRetentionMode(
    body?.retentionMode ?? body?.retention_mode ?? body?.storageRetention ?? body?.storage_retention ?? body?.retention
  );
  const heavyStorageFlowRequested =
    extractBooleanFlag(body, ["heavyJob", "heavy_job", "advancedWorkflow", "advanced_workflow", "premiumFlow", "premium_flow"]) ||
    retentionMode === "long_term";

  const telemetry = {};
  if (fileCount != null) telemetry.file_count = fileCount;
  if (fileSizeMb != null) telemetry.file_size_mb = fileSizeMb;
  if (inputVideoMinutes != null) telemetry.input_video_minutes = inputVideoMinutes;
  if (inputAudioMinutes != null) telemetry.input_audio_minutes = inputAudioMinutes;
  if (outputQuality) telemetry.output_quality = outputQuality;
  if (qualityProfile) telemetry.quality_profile = qualityProfile;
  if (requestedPipelineLevel) telemetry.requested_pipeline_level = requestedPipelineLevel;
  if (requestedAutomationLevel) telemetry.requested_automation_level = requestedAutomationLevel;
  if (requestedStorageMode) telemetry.requested_storage_mode = requestedStorageMode;
  if (retentionMode) telemetry.retention_mode = retentionMode;
  if (heavyStorageFlowRequested) telemetry.heavy_storage_flow_requested = true;
  return telemetry;
}

export function getPlanRuntimeMatrix(planCode) {
  return getPlanLimitMatrix(planCode, { domain: "usage" });
}

export function getPlanFeatureRuntimeConfig(planCode, feature) {
  const planMatrix = getPlanRuntimeMatrix(planCode);
  const matrixKey = FEATURE_TO_MATRIX_KEY[normalizeFeatureKey(feature)];
  if (!matrixKey) return null;
  return planMatrix?.providers?.[matrixKey] || null;
}

export function getPlanAvatarPreviewLimits(planCode) {
  const planMatrix = getPlanRuntimeMatrix(planCode);
  return {
    enabled: Boolean(planMatrix?.providers?.avatar_preview?.enabled),
    sessions_per_day: Number(planMatrix?.usage_limits?.avatar_preview_sessions_per_day || 0),
    seconds_per_session: Number(planMatrix?.usage_limits?.avatar_preview_seconds_per_session || 0),
  };
}

export async function validatePlanFeatureRequest({
  planCode,
  feature,
  body = {},
  parsedInput = {},
  mode = "quality",
  db = null,
  userId = null,
  idempotencyKey = null,
}) {
  const planMatrix = getPlanRuntimeMatrix(planCode);
  const featureConfig = getPlanFeatureRuntimeConfig(planCode, feature);
  const storagePolicy = getPlanStoragePolicySnapshot(planCode, { domain: "usage" });
  if (!planMatrix || !featureConfig) return { ok: true };
  if (featureConfig.enabled === false || featureConfig.availability === "unavailable") {
    return buildViolation({
      status: 403,
      error: "feature_not_available_for_plan",
      message: "Esta capacidade nao esta liberada para este plano.",
      planCode,
      feature,
    });
  }

  const runtimeRules = planMatrix.runtime_rules || {};
  const normalizedMode = String(mode || "quality").trim().toLowerCase() || "quality";
  if (normalizedMode === "manual" && runtimeRules.manual_mode_allowed !== true) {
    return buildViolation({
      status: 403,
      error: "manual_mode_not_allowed_for_plan",
      message: "A selecao manual nao esta liberada para este plano.",
      planCode,
      feature,
      details: {
        manual_mode_level: runtimeRules.manual_mode_level || "none",
      },
    });
  }

  const usageTelemetry = extractPlanUsageTelemetry({ body, parsedInput });
  const fileCount = toFiniteNumber(usageTelemetry.file_count);
  const explicitFileSizeMb = toFiniteNumber(usageTelemetry.file_size_mb);
  const inputVideoMinutes = toFiniteNumber(usageTelemetry.input_video_minutes);
  const inputAudioMinutes = toFiniteNumber(usageTelemetry.input_audio_minutes);
  const requestAlreadyRecorded = await hasSuccessfulUsageRecorded({
    db,
    userId,
    feature,
    idempotencyKey,
  });

  if (!requestAlreadyRecorded) {
    const jobsPerDay = toFiniteNumber(planMatrix?.usage_limits?.jobs_per_day);
    if (jobsPerDay != null && db && userId) {
      try {
        const jobsUsedToday = await countGenerateJobsToday({ db, userId });
        if (jobsUsedToday != null && jobsUsedToday >= jobsPerDay) {
          return buildViolation({
            status: 403,
            error: "jobs_per_day_limit_reached",
            message: "A quantidade diaria de jobs excede o limite deste plano.",
            planCode,
            feature,
            details: {
              used_today: jobsUsedToday,
              max_jobs_per_day: jobsPerDay,
            },
          });
        }
      } catch (error) {
        return buildViolation({
          status: 503,
          error: "plan_policy_temporarily_unavailable",
          message: "Nao foi possivel validar a politica de uso deste plano agora.",
          planCode,
          feature,
          details: {
            reason: error?.message || "daily_jobs_count_failed",
          },
        });
      }
    }

    const filesPerDay = toFiniteNumber(planMatrix?.upload_limits?.files_per_day);
    if (fileCount != null && filesPerDay != null && db && userId) {
      try {
        const filesUsedToday = await countUploadedFilesToday({ db, userId });
        if (filesUsedToday != null && filesUsedToday + fileCount > filesPerDay) {
          return buildViolation({
            status: 403,
            error: "files_per_day_limit_reached",
            message: "A quantidade diaria de arquivos excede o limite deste plano.",
            planCode,
            feature,
            details: {
              used_today: filesUsedToday,
              requested_files: fileCount,
              max_files_per_day: filesPerDay,
            },
          });
        }
      } catch (error) {
        return buildViolation({
          status: 503,
          error: "plan_policy_temporarily_unavailable",
          message: "Nao foi possivel validar a politica de upload deste plano agora.",
          planCode,
          feature,
          details: {
            reason: error?.message || "daily_files_count_failed",
          },
        });
      }
    }
  }

  const requestedOutputQualityRaw =
    parsedInput?.outputQuality ??
    parsedInput?.output_quality ??
    body?.outputQuality ??
    body?.output_quality ??
    body?.quality_output ??
    body?.qualityOutput ??
    body?.resolution ??
    body?.output_resolution ??
    body?.outputResolution ??
    null;
  const qualityProfile =
    usageTelemetry.quality_profile ||
    normalizeRequestedQualityProfile(
      parsedInput?.qualityProfile ??
        parsedInput?.quality_profile ??
        body?.qualityProfile ??
        body?.quality_profile ??
        body?.quality
    );
  const allowedOutputs = Array.isArray(planMatrix.quality_outputs) ? [...planMatrix.quality_outputs] : [];
  const featureKey = normalizeFeatureKey(feature);
  const requestedOutputQuality =
    requestedOutputQualityRaw != null && String(requestedOutputQualityRaw).trim()
      ? normalizeRequestedOutputQuality(requestedOutputQualityRaw)
      : ["image_generate", "video_generate", "slides_generate"].includes(featureKey)
        ? resolveOutputQualityFromProfile(qualityProfile, allowedOutputs)
        : null;

  if ((requestedOutputQualityRaw != null && String(requestedOutputQualityRaw).trim()) || requestedOutputQuality) {
    if (!requestedOutputQuality) {
      return buildViolation({
        status: 400,
        error: "invalid_output_quality",
        message: "A qualidade de saida informada nao e valida.",
        planCode,
        feature,
      });
    }

    if (!allowedOutputs.includes(requestedOutputQuality)) {
      return buildViolation({
        status: 403,
        error: "output_quality_not_allowed_for_plan",
        message: "A qualidade de saida solicitada nao esta liberada para este plano.",
        planCode,
        feature,
        details: {
          requested_output_quality: requestedOutputQuality,
          requested_quality_profile: qualityProfile || null,
          allowed_quality_outputs: allowedOutputs,
        },
      });
    }
  }

  const generationLimits = planMatrix.generation_limits || {};
  const durationSec = toFiniteNumber(parsedInput?.durationSec);
  if (
    normalizeFeatureKey(feature) === "video_generate" &&
    durationSec != null &&
    generationLimits.max_generated_video_seconds != null &&
    durationSec > Number(generationLimits.max_generated_video_seconds)
  ) {
    return buildViolation({
      status: 403,
      error: "video_duration_not_allowed_for_plan",
      message: "A duracao de video solicitada excede o limite deste plano.",
      planCode,
      feature,
      details: {
        requested_seconds: durationSec,
        max_seconds: Number(generationLimits.max_generated_video_seconds),
      },
    });
  }

  if (
    normalizeFeatureKey(feature) === "music_generate" &&
    durationSec != null &&
    generationLimits.max_generated_audio_seconds != null &&
    durationSec > Number(generationLimits.max_generated_audio_seconds)
  ) {
    return buildViolation({
      status: 403,
      error: "audio_duration_not_allowed_for_plan",
      message: "A duracao de audio solicitada excede o limite deste plano.",
      planCode,
      feature,
      details: {
        requested_seconds: durationSec,
        max_seconds: Number(generationLimits.max_generated_audio_seconds),
      },
    });
  }

  const uploadLimits = planMatrix.upload_limits || {};
  if (fileCount != null && uploadLimits.files_per_job != null && fileCount > Number(uploadLimits.files_per_job)) {
    return buildViolation({
      status: 403,
      error: "files_per_job_limit_reached",
      message: "A quantidade de arquivos por job excede o limite deste plano.",
      planCode,
      feature,
      details: {
        requested_files: fileCount,
        max_files_per_job: Number(uploadLimits.files_per_job),
      },
    });
  }

  if (
    explicitFileSizeMb != null &&
    uploadLimits.max_file_size_mb != null &&
    explicitFileSizeMb > Number(uploadLimits.max_file_size_mb)
  ) {
    const directUploadMax = toFiniteNumber(uploadLimits.direct_upload_max_file_size_mb);
    if (
      directUploadMax != null &&
      explicitFileSizeMb <= directUploadMax &&
      planMatrix.storage_policy?.direct_upload_required_when_large === true
    ) {
      if (
        storagePolicy?.runtime?.direct_upload_available !== true &&
        storagePolicy?.runtime?.connected_storage_available !== true
      ) {
        return buildViolation({
          status: 503,
          error: "large_file_flow_not_available",
          message:
            "Este tamanho de arquivo exige um fluxo de storage direto ou conectado que ainda nao esta disponivel neste ambiente.",
          planCode,
          feature,
          details: {
            requested_file_size_mb: explicitFileSizeMb,
            max_inline_file_size_mb: Number(uploadLimits.max_file_size_mb),
            direct_upload_max_file_size_mb: directUploadMax,
            storage_policy: storagePolicy,
          },
        });
      }

      return buildViolation({
        status: 403,
        error: "direct_upload_required_for_plan",
        message: "Este tamanho de arquivo exige direct upload ou storage conectado neste plano.",
        planCode,
        feature,
        details: {
          requested_file_size_mb: explicitFileSizeMb,
          max_inline_file_size_mb: Number(uploadLimits.max_file_size_mb),
          direct_upload_max_file_size_mb: directUploadMax,
          storage_policy: storagePolicy,
        },
      });
    }

    return buildViolation({
      status: 403,
      error: "file_size_not_allowed_for_plan",
      message: "O tamanho do arquivo excede o limite deste plano.",
      planCode,
      feature,
      details: {
        requested_file_size_mb: explicitFileSizeMb,
        max_file_size_mb: Number(uploadLimits.max_file_size_mb),
        storage_policy: storagePolicy,
      },
    });
  }

  if (
    usageTelemetry.heavy_storage_flow_requested === true &&
    planMatrix.storage_policy?.connected_storage_required_when_heavy === true
  ) {
    if (storagePolicy?.runtime?.connected_storage_available !== true) {
      return buildViolation({
        status: 503,
        error: "connected_storage_not_available",
        message:
          "Esta operacao pesada exige storage conectado ou dedicado, mas esse fluxo ainda nao esta disponivel neste ambiente.",
        planCode,
        feature,
        details: {
          requested_storage_mode: usageTelemetry.requested_storage_mode || null,
          storage_policy: storagePolicy,
        },
      });
    }

    if (usageTelemetry.requested_storage_mode && usageTelemetry.requested_storage_mode !== "connected_storage") {
      return buildViolation({
        status: 403,
        error: "connected_storage_required_for_plan",
        message: "Esta operacao exige storage conectado ou dedicado neste plano.",
        planCode,
        feature,
        details: {
          requested_storage_mode: usageTelemetry.requested_storage_mode,
          storage_policy: storagePolicy,
        },
      });
    }
  }

  if (
    usageTelemetry.retention_mode === "long_term" &&
    planMatrix.storage_policy?.connected_storage_required_for_long_retention === true
  ) {
    if (storagePolicy?.runtime?.connected_storage_available !== true) {
      return buildViolation({
        status: 503,
        error: "connected_storage_not_available",
        message:
          "Retencao longa exige storage conectado ou dedicado, mas esse fluxo ainda nao esta disponivel neste ambiente.",
        planCode,
        feature,
        details: {
          retention_mode: usageTelemetry.retention_mode,
          storage_policy: storagePolicy,
        },
      });
    }

    if (usageTelemetry.requested_storage_mode && usageTelemetry.requested_storage_mode !== "connected_storage") {
      return buildViolation({
        status: 403,
        error: "connected_storage_required_for_plan",
        message: "Retencao longa exige storage conectado ou dedicado neste plano.",
        planCode,
        feature,
        details: {
          requested_storage_mode: usageTelemetry.requested_storage_mode,
          retention_mode: usageTelemetry.retention_mode,
          storage_policy: storagePolicy,
        },
      });
    }
  }

  const inputMediaLimits = planMatrix.input_media_limits || {};
  if (
    inputVideoMinutes != null &&
    inputMediaLimits.max_input_video_minutes != null &&
    inputVideoMinutes > Number(inputMediaLimits.max_input_video_minutes)
  ) {
    return buildViolation({
      status: 403,
      error: "input_video_not_allowed_for_plan",
      message: "A duracao do video de entrada excede o limite deste plano.",
      planCode,
      feature,
      details: {
        requested_minutes: inputVideoMinutes,
        max_minutes: Number(inputMediaLimits.max_input_video_minutes),
      },
    });
  }

  if (
    inputAudioMinutes != null &&
    inputMediaLimits.max_input_audio_minutes != null &&
    inputAudioMinutes > Number(inputMediaLimits.max_input_audio_minutes)
  ) {
    return buildViolation({
      status: 403,
      error: "input_audio_not_allowed_for_plan",
      message: "A duracao do audio de entrada excede o limite deste plano.",
      planCode,
      feature,
      details: {
        requested_minutes: inputAudioMinutes,
        max_minutes: Number(inputMediaLimits.max_input_audio_minutes),
      },
    });
  }

  const workflowLimits = planMatrix.workflow_limits || {};
  const requestedPipelineLevel = normalizePipelineLevel(
    usageTelemetry.requested_pipeline_level ??
      parsedInput?.requestedPipelineLevel ??
      parsedInput?.requested_pipeline_level ??
      body?.requestedPipelineLevel ??
      body?.requested_pipeline_level ??
      body?.pipelineLevel ??
      body?.pipeline_level
  );
  const allowedPipelineLevel = normalizePipelineLevel(workflowLimits.pipeline_level);
  if (
    requestedPipelineLevel &&
    allowedPipelineLevel &&
    (PIPELINE_LEVEL_ORDER[requestedPipelineLevel] || 0) > (PIPELINE_LEVEL_ORDER[allowedPipelineLevel] || 0)
  ) {
    return buildViolation({
      status: 403,
      error: "pipeline_level_not_allowed_for_plan",
      message: "O nivel de pipeline solicitado nao esta liberado para este plano.",
      planCode,
      feature,
      details: {
        requested_pipeline_level: requestedPipelineLevel,
        allowed_pipeline_level: allowedPipelineLevel,
      },
    });
  }

  const requestedAutomationLevel = normalizeAutomationLevel(
    usageTelemetry.requested_automation_level ??
      parsedInput?.requestedAutomationLevel ??
      parsedInput?.requested_automation_level ??
      body?.requestedAutomationLevel ??
      body?.requested_automation_level ??
      body?.automationLevel ??
      body?.automation_level
  );
  const allowedAutomationLevel = normalizeAutomationLevel(workflowLimits.automation_level);
  if (
    requestedAutomationLevel &&
    allowedAutomationLevel &&
    (AUTOMATION_LEVEL_ORDER[requestedAutomationLevel] || 0) > (AUTOMATION_LEVEL_ORDER[allowedAutomationLevel] || 0)
  ) {
    return buildViolation({
      status: 403,
      error: "automation_level_not_allowed_for_plan",
      message: "O nivel de automacao solicitado nao esta liberado para este plano.",
      planCode,
      feature,
      details: {
        requested_automation_level: requestedAutomationLevel,
        allowed_automation_level: allowedAutomationLevel,
      },
    });
  }

  const functionCount = extractFunctionCount(parsedInput, body);
  if (functionCount != null) {
    if (workflowLimits.can_combine_functions === false && functionCount > 1) {
      return buildViolation({
        status: 403,
        error: "function_combination_not_allowed_for_plan",
        message: "Este plano nao permite combinar multiplas funcoes no mesmo job.",
        planCode,
        feature,
        details: {
          requested_functions: functionCount,
        },
      });
    }

    if (
      workflowLimits.max_functions_per_job != null &&
      functionCount > Number(workflowLimits.max_functions_per_job)
    ) {
      return buildViolation({
        status: 403,
        error: "functions_per_job_limit_reached",
        message: "A quantidade de funcoes no job excede o limite deste plano.",
        planCode,
        feature,
        details: {
          requested_functions: functionCount,
          max_functions_per_job: Number(workflowLimits.max_functions_per_job),
        },
      });
    }
  }

  return { ok: true };
}
