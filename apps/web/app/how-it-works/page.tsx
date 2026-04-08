import Link from "next/link";
import { EditorRouteLink } from "../../components/ui/EditorRouteLink";

const STEPS = [
  {
    title: "1. Gere contexto em Creators",
    description: "Use Creator Post, Scripts ou Clips para montar a base.",
    href: "/creators",
    cta: "Abrir Creators",
  },
  {
    title: "2. Salve em projeto",
    description: "O projeto guarda contexto, estado e próxima etapa.",
    href: "/projects",
    cta: "Ver projetos",
  },
  {
    title: "3. Continue no editor",
    description: "No editor, revise, salve versões e consolide o entregável.",
    href: "/editor/new",
    cta: "Abrir editor",
  },
  {
    title: "4. Exporte com clareza",
    description: "Registre a saída e acompanhe a publicação sem ambiguidade.",
    href: "/projects#vercel-publish",
    cta: "Preparar publicação",
  },
];

const RESULT_EXAMPLES = [
  {
    title: "Post com CTA saindo do Creator Post",
    input: "Promover uma aula ao vivo de fotografia mobile com CTA para lista de espera.",
    publicOutput: "\"Abra a camera antes do curso: 3 ajustes de luz que mudam seu reel em 30 segundos.\"",
    output: "Gancho inicial, legenda com prova social e CTA para lista.",
    nextStep: "Salvar no projeto e ajustar no editor.",
  },
  {
    title: "Roteiro curto saindo do Creator Scripts",
    input: "Explicar por que pages lentas derrubam conversão em até 45 segundos.",
    publicOutput: "\"Se o clique chega quente e a page responde fria, a conversao morre antes do argumento começar.\"",
    output: "Abertura, desenvolvimento e fechamento prontos para gravacao.",
    nextStep: "Virar clipe, anuncio ou base de landing.",
  },
  {
    title: "Saída rastreada no fim do fluxo",
    input: "Organizar um post, roteiro ou clipe com estado claro de rascunho, saída registrada e publicação confirmada.",
    publicOutput: "\"A peça não some depois da geração: ela continua no editor, no projeto e na saída registrada.\"",
    output: "Projeto salvo, checkpoints no editor e trilha de saida registrada.",
    nextStep: "Registrar a saida e concluir a publicacao no canal correto.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="page-shell how-it-works-page">
      <div className="how-it-works-page-canvas">
        <section className="how-it-works-hero-open" data-reveal>
          <div className="how-it-works-hero-main">
            <div className="hero-title-stack">
              <p className="section-kicker">Fluxo da plataforma</p>
              <h1 style={{ margin: 0, letterSpacing: -0.3 }}>Como funciona</h1>
              <p className="hero-copy-compact">
                O fluxo real do produto hoje: creators, projeto, editor e saída rastreada.
              </p>
            </div>
          </div>

          <div className="how-it-works-context-grid">
            <div className="how-it-works-context-item">
              <strong>Fluxo único</strong>
              <span>Creators abrem, Projetos guardam, Editor fecha.</span>
            </div>
            <div className="how-it-works-context-item">
              <strong>Camada comercial</strong>
              <span>Plans e Credits sustentam o acesso sem disputar o núcleo criativo.</span>
            </div>
            <div className="how-it-works-context-item">
              <strong>Privacidade</strong>
              <span>Dados da conta ficam isolados e fora de treino.</span>
            </div>
          </div>
        </section>

        <section className="how-it-works-flow" data-reveal data-reveal-delay="40">
          <div className="how-it-works-flow-head section-stack-tight">
            <p className="section-kicker">Sequência operacional</p>
            <h2 className="heading-reset">Do contexto à saída rastreada</h2>
            <p className="helper-text-ea">
              Quatro etapas. Um fluxo.
            </p>
          </div>

          <div className="how-it-works-flow-grid">
            {STEPS.map((step, index) => (
              <article key={step.title} className="how-it-works-step-open" data-reveal data-reveal-delay={String(60 + index * 50)}>
                <div className="section-stack-tight">
                  <span className="how-it-works-step-index">Etapa {index + 1}</span>
                  <h3 className="heading-reset">{step.title.replace(/^\d+\.\s*/, "")}</h3>
                  <p className="helper-text-ea">{step.description}</p>
                </div>
                {step.href.startsWith("/editor") ? (
                  <EditorRouteLink href={step.href} className="btn-link-ea btn-secondary btn-sm">
                    {step.cta}
                  </EditorRouteLink>
                ) : (
                  <Link href={step.href} className="btn-link-ea btn-secondary btn-sm">
                    {step.cta}
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="how-it-works-proof-open" data-reveal data-reveal-delay="90">
          <div className="how-it-works-flow-head section-stack-tight">
            <p className="section-kicker">Exemplos públicos</p>
            <h2 className="heading-reset">Do briefing ao que já sai do fluxo</h2>
            <p className="helper-text-ea">
              Sem cliente inventado. Estes exemplos mostram o tipo de resultado que o núcleo atual já organiza hoje.
            </p>
          </div>

          <div className="how-it-works-proof-grid-open">
            {RESULT_EXAMPLES.map((example, index) => (
              <article key={example.title} className="how-it-works-example" data-reveal data-reveal-delay={String(70 + index * 50)}>
                <div className="section-stack-tight">
                  <h3 className="heading-reset">{example.title}</h3>
                </div>
                <div className="how-it-works-example-row">
                  <span className="how-it-works-example-label">Entrada</span>
                  <p>{example.input}</p>
                </div>
                <div className="how-it-works-example-row">
                  <span className="how-it-works-example-label">Saída pública</span>
                  <div className="proof-value-block proof-value-block-inline">
                    <p>{example.publicOutput}</p>
                  </div>
                </div>
                <div className="how-it-works-example-row">
                  <span className="how-it-works-example-label">Saída organizada</span>
                  <p>{example.output}</p>
                </div>
                <div className="how-it-works-example-row how-it-works-example-row-strong">
                  <span className="how-it-works-example-label">Continuação</span>
                  <strong>{example.nextStep}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="how-it-works-footer-notes" data-reveal data-reveal-delay="120">
          <div className="how-it-works-note-open">
            <strong>Entrada rápida</strong>
            <span>
              Se o formato do trabalho já estiver claro, vá direto para{" "}
              <EditorRouteLink href="/editor/new" className="text-link-ea">
                /editor/new
              </EditorRouteLink>{" "}
              e comece por texto ou vídeo.
            </span>
          </div>

          <div className="how-it-works-note-open how-it-works-note-open-trust">
            <strong>Privacidade clara</strong>
            <span>Os dados da conta não entram em treino e o processamento segue isolado.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
