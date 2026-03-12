-- PASSO 12 — Anti Fake News (Fact-check) com evidências + histórico
-- Requer: PASSO 9 (ai_usage/configs) e Auth Supabase.

create extension if not exists "pgcrypto";

-- =========================
-- FACT CHECKS (histórico)
-- =========================
create table if not exists public.fact_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  claim text not null,
  query text,

  verdict text not null check (verdict in ('TRUE','FALSE','MIXED','INSUFFICIENT')),
  confidence numeric(4,3) not null default 0,
  summary text not null,

  provider text,
  model text,
  search_provider text,

  citations jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_fact_checks_user_created
  on public.fact_checks(user_id, created_at desc);

-- =========================
-- FACT CHECK SOURCES (evidências)
-- =========================
create table if not exists public.fact_check_sources (
  id uuid primary key default gen_random_uuid(),
  fact_check_id uuid not null references public.fact_checks(id) on delete cascade,
  rank int not null,
  title text,
  url text not null,
  snippet text,
  source_name text,
  published_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);

create unique index if not exists uq_fact_check_sources_rank
  on public.fact_check_sources(fact_check_id, rank);

create index if not exists idx_fact_check_sources_fact
  on public.fact_check_sources(fact_check_id);

-- =========================
-- RLS
-- =========================
alter table public.fact_checks enable row level security;
alter table public.fact_check_sources enable row level security;

-- Usuário pode ler apenas seus checks
create policy "fact_checks_select_own"
on public.fact_checks for select
to authenticated
using (user_id = auth.uid());

-- Bloquear writes via client (somente backend/service role)
revoke insert, update, delete on public.fact_checks from authenticated;

-- Sources: usuário lê se o check for dele
create policy "fact_check_sources_select_own"
on public.fact_check_sources for select
to authenticated
using (
  exists (
    select 1 from public.fact_checks fc
    where fc.id = fact_check_id and fc.user_id = auth.uid()
  )
);

revoke insert, update, delete on public.fact_check_sources from authenticated;

-- =========================
-- Config padrão de fact-check (opcional)
-- =========================
-- Depende da existência de public.configs (PASSO 9)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='configs') then
    insert into public.configs(key, value)
    values (
      'fact_check',
      jsonb_build_object(
        'sources_limit', 6,
        'min_snippet_chars', 40,
        'disallow_domains', jsonb_build_array(),
        'require_internet_search', true
      )
    )
    on conflict (key) do nothing;
  end if;
end $$;

-- Storage (opcional; se você for permitir upload de arquivos para checagem)
-- insert into storage.buckets (id, name, public) values ('fact-check-files', 'fact-check-files', false)
-- on conflict (id) do nothing;
