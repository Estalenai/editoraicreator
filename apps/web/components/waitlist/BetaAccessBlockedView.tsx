"use client";

import Link from "next/link";
import { ClosedBetaAccessCard } from "./ClosedBetaAccessCard";
import type { BetaAccessStatus } from "../../hooks/useDashboardBootstrap";

type Props = {
  email: string;
  status?: BetaAccessStatus;
  title?: string;
  description?: string;
  onLogout: () => Promise<void> | void;
};

export function BetaAccessBlockedView({
  email,
  status = "pending",
  title = "Beta fechado",
  description = "Seu usuário ainda não foi liberado para o beta fechado. Deixe seu e-mail para análise e aprovação manual.",
  onLogout,
}: Props) {
  return (
    <div className="page-shell beta-access-page">
      <div className="beta-access-page-canvas">
        <section className="beta-access-hero-open">
          <div className="beta-access-hero-head">
            <div className="section-stack">
              <p className="section-kicker">Controle de acesso</p>
              <h1 style={{ margin: 0 }}>{title}</h1>
              <p className="meta-text-ea">Acesso por aprovacao manual para manter o beta controlado e a operacao consistente.</p>
            </div>
            <div className="hero-actions-row beta-access-hero-actions">
              <Link href="/how-it-works" className="btn-link-ea btn-ghost">
                Como funciona
              </Link>
              <button onClick={onLogout} className="btn-ea btn-ghost">
                Sair
              </button>
            </div>
          </div>

          <div className="beta-access-context-grid">
            <div className="beta-access-context-item">
              <strong>Fluxo controlado</strong>
              <span>O acesso continua liberado por análise manual para manter o beta estável e o onboarding consistente.</span>
            </div>
            <div className="beta-access-context-item">
              <strong>Entrada clara</strong>
              <span>Assim que a conta é aprovada, o login leva direto para o workspace sem outra etapa paralela.</span>
            </div>
            <div className="beta-access-context-item">
              <strong>Privacidade preservada</strong>
              <span>O contexto da conta permanece isolado e não entra em treino de modelos.</span>
            </div>
          </div>
        </section>

        <ClosedBetaAccessCard
          initialEmail={email}
          initialStatus={status}
          title="Acesso antecipado"
          description={description}
        />
      </div>
    </div>
  );
}
