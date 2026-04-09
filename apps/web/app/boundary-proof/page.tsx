import Link from "next/link";

export default function BoundaryProofIndexPage() {
  return (
    <div className="page-shell route-boundary-proof-page">
      <section className="surface-flow-region route-boundary-proof-card">
        <p className="section-kicker">Boundary proof</p>
        <h1 className="route-boundary-proof-title">Boundary probes</h1>
        <p className="route-boundary-proof-copy">
          Esta área existe só para validar loading, error e recuperação real do App Router sem depender de hacks no resto do produto.
        </p>
        <div className="hero-actions-row route-boundary-actions">
          <Link href="/boundary-proof/loading" className="btn-link-ea btn-primary">
            Abrir loading probe
          </Link>
          <Link href="/boundary-proof/error" className="btn-link-ea btn-ghost">
            Abrir error probe
          </Link>
        </div>
      </section>
    </div>
  );
}
