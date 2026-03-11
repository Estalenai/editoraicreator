-- PASSO 6 — CRUD básico (projects, texts, prompts) + RLS
-- Execute no Supabase SQL Editor (Database) em ambiente de desenvolvimento.

create extension if not exists "pgcrypto";

-- helper updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- PROJECTS
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'generic',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_user_created on public.projects(user_id, created_at desc);

drop trigger if exists trg_projects_updated on public.projects;
create trigger trg_projects_updated
before update on public.projects
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "projects_select_own"
on public.projects for select
to authenticated
using (user_id = auth.uid());

create policy "projects_insert_own"
on public.projects for insert
to authenticated
with check (user_id = auth.uid());

create policy "projects_update_own"
on public.projects for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "projects_delete_own"
on public.projects for delete
to authenticated
using (user_id = auth.uid());

-- TEXTS
create table if not exists public.texts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  content text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_texts_user_created on public.texts(user_id, created_at desc);
create index if not exists idx_texts_project on public.texts(project_id);

drop trigger if exists trg_texts_updated on public.texts;
create trigger trg_texts_updated
before update on public.texts
for each row execute function public.set_updated_at();

alter table public.texts enable row level security;

create policy "texts_select_own"
on public.texts for select
to authenticated
using (user_id = auth.uid());

create policy "texts_insert_own"
on public.texts for insert
to authenticated
with check (user_id = auth.uid());

create policy "texts_update_own"
on public.texts for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "texts_delete_own"
on public.texts for delete
to authenticated
using (user_id = auth.uid());

-- PROMPTS
create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  prompt text not null,
  tags text[] not null default '{}',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prompts_user_created on public.prompts(user_id, created_at desc);

drop trigger if exists trg_prompts_updated on public.prompts;
create trigger trg_prompts_updated
before update on public.prompts
for each row execute function public.set_updated_at();

alter table public.prompts enable row level security;

create policy "prompts_select_own"
on public.prompts for select
to authenticated
using (user_id = auth.uid());

create policy "prompts_insert_own"
on public.prompts for insert
to authenticated
with check (user_id = auth.uid());

create policy "prompts_update_own"
on public.prompts for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "prompts_delete_own"
on public.prompts for delete
to authenticated
using (user_id = auth.uid());
