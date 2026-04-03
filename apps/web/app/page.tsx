import Link from "next/link";
import { ClosedBetaAccessCard } from "../components/waitlist/ClosedBetaAccessCard";

const HOME_PROOF_SAMPLES = [
  {
    label: "Post com CTA",
    creator: "Creator Post",
    prompt: "Lançar aula gratuita de color grading para reels e stories.",
    output: "Hook curto, legenda com prova social e CTA.",
    nextStep: "Salvar no projeto e refinar.",
  },
  {
    label: "Roteiro para vídeo",
    creator: "Creator Scripts",
    prompt: "Explicar em 30 segundos por que uma landing lenta perde conversão.",
    output: "Abertura, argumento central e fechamento prontos para gravação.",
    nextStep: "Virar vídeo curto ou anúncio.",
  },
  {
    label: "Publicação pronta",
    creator: "Creator Clips",
    prompt: "Gerar um clipe curto com direção de cena e continuidade.",
    output: "Briefing visual e base pronta para editar.",
    nextStep: "Continuar no editor e preparar a saída.",
  },
];

const HOME_HERO_FLOW = [
  {
    label: "Creators",
    meta: "gera base",
  },
  {
    label: "Editor",
    meta: "refina contexto",
  },
  {
    label: "Projetos",
    meta: "segura continuidade",
  },
  {
    label: "Saída",
    meta: "registra o que foi entregue",
  },
];

const HOME_HERO_TRUST = [
  {
    title: "Não começa do zero",
    detail: "Creators já devolvem base utilizável.",
  },
  {
    title: "Não quebra o fluxo",
    detail: "Editor e projetos continuam na mesma peça.",
  },
  {
    title: "Não perde a saída",
    detail: "A entrega continua visível até o fim.",
  },
];

export default function HomePage() {
  return (
    <div className="page-shell beta-entry-page">
      <div className="beta-entry-page-canvas">
        <section className="beta-entry-hero-open" data-reveal>
          <div className="beta-entry-hero-layout">
            <div className="beta-entry-hero-copy">
              <div className="beta-entry-headline-stack">
                <div className="premium-badge premium-badge-phase beta-entry-badge">
                  Beta pago/controlado
                </div>
                <h1 className="beta-entry-title">Não é prompt solto. É creators, editor e projetos na mesma continuidade.</h1>
                <p className="beta-entry-copy">
                  Gere a base, refine no editor e siga até a saída sem perder contexto no caminho.
                </p>
              </div>

              <div className="hero-actions-row beta-entry-actions">
                <Link href="/login" className="btn-link-ea btn-primary">Já tenho acesso</Link>
                <Link href="/login?mode=signup" className="btn-link-ea btn-secondary">Criar conta</Link>
                <Link href="/how-it-works" className="btn-link-ea btn-ghost">Como funciona</Link>
              </div>
            </div>

            <div className="beta-entry-command-surface" aria-label="Fluxo principal do beta pago/controlado">
              <div className="beta-entry-command-head">
                <span className="beta-entry-command-kicker">Fluxo principal</span>
                <span className="beta-entry-command-status">Creators → editor → projetos → saída</span>
              </div>

              <div className="beta-entry-command-prompt">
                <span className="beta-entry-command-prompt-label">Wedge</span>
                <strong>O valor não está só em gerar. Está em continuar a mesma peça até a saída.</strong>
              </div>

              <div className="beta-entry-command-route" aria-label="Creators centrais do beta">
                {HOME_HERO_FLOW.map((item) => (
                  <div key={item.label} className="beta-entry-command-node">
                    <strong>{item.label}</strong>
                    <span>{item.meta}</span>
                  </div>
                ))}
              </div>

              <div className="beta-entry-command-proof">
                <div className="beta-entry-command-proof-item">
                  <span>Geração útil</span>
                  <strong>Creators já entregam base utilizável</strong>
                </div>
                <div className="beta-entry-command-proof-item">
                  <span>Revisão contínua</span>
                  <strong>Editor e projeto seguram a mesma peça</strong>
                </div>
                <div className="beta-entry-command-proof-item">
                  <span>Saída rastreada</span>
                  <strong>O próximo passo continua claro até a entrega</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="beta-entry-trust-strip" data-reveal data-reveal-delay="35">
          {HOME_HERO_TRUST.map((item) => (
            <div key={item.title} className="beta-entry-trust-item">
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </div>
          ))}
        </section>

        <section className="beta-entry-proof-open" data-reveal data-reveal-delay="60">
            <div className="section-stack-tight beta-entry-proof-head">
              <div className="premium-badge premium-badge-phase beta-entry-badge">
                Prova rápida
              </div>
            <h2 className="heading-reset">Não para na geração.</h2>
            <p className="helper-text-ea">
              Cada creator já nasce com próximo passo: salvar, abrir no editor e seguir até a saída.
            </p>
          </div>
          <Link href="/creators" className="btn-link-ea btn-secondary btn-sm">
            Ver Creators
          </Link>
        </section>

        <section className="beta-entry-proof-grid-open" data-reveal data-reveal-delay="70">
          {HOME_PROOF_SAMPLES.map((sample, index) => (
            <article key={sample.label} className="beta-entry-proof-item" data-reveal data-reveal-delay={String(80 + index * 55)}>
              <div className="beta-entry-proof-meta">
                <span className="proof-value-kicker">{sample.label}</span>
                <span className="beta-entry-proof-chip">{sample.creator}</span>
              </div>
              <div className="beta-entry-proof-row">
                <span className="proof-value-label">Briefing</span>
                <p>{sample.prompt}</p>
              </div>
              <div className="beta-entry-proof-row">
                <span className="proof-value-label">Entrega</span>
                <p>{sample.output}</p>
              </div>
              <div className="beta-entry-proof-row beta-entry-proof-row-strong">
                <span className="proof-value-label">Próximo passo</span>
                <strong>{sample.nextStep}</strong>
              </div>
            </article>
          ))}
        </section>

        <div data-reveal data-reveal-delay="100">
          <ClosedBetaAccessCard
            compact
            title="Pedir acesso"
            description="Entre na fila para usar creators, editor e projetos na mesma continuidade."
          />
        </div>

        <div className="helper-text-ea beta-entry-footnote" data-reveal data-reveal-delay="140">
          Editor AI Creator • Assistente interno EditexAI
        </div>
      </div>
    </div>
  );
}
