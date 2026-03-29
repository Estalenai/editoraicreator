import { getPlanLimitMatrix, normalizePlanMatrixCode } from "./planLimitsMatrix.js";
import { getPlanRuntimeMatrix } from "./planRuntimeGuards.js";
import {
  NO_CODE_APPROVAL_STATE,
  NO_CODE_EXECUTION_MODE,
  NO_CODE_FILE_OPERATION_TYPE,
  NO_CODE_PATCH_FORMAT,
  NO_CODE_PROVIDER_STATUS,
  buildNoCodeApprovalState,
  buildNoCodeContractTemplates,
  buildNoCodePlan,
  buildNoCodeProviderCapabilities,
  buildNoCodeRollbackMetadata,
} from "./noCodeContracts.js";

function cloneValue(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

const NO_CODE_PROVIDER_REGISTRY = {
  codex: {
    key: "codex",
    label: "Codex",
    vendor: "openai",
    status: NO_CODE_PROVIDER_STATUS.PREPARED,
    runtime_delivery_status: "prepared",
    public_readiness: "future_only",
    capabilities: buildNoCodeProviderCapabilities(),
    supported_patch_formats: [NO_CODE_PATCH_FORMAT.UNIFIED_DIFF, NO_CODE_PATCH_FORMAT.APPLY_PATCH],
    supported_file_operations: [
      NO_CODE_FILE_OPERATION_TYPE.CREATE_FILE,
      NO_CODE_FILE_OPERATION_TYPE.UPDATE_FILE,
      NO_CODE_FILE_OPERATION_TYPE.RENAME_FILE,
      NO_CODE_FILE_OPERATION_TYPE.CREATE_DIRECTORY,
    ],
  },
  claude_code: {
    key: "claude_code",
    label: "Claude Code",
    vendor: "anthropic",
    status: NO_CODE_PROVIDER_STATUS.PREPARED,
    runtime_delivery_status: "prepared",
    public_readiness: "future_only",
    capabilities: buildNoCodeProviderCapabilities(),
    supported_patch_formats: [NO_CODE_PATCH_FORMAT.UNIFIED_DIFF, NO_CODE_PATCH_FORMAT.APPLY_PATCH],
    supported_file_operations: [
      NO_CODE_FILE_OPERATION_TYPE.CREATE_FILE,
      NO_CODE_FILE_OPERATION_TYPE.UPDATE_FILE,
      NO_CODE_FILE_OPERATION_TYPE.RENAME_FILE,
      NO_CODE_FILE_OPERATION_TYPE.CREATE_DIRECTORY,
    ],
  },
};

function normalizeNoCodeProvider(providerKey) {
  return String(providerKey || "").trim().toLowerCase();
}

function resolvePlanNoCodeConfig(planCode) {
  const normalizedPlan = normalizePlanMatrixCode(planCode, "usage");
  const planMatrix = getPlanLimitMatrix(normalizedPlan, { domain: "usage" });
  const runtimeMatrix = getPlanRuntimeMatrix(normalizedPlan);
  const noCodeConfig = planMatrix?.no_code && typeof planMatrix.no_code === "object" ? planMatrix.no_code : {};

  return {
    normalizedPlan,
    planMatrix,
    runtimeMatrix,
    noCodeConfig,
  };
}

function buildSecuritySnapshot(noCodeConfig = {}) {
  const securityPolicy = noCodeConfig?.security_policy || {};
  return {
    access_scope: String(securityPolicy.access_scope || "project_workspace").trim() || "project_workspace",
    sandbox_profile: String(securityPolicy.sandbox_profile || "restricted_project_patch").trim() || "restricted_project_patch",
    allow_full_repository_access: securityPolicy.allow_full_repository_access === true,
    destructive_operations_allowed: securityPolicy.destructive_operations_allowed === true,
    tool_permissions: Array.isArray(securityPolicy.tool_permissions)
      ? securityPolicy.tool_permissions.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    approval_required_operations: Array.isArray(securityPolicy.approval_required_operations)
      ? securityPolicy.approval_required_operations.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
  };
}

function buildProviderRuntimeSnapshot(providerKey, { noCodeConfig, providerOrder = [], planEnabled = false }) {
  const normalizedProvider = normalizeNoCodeProvider(providerKey);
  const registryEntry = NO_CODE_PROVIDER_REGISTRY[normalizedProvider];
  if (!registryEntry) return null;

  const allowedProviders = Array.isArray(noCodeConfig?.provider_order)
    ? noCodeConfig.provider_order.map(normalizeNoCodeProvider).filter(Boolean)
    : [];
  const allowedByPlan = planEnabled && allowedProviders.includes(normalizedProvider);
  const position = providerOrder.findIndex((item) => item === normalizedProvider);

  return {
    ...cloneValue(registryEntry),
    allowed_by_plan: allowedByPlan,
    automatic_candidate: allowedByPlan,
    manual_selectable: allowedByPlan && registryEntry.status === NO_CODE_PROVIDER_STATUS.REAL,
    status: registryEntry.status,
    sort_order: position >= 0 ? position : providerOrder.length,
  };
}

export function getNoCodeProviderRegistry() {
  return cloneValue(Object.values(NO_CODE_PROVIDER_REGISTRY));
}

export function isNoCodeFeatureEnabled(planCode) {
  const { noCodeConfig } = resolvePlanNoCodeConfig(planCode);
  return noCodeConfig?.enabled === true;
}

export function validateNoCodeRequest({ planCode, mode = "automatic", provider = null } = {}) {
  const { normalizedPlan, noCodeConfig, runtimeMatrix } = resolvePlanNoCodeConfig(planCode);
  if (noCodeConfig?.enabled !== true) {
    return {
      ok: false,
      status: 403,
      error: "no_code_not_available_for_plan",
      message: "Creator No Code nao esta liberado para este plano.",
      plan: normalizedPlan,
      details: {
        base_experience_status: noCodeConfig?.base_experience_status || "disabled",
      },
    };
  }

  const normalizedMode = String(mode || NO_CODE_EXECUTION_MODE.AUTOMATIC).trim().toLowerCase();
  const runtimeRules = runtimeMatrix?.runtime_rules || {};
  const noCodeManualAllowed = noCodeConfig?.manual_mode_allowed === true && runtimeRules.manual_mode_allowed === true;
  if (normalizedMode === NO_CODE_EXECUTION_MODE.MANUAL && !noCodeManualAllowed) {
    return {
      ok: false,
      status: 403,
      error: "no_code_manual_not_allowed_for_plan",
      message: "A selecao manual do Creator No Code nao esta liberada para este plano.",
      plan: normalizedPlan,
      details: {
        manual_mode_level: noCodeConfig?.manual_mode_level || runtimeRules.manual_mode_level || "none",
      },
    };
  }

  const requestedProvider = normalizeNoCodeProvider(provider);
  if (requestedProvider) {
    const providerSnapshot = buildProviderRuntimeSnapshot(requestedProvider, {
      noCodeConfig,
      providerOrder: Array.isArray(noCodeConfig?.provider_order)
        ? noCodeConfig.provider_order.map(normalizeNoCodeProvider).filter(Boolean)
        : [],
      planEnabled: true,
    });
    if (!providerSnapshot || !providerSnapshot.allowed_by_plan) {
      return {
        ok: false,
        status: 403,
        error: "no_code_provider_not_allowed_for_plan",
        message: "O provider solicitado nao esta liberado para o Creator No Code neste plano.",
        plan: normalizedPlan,
        details: {
          provider: requestedProvider,
        },
      };
    }
    if (providerSnapshot.status !== NO_CODE_PROVIDER_STATUS.REAL) {
      return {
        ok: false,
        status: 409,
        error: "no_code_provider_not_active",
        message: "O provider solicitado ainda esta apenas preparado para integracao e nao pode executar patches reais.",
        plan: normalizedPlan,
        details: {
          provider: requestedProvider,
          provider_status: providerSnapshot.status,
        },
      };
    }
  }

  return { ok: true };
}

export function buildNoCodeRuntimeSnapshot(planCode) {
  const { normalizedPlan, planMatrix, runtimeMatrix, noCodeConfig } = resolvePlanNoCodeConfig(planCode);
  const providerOrder = Array.isArray(noCodeConfig?.provider_order)
    ? noCodeConfig.provider_order.map(normalizeNoCodeProvider).filter(Boolean)
    : [];
  const providers = providerOrder
    .map((providerKey) =>
      buildProviderRuntimeSnapshot(providerKey, {
        noCodeConfig,
        providerOrder,
        planEnabled: noCodeConfig?.enabled === true,
      })
    )
    .filter(Boolean);

  const runtimeRules = runtimeMatrix?.runtime_rules || {};
  const executionMode = {
    default_mode:
      String(noCodeConfig?.execution_mode_default || NO_CODE_EXECUTION_MODE.AUTOMATIC).trim().toLowerCase() ===
      NO_CODE_EXECUTION_MODE.MANUAL
        ? NO_CODE_EXECUTION_MODE.MANUAL
        : NO_CODE_EXECUTION_MODE.AUTOMATIC,
    automatic_profile_default:
      String(noCodeConfig?.automatic_profile_default || "quality").trim().toLowerCase() || "quality",
    automatic_primary: noCodeConfig?.automatic_primary !== false,
    manual_allowed: noCodeConfig?.manual_mode_allowed === true && runtimeRules.manual_mode_allowed === true,
    manual_mode_level:
      String(noCodeConfig?.manual_mode_level || runtimeRules.manual_mode_level || "none").trim().toLowerCase() || "none",
    provider_order: providerOrder,
  };

  const contracts = buildNoCodeContractTemplates();
  const security = buildSecuritySnapshot(noCodeConfig);
  const applyPatchRequired = noCodeConfig?.apply_patch_requires_approval !== false;
  const rollbackSupported = noCodeConfig?.rollback_supported !== false;

  return cloneValue({
    plan_code: normalizedPlan,
    plan_availability: String(planMatrix?.availability || "hidden_beta"),
    feature_key: "creator_no_code",
    feature_enabled: noCodeConfig?.enabled === true,
    feature_status: String(noCodeConfig?.feature_status || "disabled"),
    base_experience_status: String(noCodeConfig?.base_experience_status || "disabled"),
    integration_status: String(noCodeConfig?.integration_status || "prepared"),
    current_runtime_feature: String(noCodeConfig?.current_runtime_feature || "").trim() || null,
    inherits_from: Array.isArray(noCodeConfig?.inherits_from)
      ? noCodeConfig.inherits_from.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    execution: executionMode,
    security,
    approvals: {
      apply_patch_required: applyPatchRequired,
      default_state: applyPatchRequired ? NO_CODE_APPROVAL_STATE.REQUIRED : NO_CODE_APPROVAL_STATE.NOT_REQUIRED,
      states: Object.values(NO_CODE_APPROVAL_STATE),
      template: buildNoCodeApprovalState({
        state: applyPatchRequired ? NO_CODE_APPROVAL_STATE.REQUIRED : NO_CODE_APPROVAL_STATE.NOT_REQUIRED,
        required: applyPatchRequired,
      }),
    },
    rollback: {
      supported: rollbackSupported,
      metadata_required: noCodeConfig?.rollback_metadata_required !== false,
      strategy: String(noCodeConfig?.rollback_strategy || "patch_reverse").trim() || "patch_reverse",
      template: buildNoCodeRollbackMetadata({
        supported: rollbackSupported,
        strategy: String(noCodeConfig?.rollback_strategy || "patch_reverse").trim() || "patch_reverse",
      }),
    },
    providers,
    contracts: {
      templates: contracts,
      provider_capabilities: providers.map((providerEntry) => ({
        key: providerEntry.key,
        status: providerEntry.status,
        capabilities: providerEntry.capabilities,
      })),
      plan_template: buildNoCodePlan({
        provider: providers[0]?.key || null,
        executionMode: {
          mode: executionMode.default_mode,
          automaticProfile: executionMode.automatic_profile_default,
          automaticDefault: executionMode.default_mode === NO_CODE_EXECUTION_MODE.AUTOMATIC,
          manualAllowed: executionMode.manual_allowed,
          manualModeLevel: executionMode.manual_mode_level,
        },
        approvalState: {
          state: applyPatchRequired ? NO_CODE_APPROVAL_STATE.REQUIRED : NO_CODE_APPROVAL_STATE.NOT_REQUIRED,
          required: applyPatchRequired,
        },
        rollback: {
          supported: rollbackSupported,
          strategy: String(noCodeConfig?.rollback_strategy || "patch_reverse").trim() || "patch_reverse",
        },
        toolPermissions: security.tool_permissions,
        sandboxScope: security.access_scope,
      }),
    },
    notes: Array.isArray(noCodeConfig?.notes)
      ? noCodeConfig.notes.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
  });
}
