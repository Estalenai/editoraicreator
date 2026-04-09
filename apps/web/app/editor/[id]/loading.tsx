import { RouteBoundaryFrame } from "../../../components/ui/RouteBoundaryFrame";

export default function EditorLoading() {
  return (
    <RouteBoundaryFrame
      kicker="Editor"
      badge="Abrindo editor"
      title="Preparando o projeto salvo"
      description="Estamos abrindo o editor com contexto, histórico e saída do projeto no mesmo fluxo antes de liberar a interface."
      asideTitle="Nesta etapa"
      asideItems={[
        <div key="doc">
          <strong>Documento primeiro</strong>
          <span>A rota segura o carregamento antes de expor um editor incompleto.</span>
        </div>,
        <div key="history">
          <strong>Contexto preservado</strong>
          <span>Versões, checkpoints e estado operacional entram no mesmo shell.</span>
        </div>,
        <div key="exit">
          <strong>Saída continua ligada</strong>
          <span>O histórico do projeto permanece ligado à mesma abertura do editor.</span>
        </div>,
      ]}
      emphasis={<span className="route-boundary-pulse" aria-hidden="true" />}
      shellClassName="route-boundary-page-editor"
    />
  );
}
