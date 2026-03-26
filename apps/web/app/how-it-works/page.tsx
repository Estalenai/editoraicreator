import Link from "next/link";

const STEPS = [
  {
    title: "1. Gere contexto em Creators",
    description:
      "Comece por Creator Post, Creator Scripts ou Creator Clips para estruturar briefing, resultado e continuidade no núcleo principal do beta.",
    href: "/creators",
    cta: "Abrir Creators",
  },
  {
    title: "2. Salve em projeto",
    description:
      "Projetos guardam o contexto aprovado para continuar no editor sem perder histórico nem organização.",
    href: "/projects",
    cta: "Ver projetos",
  },
  {
    title: "3. Continue no editor",
    description:
      "Abra um projeto existente ou entre em /editor/new para revisar, salvar versão, marcar checkpoint e consolidar o entregável principal.",
    href: "/editor/new",
    cta: "Abrir editor novo",
  },
  {
    title: "4. Exporte com clareza",
    description:
      "Registre exported e published com clareza no projeto. GitHub e Vercel continuam úteis como handoff beta, sem fingir automação completa.",
    href: "/projects#vercel-publish",
    cta: "Preparar publicação",
  },
];

const RESULT_EXAMPLES = [
  {
    title: "De briefing para post publicado",
    input: "Promover uma aula ao vivo de fotografia mobile com CTA para lista de espera.",
    output: "Legenda curta, gancho inicial, prova social e variações para testar distribuição.",
    nextStep: "Salvar em projeto e ajustar no editor antes de exportar.",
  },
  {
    title: "De ideia para roteiro de vídeo",
    input: "Explicar por que pages lentas derrubam conversão em até 45 segundos.",
    output: "Abertura, desenvolvimento e fechamento com direção suficiente para gravação ou anúncio.",
    nextStep: "Transformar em clipe, anúncio ou base de landing.",
  },
  {
    title: "De peça pronta para saída rastreada",
    input: "Organizar um post, roteiro ou clipe com estado claro de draft, exported e published.",
    output: "Projeto salvo, checkpoints no editor e trilha de saída registrada sem confundir trabalho em andamento com publicação final.",
    nextStep: "Exportar no dispositivo ou registrar publicação manual com clareza.",
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
                Uma visão curta do fluxo que o beta pago/controlado realmente sustenta hoje: creators hero, projeto, editor e saída rastreada em sequência clara.
              </p>
            </div>
          </div>

          <div className="how-it-works-context-grid">
            <div className="how-it-works-context-item">
              <strong>Fluxo único</strong>
              <span>Creators hero prepara contexto, Projetos guarda continuidade e o editor centraliza a execução.</span>
            </div>
            <div className="how-it-works-context-item">
              <strong>Camada comercial clara</strong>
              <span>Plans e Credits sustentam o beta pago/controlado sem disputar o centro da proposta criativa.</span>
            </div>
            <div className="how-it-works-context-item">
              <strong>Privacidade aplicada</strong>
              <span>Os dados do projeto não são usados para treinar modelos e o processamento segue isolado por conta.</span>
            </div>
          </div>
        </section>

        <section className="how-it-works-flow" data-reveal data-reveal-delay="40">
          <div className="how-it-works-flow-head section-stack-tight">
            <p className="section-kicker">Sequência operacional</p>
            <h2 className="heading-reset">Do contexto à saída rastreada</h2>
            <p className="helper-text-ea">
              Os passos abaixo continuam o mesmo sistema. A leitura precisa parecer progressão de trabalho, não uma grade de cards independentes.
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
                <Link href={step.href} className="btn-link-ea btn-secondary btn-sm">
                  {step.cta}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="how-it-works-proof-open" data-reveal data-reveal-delay="90">
          <div className="how-it-works-flow-head section-stack-tight">
            <p className="section-kicker">Exemplos concretos</p>
            <h2 className="heading-reset">Do briefing ao resultado</h2>
            <p className="helper-text-ea">
              Cada fluxo abaixo mostra o tipo de entrega que o núcleo atual já consegue organizar com IA, projeto, checkpoints e continuidade no editor.
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
              <Link href="/editor/new" className="text-link-ea">
                /editor/new
              </Link>{" "}
              e abra primeiro texto ou vídeo, que hoje concentram a melhor continuidade do beta pago/controlado.
            </span>
          </div>

          <div className="how-it-works-note-open how-it-works-note-open-trust">
            <strong>Privacidade sem ruído jurídico</strong>
            <span>O produto prioriza processamento isolado, confidencialidade operacional e não usa os dados da sua conta para treinar modelos.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
