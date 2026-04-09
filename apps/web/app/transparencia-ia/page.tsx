import { PublicDocumentPage } from "../../components/public/PublicDocumentPage";

export default function AiTransparencyPage() {
  return (
    <PublicDocumentPage
      kicker="Transparência de IA"
      title="O que a IA faz, o que não faz e onde pode falhar"
      summary="O produto não deve insinuar automação madura onde ela ainda não existe. Esta página deixa explícito o papel real da IA na plataforma hoje."
      sections={[
        {
          title: "1. O que a IA faz hoje",
          body: [
            "A IA participa da geração e estruturação de base criativa, apoio editorial, sugestões, organização de contexto e algumas rotas de continuidade entre creators, editor e projetos.",
            "Na prática, a plataforma usa IA para acelerar briefing, primeira saída, refinamento e rastreio operacional do trabalho, não para prometer autonomia completa do fluxo inteiro.",
          ],
        },
        {
          title: "2. O que continua assistido ou manual",
          body: [
            "Revisão final, validação factual, decisão editorial, publicação, conferência de saída e tratamento de exceções continuam exigindo ação humana ou operação assistida em vários casos.",
            "Algumas áreas do produto usam linguagem de continuidade e apoio operacional de propósito. Isso existe para não vender automação plena onde o fluxo ainda depende de acompanhamento real.",
          ],
        },
        {
          title: "3. Dependência de providers",
          body: [
            "Parte da experiência depende de providers e serviços terceirizados de IA. Quando um provider varia em latência, disponibilidade, custo, limite ou qualidade, a experiência do produto pode variar junto.",
            "Isso significa que creators, outputs e respostas não devem ser tratados como infalíveis, uniformes ou imutáveis entre execuções.",
          ],
        },
        {
          title: "4. Falhas, limites e revisão",
          body: [
            "A IA pode errar fatos, extrapolar, resumir mal, sugerir estruturas fracas, interpretar contexto de forma imprecisa ou retornar saída abaixo do esperado. O produto já possui checkpoints, suporte e trilhas de continuidade para reduzir dano, mas isso não elimina revisão humana.",
            "Se o conteúdo tiver impacto comercial, reputacional, contratual, financeiro ou público, a revisão humana continua obrigatória.",
          ],
        },
        {
          title: "5. Compromisso de honestidade",
          body: [
            "O Editor AI Creator assume o compromisso de mostrar com clareza quando um fluxo é automatizado, quando é assistido, quando depende de terceiro e quando a confirmação final ainda não pode ser tratada como automática.",
          ],
        },
      ]}
    />
  );
}
