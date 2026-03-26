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
      <div className="beta-entry-page-canvas">
        <section className="beta-entry-hero-open" data-reveal>
          <div className="beta-entry-hero-layout">
            <div className="beta-entry-hero-copy">
              <div className="beta-entry-headline-stack">
                <div className="premium-badge premium-badge-phase beta-entry-badge">
                  Beta pago/controlado
                </div>
                <h1 className="beta-entry-title">Acesso ao núcleo do Editor AI Creator</h1>
                <p className="beta-entry-copy">
                  O Editor AI Creator concentra hoje o que já sustenta valor real: <strong>Creator Post</strong>, <strong>Creator Scripts</strong>, <strong>Creator Clips</strong>, editor central, projetos e saída rastreada. Solicite acesso para entrar no beta pago/controlado com escopo claro, onboarding assistido e continuidade séria até a exportação.
                </p>
              </div>

              <div className="hero-actions-row beta-entry-actions">
                <Link href="/login" className="btn-link-ea btn-primary">Já tenho acesso</Link>
                <Link href="/login?mode=signup" className="btn-link-ea btn-secondary">Criar conta</Link>
                <Link href="/how-it-works" className="btn-link-ea btn-ghost">Como funciona</Link>
              </div>

              <div className="beta-entry-points">
                <div className="beta-entry-point">
                  <strong>Núcleo focado</strong>
                  <span>Post, Scripts e Clips ficam no centro da promessa e do uso recorrente.</span>
                </div>
                <div className="beta-entry-point">
                  <strong>Editor central</strong>
                  <span>Creators, projetos e checkpoints convergem para o mesmo workspace até a saída final.</span>
                </div>
                <div className="beta-entry-point">
                  <strong>Saída rastreada</strong>
                  <span>Draft, exported e published aparecem com clareza para reduzir ambiguidade no fechamento.</span>
                </div>
              </div>
            </div>

            <div className="beta-entry-context">
              <div className="beta-entry-context-item">
                <strong>Escopo decidido</strong>
                <span>O centro do beta pago/controlado é criar, editar, salvar e exportar com força comercial real.</span>
              </div>
              <div className="beta-entry-context-item">
                <strong>Amplitude reduzida</strong>
                <span>O que ainda está cedo demais saiu do centro da promessa e virou camada secundária ou handoff beta.</span>
              </div>
              <div className="beta-entry-context-item">
                <strong>Confidencialidade priorizada</strong>
                <span>Fluxos de geração e edição preservam contexto da conta sem usar seus dados para treinar modelos.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="beta-entry-proof-open" data-reveal data-reveal-delay="60">
          <div className="section-stack-tight beta-entry-proof-head">
            <div className="premium-badge premium-badge-phase beta-entry-badge">
              Prova de valor
            </div>
            <h2 className="heading-reset">O que a IA entrega no beta pago/controlado</h2>
            <p className="helper-text-ea">
              Exemplos do tipo de saída que o núcleo atual já consegue organizar. Não são promessas vagas; são formatos reais para gerar, salvar em projeto, refinar no editor e fechar a saída com clareza.
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
            description="Informe o e-mail de trabalho para entrar na fila de liberação do beta pago/controlado."
          />
        </div>

        <div className="helper-text-ea beta-entry-footnote" data-reveal data-reveal-delay="140">
          Plataforma: Editor AI Creator • Assistente interno: EditexAI
        </div>
      </div>
    </div>
  );
}
