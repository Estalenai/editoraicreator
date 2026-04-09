"use client";

import { RouteErrorBoundary } from "../../components/ui/RouteErrorBoundary";

export default function AuthError({
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
      kicker="Acesso"
      badge="Falha de acesso"
      title="Nao foi possivel abrir a entrada agora"
      description="A camada de acesso falhou antes de estabilizar a sessão ou o formulário. Você pode tentar novamente ou voltar para o início público."
      asideTitle="Recuperação"
      asideItems={[
        <div key="retry">
          <strong>Tente de novo</strong>
          <span>O reset reexecuta a rota de acesso sem depender de refresh manual.</span>
        </div>,
        <div key="safe">
          <strong>Ponto seguro</strong>
          <span>Se continuar falhando, volte para o início público e reabra o login por lá.</span>
        </div>,
      ]}
      homeHref="/login"
      homeLabel="Reabrir login"
      secondaryHref="/"
      secondaryLabel="Voltar ao início"
      shellClassName="route-boundary-page-auth"
    />
  );
}
