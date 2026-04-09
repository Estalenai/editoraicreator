import Link from "next/link";
import { ClosedBetaAccessCard } from "../components/waitlist/ClosedBetaAccessCard";

const HOME_PROOF_SAMPLES = [
  {
    creator: "Post",
    brief: "Lançar uma aula gratuita de color grading para reels.",
    result: "\"3 ajustes de cor que deixam seu reel com cara de campanha.\"",
    continuation: "Entra no editor com gancho, legenda e CTA prontos para virar projeto.",
  },
  {
    creator: "Scripts",
    brief: "Explicar em 30 segundos por que uma landing lenta perde conversão.",
    result: "\"Se a página demora, o clique esfria. E clique frio não compra.\"",
    continuation: "Sai com abertura, argumento e fechamento prontos para gravação ou página.",
  },
  {
    creator: "Clips",
    brief: "Gerar um clipe curto com direção de cena, ritmo e continuidade.",
    result: "\"Close no produto, corte na reação e fechamento com CTA sem perder contexto.\"",
    continuation: "Vira briefing visual pronto para editar e seguir até a saída.",
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
    title: "3 creators centrais",
    detail: "Post, Scripts e Clips já entram no mesmo fluxo.",
  },
  {
    title: "A mesma peça continua",
    detail: "Creator, editor e projeto seguram o mesmo contexto.",
  },
  {
    title: "Saída sem perda de contexto",
    detail: "Projetos mantém rascunho, revisão e próximo passo claros.",
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
                <div className="premium-badge premium-badge-phase beta-entry-badge">Núcleo criativo</div>
                <h1 className="beta-entry-title">A mesma peça vai do creator à saída.</h1>
                <p className="beta-entry-copy">
                  Creators gera a base, o editor lapida e projetos segura a continuidade sem fazer você recomeçar.
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
                <span className="beta-entry-command-prompt-label">O que muda</span>
                <strong>Você não gera e descarta. Você continua.</strong>
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
                  <span>Base útil</span>
                  <strong>Creators já entregam material aproveitável</strong>
                </div>
                <div className="beta-entry-command-proof-item">
                  <span>Mesma peça</span>
                  <strong>Editor e projeto mantêm o mesmo contexto</strong>
                </div>
                <div className="beta-entry-command-proof-item">
                  <span>Saída clara</span>
                  <strong>O próximo passo continua definido até a entrega</strong>
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
            <div className="premium-badge premium-badge-phase beta-entry-badge">Prova pública</div>
            <h2 className="heading-reset">Veja o tipo de peça que já sai daqui.</h2>
            <p className="helper-text-ea">
              Brief curto, saída utilizável e continuação clara em creators, editor e projetos.
            </p>
          </div>
          <Link href="/how-it-works" className="btn-link-ea btn-secondary btn-sm">
            Ver fluxo completo
          </Link>
        </section>

        <section className="beta-entry-proof-grid-open" data-reveal data-reveal-delay="70">
          {HOME_PROOF_SAMPLES.map((sample, index) => (
            <article key={sample.creator} className="beta-entry-proof-item" data-reveal data-reveal-delay={String(80 + index * 55)}>
              <div className="beta-entry-proof-meta">
                <span className="proof-value-kicker">Exemplo público</span>
                <span className="beta-entry-proof-chip">{sample.creator}</span>
              </div>
              <div className="beta-entry-proof-row">
                <span className="proof-value-label">Entrada</span>
                <p>{sample.brief}</p>
              </div>
              <div className="beta-entry-proof-row">
                <span className="proof-value-label">Saída</span>
                <div className="proof-value-block proof-value-block-inline">
                  <p>{sample.result}</p>
                </div>
              </div>
              <div className="beta-entry-proof-row">
                <span className="proof-value-label">Continuação</span>
                <strong>{sample.continuation}</strong>
              </div>
            </article>
          ))}
        </section>

        <div data-reveal data-reveal-delay="100">
          <ClosedBetaAccessCard
            compact
            title="Entrar na fila"
            description="Use creators, editor e projetos na mesma continuidade."
          />
        </div>

        <div className="helper-text-ea beta-entry-footnote" data-reveal data-reveal-delay="140">
          Editor AI Creator • Assistente interno EditexAI
        </div>
      </div>
    </div>
  );
}
