import { PublicDocumentPage } from "../../components/public/PublicDocumentPage";

export default function PrivacyPage() {
  return (
    <PublicDocumentPage
      kicker="Privacidade"
      title="Como tratamos dados nesta fase"
      summary="Esta base pública explica, em nível de produto, quais dados entram na plataforma, como eles circulam e onde ainda existe dependência de terceiros."
      sections={[
        {
          title: "1. Dados de conta e autenticação",
          body: [
            "O produto usa autenticação para proteger áreas logadas, rotas sensíveis e acesso administrativo. Dados de conta e sessão são tratados para login, autorização, operação do workspace e segurança básica da plataforma.",
            "Dados da conta não são usados como material de treino do produto. Eles existem para identificação, autorização, suporte, operação e investigação técnica quando houver falha.",
          ],
        },
        {
          title: "2. Dados operacionais e conteúdo de uso",
          body: [
            "Briefings, saídas geradas, projetos, checkpoints, histórico operacional, suporte e eventos de uso podem ser processados para que creators, editor, projetos, créditos e suporte funcionem com continuidade real.",
            "Esses dados podem ser armazenados e correlacionados para recuperar contexto, investigar erro, sustentar segurança de acesso e permitir suporte operacional.",
          ],
        },
        {
          title: "3. Retenção e acesso interno",
          body: [
            "Nesta fase, retenção e exclusão seguem política operacional de produto e suporte, não um programa jurídico completo já fechado. O produto mantém o mínimo necessário para operação, segurança, suporte e investigação.",
            "Acesso interno a dados deve ser restrito ao que for necessário para operar o sistema, investigar falhas e responder solicitações legítimas do usuário.",
          ],
        },
        {
          title: "4. Terceiros e transferência de dados",
          body: [
            "Parte do processamento pode depender de terceiros, incluindo autenticação, provedores de IA, hospedagem, observabilidade, storage e, futuramente, plataformas externas conectadas. Isso significa que alguns dados podem circular por serviços parceiros estritamente para viabilizar a funcionalidade.",
            "Quando um fluxo depende de terceiro, o comportamento, a disponibilidade e o tratamento técnico de dados podem variar conforme o provedor envolvido.",
          ],
        },
        {
          title: "5. Limite desta página",
          body: [
            "Esta página é uma base pública honesta de produto. Ela melhora transparência real, mas não substitui política jurídica revisada por advogado, DPA, matriz formal de retenção ou documentação regulatória completa.",
          ],
        },
      ]}
    />
  );
}
