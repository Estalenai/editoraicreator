-- PASSO 7 — Planos (Free vs Pro) + Assinaturas (base para Stripe)
-- Execute no Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.plans (
  code text primary key,
  name text not null,
  tier int not null default 0,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.plans(code),
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "plans_read_all" on public.plans;
create policy "plans_read_all"
on public.plans for select
to authenticated
using (true);

drop policy if exists "subs_select_own" on public.subscriptions;
create policy "subs_select_own"
on public.subscriptions for select
to authenticated
using (user_id = auth.uid());

revoke insert, update, delete on public.subscriptions from authenticated;

insert into public.plans(code, name, tier, features)
values
  ('FREE','Free',0,'{"limits":{"projects":3,"prompts":10}}'),
  ('PRO','Pro',1,'{"limits":{"projects":100,"prompts":1000}}')
on conflict (code) do nothing;
