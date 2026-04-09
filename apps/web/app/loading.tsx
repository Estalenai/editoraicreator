import { RouteBoundaryFrame } from "../components/ui/RouteBoundaryFrame";

export default function RootLoading() {
  return (
    <RouteBoundaryFrame
      kicker="Carregando a rota"
      badge="Carregando"
      title="Preparando esta etapa com segurança"
      description="Estamos montando a rota, validando os dados essenciais e liberando a interface no estado certo."
      asideTitle="Enquanto isso"
      asideItems={[
        <div key="shell">
          <strong>Shell já validado</strong>
          <span>O App Router segura a navegação antes de soltar a tela no estado errado.</span>
        </div>,
        <div key="data">
          <strong>Dados entram na ordem certa</strong>
          <span>A rota sobe com boundary real, em vez de depender só de soluções locais.</span>
        </div>,
        <div key="handoff">
          <strong>Continuidade preservada</strong>
          <span>Assim que a rota fica pronta, o fluxo volta no mesmo contexto.</span>
        </div>,
      ]}
      emphasis={<span className="route-boundary-pulse" aria-hidden="true" />}
    />
  );
}
