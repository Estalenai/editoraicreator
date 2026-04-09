import type { ReactNode } from "react";

type RouteBoundaryFrameProps = {
  kicker: string;
  badge: string;
  title: string;
  description: string;
  asideTitle: string;
  asideItems: ReactNode[];
  actions?: ReactNode;
  emphasis?: ReactNode;
  shellClassName?: string;
  contentClassName?: string;
};

export function RouteBoundaryFrame({
  kicker,
  badge,
  title,
  description,
  asideTitle,
  asideItems,
  actions,
  emphasis,
  shellClassName = "",
  contentClassName = "",
}: RouteBoundaryFrameProps) {
  return (
    <div className={["page-shell", "route-boundary-page", shellClassName].filter(Boolean).join(" ")}>
      <section className="surface-flow-hero route-boundary-shell">
        <div className={["hero-split", "route-boundary-grid", contentClassName].filter(Boolean).join(" ")}>
          <div className="route-boundary-copy section-stack">
            <p className="section-kicker">{kicker}</p>
            <div className="route-boundary-headline-row">
              <span className="premium-badge premium-badge-phase route-boundary-badge">{badge}</span>
              {emphasis ? <div className="route-boundary-emphasis">{emphasis}</div> : null}
            </div>
            <h1 className="route-boundary-title">{title}</h1>
            <p className="route-boundary-description">{description}</p>
            {actions ? <div className="hero-actions-row route-boundary-actions">{actions}</div> : null}
          </div>

          <aside className="route-boundary-aside" aria-label={asideTitle}>
            <p className="section-kicker">{asideTitle}</p>
            <div className="route-boundary-list" role="list">
              {asideItems.map((item, index) => (
                <div key={index} className="route-boundary-list-item" role="listitem">
                  {item}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
