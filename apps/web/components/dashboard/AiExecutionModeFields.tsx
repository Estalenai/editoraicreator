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
  const preferenceNote = mode !== "manual"
    ? persistingPreference
      ? "Salvando a preferência para a conta..."
      : "O modo automático fica como padrão desta experiência."
    : "A escolha manual vale apenas para esta geração.";
  const planNotes = [
    manualSelectionLabel ? `Seleção desta geração: ${manualSelectionLabel}.` : null,
    qualityOutputsLabel ? `Perfil de qualidade disponível nesta trilha: ${qualityOutputsLabel}.` : null,
    availabilityNote,
    preferenceNote,
    preferenceError ? "Não foi possível salvar a preferência automática agora. A execução atual continua válida nesta tela." : null,
  ].filter((note): note is string => Boolean(note));

  return (
    <div className="creator-ai-assist-fields">
      <div className="creator-section-label">Preferência de assistência</div>
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
            <span>Fonte</span>
            <PremiumSelect
              value={manualProvider}
              onChange={onManualProviderChange}
              options={capabilities.providerOptions}
              ariaLabel="Fonte da assistência"
            />
          </label>
        ) : null}

        {showTierSelect ? (
          <label className="field-label-ea">
            <span>Perfil</span>
            <PremiumSelect
              value={manualTier}
              onChange={onManualTierChange}
              options={capabilities.tierOptions}
              ariaLabel="Perfil da assistência"
            />
          </label>
        ) : null}
      </div>

      <div className="creator-ai-assist-notes">
        <div className="helper-note-inline creator-ai-assist-primary-note">{modeDetail}</div>
        <details className="creator-ai-assist-details">
          <summary>Detalhes do plano</summary>
          <div className="creator-ai-assist-detail-list">
            {planNotes.map((note) => (
              <div key={note} className="helper-note-subtle">{note}</div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
