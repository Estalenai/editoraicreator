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
      "O fluxo atual privilegia salvar o projeto, revisar no editor e exportar no dispositivo com previsibilidade.",
    href: "/credits",
    cta: "Revisar créditos",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="page-shell">
      <section className="premium-hero">
        <div className="hero-split">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Fluxo da plataforma</p>
              <h1 style={{ margin: 0, letterSpacing: -0.3 }}>Como funciona</h1>
              <p className="hero-copy-compact">
                Uma visão curta do fluxo operacional: gerar, salvar, editar, exportar e acompanhar crédito com clareza.
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
            </div>
          </div>
        </div>
      </section>

      <section className="summary-grid">
        {STEPS.map((step) => (
          <article key={step.title} className="summary-card">
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

      <section className="premium-card-soft info-note">
        <strong>Entrada rápida</strong>
        <span>
          Se você já sabe o formato do trabalho, vá direto para{" "}
          <Link href="/editor/new" className="text-link-ea">
            /editor/new
          </Link>{" "}
          e abra um projeto com contexto pronto para editar e exportar.
        </span>
      </section>
    </div>
  );
}
