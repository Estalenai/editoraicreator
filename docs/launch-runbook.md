# Launch Runbook

Base operacional mínima do Editor AI Creator para pré-lançamento e lançamento controlado.

## 1. Pré-check obrigatório

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

Condições mínimas:

- `lint` verde
- `build` verde
- acessibilidade base verde
- fluxos críticos verdes
- teste operacional da API verde

## 2. Ambientes e configuração

Antes de publicar:

- confirmar `.env` do web e da API
- confirmar bloqueio de overrides E2E em produção
- confirmar segredos e variáveis por ambiente
- confirmar URLs de callback e origem pública

## 3. Deploy

Sequência recomendada:

1. publicar API
2. validar health e autenticação
3. publicar web
4. validar rotas públicas
5. validar login
6. validar `dashboard`, `creators`, `projects`, `credits`, `support` e `admin`

## 4. Pós-deploy imediato

Checklist curto:

- home abre sem erro
- login abre sem erro
- páginas públicas de transparência estão acessíveis
- gate de rota continua ativo
- rotas logadas principais abrem
- admin continua restrita
- logs estruturados continuam chegando

## 5. Rollback

Faça rollback se houver qualquer um destes sinais:

- falha de login ou redirect quebrado
- rotas públicas indisponíveis
- build publicado com erro estrutural
- regressão séria em gate, boundaries ou critical flows
- incidentes repetidos sem mitigação rápida

Ordem de rollback:

1. web para a última versão estável
2. API para a última versão estável
3. validar health, login e dashboard
4. comunicar congelamento operacional até nova correção

## 6. Resposta inicial a incidente

Perguntas que precisam ser respondidas rápido:

- o problema está no web, API ou terceiro?
- é falha total, parcial ou só degradação?
- afeta login, geração, editor, credits, support ou admin?
- existe workaround seguro?
- precisa bloquear rota, esconder ação ou reverter deploy?

Passos mínimos:

1. reproduzir
2. capturar `requestId`, rota e contexto
3. verificar logs web e API
4. isolar se a causa é interna ou de terceiro
5. decidir rollback, mitigação ou hotfix

## 7. Operação pública e suporte

Antes do lançamento controlado:

- rotas `/termos`, `/privacidade`, `/transparencia-ia`, `/uso-aceitavel`, `/cancelamento-e-reembolso` e `/como-operamos` precisam estar publicadas
- o time precisa saber que essa camada é base de produto, não parecer jurídico final
- dúvidas sobre política comercial, retenção ou uso sensível precisam ser encaminhadas para revisão posterior quando necessário

## 8. Limite deste documento

Este runbook é a base mínima para operação séria. Ele não substitui:

- processo formal de compliance
- documentação jurídica revisada
- matriz completa de alerta/on-call
- documentação completa de integrações externas
