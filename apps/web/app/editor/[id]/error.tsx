"use client";

import { RouteErrorBoundary } from "../../../components/ui/RouteErrorBoundary";

export default function EditorError({
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
      kicker="Editor"
      badge="Falha no editor"
      title="O editor nao conseguiu abrir este projeto"
      description="A rota do editor falhou antes de estabilizar o documento. Em vez de deixar a tela quebrada, a aplicação entrega recuperação clara e caminhos seguros."
      asideTitle="Como retomar"
      asideItems={[
        <div key="retry">
          <strong>Reexecutar a abertura</strong>
          <span>Use o reset para tentar montar de novo o projeto atual.</span>
        </div>,
        <div key="projects">
          <strong>Voltar para projetos</strong>
          <span>Se o erro persistir, reabra o projeto pelo hub de continuidade.</span>
        </div>,
        <div key="new">
          <strong>Entrar por um novo documento</strong>
          <span>Você também pode voltar pela entrada do editor e abrir outro fluxo.</span>
        </div>,
      ]}
      homeHref="/projects"
      homeLabel="Voltar para projetos"
      secondaryHref="/editor/new"
      secondaryLabel="Abrir novo editor"
      shellClassName="route-boundary-page-editor"
    />
  );
}
