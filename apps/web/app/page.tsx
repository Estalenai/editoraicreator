import Link from "next/link";
import { ClosedBetaAccessCard } from "../components/waitlist/ClosedBetaAccessCard";

export default function HomePage() {
  return (
    <div className="page-shell beta-entry-page">
      <section className="premium-hero beta-entry-hero">
        <div className="premium-badge premium-badge-phase beta-entry-badge">
          Beta fechado
        </div>
        <h1 className="beta-entry-title">Acesso antecipado</h1>
        <p className="beta-entry-copy">
          O Editor AI Creator esta em beta fechado. Solicite acesso antecipado para liberar sua conta e acompanhar a evolucao da EditexAI.
        </p>
        <div className="hero-actions-row">
          <Link href="/login" className="btn-link-ea btn-primary">Já tenho acesso</Link>
          <Link href="/login?mode=signup" className="btn-link-ea btn-secondary">Criar conta</Link>
          <Link href="/how-it-works" className="btn-link-ea btn-ghost">Como funciona</Link>
        </div>
      </section>

      <ClosedBetaAccessCard
        compact
        title="Fila de espera"
        description="Informe seu e-mail para entrar na fila de liberação do beta fechado."
      />

      <div className="helper-text-ea">
        Plataforma: Editor AI Creator • Assistente interno: EditexAI
      </div>
    </div>
  );
}
