# PASSO 15 — Frontend foundation (Web + Mobile-ready)

Este ZIP contém **apenas os novos apps** (Web e Mobile) + o package `sdk` compartilhado.
Você deve **mesclar** esta estrutura no repositório atual (não substituir o backend).

## Apps incluídos
- `apps/web` — Next.js (App Router) com login, callback e dashboard.
- `apps/mobile` — Expo (React Native) com login e home.
- `packages/sdk` — Client REST para seu backend Express + tipos básicos.

## Pré-requisitos
- Backend rodando localmente (ex.: http://localhost:3000)
- Projeto Supabase configurado (URL + anon key)

## Variáveis de ambiente
Crie um `.env.local` em `apps/web` baseado em `.env.example`.

No mobile, use `app.config.js` e/ou `EXPO_PUBLIC_*` no `.env` do Expo (exemplo no `.env.example` do mobile).

## Fluxo
1. Frontend faz login via Supabase Auth (email/senha).
2. Obtém `access_token` (Supabase).
3. Chama o backend com `Authorization: Bearer <access_token>` usando o `sdk`.

## Como rodar
Na raiz:
- `npm i`
- `npm run dev:web`
- `npm run dev:mobile`
