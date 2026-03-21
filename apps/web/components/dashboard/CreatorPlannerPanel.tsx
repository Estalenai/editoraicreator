"use client";

type PlannerField = {
  label: string;
  value: string;
};

type Props = {
  title: string;
  objective: string;
  summary: string;
  steps: string[];
  settings: PlannerField[];
  parameters: PlannerField[];
  note?: string;
  continueLabel: string;
  busy?: boolean;
  onContinue: () => void;
  onEdit: () => void;
  onCancel: () => void;
};

function normalizeFields(items: PlannerField[]): PlannerField[] {
  return items.filter((item) => String(item?.value || "").trim().length > 0);
}

export function CreatorPlannerPanel({
  title,
  objective,
  summary,
  steps,
  settings,
  parameters,
  note,
  continueLabel,
  busy = false,
  onContinue,
  onEdit,
  onCancel,
}: Props) {
  const visibleSettings = normalizeFields(settings);
  const visibleParameters = normalizeFields(parameters);

  return (
    <section className="creator-planner-panel creator-planner-anchor layout-contract-item">
      <div className="creator-planner-head">
        <div className="section-stack-tight creator-planner-copy">
          <p className="section-kicker">Planner da IA</p>
          <h4 className="heading-reset">{title}</h4>
          <p className="helper-text-ea">{summary}</p>
        </div>
        <span className="premium-badge premium-badge-phase">Pré-execução</span>
      </div>

      <div className="creator-planner-objective">
        <strong>Objetivo detectado</strong>
        <span>{objective}</span>
      </div>

      <div className="creator-planner-grid">
        <div className="creator-planner-column">
          <div className="creator-planner-section-label">Etapas previstas</div>
          <ol className="creator-planner-list">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="creator-planner-column">
          {visibleSettings.length > 0 ? (
            <div className="creator-planner-section">
              <div className="creator-planner-section-label">Configurações principais</div>
              <div className="creator-planner-field-grid">
                {visibleSettings.map((item) => (
                  <div key={`${item.label}-${item.value}`} className="creator-planner-field">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {visibleParameters.length > 0 ? (
            <div className="creator-planner-section">
              <div className="creator-planner-section-label">Parâmetros principais</div>
              <div className="creator-planner-field-grid">
                {visibleParameters.map((item) => (
                  <div key={`${item.label}-${item.value}`} className="creator-planner-field">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {note ? <div className="creator-planner-note">{note}</div> : null}

      <div className="creator-planner-actions">
        <button type="button" className="btn-ea btn-primary" onClick={onContinue} disabled={busy}>
          {busy ? "Executando..." : continueLabel}
        </button>
        <button type="button" className="btn-ea btn-secondary" onClick={onEdit}>
          Editar plano
        </button>
        <button type="button" className="btn-ea btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
