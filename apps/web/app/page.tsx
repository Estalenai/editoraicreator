import Link from "next/link";
import { ClosedBetaAccessCard } from "../components/waitlist/ClosedBetaAccessCard";

export default function HomePage() {
  return (
    <div className="page-shell beta-entry-page">
      <section className="premium-hero beta-entry-hero">
        <div className="beta-entry-hero-grid">
          <div className="beta-entry-hero-copy">
            <div className="premium-badge premium-badge-phase beta-entry-badge">
              Beta fechado
            </div>
            <h1 className="beta-entry-title">Acesso antecipado</h1>
            <p className="beta-entry-copy">
              O Editor AI Creator organiza geração, edição, refinamento e exportação de vídeo, foto e conteúdo em um workspace contínuo. Solicite acesso antecipado para liberar sua conta e acompanhar a evolução da plataforma.
            </p>
            <div className="hero-actions-row">
              <Link href="/login" className="btn-link-ea btn-primary">Já tenho acesso</Link>
              <Link href="/login?mode=signup" className="btn-link-ea btn-secondary">Criar conta</Link>
              <Link href="/how-it-works" className="btn-link-ea btn-ghost">Como funciona</Link>
            </div>
            <div className="signal-strip beta-entry-signal-strip">
              <div className="signal-chip signal-chip-creative">
                <strong>Controle claro</strong>
                <span>Planos, créditos, projeto e exportação local organizados desde a entrada.</span>
              </div>
              <div className="signal-chip signal-chip-creative">
                <strong>Criação com contexto</strong>
                <span>Creators e editor trabalham no mesmo fluxo para vídeo, foto e conteúdo, sem perder o projeto.</span>
              </div>
              <div className="signal-chip signal-chip-creative">
                <strong>Beta monitorado</strong>
                <span>Acesso controlado enquanto a plataforma evolui com segurança.</span>
              </div>
            </div>
          </div>

          <div className="premium-card-soft beta-entry-side-card">
            <p className="section-kicker">Leitura rápida</p>
            <div className="beta-entry-side-list">
              <div className="hero-side-note">
                <strong>Estrutura séria</strong>
                <span>Painel operacional, fluxo de edição e área financeira com hierarquia clara.</span>
              </div>
              <div className="hero-side-note">
                <strong>Energia criativa</strong>
                <span>Workspace de criação com personalidade própria, sem virar showcase visual.</span>
              </div>
              <div className="hero-side-note">
                <strong>Continuidade real</strong>
                <span>Gere, edite, salve e prepare a exportação no dispositivo sem acumular mídia pesada no servidor.</span>
              </div>
            </div>
          </div>
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
