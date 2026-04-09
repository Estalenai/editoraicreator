"use client";

import { RouteErrorBoundary } from "../components/ui/RouteErrorBoundary";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="app-root-body">
        <RouteErrorBoundary
          error={error}
          reset={reset}
          kicker="Falha global"
          badge="Erro global"
          title="A aplicação falhou antes de abrir a rota"
          description="Esta é a camada final de contenção. Quando o erro acontece acima das páginas, a aplicação ainda responde com uma saída digna e recuperável."
          asideTitle="Recuperação"
          asideItems={[
            <div key="global-retry">
              <strong>Tente reabrir a aplicação</strong>
              <span>O reset reexecuta o render global imediatamente.</span>
            </div>,
            <div key="global-safe">
              <strong>Volte para um ponto estável</strong>
              <span>Você pode reiniciar pelo início público ou pelo dashboard.</span>
            </div>,
            <div key="global-ops">
              <strong>Boundary de lançamento</strong>
              <span>Mesmo uma falha no shell principal não derruba a dignidade operacional da interface.</span>
            </div>,
          ]}
          homeHref="/dashboard"
          homeLabel="Abrir dashboard"
          secondaryHref="/"
          secondaryLabel="Ir para o início"
        />
      </body>
    </html>
  );
}
