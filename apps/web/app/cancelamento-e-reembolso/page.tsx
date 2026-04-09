import { PublicDocumentPage } from "../../components/public/PublicDocumentPage";

export default function BillingPolicyPage() {
  return (
    <PublicDocumentPage
      kicker="Cancelamento e reembolso"
      title="Como tratamos assinatura, cancelamento e ajustes financeiros hoje"
      summary="Esta não é uma política jurídica final. É a base pública honesta do que a equipe assume nesta fase para evitar ambiguidade comercial."
      sections={[
        {
          title: "1. Escopo desta página",
          body: [
            "O Editor AI Creator ainda opera em beta controlado e a camada comercial pode evoluir. Esta página descreve a política operacional mínima de produto para assinatura, cancelamento e análise de ajuste financeiro na fase atual.",
          ],
        },
        {
          title: "2. Cancelamento",
          body: [
            "Quando houver assinatura recorrente ativa, o cancelamento deve encerrar a renovação futura sem apagar automaticamente histórico operacional, suporte ou registros necessários para segurança e investigação.",
            "Se o fluxo comercial ainda estiver em ativação assistida ou beta controlado, parte do processo pode depender de suporte operacional.",
          ],
        },
        {
          title: "3. Reembolso e exceções",
          body: [
            "Pedidos de reembolso não devem ser prometidos como automáticos nesta fase. Eles precisam ser analisados conforme estado da assinatura, uso efetivo, créditos já consumidos, falha operacional comprovada e escopo comercial vigente.",
            "Quando existir erro técnico grave, cobrança indevida comprovada ou ativação claramente inconsistente com o que foi entregue, a equipe deve revisar o caso com prioridade e responder com registro claro.",
          ],
        },
        {
          title: "4. Creator Coins e consumo",
          body: [
            "Créditos, consumos, conversões e histórico financeiro precisam seguir o ledger operacional da conta. Ajustes manuais, quando necessários, devem ser rastreáveis e tratados como exceção, não como regra silenciosa.",
          ],
        },
        {
          title: "5. Revisão posterior",
          body: [
            "Esta base melhora transparência comercial real, mas ainda deve ser revisada junto da implementação final de pagamentos, termos comerciais e orientação jurídica antes do lançamento definitivo.",
          ],
        },
      ]}
    />
  );
}
