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
      ? "Salvando o ajuste para a conta..."
      : "O apoio padrão fica ativo nesta experiência."
    : "A escolha manual vale apenas para esta criação.";
  const planNotes = [
    manualSelectionLabel ? `Escolha desta criação: ${manualSelectionLabel}.` : null,
    qualityOutputsLabel ? `Perfil disponível nesta trilha: ${qualityOutputsLabel}.` : null,
    availabilityNote,
    preferenceNote,
    preferenceError ? "Não foi possível salvar o ajuste agora. A criação atual continua válida nesta tela." : null,
  ].filter((note): note is string => Boolean(note));

  return (
    <div className="creator-ai-assist-fields">
      <div className="creator-section-label">Como o apoio trabalha</div>
      <div className="form-grid-2 creator-field-grid">
        <label className="field-label-ea">
          <span>Ritmo do apoio</span>
          <PremiumSelect
            value={mode}
            onChange={(next) => void onModeChange(next)}
            options={capabilities.modeOptions}
            ariaLabel="Ritmo do apoio"
          />
        </label>

        {showProviderSelect ? (
          <label className="field-label-ea">
            <span>Fonte do apoio</span>
            <PremiumSelect
              value={manualProvider}
              onChange={onManualProviderChange}
              options={capabilities.providerOptions}
              ariaLabel="Fonte do apoio"
            />
          </label>
        ) : null}

        {showTierSelect ? (
          <label className="field-label-ea">
            <span>Perfil do apoio</span>
            <PremiumSelect
              value={manualTier}
              onChange={onManualTierChange}
              options={capabilities.tierOptions}
              ariaLabel="Perfil do apoio"
            />
          </label>
        ) : null}
      </div>

      <div className="creator-ai-assist-notes">
        <div className="helper-note-inline creator-ai-assist-primary-note">{modeDetail}</div>
        <details className="creator-ai-assist-details">
          <summary>Ver detalhes do apoio</summary>
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
