-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Holdings (portfolio snapshots) ───────────────────────────────────────────
create table if not exists holdings (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  statement_date   date not null,
  isin             text not null,
  name             text not null,
  ticker           text,
  shares           numeric not null,
  price_eur        numeric not null,
  market_value_eur numeric not null,
  depot            text,
  created_at       timestamptz not null default now(),

  unique (user_id, statement_date, isin)
);

create index if not exists idx_holdings_user_date on holdings(user_id, statement_date);
create index if not exists idx_holdings_isin      on holdings(user_id, isin);

-- ── Transactions ──────────────────────────────────────────────────────────────
create table if not exists transactions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  isin       text,                 -- null for non-security transactions (dividends, transfers)
  name       text not null,
  direction  text not null,        -- buy | sell | dividend | interest | deposit | withdrawal | split | etc.
  shares     numeric,
  price_eur  numeric,
  amount_eur numeric not null,
  approx     boolean not null default false,
  tx_type    text,
  created_at timestamptz not null default now()
);

-- Legacy 5-tuple dedup (dropped 2026-04) — transaction_id is the natural key now
alter table transactions drop constraint if exists transactions_user_id_date_isin_direction_amount_eur_key;

-- CSV-era columns (added 2026-04): transaction_id is the natural dedup key for CSV imports
alter table transactions add column if not exists transaction_id    text;
alter table transactions add column if not exists fee_eur           numeric;
alter table transactions add column if not exists tax_eur           numeric;
alter table transactions add column if not exists asset_class       text;
alter table transactions add column if not exists currency          text;
alter table transactions add column if not exists original_amount   numeric;
alter table transactions add column if not exists original_currency text;
alter table transactions add column if not exists fx_rate           numeric;

-- Unique constraint (not a partial index) so Supabase's onConflict can target
-- it. Postgres treats NULLs as distinct in unique constraints by default, so
-- legacy rows with transaction_id = NULL don't collide with each other.
-- Drop any prior partial index from earlier migrations first.
drop index if exists ux_tx_user_tx_id;

do $$ begin
  alter table transactions add constraint ux_tx_user_tx_id unique (user_id, transaction_id);
exception when duplicate_object then null;
end $$;

create index if not exists idx_tx_user_date on transactions(user_id, date);
create index if not exists idx_tx_isin      on transactions(user_id, isin);

-- ── Target allocations ────────────────────────────────────────────────────────
create table if not exists targets (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  isin          text not null,
  target_weight numeric not null default 0,
  updated_at    timestamptz not null default now(),

  unique (user_id, isin)
);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table holdings     enable row level security;
alter table transactions enable row level security;
alter table targets      enable row level security;

-- Users can only access their own data
create policy "holdings: owner access"
  on holdings for all using (auth.uid() = user_id);

create policy "transactions: owner access"
  on transactions for all using (auth.uid() = user_id);

create policy "targets: owner access"
  on targets for all using (auth.uid() = user_id);
