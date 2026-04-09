import { RouteBoundaryFrame } from "../../components/ui/RouteBoundaryFrame";

export default function AuthLoading() {
  return (
    <RouteBoundaryFrame
      kicker="Acesso"
      badge="Carregando acesso"
      title="Preparando a entrada na plataforma"
      description="Estamos validando a rota de acesso antes de abrir o formulário ou redirecionar a sessão atual."
      asideTitle="Nesta etapa"
      asideItems={[
        <div key="session">
          <strong>Sessão primeiro</strong>
          <span>A rota não precisa abrir solta antes de saber se já existe uma sessão válida.</span>
        </div>,
        <div key="redirect">
          <strong>Redirect no estado certo</strong>
          <span>Se a sessão já estiver pronta, o fluxo segue direto para o próximo destino.</span>
        </div>,
      ]}
      emphasis={<span className="route-boundary-pulse" aria-hidden="true" />}
      shellClassName="route-boundary-page-auth"
    />
  );
}
