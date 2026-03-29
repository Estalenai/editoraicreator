import { getPlanLimitMatrix, normalizePlanMatrixCode } from "./planLimitsMatrix.js";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

function envFlagEnabled(...names) {
  for (const name of names) {
    const raw = String(process.env?.[name] || "")
      .trim()
      .toLowerCase();
    if (ENABLED_VALUES.has(raw)) return true;
  }
  return false;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function inferRecommendedStorageMode(planMatrix, storagePolicy) {
  const explicit = String(storagePolicy?.recommended_storage_mode || "").trim().toLowerCase();
  if (explicit) return explicit;

  const normalizedCode = String(planMatrix?.code || "").trim().toUpperCase();
  if (normalizedCode === "ENTERPRISE" || normalizedCode === "EMPRESARIAL") {
    return "connected_or_dedicated";
  }
  if (normalizedCode === "EDITOR_PRO" || normalizedCode === "EDITOR_ULTRA") {
    return "hybrid";
  }
  return "platform_temporary";
}

export function getStorageRuntimeAvailability() {
  return {
    platform_temporary_storage_available: true,
    direct_upload_available: envFlagEnabled(
      "STORAGE_DIRECT_UPLOAD_ENABLED",
      "SUPABASE_DIRECT_UPLOAD_ENABLED",
      "DIRECT_UPLOAD_ENABLED"
    ),
    connected_storage_available: envFlagEnabled(
      "CONNECTED_STORAGE_ENABLED",
      "CONNECTED_STORAGE_INTEGRATION_ENABLED",
      "USER_CONNECTED_STORAGE_ENABLED"
    ),
  };
}

export function getPlanStoragePolicySnapshot(planCode, { domain = "usage" } = {}) {
  const normalizedPlanCode = normalizePlanMatrixCode(planCode, domain);
  const planMatrix = getPlanLimitMatrix(normalizedPlanCode, { domain });
  const uploadLimits = planMatrix?.upload_limits || {};
  const storagePolicy = planMatrix?.storage_policy || {};
  const runtime = getStorageRuntimeAvailability();

  return {
    plan_code: normalizedPlanCode,
    availability: String(planMatrix?.availability || "hidden_beta"),
    onboarding_required: storagePolicy?.onboarding_required === true,
    recommended_storage_mode: inferRecommendedStorageMode(planMatrix, storagePolicy),
    platform_temporary_storage_allowed: storagePolicy?.platform_temporary_storage_allowed !== false,
    direct_upload_required_when_large: storagePolicy?.direct_upload_required_when_large === true,
    connected_storage_required_when_heavy: storagePolicy?.connected_storage_required_when_heavy === true,
    connected_storage_required_for_long_retention:
      storagePolicy?.connected_storage_required_for_long_retention === true,
    inline_upload_max_file_size_mb: toFiniteNumber(uploadLimits?.max_file_size_mb),
    direct_upload_max_file_size_mb: toFiniteNumber(uploadLimits?.direct_upload_max_file_size_mb),
    files_per_job: toFiniteNumber(uploadLimits?.files_per_job),
    files_per_day: toFiniteNumber(uploadLimits?.files_per_day),
    runtime,
  };
}
