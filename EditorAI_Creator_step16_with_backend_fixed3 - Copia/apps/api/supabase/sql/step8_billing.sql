-- PASSO 8 — Billing Stripe + Estrutura de assinaturas + Logs (audit) + Coluna price_id
-- Execute no Supabase SQL Editor.
-- Este arquivo é auto-suficiente (não depende dos passos 6/7).

create extension if not exists "pgcrypto";

-- updated_at helper (caso ainda não exista)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Plans: catálogo interno + price_id do Stripe
create table if not exists public.plans (
  code text primary key,
  name text not null,
  tier int not null default 0,
  stripe_price_id text, -- ex: price_123
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Assinaturas: espelho mínimo do Stripe (atualizado via webhook)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  plan_code text references public.plans(code),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user on public.subscriptions(user_id);

-- Mapeamento customer Stripe <-> user
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

-- Audit logs (para billing e anti-abuso)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_customers enable row level security;
alter table public.audit_logs enable row level security;

-- Plans: autenticado pode ler
drop policy if exists "plans_read_all" on public.plans;
create policy "plans_read_all"
on public.plans for select
to authenticated
using (true);

-- Subscriptions: usuário lê apenas as próprias
drop policy if exists "subs_select_own" on public.subscriptions;
create policy "subs_select_own"
on public.subscriptions for select
to authenticated
using (user_id = auth.uid());

-- billing_customers: usuário lê apenas o próprio (opcional)
drop policy if exists "billing_customers_select_own" on public.billing_customers;
create policy "billing_customers_select_own"
on public.billing_customers for select
to authenticated
using (user_id = auth.uid());

-- audit_logs: usuário lê apenas os próprios
drop policy if exists "audit_select_own" on public.audit_logs;
create policy "audit_select_own"
on public.audit_logs for select
to authenticated
using (user_id = auth.uid());

-- Writes pelo client desabilitados (writes via service role/webhook/backend)
revoke insert, update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.billing_customers from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;

-- Seeds mínimos (ajuste stripe_price_id depois via SQL/Backoffice)
insert into public.plans(code, name, tier, stripe_price_id, features)
values
  ('FREE','Free',0,null,'{"limits":{"projects":3,"texts":10,"prompts":10}}'),
  ('PRO','Pro',1,null,'{"limits":{"projects":100,"texts":1000,"prompts":1000}}')
on conflict (code) do update
set name = excluded.name,
    tier = excluded.tier,
    features = excluded.features;
