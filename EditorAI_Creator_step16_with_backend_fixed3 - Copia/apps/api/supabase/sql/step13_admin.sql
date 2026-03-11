-- STEP 13 - Admin policies and admin-support tables
-- Run after step7/step8/step9 SQLs.
-- This script focuses on:
-- 1) ensuring required columns exist
-- 2) enabling RLS (where applicable)
-- 3) adding admin read policies for audit/configs/profiles

-- --------------------
-- PROFILES: ensure role column exists
-- --------------------
alter table if exists public.profiles
  add column if not exists role text not null default 'user';

-- --------------------
-- PLANS: ensure admin-editable columns exist
-- --------------------
alter table if exists public.plans
  add column if not exists tier int not null default 0;

alter table if exists public.plans
  add column if not exists stripe_price_id text;

alter table if exists public.plans
  add column if not exists features jsonb not null default '{}'::jsonb;

-- --------------------
-- CONFIGS: ensure exists (used for dynamic pricing/flags/packs)
-- --------------------
create table if not exists public.configs (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_configs_updated on public.configs;
create trigger trg_configs_updated
before update on public.configs
for each row execute function public.set_updated_at();

-- --------------------
-- AUDIT LOGS: ensure exists
-- --------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- --------------------
-- RLS + POLICIES
-- --------------------
alter table public.configs enable row level security;
alter table public.audit_logs enable row level security;
alter table if exists public.profiles enable row level security;

-- configs: admin can read; writes should be done via service role (backend)
drop policy if exists "configs_select_admin" on public.configs;
create policy "configs_select_admin"
on public.configs for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

-- audit_logs: user reads own, admin reads all
drop policy if exists "audit_select_own" on public.audit_logs;
create policy "audit_select_own"
on public.audit_logs for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "audit_select_admin" on public.audit_logs;
create policy "audit_select_admin"
on public.audit_logs for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

-- profiles: admin read-all policy
drop policy if exists "profiles_select_admin_all" on public.profiles;
create policy "profiles_select_admin_all"
on public.profiles for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

-- NOTE: To promote your first admin, run once in SQL editor:
-- update public.profiles set role='admin' where user_id='<YOUR_USER_UUID>';
