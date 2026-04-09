import { setTimeout as delay } from "node:timers/promises";

export const dynamic = "force-dynamic";

export default async function BoundaryLoadingProbePage() {
  await delay(1600);

  return (
    <div className="page-shell route-boundary-proof-page">
      <section className="surface-flow-region route-boundary-proof-card">
        <p className="section-kicker">Boundary proof</p>
        <h1 className="route-boundary-proof-title">Boundary loading probe ready.</h1>
        <p className="route-boundary-proof-copy">
          Esta rota existe apenas para provar que o App Router mostra loading real antes de liberar o conteúdo final.
        </p>
      </section>
    </div>
  );
}
