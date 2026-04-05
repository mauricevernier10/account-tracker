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
do $$ begin
  create type direction as enum ('buy', 'sell');
exception when duplicate_object then null;
end $$;

create table if not exists transactions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  isin       text,                 -- null for non-security transactions (dividends, transfers)
  name       text not null,
  direction  direction not null,
  shares     numeric,
  price_eur  numeric,
  amount_eur numeric not null,
  approx     boolean not null default false,
  tx_type    text,
  created_at timestamptz not null default now(),

  unique (user_id, date, isin, direction, amount_eur)
);

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
