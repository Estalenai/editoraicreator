export const NO_CODE_PROVIDER_STATUS = {
  REAL: "real",
  PREPARED: "prepared",
  DISABLED: "disabled",
};

export const NO_CODE_EXECUTION_MODE = {
  AUTOMATIC: "automatic",
  MANUAL: "manual",
};

export const NO_CODE_APPROVAL_STATE = {
  NOT_REQUIRED: "not_required",
  REQUIRED: "required",
  APPROVED: "approved",
  REJECTED: "rejected",
  APPLIED: "applied",
  ROLLED_BACK: "rolled_back",
};

export const NO_CODE_PATCH_FORMAT = {
  UNIFIED_DIFF: "unified_diff",
  APPLY_PATCH: "apply_patch",
};

export const NO_CODE_FILE_OPERATION_TYPE = {
  CREATE_FILE: "create_file",
  UPDATE_FILE: "update_file",
  RENAME_FILE: "rename_file",
  DELETE_FILE: "delete_file",
  CREATE_DIRECTORY: "create_directory",
  MOVE_FILE: "move_file",
};

function cloneValue(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function buildNoCodeProviderCapabilities({
  canPlan = true,
  canProposePatch = true,
  canPrepareFileOperations = true,
  canApplyAfterApproval = true,
  canGenerateRollbackMetadata = true,
  supportsDiffPatch = true,
  supportsRollback = true,
  sandboxed = true,
} = {}) {
  return {
    can_plan: canPlan === true,
    can_propose_patch: canProposePatch === true,
    can_prepare_file_operations: canPrepareFileOperations === true,
    can_apply_after_approval: canApplyAfterApproval === true,
    can_generate_rollback_metadata: canGenerateRollbackMetadata === true,
    supports_diff_patch: supportsDiffPatch === true,
    supports_rollback: supportsRollback === true,
    sandboxed: sandboxed === true,
  };
}

export function buildNoCodeExecutionMode({
  mode = NO_CODE_EXECUTION_MODE.AUTOMATIC,
  automaticProfile = "quality",
  automaticDefault = true,
  manualAllowed = false,
  manualModeLevel = "none",
} = {}) {
  return {
    mode: mode === NO_CODE_EXECUTION_MODE.MANUAL ? NO_CODE_EXECUTION_MODE.MANUAL : NO_CODE_EXECUTION_MODE.AUTOMATIC,
    automatic_profile: String(automaticProfile || "quality").trim().toLowerCase() || "quality",
    automatic_default: automaticDefault === true,
    manual_allowed: manualAllowed === true,
    manual_mode_level: String(manualModeLevel || "none").trim().toLowerCase() || "none",
  };
}

export function buildNoCodeFileOperation({
  type = NO_CODE_FILE_OPERATION_TYPE.UPDATE_FILE,
  path = "",
  nextPath = null,
  reason = "",
  approvalRequired = true,
} = {}) {
  return {
    type,
    path: String(path || "").trim(),
    next_path: nextPath == null ? null : String(nextPath).trim() || null,
    reason: String(reason || "").trim() || null,
    approval_required: approvalRequired === true,
  };
}

export function buildNoCodePatch({
  patchId = null,
  format = NO_CODE_PATCH_FORMAT.UNIFIED_DIFF,
  diff = "",
  files = [],
  applyRequiresApproval = true,
  rollbackId = null,
} = {}) {
  return {
    patch_id: patchId == null ? null : String(patchId).trim() || null,
    format: format === NO_CODE_PATCH_FORMAT.APPLY_PATCH ? NO_CODE_PATCH_FORMAT.APPLY_PATCH : NO_CODE_PATCH_FORMAT.UNIFIED_DIFF,
    diff: String(diff || ""),
    files: Array.isArray(files) ? files.map((file) => buildNoCodeFileOperation(file)) : [],
    apply_requires_approval: applyRequiresApproval === true,
    rollback_id: rollbackId == null ? null : String(rollbackId).trim() || null,
  };
}

export function buildNoCodeApprovalState({
  state = NO_CODE_APPROVAL_STATE.REQUIRED,
  required = true,
  approvedBy = null,
  approvedAt = null,
  reason = null,
} = {}) {
  return {
    state: Object.values(NO_CODE_APPROVAL_STATE).includes(state) ? state : NO_CODE_APPROVAL_STATE.REQUIRED,
    required: required === true,
    approved_by: approvedBy == null ? null : String(approvedBy).trim() || null,
    approved_at: approvedAt == null ? null : String(approvedAt).trim() || null,
    reason: reason == null ? null : String(reason).trim() || null,
  };
}

export function buildNoCodeRollbackMetadata({
  rollbackId = null,
  supported = true,
  strategy = "patch_reverse",
  restoredFiles = [],
} = {}) {
  return {
    rollback_id: rollbackId == null ? null : String(rollbackId).trim() || null,
    supported: supported === true,
    strategy: String(strategy || "patch_reverse").trim() || "patch_reverse",
    restored_files: Array.isArray(restoredFiles)
      ? restoredFiles.map((file) => String(file || "").trim()).filter(Boolean)
      : [],
  };
}

export function buildNoCodePlan({
  provider = null,
  executionMode = null,
  objective = null,
  summary = null,
  fileOperations = [],
  approvalState = null,
  rollback = null,
  toolPermissions = [],
  sandboxScope = "project_workspace",
} = {}) {
  return {
    provider: provider == null ? null : String(provider).trim().toLowerCase() || null,
    execution_mode: executionMode ? buildNoCodeExecutionMode(executionMode) : null,
    objective: objective == null ? null : String(objective).trim() || null,
    summary: summary == null ? null : String(summary).trim() || null,
    file_operations: Array.isArray(fileOperations) ? fileOperations.map((item) => buildNoCodeFileOperation(item)) : [],
    approval_state: approvalState ? buildNoCodeApprovalState(approvalState) : null,
    rollback: rollback ? buildNoCodeRollbackMetadata(rollback) : null,
    tool_permissions: Array.isArray(toolPermissions)
      ? toolPermissions.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    sandbox_scope: String(sandboxScope || "project_workspace").trim() || "project_workspace",
  };
}

export function buildNoCodeContractTemplates() {
  return cloneValue({
    no_code_execution_mode: buildNoCodeExecutionMode(),
    no_code_file_operation: buildNoCodeFileOperation(),
    no_code_patch: buildNoCodePatch(),
    no_code_approval_state: buildNoCodeApprovalState(),
    no_code_rollback_metadata: buildNoCodeRollbackMetadata(),
    no_code_plan: buildNoCodePlan(),
  });
}
