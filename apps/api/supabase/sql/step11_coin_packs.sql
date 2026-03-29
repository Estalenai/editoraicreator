-- PASSO 11 - Coin Packs (Stripe payment) + idempotência + anti-fraude
-- Requer (idealmente) que o SQL do PASSO 9 já tenha sido aplicado (wallet + ledger + configs).

create extension if not exists "pgcrypto";

-- Tabela para registrar compras de pacotes (idempotência por stripe_session_id)
create table if not exists public.coin_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  sku text not null,
  coin_type text not null check (coin_type in ('common','pro','ultra')),
  coins int not null check (coins > 0),
  status text not null default 'paid',
  credited boolean not null default false,
  credited_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_coin_purchases_user_created
on public.coin_purchases(user_id, created_at desc);

alter table public.coin_purchases enable row level security;

-- Usuário pode ler suas compras
do $$ begin
  create policy "coin_purchases_select_own"
  on public.coin_purchases for select
  to authenticated
  using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Bloquear writes do client (webhook/service role é quem escreve)
revoke insert, update, delete on public.coin_purchases from authenticated;

-- Seed opcional de catálogo de pacotes via configs (se a tabela configs existir).
-- Observação: se configs não existir ainda, rode o SQL do PASSO 9 primeiro.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='configs') then
    insert into public.configs(key, value)
    values (
      'coin_packs',
      jsonb_build_object(
        'currency','brl',
        'free_surcharge_percent',15,
        'packs', jsonb_build_array(
          jsonb_build_object('sku','COMMON_1000','coin_type','common','coins',1000,'base_unit_amount_cents',15000,'min_tier',0),
          jsonb_build_object('sku','COMMON_5000','coin_type','common','coins',5000,'base_unit_amount_cents',75000,'min_tier',0),
          jsonb_build_object('sku','PRO_1000','coin_type','pro','coins',1000,'base_unit_amount_cents',30000,'min_tier',0),
          jsonb_build_object('sku','PRO_5000','coin_type','pro','coins',5000,'base_unit_amount_cents',150000,'min_tier',0),
          jsonb_build_object('sku','ULTRA_1000','coin_type','ultra','coins',1000,'base_unit_amount_cents',150000,'min_tier',2)
        )
      )
    )
    on conflict (key) do nothing;
  end if;
end $$;
