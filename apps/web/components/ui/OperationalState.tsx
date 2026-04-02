import type { ReactNode } from "react";

export type OperationalStateKind =
  | "loading"
  | "success"
  | "error"
  | "empty"
  | "syncing"
  | "published"
  | "failed-publish"
  | "payment-processing"
  | "reconciliation"
  | "saved"
  | "unsaved"
  | "retry";

export type OperationalStateMetaTone = "default" | "success" | "warning" | "danger";

export type OperationalStateMetaItem = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: OperationalStateMetaTone;
};

type OperationalStateProps = {
  kind: OperationalStateKind;
  description: ReactNode;
  title?: ReactNode;
  badge?: ReactNode;
  emphasis?: ReactNode;
  meta?: OperationalStateMetaItem[];
  details?: ReactNode[];
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  compact?: boolean;
};

const OPERATIONAL_STATE_PRESETS: Record<OperationalStateKind, { badge: string; title: string }> = {
  loading: {
    badge: "Carregando",
    title: "Carregando dados",
  },
  success: {
    badge: "Sucesso",
    title: "Operação concluída",
  },
  error: {
    badge: "Erro",
    title: "Falha operacional",
  },
  empty: {
    badge: "Vazio",
    title: "Nada encontrado ainda",
  },
  syncing: {
    badge: "Sincronia",
    title: "Sincronizando alterações",
  },
  published: {
    badge: "Publicado",
    title: "Publicação registrada",
  },
  "failed-publish": {
    badge: "Publicação",
    title: "Falha ao publicar",
  },
  "payment-processing": {
    badge: "Pagamento",
    title: "Pagamento em processamento",
  },
  reconciliation: {
    badge: "Conciliação",
    title: "Conciliando pagamento e saldo",
  },
  saved: {
    badge: "Salvo",
    title: "Alterações salvas",
  },
  unsaved: {
    badge: "Pendente",
    title: "Alterações ainda não salvas",
  },
  retry: {
    badge: "Nova tentativa",
    title: "Ação precisa de nova tentativa",
  },
};

export function OperationalState({
  kind,
  description,
  title,
  badge,
  emphasis,
  meta = [],
  details = [],
  actions,
  footer,
  className = "",
  compact = false,
}: OperationalStateProps) {
  const preset = OPERATIONAL_STATE_PRESETS[kind];
  const role = kind === "error" || kind === "failed-publish" ? "alert" : "status";
  const ariaLive = kind === "error" || kind === "failed-publish" ? "assertive" : "polite";
  const rootClassName = [
    "state-ea",
    "state-ea-operational",
    compact ? "state-ea-operational-compact" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={rootClassName}
      data-operational-kind={kind}
      data-compact={compact ? "true" : undefined}
      role={role}
      aria-live={ariaLive}
    >
      <div className="operational-state-head">
        <div className="operational-state-copy">
          <span className="operational-state-badge">{badge ?? preset.badge}</span>
          <p className="state-ea-title">{title ?? preset.title}</p>
          <div className="state-ea-text">{description}</div>
        </div>
        {emphasis ? <div className="operational-state-emphasis">{emphasis}</div> : null}
      </div>

      {meta.length ? (
        <dl className="operational-state-meta-grid">
          {meta.map((item, index) => (
            <div
              key={`${item.label}-${index}`}
              className={[
                "operational-state-meta-item",
                item.tone ? `operational-state-meta-item-${item.tone}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
              {item.hint ? <p>{item.hint}</p> : null}
            </div>
          ))}
        </dl>
      ) : null}

      {details.length ? (
        <ul className="operational-state-details">
          {details.map((detail, index) => (
            <li key={index}>{detail}</li>
          ))}
        </ul>
      ) : null}

      {actions ? <div className="state-ea-actions operational-state-actions">{actions}</div> : null}
      {footer ? <div className="operational-state-footer">{footer}</div> : null}
    </section>
  );
}
