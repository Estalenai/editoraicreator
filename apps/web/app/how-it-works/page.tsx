import Link from "next/link";

const STEPS = [
  {
    title: "1. Gere contexto em Creators",
    description:
      "Use Post, Scripts, Ads e os demais workspaces para estruturar briefing, configuração e resultado antes do editor.",
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
      "Abra um projeto existente ou comece por /editor/new para entrar com estrutura inicial pronta para editar.",
    href: "/editor/new",
    cta: "Abrir editor novo",
  },
  {
    title: "4. Exporte com clareza",
    description:
      "O beta já permite fechar o fluxo criando, editando e preparando o handoff inicial de publicação via Projetos e Vercel.",
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
    title: "De conceito para fluxo publicável",
    input: "Organizar uma peça curta com contexto visual, texto e próximo passo de deploy.",
    output: "Projeto salvo, edição centralizada e handoff beta para GitHub e Vercel quando fizer sentido.",
    nextStep: "Continuar no editor e preparar exportação ou publicação.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="page-shell how-it-works-page">
      <section className="premium-hero how-it-works-hero">
        <div className="hero-split">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Fluxo da plataforma</p>
              <h1 style={{ margin: 0, letterSpacing: -0.3 }}>Como funciona</h1>
              <p className="hero-copy-compact">
                Uma visão curta do fluxo operacional: gerar, salvar, editar, publicar e acompanhar crédito com clareza.
              </p>
            </div>
          </div>

          <div className="hero-side-panel">
            <div className="hero-side-list">
              <div className="hero-side-note">
                <strong>Fluxo único</strong>
                <span>Creators prepara contexto, Projetos organiza continuidade e o editor centraliza a execução.</span>
              </div>
              <div className="hero-side-note">
                <strong>Controle financeiro</strong>
                <span>Plans e Credits mostram o que está disponível, o que foi usado e o que muda em cada decisão.</span>
              </div>
              <div className="hero-side-note hero-side-note-trust">
                <strong>Privacidade aplicada</strong>
                <span>Os dados do projeto não são usados para treinar modelos e o processamento segue isolado por conta.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="summary-grid how-it-works-grid">
        {STEPS.map((step) => (
          <article key={step.title} className="premium-card summary-card how-it-works-step">
            <div className="section-stack-tight">
              <h2 className="heading-reset">{step.title}</h2>
              <p className="helper-text-ea">{step.description}</p>
            </div>
            <Link href={step.href} className="btn-link-ea btn-secondary btn-sm">
              {step.cta}
            </Link>
          </article>
        ))}
      </section>

      <section className="proof-value-section premium-card-soft how-it-works-proof-section">
        <div className="proof-value-header">
          <div className="section-stack-tight">
            <p className="section-kicker">Exemplos concretos</p>
            <h2 className="heading-reset">Do briefing ao resultado</h2>
            <p className="helper-text-ea">
              Cada fluxo abaixo mostra o tipo de entrega que o beta já consegue organizar com IA, projeto e continuidade no editor.
            </p>
          </div>
        </div>

        <div className="proof-value-grid">
          {RESULT_EXAMPLES.map((example) => (
            <article key={example.title} className="proof-value-card premium-card-soft">
              <div className="proof-value-stack">
                <h3 className="heading-reset">{example.title}</h3>
                <div className="proof-value-block">
                  <span className="proof-value-label">Entrada</span>
                  <p>{example.input}</p>
                </div>
                <div className="proof-value-block">
                  <span className="proof-value-label">Saída organizada</span>
                  <p>{example.output}</p>
                </div>
                <div className="proof-value-block proof-value-block-inline">
                  <span className="proof-value-label">Continuação</span>
                  <strong>{example.nextStep}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="premium-card-soft info-note how-it-works-note">
        <strong>Entrada rápida</strong>
        <span>
          Se você já sabe o formato do trabalho, vá direto para{" "}
          <Link href="/editor/new" className="text-link-ea">
            /editor/new
          </Link>{" "}
          e abra um projeto com contexto pronto para editar e exportar.
        </span>
      </section>

      <section className="premium-card-soft privacy-trust-note how-it-works-trust-note">
        <strong>Privacidade sem ruído jurídico</strong>
        <span>O produto prioriza processamento isolado, confidencialidade operacional e não usa os dados da sua conta para treinar modelos.</span>
      </section>
    </div>
  );
}
