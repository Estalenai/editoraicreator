"use client";

import { PremiumSelect } from "../ui/PremiumSelect";
import type { ExecutionCapabilities, AiExecutionUiMode, SelectOption } from "../../lib/aiExecution";

type Props = {
  capabilities: ExecutionCapabilities;
  mode: AiExecutionUiMode;
  onModeChange: (nextValue: string) => void | Promise<void>;
  modeDetail: string;
  availabilityNote: string;
  qualityOutputsLabel?: string | null;
  manualProvider: string;
  onManualProviderChange: (nextValue: string) => void;
  manualTier: string;
  onManualTierChange: (nextValue: string) => void;
  manualSelectionLabel: string | null;
  persistingPreference?: boolean;
  preferenceError?: string | null;
};

function hasMultipleOptions(options: SelectOption[]) {
  return Array.isArray(options) && options.length > 1;
}

export function AiExecutionModeFields({
  capabilities,
  mode,
  onModeChange,
  modeDetail,
  availabilityNote,
  qualityOutputsLabel = null,
  manualProvider,
  onManualProviderChange,
  manualTier,
  onManualTierChange,
  manualSelectionLabel,
  persistingPreference = false,
  preferenceError = null,
}: Props) {
  const showProviderSelect = mode === "manual" && hasMultipleOptions(capabilities.providerOptions);
  const showTierSelect = mode === "manual" && capabilities.manualModeLevel === "full" && hasMultipleOptions(capabilities.tierOptions);

  return (
    <>
      <div className="creator-section-label">Execução da IA</div>
      <div className="form-grid-2 creator-field-grid">
        <label className="field-label-ea">
          <span>Modo</span>
          <PremiumSelect
            value={mode}
            onChange={(next) => void onModeChange(next)}
            options={capabilities.modeOptions}
            ariaLabel="Modo de execução da IA"
          />
        </label>

        {showProviderSelect ? (
          <label className="field-label-ea">
            <span>Provider manual</span>
            <PremiumSelect
              value={manualProvider}
              onChange={onManualProviderChange}
              options={capabilities.providerOptions}
              ariaLabel="Provider manual"
            />
          </label>
        ) : null}

        {showTierSelect ? (
          <label className="field-label-ea">
            <span>Perfil do modelo</span>
            <PremiumSelect
              value={manualTier}
              onChange={onManualTierChange}
              options={capabilities.tierOptions}
              ariaLabel="Perfil do modelo manual"
            />
          </label>
        ) : null}
      </div>

      <div className="helper-note-inline">{modeDetail}</div>
      {manualSelectionLabel ? (
        <div className="helper-note-subtle">Rota manual atual: {manualSelectionLabel}.</div>
      ) : null}
      {qualityOutputsLabel ? (
        <div className="helper-note-subtle">Qualidade máxima do plano nesta trilha: {qualityOutputsLabel}.</div>
      ) : null}
      <div className="helper-note-subtle">{availabilityNote}</div>
      {mode !== "manual" ? (
        <div className="helper-note-subtle">
          {persistingPreference
            ? "Salvando sua preferência automática para a conta..."
            : "Quando você escolhe um perfil automático, ele vira o padrão da sua conta nesta experiência."}
        </div>
      ) : (
        <div className="helper-note-subtle">
          Manual vale só para esta execução e nunca altera a regra do seu plano.
        </div>
      )}
      {preferenceError ? (
        <div className="helper-note-subtle">
          Não foi possível salvar a preferência automática agora. A execução atual continua válida nesta tela.
        </div>
      ) : null}
    </>
  );
}
