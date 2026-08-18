-- Run this once in the Supabase SQL Editor (or via `supabase db push` if you're
-- using the CLI locally) after creating a new Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null default 'SIMX',
  starting_balance numeric not null,
  balance numeric not null,
  peak_equity numeric not null,
  day_start_equity numeric not null,
  status text not null default 'active' check (status in ('active', 'passed', 'failed')),
  fail_reason text check (fail_reason in ('daily_loss', 'trailing_drawdown')),
  created_at timestamptz not null default now()
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  side text not null check (side in ('long', 'short')),
  quantity numeric not null check (quantity > 0),
  entry_price numeric not null,
  opened_at timestamptz not null default now()
);

-- Phase 1 keeps "one open position per account" as an app-level rule (enforced
-- in useAccount.ts before inserting). A partial unique index would enforce it
-- at the DB layer too, but account_id alone isn't unique-safe across retries
-- without an idempotency key, so it's left as a documented app-level invariant.

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  side text not null check (side in ('long', 'short')),
  quantity numeric not null,
  entry_price numeric not null,
  exit_price numeric not null,
  pnl numeric not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null default now()
);

alter table public.accounts enable row level security;
alter table public.positions enable row level security;
alter table public.trades enable row level security;

create policy "own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own positions" on public.positions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own trades" on public.trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
