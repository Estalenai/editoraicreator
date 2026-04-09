import { PublicDocumentPage } from "../../components/public/PublicDocumentPage";

export default function TermsPage() {
  return (
    <PublicDocumentPage
      kicker="Termos de uso"
      title="Regras base de uso do Editor AI Creator"
      summary="Esta página descreve em linguagem de produto como o acesso, o uso e os limites operacionais funcionam hoje no beta controlado."
      sections={[
        {
          title: "1. Escopo atual do produto",
          body: [
            "O Editor AI Creator é uma plataforma de criação e continuidade de conteúdo com creators, editor, projetos, créditos, suporte e área administrativa restrita. Nem toda funcionalidade pública ou planejada está liberada no beta controlado.",
            "O acesso depende de conta válida, aprovação quando aplicável e respeito às regras de uso desta fase. O produto pode evoluir, mudar disponibilidade de fluxos e alterar integrações antes do lançamento definitivo.",
          ],
        },
        {
          title: "2. Conta, acesso e responsabilidade",
          body: [
            "Você é responsável por proteger suas credenciais, usar a conta de forma legítima e manter dados cadastrais corretos. O acesso pode ser suspenso ou revogado em caso de uso abusivo, fraude, tentativa de burlar limites ou violação das políticas públicas do produto.",
            "Áreas logadas e sensíveis são protegidas por autenticação e gate de rota. Mesmo assim, você continua responsável por revisar o que gera, salva, exporta ou publica a partir da plataforma.",
          ],
        },
        {
          title: "3. Saídas, revisão humana e limites",
          body: [
            "As saídas do produto podem envolver geração, transformação, consolidação editorial, checkpoints e exportação. Elas não substituem revisão humana final quando houver impacto comercial, reputacional, regulatório ou factual.",
            "O Editor AI Creator não garante que toda saída esteja correta, própria para publicação imediata ou livre de erro. A responsabilidade pela revisão, decisão final e uso externo continua com a pessoa ou equipe que opera o produto.",
          ],
        },
        {
          title: "4. Dependência de terceiros",
          body: [
            "Parte da experiência depende de provedores e plataformas terceiras, como autenticação, IA, hospedagem, deploy, pagamentos e storage. Essas dependências podem afetar disponibilidade, latência, limite de uso e comportamento de determinados fluxos.",
            "Quando um terceiro falhar, atrasar ou mudar comportamento, o Editor AI Creator pode degradar parcialmente, suspender ações específicas ou exigir tentativa posterior.",
          ],
        },
        {
          title: "5. Encerramento, suspensão e mudanças",
          body: [
            "O produto pode ajustar fluxos, limites, planos, políticas e disponibilidade conforme a fase de operação evolui. Em caso de abuso, risco operacional ou necessidade de proteção do sistema, contas e acessos podem ser limitados temporária ou permanentemente.",
            "Esta página é uma base operacional de produto e não substitui revisão jurídica formal posterior.",
          ],
        },
      ]}
    />
  );
}
