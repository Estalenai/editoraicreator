import { getPlanLimitMatrix, normalizePlanMatrixCode } from "./planLimitsMatrix.js";

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

function extractFileCount(parsedInput, body) {
  const explicit =
    extractFirstNumber(parsedInput, ["fileCount", "file_count"]) ??
    extractFirstNumber(body, ["fileCount", "file_count"]);
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
    extractFirstNumber(parsedInput, ["functionCount", "function_count"]) ??
    extractFirstNumber(body, ["functionCount", "function_count"]);
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

export function validatePlanFeatureRequest({ planCode, feature, body = {}, parsedInput = {}, mode = "quality" }) {
  const planMatrix = getPlanRuntimeMatrix(planCode);
  const featureConfig = getPlanFeatureRuntimeConfig(planCode, feature);
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

  const requestedOutputQualityRaw =
    parsedInput?.outputQuality ??
    body?.outputQuality ??
    body?.output_quality ??
    body?.quality_output ??
    body?.qualityOutput ??
    body?.resolution ??
    body?.output_resolution ??
    body?.outputResolution ??
    null;

  if (requestedOutputQualityRaw != null && String(requestedOutputQualityRaw).trim()) {
    const requestedOutputQuality = normalizeRequestedOutputQuality(requestedOutputQualityRaw);
    if (!requestedOutputQuality) {
      return buildViolation({
        status: 400,
        error: "invalid_output_quality",
        message: "A qualidade de saida informada nao e valida.",
        planCode,
        feature,
      });
    }

    const allowedOutputs = Array.isArray(planMatrix.quality_outputs) ? [...planMatrix.quality_outputs] : [];
    if (!allowedOutputs.includes(requestedOutputQuality)) {
      return buildViolation({
        status: 403,
        error: "output_quality_not_allowed_for_plan",
        message: "A qualidade de saida solicitada nao esta liberada para este plano.",
        planCode,
        feature,
        details: {
          requested_output_quality: requestedOutputQuality,
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
  const fileCount = extractFileCount(parsedInput, body);
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

  const explicitFileSizeMb =
    extractFirstNumber(parsedInput, ["fileSizeMb", "file_size_mb", "maxFileSizeMb"]) ??
    extractFirstNumber(body, ["fileSizeMb", "file_size_mb", "maxFileSizeMb"]);
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
      },
    });
  }

  const inputMediaLimits = planMatrix.input_media_limits || {};
  const inputVideoMinutes =
    extractFirstNumber(parsedInput, ["inputVideoMinutes", "input_video_minutes", "videoMinutes", "video_minutes"]) ??
    extractFirstNumber(body, ["inputVideoMinutes", "input_video_minutes", "videoMinutes", "video_minutes"]);
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

  const inputAudioMinutes =
    extractFirstNumber(parsedInput, ["inputAudioMinutes", "input_audio_minutes", "audioMinutes", "audio_minutes"]) ??
    extractFirstNumber(body, ["inputAudioMinutes", "input_audio_minutes", "audioMinutes", "audio_minutes"]);
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
