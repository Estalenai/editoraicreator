-- PASSO 9 — Creator Coins (wallet + ledger) + AI Usage + Configs + Anti-abuso (base)
-- Execute no Supabase SQL Editor.
-- Este arquivo adiciona infraestrutura de consumo, créditos e tarifação dinâmica.

create extension if not exists "pgcrypto";

-- updated_at helper (caso ainda não exista)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- CONFIGS (para custos dinâmicos, limites globais, flags)
create table if not exists public.configs (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_configs_updated on public.configs;
create trigger trg_configs_updated
before update on public.configs
for each row execute function public.set_updated_at();

alter table public.configs enable row level security;

-- Por padrão: configs só leitura para usuários autenticados (para o app saber custos/flags),
-- mas você pode restringir mais tarde (admin-only) quando criar profiles/roles.
create policy "configs_read_authenticated"
on public.configs for select
to authenticated
using (true);

revoke insert, update, delete on public.configs from authenticated;

-- WALLET (saldo atual)
create table if not exists public.creator_coins_wallet (
  user_id uuid primary key references auth.users(id) on delete cascade,
  common int not null default 0,
  pro int not null default 0,
  ultra int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.creator_coins_wallet enable row level security;

create policy "wallet_select_own"
on public.creator_coins_wallet for select
to authenticated
using (user_id = auth.uid());

revoke insert, update, delete on public.creator_coins_wallet from authenticated;

-- TRANSACTIONS (ledger imutável)
create table if not exists public.coins_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coin_type text not null check (coin_type in ('common','pro','ultra')),
  amount int not null, -- positivo=credit, negativo=debit
  reason text not null,
  feature text,
  ref_kind text not null default 'other',
  ref_id text not null default '',
  idempotency_key text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_coins_idempotency
on public.coins_transactions(user_id, idempotency_key);

create index if not exists idx_coins_user_created
on public.coins_transactions(user_id, created_at desc);

alter table public.coins_transactions enable row level security;

create policy "coins_tx_select_own"
on public.coins_transactions for select
to authenticated
using (user_id = auth.uid());

revoke insert, update, delete on public.coins_transactions from authenticated;

-- AI USAGE (telemetria e base anti-abuso)
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, -- openai | gemini | claude | elevenlabs...
  model text,
  feature text not null,  -- text_generate | image_generate | fact_check...
  coins_type text check (coins_type in ('common','pro','ultra')),
  coins_amount int default 0,
  cost_usd numeric(12,6) default 0,
  tokens_in int default 0,
  tokens_out int default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_user_created
on public.ai_usage(user_id, created_at desc);

alter table public.ai_usage enable row level security;

create policy "ai_usage_select_own"
on public.ai_usage for select
to authenticated
using (user_id = auth.uid());

revoke insert, update, delete on public.ai_usage from authenticated;

-- Helper: garantir wallet
create or replace function public.ensure_wallet(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into public.creator_coins_wallet(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end $$;

-- RPC: crédito (server-side)
create or replace function public.coins_credit(
  p_user_id uuid,
  p_coin_type text,
  p_amount int,
  p_reason text,
  p_feature text,
  p_ref_kind text,
  p_ref_id text,
  p_idempotency_key text,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_common int;
  v_pro int;
  v_ultra int;
  v_new int;
begin
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  perform public.ensure_wallet(p_user_id);

  if exists (
    select 1 from public.coins_transactions
    where user_id = p_user_id and idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object('status','noop','message','Idempotent replay');
  end if;

  select common, pro, ultra
    into v_common, v_pro, v_ultra
  from public.creator_coins_wallet
  where user_id = p_user_id
  for update;

  if p_coin_type = 'common' then
    v_new := v_common + p_amount;
    update public.creator_coins_wallet set common = v_new, updated_at = now() where user_id = p_user_id;
  elsif p_coin_type = 'pro' then
    v_new := v_pro + p_amount;
    update public.creator_coins_wallet set pro = v_new, updated_at = now() where user_id = p_user_id;
  elsif p_coin_type = 'ultra' then
    v_new := v_ultra + p_amount;
    update public.creator_coins_wallet set ultra = v_new, updated_at = now() where user_id = p_user_id;
  else
    raise exception 'Invalid coin_type';
  end if;

  insert into public.coins_transactions(
    user_id, coin_type, amount, reason, feature, ref_kind, ref_id, idempotency_key, meta
  ) values (
    p_user_id, p_coin_type, p_amount, p_reason, p_feature, coalesce(p_ref_kind,'other'), coalesce(p_ref_id,''), p_idempotency_key, coalesce(p_meta,'{}'::jsonb)
  );

  return jsonb_build_object('status','ok','coin_type',p_coin_type,'amount',p_amount);
end $$;

-- RPC: débito (server-side)
create or replace function public.coins_debit(
  p_user_id uuid,
  p_coin_type text,
  p_amount int,
  p_reason text,
  p_feature text,
  p_ref_kind text,
  p_ref_id text,
  p_idempotency_key text,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_common int;
  v_pro int;
  v_ultra int;
  v_new int;
begin
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  perform public.ensure_wallet(p_user_id);

  if exists (
    select 1 from public.coins_transactions
    where user_id = p_user_id and idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object('status','noop','message','Idempotent replay');
  end if;

  select common, pro, ultra
    into v_common, v_pro, v_ultra
  from public.creator_coins_wallet
  where user_id = p_user_id
  for update;

  if p_coin_type = 'common' then
    v_new := v_common - p_amount;
    if v_new < 0 then raise exception 'Insufficient common coins'; end if;
    update public.creator_coins_wallet set common = v_new, updated_at = now() where user_id = p_user_id;
  elsif p_coin_type = 'pro' then
    v_new := v_pro - p_amount;
    if v_new < 0 then raise exception 'Insufficient pro coins'; end if;
    update public.creator_coins_wallet set pro = v_new, updated_at = now() where user_id = p_user_id;
  elsif p_coin_type = 'ultra' then
    v_new := v_ultra - p_amount;
    if v_new < 0 then raise exception 'Insufficient ultra coins'; end if;
    update public.creator_coins_wallet set ultra = v_new, updated_at = now() where user_id = p_user_id;
  else
    raise exception 'Invalid coin_type';
  end if;

  insert into public.coins_transactions(
    user_id, coin_type, amount, reason, feature, ref_kind, ref_id, idempotency_key, meta
  ) values (
    p_user_id, p_coin_type, -p_amount, p_reason, p_feature, coalesce(p_ref_kind,'other'), coalesce(p_ref_id,''), p_idempotency_key, coalesce(p_meta,'{}'::jsonb)
  );

  return jsonb_build_object('status','ok','coin_type',p_coin_type,'amount',p_amount);
end $$;

-- Seeds: configs de custo (editável depois)
insert into public.configs(key, value)
values
  ('pricing.text_generate', '{"coin_type":"common","amount":1,"multiplier":1.0}'),
  ('pricing.image_generate', '{"coin_type":"common","amount":3,"multiplier":1.0}'),
  ('pricing.fact_check', '{"coin_type":"pro","amount":5,"multiplier":1.0}'),
  ('pricing.video_generate_short', '{"coin_type":"pro","amount":25,"multiplier":1.0}'),
  ('pricing.video_generate_long', '{"coin_type":"ultra","amount":120,"multiplier":1.0}'),
  ('flags.api_cost_high', '{"enabled":false,"multiplier":1.0}')
on conflict (key) do nothing;
