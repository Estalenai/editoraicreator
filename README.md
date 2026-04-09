# Editor AI Creator

Plataforma de continuidade criativa com `creators`, `editor`, `projetos`, `credits`, `support` e `admin`.

## Estado atual

- Frontend web em `Next.js App Router`
- API em `Node.js`
- Gate de rotas endurecido
- Boundaries reais de `loading`, `error` e `not-found`
- Observabilidade básica séria
- Cobertura crítica e acessibilidade base mínimas
- Base pública de transparência e operação disponível no app

## Estrutura principal

- `apps/web`: aplicação web
- `apps/api`: API
- `scripts`: validações, smoke tests e harnesses E2E
- `docs/launch-runbook.md`: operação, deploy, rollback e incidente

## Setup rápido

1. Instale dependências na raiz.
2. Configure os `.env` necessários para `apps/web` e `apps/api`.
3. Suba a API.
4. Suba o web.

Comandos:

```powershell
pnpm install
pnpm dev:api
pnpm dev:web
```

## Ambientes

- `development`: desenvolvimento local com mocks e validações dedicadas
- `preview`: ambiente para validação pré-lançamento
- `production`: ambiente de lançamento, com overrides E2E explicitamente bloqueados

Observação:

- Recursos de QA/E2E existem para teste local e validações automatizadas.
- Eles não devem permanecer habilitados ou acessíveis em produção.

## Validações mínimas antes de lançar

Web:

```powershell
pnpm -C apps/web lint
pnpm -C apps/web build
node scripts/validate-accessibility-base.mjs
node scripts/e2e-critical-flows.mjs
```

API:

```powershell
npm run test:operational:api
```

## Base pública do produto

Rotas públicas atuais:

- `/termos`
- `/privacidade`
- `/transparencia-ia`
- `/uso-aceitavel`
- `/cancelamento-e-reembolso`
- `/como-operamos`

Essas páginas são base de produto e transparência operacional. Elas melhoram honestidade pública, mas não substituem revisão jurídica formal.

## Operação de lançamento

Use o runbook em [docs/launch-runbook.md](/C:/Users/wesle/Downloads/editoraicreator-git/docs/launch-runbook.md) para:

- setup e pré-check
- deploy
- rollback
- resposta inicial a incidente
- checklist de lançamento

## Limites conhecidos

- Parte da experiência ainda depende de terceiros para autenticação, IA, hospedagem e integrações futuras.
- A base pública e operacional já existe, mas revisão legal posterior continua necessária antes do lançamento definitivo.
- A cobertura automatizada atual é o mínimo sério para reduzir regressão, não uma suíte exaustiva.
