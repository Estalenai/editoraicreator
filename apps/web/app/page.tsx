import Link from "next/link";
import { ClosedBetaAccessCard } from "../components/waitlist/ClosedBetaAccessCard";

const HOME_PROOF_SAMPLES = [
  {
    label: "Exemplo público",
    creator: "Creator Post",
    prompt: "Lançar uma aula gratuita de color grading para reels e stories.",
    publicOutput: "\"3 ajustes de cor que deixam seu reel com cara de campanha, não de improviso.\"",
    output: "Gancho curto, legenda com prova social e CTA para lista.",
    nextStep: "Salvar no projeto, abrir no editor e lapidar a peça.",
  },
  {
    label: "Exemplo público",
    creator: "Creator Scripts",
    prompt: "Explicar em 30 segundos por que uma landing lenta perde conversão.",
    publicOutput: "\"Se a página demora, o clique esfria. E clique frio não compra.\"",
    output: "Abertura, argumento central e fechamento prontos para gravação.",
    nextStep: "Virar vídeo curto, anúncio ou base de página.",
  },
  {
    label: "Exemplo público",
    creator: "Creator Clips",
    prompt: "Gerar um clipe curto com direção de cena, ritmo e continuidade.",
    publicOutput: "\"Close no produto, corte na reação e fechamento com CTA sem perder o contexto.\"",
    output: "Briefing visual com direção de cena e base pronta para editar.",
    nextStep: "Continuar no editor e seguir com saída rastreada.",
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
    title: "3 creators centrais já abertos",
    detail: "Post, Scripts e Clips já entram no mesmo fluxo.",
  },
  {
    title: "Continuidade real no editor",
    detail: "A mesma peça segue do creator para revisão e projeto.",
  },
  {
    title: "Saída acompanhada",
    detail: "Projetos segura rascunho, saída registrada e publicação.",
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
                Prova pública
              </div>
            <h2 className="heading-reset">Exemplos públicos do que já sai do núcleo.</h2>
            <p className="helper-text-ea">
              Sem case inventado. Aqui está o tipo de saída que o produto já organiza hoje, com continuação clara até editor e projetos.
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
                <span className="proof-value-kicker">{sample.label}</span>
                <span className="beta-entry-proof-chip">{sample.creator}</span>
              </div>
              <div className="beta-entry-proof-row">
                <span className="proof-value-label">Briefing</span>
                <p>{sample.prompt}</p>
              </div>
              <div className="beta-entry-proof-row">
                <span className="proof-value-label">Saída pública</span>
                <div className="proof-value-block proof-value-block-inline">
                  <p>{sample.publicOutput}</p>
                </div>
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
