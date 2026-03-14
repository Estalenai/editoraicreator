import Link from "next/link";

const STEPS = [
  {
    title: "1. Gere contexto em Creators",
    description:
      "Use Post, Scripts, Ads e os demais workspaces para estruturar briefing, configuracao e resultado antes do editor.",
    href: "/creators",
    cta: "Abrir Creators",
  },
  {
    title: "2. Salve em projeto",
    description:
      "Projetos guardam o contexto aprovado para continuar no editor sem perder historico nem organizacao.",
    href: "/projects",
    cta: "Ver projetos",
  },
  {
    title: "3. Continue no editor",
    description:
      "Abra um projeto existente ou comece por /editor/new para entrar com estrutura inicial pronta.",
    href: "/editor/new",
    cta: "Abrir editor novo",
  },
  {
    title: "4. Acompanhe credito e plano",
    description:
      "Use Credits e Plans para revisar saldo, conversao, compras e disponibilidade operacional.",
    href: "/credits",
    cta: "Revisar creditos",
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
                Uma visao curta do fluxo operacional: gerar, salvar, editar, acompanhar credito e evoluir com clareza.
              </p>
            </div>
          </div>

          <div className="hero-side-panel">
            <div className="hero-side-list">
              <div className="hero-side-note">
                <strong>Fluxo unico</strong>
                <span>Creators prepara contexto, Projetos organiza continuidade e o editor centraliza a execucao.</span>
              </div>
              <div className="hero-side-note">
                <strong>Controle financeiro</strong>
                <span>Plans e Credits mostram o que esta disponivel, o que foi usado e o que muda em cada decisao.</span>
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
        <strong>Entrada rapida</strong>
        <span>
          Se voce ja sabe o formato do trabalho, va direto para{" "}
          <Link href="/editor/new" className="text-link-ea">
            /editor/new
          </Link>{" "}
          e abra um projeto com contexto pronto.
        </span>
      </section>
    </div>
  );
}
