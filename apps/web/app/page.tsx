import Link from "next/link";
import { ClosedBetaAccessCard } from "../components/waitlist/ClosedBetaAccessCard";

const HOME_PROOF_SAMPLES = [
  {
    label: "Post com CTA",
    creator: "Creator Post",
    prompt: "Lançar uma aula gratuita de color grading para reels e stories.",
    output: "Hook curto, legenda com prova social e CTA para lista de espera.",
    nextStep: "Salvar em projeto e refinar no editor.",
  },
  {
    label: "Roteiro para vídeo",
    creator: "Creator Scripts",
    prompt: "Explicar em 30 segundos por que uma landing lenta perde conversão.",
    output: "Estrutura em 3 blocos com abertura, argumento central e fechamento para gravação.",
    nextStep: "Transformar em vídeo curto ou anúncio.",
  },
  {
    label: "Publicação pronta",
    creator: "Creator Clips",
    prompt: "Gerar um clipe curto com direção de cena e continuidade no projeto.",
    output: "Briefing visual, job assíncrono e base pronta para editar e preparar exportação.",
    nextStep: "Continuar no editor e preparar handoff de publicação.",
  },
];

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
                <strong>Privacidade real</strong>
                <span>Seus dados não são usados para treinar modelos; o processamento segue isolado por conta.</span>
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
              <div className="hero-side-note hero-side-note-trust">
                <strong>Confidencialidade priorizada</strong>
                <span>Fluxos de geração e edição preservam contexto da conta sem usar seus dados para treinar modelos.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-value-section premium-card-soft">
        <div className="proof-value-header">
          <div className="section-stack-tight">
            <p className="section-kicker">Prova de valor</p>
            <h2 className="heading-reset">O que a IA entrega no beta</h2>
            <p className="helper-text-ea">
              Exemplos do tipo de saída que o workspace organiza hoje. Não são promessas vagas; são formatos reais de entrega para publicar, editar e evoluir em projeto.
            </p>
          </div>
          <Link href="/creators" className="btn-link-ea btn-secondary btn-sm">
            Ver Creators
          </Link>
        </div>

        <div className="proof-value-grid">
          {HOME_PROOF_SAMPLES.map((sample) => (
            <article key={sample.label} className="proof-value-card premium-card-soft">
              <div className="proof-value-meta-row">
                <span className="proof-value-kicker">{sample.label}</span>
                <span className="proof-value-chip">{sample.creator}</span>
              </div>
              <div className="proof-value-stack">
                <div className="proof-value-block">
                  <span className="proof-value-label">Briefing</span>
                  <p>{sample.prompt}</p>
                </div>
                <div className="proof-value-block">
                  <span className="proof-value-label">Entrega</span>
                  <p>{sample.output}</p>
                </div>
                <div className="proof-value-block proof-value-block-inline">
                  <span className="proof-value-label">Próximo passo</span>
                  <strong>{sample.nextStep}</strong>
                </div>
              </div>
            </article>
          ))}
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
