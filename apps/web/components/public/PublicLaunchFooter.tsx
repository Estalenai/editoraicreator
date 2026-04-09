import Link from "next/link";

const PUBLIC_LAUNCH_LINKS = [
  { href: "/termos", label: "Termos de uso" },
  { href: "/privacidade", label: "Privacidade" },
  { href: "/transparencia-ia", label: "Transparência de IA" },
  { href: "/uso-aceitavel", label: "Uso aceitável" },
  { href: "/cancelamento-e-reembolso", label: "Cancelamento e reembolso" },
  { href: "/como-operamos", label: "Como operamos" },
];

export function PublicLaunchFooter() {
  return (
    <section className="public-launch-footer surface-flow-region layout-contract-region" aria-label="Base pública do produto">
      <div className="public-launch-footer-head">
        <div className="section-stack-tight">
          <p className="section-kicker">Base pública</p>
          <h2 className="heading-reset">Transparência mínima para lançamento</h2>
          <p className="helper-text-ea">
            Esta camada descreve como o produto opera hoje, o que depende de terceiros, o que pode falhar e como tratamos
            dados e acesso nesta fase.
          </p>
        </div>
        <span className="premium-badge premium-badge-phase">Base de produto, sujeita a revisão legal posterior</span>
      </div>

      <div className="public-launch-footer-grid">
        {PUBLIC_LAUNCH_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="public-launch-link">
            {item.label}
          </Link>
        ))}
      </div>

      <div className="public-launch-footer-note">
        <strong>Honestidade operacional</strong>
        <span>
          O Editor AI Creator ainda opera em beta controlado. Integrações, automações e políticas comerciais podem evoluir
          antes do lançamento definitivo.
        </span>
      </div>
    </section>
  );
}
