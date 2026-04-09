"use client";

import { RouteErrorBoundary } from "../components/ui/RouteErrorBoundary";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      kicker="Falha de rota"
      badge="Erro"
      title="Esta rota saiu do trilho"
      description="A navegação falhou antes de concluir a etapa com segurança. A interface não fica solta: você pode tentar de novo ou voltar para um ponto estável."
      asideTitle="Como recuperar"
      asideItems={[
        <div key="retry">
          <strong>Nova tentativa imediata</strong>
          <span>O reset reexecuta a rota atual sem depender de refresh manual.</span>
        </div>,
        <div key="stable">
          <strong>Ponto seguro</strong>
          <span>Se a falha persistir, volte para o dashboard ou reabra o fluxo pelo início.</span>
        </div>,
        <div key="dignity">
          <strong>Falha com dignidade</strong>
          <span>O App Router agora segura a queda com boundary real, não com improviso dentro da página.</span>
        </div>,
      ]}
    />
  );
}
