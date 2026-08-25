-- ════════════════════════════════════════════════════════════════════
-- PropSim — AUTHORITATIVE SCHEMA (Phase 2 reconciliation)
-- Reconstructed from live production DB (2025-08) + verified migrations:
--   • trades.close_reason widened with 'finalized'
--   • partial UNIQUE index preventing duplicate funded children
--   • RLS policies consolidated to one explicit policy per table
-- Provenance notes:
--   • payments.amount is stored in CENTS (integer)
--   • daily_pnls is a numeric[] journal of completed simulated days
--   • 'liquidation' close-reason reserved for future margin-call feature
-- ════════════════════════════════════════════════════════════════════

-- ── TABLES ───────────────────────────────────────────────────────────

create table public.accounts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  symbol text not null default 'SIMX',
  starting_balance numeric not null,
  balance numeric not null,
  peak_equity numeric not null,
  day_start_equity numeric not null,
  status text not null default 'active'
    check (status = any (array['active'::text, 'passed'::text, 'failed'::text])),
  fail_reason text
    check (fail_reason = any (array['daily_loss'::text, 'trailing_drawdown'::text])),
  created_at timestamptz not null default now(),
  phase text not null default 'evaluation'
    check (phase = any (array['evaluation'::text, 'funded'::text])),
  daily_pnls numeric[] not null default '{}'::numeric[],
  source_account_id uuid,
  leverage numeric not null default 10,
  day_started_at timestamptz not null default now(),
  replay_bar_index integer not null default 0,
  payment_status text default 'not_required'
    check (payment_status = any (array['not_required'::text, 'pending'::text, 'paid'::text, 'failed'::text])),
  epoch text,
  constraint accounts_pkey primary key (id),
  constraint accounts_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint accounts_source_account_id_fkey foreign key (source_account_id) references public.accounts(id)
);

create table public.positions (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  user_id uuid not null,
  side text not null check (side = any (array['long'::text, 'short'::text])),
  quantity numeric not null check (quantity > 0::numeric),
  entry_price numeric not null,
  opened_at timestamptz not null default now(),
  stop_loss_price numeric,
  take_profit_price numeric,
  instrument_type text default 'equity'
    check (instrument_type = any (array['equity'::text, 'call'::text, 'put'::text])),
  strike numeric,
  entry_iv numeric,
  strategy_id uuid,
  expiration_date text,
  constraint positions_pkey primary key (id),
  constraint positions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint positions_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade
);

create table public.trades (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  user_id uuid not null,
  side text not null check (side = any (array['long'::text, 'short'::text])),
  quantity numeric not null,
  entry_price numeric not null,
  exit_price numeric not null,
  pnl numeric not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null default now(),
  close_reason text default 'manual'
    check (close_reason = any (array[
      'manual'::text, 'sl'::text, 'tp'::text,
      'day_end'::text, 'liquidation'::text, 'finalized'::text
    ])),
  strategy_id uuid,
  instrument_type text default 'equity'
    check (instrument_type = any (array['equity'::text, 'call'::text, 'put'::text])),
  strike numeric,
  constraint trades_pkey primary key (id),
  constraint trades_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint trades_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade
);

create table public.pending_orders (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  user_id uuid not null,
  side text not null check (side = any (array['long'::text, 'short'::text])),
  order_type text not null check (order_type = any (array['limit'::text, 'stop'::text])),
  quantity numeric not null check (quantity > 0::numeric),
  trigger_price numeric not null check (trigger_price > 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  stop_loss_price numeric,
  take_profit_price numeric,
  constraint pending_orders_pkey primary key (id),
  constraint pending_orders_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint pending_orders_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade
);

create table public.payments (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null,
  amount integer not null,          -- cents
  currency text default 'usd',
  stripe_session_id text,
  stripe_payment_intent_id text,
  status text default 'pending'
    check (status = any (array['pending'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text])),
  type text not null check (type = any (array['evaluation_fee'::text, 'top_up'::text])),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint payments_pkey primary key (id),
  constraint payments_user_id_fkey foreign key (user_id) references auth.users(id),
  constraint payments_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade
);

create table public.withdrawals (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null,
  amount numeric not null check (amount > 0::numeric),
  status text default 'pending'
    check (status = any (array['pending'::text, 'processing'::text, 'completed'::text, 'rejected'::text])),
  created_at timestamptz default now(),
  completed_at timestamptz,
  constraint withdrawals_pkey primary key (id),
  constraint withdrawals_user_id_fkey foreign key (user_id) references auth.users(id),
  constraint withdrawals_account_id_fkey foreign key (account_id) references public.accounts(id)
);

-- ── INDEXES ──────────────────────────────────────────────────────────

-- Armor: one evaluation can mint at most one funded child (race-proof).
create unique index accounts_one_funded_child_per_source_uidx
  on public.accounts (source_account_id)
  where source_account_id is not null;

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────

alter table public.accounts       enable row level security;
alter table public.positions      enable row level security;
alter table public.trades         enable row level security;
alter table public.pending_orders enable row level security;
alter table public.payments       enable row level security;
alter table public.withdrawals    enable row level security;

create policy "own accounts" on public.accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own positions" on public.positions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own trades" on public.trades for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own pending orders" on public.pending_orders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own their payments" on public.payments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own their withdrawals" on public.withdrawals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);