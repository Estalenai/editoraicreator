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
    title: "Creators geram a base",
    detail: "Post, Scripts e Clips iniciam o trabalho com contexto real.",
  },
  {
    title: "Editor consolida a peça",
    detail: "A revisão e o acabamento seguem no mesmo núcleo.",
  },
  {
    title: "Projetos seguram a saída",
    detail: "Continuidade e registro ficam claros antes de qualquer camada de apoio.",
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
                <h1 className="beta-entry-title">Creators, editor e projetos no centro do produto</h1>
                <p className="beta-entry-copy">
                  O núcleo atual já precisa dominar a leitura: gerar em creators, consolidar no editor e registrar a continuidade até a saída.
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
                <span className="beta-entry-command-prompt-label">Núcleo em foco</span>
                <strong>Gerar uma peça em creators, abrir no editor e seguir com continuidade até a saída registrada.</strong>
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
                  <span>Centro do produto</span>
                  <strong>Creators + editor + projetos</strong>
                </div>
                <div className="beta-entry-command-proof-item">
                  <span>Saída clara</span>
                  <strong>Rascunho, saída registrada e publicação confirmada</strong>
                </div>
                <div className="beta-entry-command-proof-item">
                  <span>Camada de apoio</span>
                  <strong>Créditos, planos e suporte entram depois</strong>
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
                Prova de valor
              </div>
            <h2 className="heading-reset">O que o núcleo já sustenta</h2>
            <p className="helper-text-ea">
              O valor principal já está aqui: gerar, salvar, abrir no editor e seguir até a saída com continuidade.
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
            title="Fila de espera"
            description="Use seu e-mail de trabalho para entrar na fila de acesso."
          />
        </div>

        <div className="helper-text-ea beta-entry-footnote" data-reveal data-reveal-delay="140">
          Editor AI Creator • Assistente interno EditexAI
        </div>
      </div>
    </div>
  );
}
