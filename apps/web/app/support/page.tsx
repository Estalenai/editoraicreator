"use client";

import Link from "next/link";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { SupportAssistantCard } from "../../components/dashboard/SupportAssistantCard";
import { toUserFacingError } from "../../lib/uiFeedback";

export default function SupportPage() {
  const {
    loading,
    error,
    email,
    betaAccess,
    betaBlocked,
    onLogout,
  } = useDashboardBootstrap({ loadDashboard: false });

  if (betaBlocked) {
    return (
      <BetaAccessBlockedView
        email={email}
        status={betaAccess?.status}
        onLogout={onLogout}
      />
    );
  }

  return (
    <div className="page-shell">
      <section className="premium-hero" style={{ padding: 20 }}>
        <p className="section-kicker">Canal operacional</p>
        <h1 style={{ margin: "4px 0 0", letterSpacing: -0.35 }}>Suporte</h1>
        <div style={{ marginTop: 8, opacity: 0.82 }}>
          Canal oficial para dúvidas, problemas técnicos e solicitações operacionais.
        </div>
        {email ? (
          <div className="surface-toolbar" style={{ marginTop: 12 }}>
            <span className="toolbar-label">Conta conectada</span>
            <span style={{ fontWeight: 600 }}>{email}</span>
            <span className="premium-badge premium-badge-phase">Resposta por fila interna</span>
            <Link href="/how-it-works" className="btn-link-ea btn-ghost btn-sm">
              Como funciona
            </Link>
          </div>
        ) : null}
      </section>

      <section className="premium-card-soft privacy-trust-note support-trust-note">
        <strong>Privacidade e confidencialidade</strong>
        <span>Dados enviados em tickets e projetos não são usados para treinar modelos. O suporte opera com processamento isolado e foco em segurança operacional.</span>
      </section>

      {loading ? (
        <div className="premium-card" style={{ padding: 14, display: "grid", gap: 8 }}>
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "32%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "70%" }} />
          <div className="premium-skeleton premium-skeleton-card" />
        </div>
      ) : null}

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível carregar o suporte</p>
          <div className="state-ea-text">{toUserFacingError(error, "Atualize a página e tente novamente.")}</div>
        </div>
      ) : null}

      <SupportAssistantCard />
    </div>
  );
}
