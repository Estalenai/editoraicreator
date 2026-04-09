import { PublicDocumentPage } from "../../components/public/PublicDocumentPage";

export default function AcceptableUsePage() {
  return (
    <PublicDocumentPage
      kicker="Uso aceitável"
      title="O que não pode acontecer dentro da plataforma"
      summary="Uma base mínima séria de lançamento precisa deixar claro o tipo de uso que o produto não aceita, mesmo antes de uma política jurídica mais extensa."
      sections={[
        {
          title: "1. Uso legítimo",
          body: [
            "A plataforma existe para criação, edição, continuidade e operação de conteúdo e projetos de forma legítima. O uso deve respeitar leis aplicáveis, direitos de terceiros e limites técnicos do produto.",
          ],
        },
        {
          title: "2. O que é proibido",
          body: [
            "Não é permitido usar a plataforma para fraude, phishing, abuso, assédio, spam, desinformação deliberada, invasão, evasão de segurança, automação maliciosa, tentativa de quebrar controles de acesso ou exploração do sistema fora do uso previsto.",
            "Também não é permitido usar o produto para violar direitos autorais, privacidade, marca, imagem, dados de terceiros ou qualquer obrigação contratual que o usuário não tenha direito de assumir.",
          ],
        },
        {
          title: "3. Integridade da operação",
          body: [
            "Não é permitido contornar limites de uso, forjar estado de saída, manipular crédito, explorar o ambiente E2E, simular autorização indevida, abusar de áreas administrativas ou tentar acessar rotas restritas sem autorização.",
          ],
        },
        {
          title: "4. Resposta a abuso",
          body: [
            "Uso abusivo pode resultar em limitação, suspensão, revogação de acesso, preservação de registros operacionais relevantes e encaminhamento para análise mais séria conforme a gravidade do caso.",
          ],
        },
      ]}
    />
  );
}
