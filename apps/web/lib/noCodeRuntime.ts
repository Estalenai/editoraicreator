export type NoCodeProviderStatus = "real" | "prepared" | "disabled";
export type NoCodeExecutionMode = "automatic" | "manual";

export type NoCodeRuntimeProvider = {
  key: string;
  label: string;
  vendor: string;
  status: NoCodeProviderStatus;
  allowed_by_plan: boolean;
  automatic_candidate: boolean;
  manual_selectable: boolean;
  advanced_only: boolean;
  credit_type: "common" | "pro" | "ultra" | null;
  runtime_delivery_status: string;
  public_readiness: string;
  capabilities: {
    can_plan: boolean;
    can_propose_patch: boolean;
    can_prepare_file_operations: boolean;
    can_apply_after_approval: boolean;
    can_generate_rollback_metadata: boolean;
    supports_diff_patch: boolean;
    supports_rollback: boolean;
    sandboxed: boolean;
  };
};

export type NoCodeRuntimeSnapshot = {
  ok?: boolean;
  plan_code: string;
  plan_availability: string;
  feature_key: "creator_no_code";
  feature_enabled: boolean;
  feature_status: string;
  base_experience_enabled: boolean;
  base_experience_status: string;
  base_credit_type: "common" | "pro" | "ultra";
  integration_status: string;
  advanced_execution_enabled: boolean;
  advanced_execution_status: string;
  advanced_credit_type: "common" | "pro" | "ultra" | null;
  current_runtime_feature: string | null;
  inherits_from: string[];
  execution: {
    default_mode: NoCodeExecutionMode;
    automatic_profile_default: string;
    automatic_primary: boolean;
    manual_allowed: boolean;
    manual_mode_level: string;
    provider_order: string[];
  };
  security: {
    access_scope: string;
    sandbox_profile: string;
    allow_full_repository_access: boolean;
    destructive_operations_allowed: boolean;
    tool_permissions: string[];
    approval_required_operations: string[];
  };
  approvals: {
    apply_patch_required: boolean;
    default_state: string;
    states: string[];
  };
  rollback: {
    supported: boolean;
    metadata_required: boolean;
    strategy: string;
  };
  providers: NoCodeRuntimeProvider[];
  notes: string[];
};

export function sanitizeNoCodeRuntimeForProject(snapshot: NoCodeRuntimeSnapshot | null) {
  if (!snapshot) return null;
  return {
    plan_code: snapshot.plan_code,
    plan_availability: snapshot.plan_availability,
    feature_status: snapshot.feature_status,
    base_experience_enabled: snapshot.base_experience_enabled,
    base_experience_status: snapshot.base_experience_status,
    base_credit_type: snapshot.base_credit_type,
    integration_status: snapshot.integration_status,
    advanced_execution_enabled: snapshot.advanced_execution_enabled,
    advanced_execution_status: snapshot.advanced_execution_status,
    advanced_credit_type: snapshot.advanced_credit_type,
    current_runtime_feature: snapshot.current_runtime_feature,
    inherits_from: [...snapshot.inherits_from],
    execution: {
      default_mode: snapshot.execution.default_mode,
      automatic_profile_default: snapshot.execution.automatic_profile_default,
      manual_allowed: snapshot.execution.manual_allowed,
      manual_mode_level: snapshot.execution.manual_mode_level,
      provider_order: [...snapshot.execution.provider_order],
    },
    security: {
      access_scope: snapshot.security.access_scope,
      sandbox_profile: snapshot.security.sandbox_profile,
      allow_full_repository_access: snapshot.security.allow_full_repository_access,
      destructive_operations_allowed: snapshot.security.destructive_operations_allowed,
      tool_permissions: [...snapshot.security.tool_permissions],
      approval_required_operations: [...snapshot.security.approval_required_operations],
    },
    approvals: {
      apply_patch_required: snapshot.approvals.apply_patch_required,
      default_state: snapshot.approvals.default_state,
    },
    rollback: {
      supported: snapshot.rollback.supported,
      metadata_required: snapshot.rollback.metadata_required,
      strategy: snapshot.rollback.strategy,
    },
    providers: snapshot.providers.map((provider) => ({
      key: provider.key,
      vendor: provider.vendor,
      status: provider.status,
      allowed_by_plan: provider.allowed_by_plan,
      advanced_only: provider.advanced_only,
      credit_type: provider.credit_type,
      runtime_delivery_status: provider.runtime_delivery_status,
      capabilities: { ...provider.capabilities },
    })),
    notes: [...snapshot.notes],
  };
}
