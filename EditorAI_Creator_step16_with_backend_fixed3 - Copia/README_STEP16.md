# PASSO 16 — Editor AI Creator (UI + Fluxos)

Este passo adiciona o Editor AI Creator (MVP de UI + fluxos) no Web (Next.js) e melhora o Mobile (Expo) com um editor básico.

## Web (Next.js)

### Rotas
- `/dashboard`
  - Lista projetos e adiciona botão **Abrir Editor**
  - Cada projeto tem link **Editar** para `/editor/[id]`
- `/editor/new`
  - Cria um projeto com estrutura inicial em `projects.data.editor` (JSON)
- `/editor/[id]`
  - Abre o editor do projeto
  - Abas: Vídeo, Texto, Workflows, Cursos, Sites, Biblioteca IA
  - Modos: Professor e Transparente (log de passos da Autocrie)
  - Integrações prontas via backend:
    - `POST /api/ai/text-generate`
    - `POST /api/ai/fact-check`
  - Botão **Salvar** persiste em `projects.data.editor`

## Mobile (Expo)

- Login via Supabase
- Lista de projetos
- Criar projeto de texto
- Editor MVP de texto com:
  - Gerar texto (usa `POST /api/ai/text-generate`)
  - Salvar (usa `PATCH /api/projects/:id`)

## SDK compartilhado

O pacote `packages/sdk` foi ampliado com:
- `getProject(id)`
- `updateProject(id, payload)`
- `deleteProject(id)`
- `aiTextGenerate({ prompt })`
- `aiFactCheck({ claim })`

## Como rodar

### 1) Backend (API)
- Copie `apps/api/.env.example` para `.env` na raiz do repositório **ou** crie `apps/api/.env` (a raiz é recomendada).
- Inicie a API: `npm run dev:api` (ou `npm run start:api`)
- A API roda em `http://localhost:3000`
- Health: `/health/live` e `/health/ready`

### 2) Web
- `npm i`
- `npm run dev:web`

### 3) Mobile
- `npm run dev:mobile`

## Observações importantes
- Sem chaves reais, os endpoints de IA podem retornar erro “provider not configured” (isso é esperado).
- O fact-check com busca na internet pode estar bloqueado por plano dependendo das features e do tier.
