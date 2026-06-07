"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import {
  type AiExecutionFeature,
  type AiExecutionUiMode,
  type AutomaticExecutionPreference,
  buildExecutionCapabilities,
  buildExecutionRoutingPayload,
  formatQualityOutputs,
  getExecutionModeLabel,
  getTierLabel,
  resolveCatalogPlan,
  resolveDefaultManualTier,
  type CatalogPlanExecution,
} from "../lib/aiExecution";

type CatalogPayload = {
  plans?: CatalogPlanExecution[];
};

type Options = {
  planCode: string | null | undefined;
  feature: AiExecutionFeature;
  automaticPreference: AutomaticExecutionPreference;
  onAutomaticPreferenceChange: (nextValue: AutomaticExecutionPreference) => Promise<void>;
};

export function useAiExecutionMode({
  planCode,
  feature,
  automaticPreference,
  onAutomaticPreferenceChange,
}: Options) {
  const [plans, setPlans] = useState<CatalogPlanExecution[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCatalog() {
      try {
        setLoadingCatalog(true);
        setCatalogError(null);
        const res = await apiFetch("/api/plans/catalog?lang=pt-BR");
        if (!res.ok) throw new Error("plan_catalog_unavailable");
        const payload = (await res.json().catch(() => null)) as CatalogPayload | null;
        if (!mounted) return;
        setPlans(Array.isArray(payload?.plans) ? payload.plans : []);
      } catch (error: any) {
        if (!mounted) return;
        setPlans([]);
        setCatalogError(String(error?.message || "plan_catalog_unavailable"));
      } finally {
        if (mounted) setLoadingCatalog(false);
      }
    }

    void loadCatalog();
    return () => {
      mounted = false;
    };
  }, []);

  const plan = useMemo(() => resolveCatalogPlan(plans, planCode), [plans, planCode]);
  const capabilities = useMemo(() => buildExecutionCapabilities(plan, feature, planCode), [feature, plan, planCode]);
  const preferredAutomaticMode =
    automaticPreference === "automatic_economy" && capabilities.economyAvailable
      ? "automatic_economy"
      : "automatic_quality";

  const [mode, setMode] = useState<AiExecutionUiMode>(preferredAutomaticMode);
  const [manualProvider, setManualProvider] = useState<string>("");
  const [manualTier, setManualTier] = useState<string>("");
  const [persistingPreference, setPersistingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  useEffect(() => {
    setMode((current) => {
      if (current === "manual" && capabilities.manualAvailable) return current;
      return preferredAutomaticMode;
    });
  }, [capabilities.manualAvailable, preferredAutomaticMode]);

  useEffect(() => {
    const nextProvider = capabilities.providerOptions[0]?.value || "";
    setManualProvider((current) =>
      capabilities.providerOptions.some((option) => option.value === current) ? current : nextProvider
    );
  }, [capabilities.providerOptions]);

  useEffect(() => {
    const defaultTier = resolveDefaultManualTier(capabilities.tierOptions);
    setManualTier((current) =>
      capabilities.tierOptions.some((option) => option.value === current) ? current : defaultTier
    );
  }, [capabilities.tierOptions]);

  const handleModeChange = useCallback(
    async (nextValue: string) => {
      const nextMode = String(nextValue || "automatic_quality") as AiExecutionUiMode;
      setMode(nextMode);
      if (nextMode !== "automatic_quality" && nextMode !== "automatic_economy") return;

      setPersistingPreference(true);
      setPreferenceError(null);
      try {
        await onAutomaticPreferenceChange(nextMode);
      } catch (error: any) {
        setPreferenceError(String(error?.message || "execution_preference_save_failed"));
      } finally {
        setPersistingPreference(false);
      }
    },
    [onAutomaticPreferenceChange]
  );

  const routing = useMemo(
    () =>
      buildExecutionRoutingPayload({
        mode,
        manualProvider: mode === "manual" ? manualProvider : null,
        manualTier:
          mode === "manual" && capabilities.manualModeLevel === "full" ? manualTier : null,
      }),
    [capabilities.manualModeLevel, manualProvider, manualTier, mode]
  );

  const modeLabel = useMemo(() => getExecutionModeLabel(mode), [mode]);
  const manualSelectionLabel = useMemo(() => {
    if (mode !== "manual") return null;
    const providerLabel =
      capabilities.providerOptions.find((option) => option.value === manualProvider)?.label || "Rota do plano";
    if (capabilities.manualModeLevel !== "full") return providerLabel;
    return `${providerLabel} · ${getTierLabel(manualTier)}`;
  }, [capabilities.manualModeLevel, capabilities.providerOptions, manualProvider, manualTier, mode]);

  const modeDetail = useMemo(() => {
    if (mode === "automatic_economy") {
      return "Prioriza uma criação mais econômica dentro do plano.";
    }
    if (mode === "manual") {
      if (capabilities.manualModeLevel === "full") {
        return "Você escolhe como o assistente trabalha dentro do plano.";
      }
      return "Você escolhe a fonte principal dentro do que o plano permite.";
    }
    return "O assistente escolhe automaticamente a melhor opção disponível no seu plano.";
  }, [capabilities.manualModeLevel, mode]);

  const availabilityNote = useMemo(() => {
    if (capabilities.mockOnly) {
      return "Este formato ainda está em validação no plano atual.";
    }
    if (!capabilities.featureAvailable) {
      return "Este formato ainda não está liberado para o plano atual.";
    }
    if (!capabilities.manualAvailable) {
      return "Seu plano usa apoio padrão. A escolha manual aparece quando estiver liberada.";
    }
    if (capabilities.manualModeLevel === "limited") {
      return "Escolha manual limitada: você define a fonte principal e mantém o plano protegido.";
    }
    return "Se alguma opção ficar fora do plano, avisamos antes de consumir o uso disponível.";
  }, [capabilities.featureAvailable, capabilities.manualAvailable, capabilities.manualModeLevel, capabilities.mockOnly]);

  const qualityOutputsLabel = useMemo(() => {
    if (feature !== "video") return null;
    return formatQualityOutputs(capabilities.qualityOutputs);
  }, [capabilities.qualityOutputs, feature]);

  return {
    plan,
    loadingCatalog,
    catalogError,
    capabilities,
    mode,
    modeLabel,
    modeDetail,
    handleModeChange,
    manualProvider,
    setManualProvider,
    manualTier,
    setManualTier,
    manualSelectionLabel,
    availabilityNote,
    qualityOutputsLabel,
    routing,
    persistingPreference,
    preferenceError,
  };
}
