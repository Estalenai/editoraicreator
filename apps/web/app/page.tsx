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
      <section className="premium-hero beta-entry-hero" data-reveal>
        <div className="beta-entry-hero-grid">
          <div className="beta-entry-hero-copy">
            <div className="premium-badge premium-badge-phase beta-entry-badge">
              Beta pago/controlado
            </div>
            <h1 className="beta-entry-title">Acesso ao núcleo do Editor AI Creator</h1>
            <p className="beta-entry-copy">
              O Editor AI Creator concentra hoje o que já sustenta valor real: <strong>Creator Post</strong>, <strong>Creator Scripts</strong>, <strong>Creator Clips</strong>, editor central, projetos e saída rastreada. Solicite acesso para entrar no beta pago/controlado com escopo claro, onboarding assistido e continuidade séria até a exportação.
            </p>
            <div className="hero-actions-row">
              <Link href="/login" className="btn-link-ea btn-primary">Já tenho acesso</Link>
              <Link href="/login?mode=signup" className="btn-link-ea btn-secondary">Criar conta</Link>
              <Link href="/how-it-works" className="btn-link-ea btn-ghost">Como funciona</Link>
            </div>
            <div className="signal-strip beta-entry-signal-strip">
              <div className="signal-chip signal-chip-creative">
                <strong>Núcleo focado</strong>
                <span>Post, Scripts e Clips ficam no centro da promessa e do uso recorrente.</span>
              </div>
              <div className="signal-chip signal-chip-creative">
                <strong>Editor central</strong>
                <span>Creators, projetos e checkpoints convergem para o mesmo workspace até a saída final.</span>
              </div>
              <div className="signal-chip signal-chip-creative">
                <strong>Saída rastreada</strong>
                <span>Draft, exported e published aparecem com clareza para reduzir ambiguidade no fechamento.</span>
              </div>
            </div>
          </div>

          <div className="premium-card-soft beta-entry-side-card">
            <p className="section-kicker">Leitura rápida</p>
            <div className="beta-entry-side-list">
              <div className="hero-side-note">
                <strong>Escopo decidido</strong>
                <span>O centro do beta pago/controlado é criar, editar, salvar e exportar com força comercial real.</span>
              </div>
              <div className="hero-side-note">
                <strong>Amplitude reduzida</strong>
                <span>O que ainda está cedo demais saiu do centro da promessa e virou camada secundária ou handoff beta.</span>
              </div>
              <div className="hero-side-note hero-side-note-trust">
                <strong>Confidencialidade priorizada</strong>
                <span>Fluxos de geração e edição preservam contexto da conta sem usar seus dados para treinar modelos.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-value-section premium-card-soft" data-reveal data-reveal-delay="60">
        <div className="proof-value-header">
          <div className="section-stack-tight">
            <p className="section-kicker">Prova de valor</p>
            <h2 className="heading-reset">O que a IA entrega no beta pago/controlado</h2>
            <p className="helper-text-ea">
              Exemplos do tipo de saída que o núcleo atual já consegue organizar. Não são promessas vagas; são formatos reais para gerar, salvar em projeto, refinar no editor e fechar a saída com clareza.
            </p>
          </div>
          <Link href="/creators" className="btn-link-ea btn-secondary btn-sm">
            Ver Creators
          </Link>
        </div>

        <div className="proof-value-grid">
          {HOME_PROOF_SAMPLES.map((sample, index) => (
            <article key={sample.label} className="proof-value-card premium-card-soft" data-reveal data-reveal-delay={String(70 + index * 55)}>
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

      <div data-reveal data-reveal-delay="100">
        <ClosedBetaAccessCard
          compact
          title="Fila de espera"
          description="Informe o e-mail de trabalho para entrar na fila de liberação do beta pago/controlado."
        />
      </div>

      <div className="helper-text-ea" data-reveal data-reveal-delay="140">
        Plataforma: Editor AI Creator • Assistente interno: EditexAI
      </div>
    </div>
  );
}
