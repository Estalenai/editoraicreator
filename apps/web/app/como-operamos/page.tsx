import { PublicDocumentPage } from "../../components/public/PublicDocumentPage";

export default function HowWeOperatePage() {
  return (
    <PublicDocumentPage
      kicker="Como operamos"
      title="Camada pública de operação do produto"
      summary="Esta página deixa claro como o Editor AI Creator funciona hoje em produção controlada, sem sugerir maturidade inexistente."
      sections={[
        {
          title: "1. Fase atual",
          body: [
            "O produto opera em beta controlado. Isso significa que parte da experiência já é séria e rastreável, mas algumas integrações, automações e políticas comerciais ainda estão em amadurecimento antes do lançamento definitivo.",
          ],
        },
        {
          title: "2. O que é central hoje",
          body: [
            "O núcleo do produto está em creators, editor, projetos e saída com continuidade clara. Camadas como créditos, suporte, admin e áreas futuras existem para sustentar operação, não para inflar promessa.",
          ],
        },
        {
          title: "3. Dependências externas",
          body: [
            "Parte da plataforma depende de serviços terceiros como autenticação, provedores de IA, hospedagem, storage, observabilidade e, futuramente, integrações externas. Quando esses serviços oscilam, a plataforma pode responder com degradação parcial, espera maior ou bloqueio temporário de rotas específicas.",
          ],
        },
        {
          title: "4. O que pode falhar e como respondemos",
          body: [
            "Falhas podem acontecer em login, carregamento de rota, geração de saída, sync de projeto, créditos, suporte ou áreas administrativas. O produto já possui gate de rota, boundaries, observabilidade básica, validação crítica e recuperação mínima para reduzir fragilidade operacional.",
            "Mesmo assim, falha não deve ser tratada como impossível. A operação séria depende de investigação, suporte e runbook, não de promessa vaga de infalibilidade.",
          ],
        },
        {
          title: "5. O que ainda exige revisão posterior",
          body: [
            "Políticas jurídicas finais, configuração comercial definitiva, integração externa completa, alertas avançados e documentação regulatória ainda precisam de aprofundamento antes do lançamento definitivo. Esta página existe para não esconder isso.",
          ],
        },
      ]}
    />
  );
}
