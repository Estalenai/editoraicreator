import Link from "next/link";
import { RouteBoundaryFrame } from "../components/ui/RouteBoundaryFrame";

export default function RootNotFound() {
  return (
    <RouteBoundaryFrame
      kicker="Rota não encontrada"
      badge="404"
      title="Esta etapa não existe ou saiu do fluxo atual"
      description="A rota pedida não foi encontrada. Em vez de cair num vazio genérico, a aplicação devolve caminhos seguros para retomar continuidade."
      asideTitle="Caminhos seguros"
      asideItems={[
        <div key="dashboard">
          <strong>Dashboard</strong>
          <span>Retome creators, editor e projetos a partir do centro da plataforma.</span>
        </div>,
        <div key="projects">
          <strong>Projetos</strong>
          <span>Abra a continuidade já salva e volte para uma saída conhecida.</span>
        </div>,
        <div key="home">
          <strong>Início público</strong>
          <span>Se você veio de fora do fluxo logado, recomece pelo ponto principal.</span>
        </div>,
      ]}
      actions={
        <>
          <Link href="/dashboard" className="btn-link-ea btn-primary">
            Ir para o dashboard
          </Link>
          <Link href="/projects" className="btn-link-ea btn-ghost">
            Abrir projetos
          </Link>
          <Link href="/" className="btn-link-ea btn-ghost">
            Voltar ao início
          </Link>
        </>
      }
    />
  );
}
