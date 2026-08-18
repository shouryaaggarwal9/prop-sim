# PropSim

A simulated prop-trading evaluation, in the shape of Topstep-style entry-level
challenges: trade a live-replayed synthetic market against a profit target, a
daily loss limit, and a trailing drawdown rule. Every account is explicitly a
simulation — no real market data, no real money — the same way a real prop
firm's evaluation tier is a simulation.

This is **Phase 1**: one instrument, three rules, market/close orders only,
built end-to-end and verified to build clean before expanding scope. See
"What's deliberately not here yet" below for what Phase 2 would add.

## Setup

### 1. Create a Supabase project (free tier)

At https://supabase.com — takes about a minute, no card required.

### 2. Run the schema

Open the SQL Editor in your Supabase project and run `supabase/schema.sql`.
It creates `accounts`, `positions`, and `trades` tables with row-level
security scoped to `auth.uid()`.

### 3. Enable anonymous sign-ins

This app has no signup form — visiting `/dashboard` silently creates a
one-off anonymous Supabase Auth session per browser, which is what your
account data is scoped to. In your Supabase project: **Authentication →
Sign In / Providers → Anonymous Sign-ins → enable.** This is a dashboard
toggle, not something the SQL migration can turn on for you.

### 4. Environment variables

Copy `.env.local.example` to `.env.local` and fill in your project's URL and
anon/publishable key (Project Settings → API in the Supabase dashboard).

### 5. Run it

```bash
npm install
npm run dev
```

Deploys to Vercel's free tier with zero extra config — same as any Next.js
app, just remember to add the two env vars in the Vercel project settings too.

## Architecture

- **`lib/market/generateSeries.ts`** — a seeded PRNG (mulberry32) generates a
  deterministic synthetic OHLC series per account. Not real market data on
  purpose: it keeps the whole project self-contained (no API keys, no rate
  limits, no licensing questions) and reproduces identically across reloads
  for a given account id.
- **`lib/market/useMarketReplay.ts`** — plays that series back one intra-bar
  tick at a time, building a live "forming" candle before each bar closes,
  rather than just snapping straight to closed bars.
- **`lib/trading/rules.ts`** — the actual evaluation logic: profit target,
  daily loss limit, trailing drawdown from peak equity. Pure functions, easy
  to unit test independent of the UI.
- **`lib/trading/useAccount.ts`** — the orchestration hook. Loads an account
  from Supabase, drives the replay, computes live equity, evaluates rules
  every tick, and persists trades/breaches back to Postgres.
- **`components/CandlestickChart.tsx`** — thin wrapper around
  `lightweight-charts` v5 (`addSeries(CandlestickSeries, …)` — the v5 API,
  not the deprecated v4 `addCandlestickSeries`).
- **Auth**: anonymous Supabase sessions only, no `@supabase/ssr`, no
  middleware, no server components for data — every page is a client
  component talking directly to Supabase. This was a deliberate simplicity
  trade-off for a fast, reliably-buildable first version; see below.

## What's deliberately not here yet

- **Cross-device persistence.** Anonymous auth ties your accounts to one
  browser. Real email/password or OAuth (via `@supabase/ssr` + Next.js
  middleware) would let the same account follow you across devices — the
  original ask — but that's meaningfully more moving parts (server clients,
  session-refresh middleware, auth UI), so it's scoped as a Phase 2 addition
  rather than risking the first build on it.
- **Consistency rule** (no single day accounting for too much of total
  profit) — a real prop-firm staple, cheap to add once the core loop is
  proven.
- **Multiple instruments.** The generator and schema are already
  symbol-agnostic (`account.symbol`); adding a 2nd/3rd synthetic series is a
  small, low-risk follow-up once this is confirmed building clean.
- **Limit/stop orders.** Phase 1 is market-order-only, one open position at
  a time — matches Topstep's actual constraint and keeps the execution model
  simple.

Replay position persistence — originally listed here as a gap — is resolved;
see "Durable replay position & day tracking" below.

## Concurrency: why every mutation goes through a lock

`useAccount.ts` uses a single `mutationLock` ref, and every state-mutating
path (`placeOrder`, `closePosition`, `finalizeAccount`, `cancelPendingOrder`,
and the pending-order fill on trigger) is wrapped in `withLock(...)` before
it does anything.

This isn't defensive boilerplate — it fixes a real bug that was reachable
purely from tick timing, no double-click or page reload required. Rule
evaluation re-fires on almost every tick while a position is open (unrealized
P&L moves `equity`, which is the effect's dependency). `finalizeAccount` has
several sequential `await`s — insert trade, delete position, persist account
— before React state actually reflects the close. That's a window
comfortably longer than one 500ms tick, during which the same effect could
re-enter and close the _same still-open position_ a second time: two trade
log entries with identical entry price but different exit prices (whichever
tick each concurrent call happened to capture), and a lost balance update
(both closes computed their new balance from the same stale
`account.balance`, so whichever `persistAccount` call resolved last silently
overwrote the other's P&L). The lock makes all of these mutations mutually
exclusive, so a second attempt while one is in flight is a no-op instead of
a second concurrent execution.

**Known boundary**: the lock is a `useRef` — scoped to one hook instance, i.e.
one browser tab. It does not protect against the same account being open and
traded from two tabs (or two devices) simultaneously; that would need a
database-level lock or optimistic-concurrency check (e.g. a version column),
not just a client-side ref. Out of scope for now — the app has no multi-tab
use case today, but worth knowing before extending toward real multi-user or
multi-device auth.

## Durable replay position & day tracking

Two earlier iterations of day-boundary tracking both had real bugs, in
opposite directions — worth understanding both, since either mistake is easy
to reintroduce:

1. **Bar-index-based (original)**: `day = floor(barIndex / 40)`, where
   `barIndex` lived only in React state. Reloading reset it to 0, so a day
   could never complete if you reloaded more often than once per ~100
   seconds — all profit stayed permanently attributed to "day 0," making the
   consistency rule impossible to satisfy no matter how much you traded.
2. **Wall-clock-based (intermediate fix)**: correctly survived reloads, but
   decoupled "a day" from actual simulated market time — it became a
   function of how long your _browser tab_ had been open, not how much
   _simulated trading_ had occurred.

The current version keeps the bar-index semantics (a day = 40 simulated
bars, matching `BAR_SECONDS`) but makes the position itself durable:
`accounts.replay_bar_index` persists in Postgres, and both the chart
(`useMarketReplay`'s `startBarIndex`) and day-boundary detection resume from
it on load, instead of restarting at 0.

Persistence happens once per bar close (`replay.barIndex` only changes on a
close), not every tick — a ~5x reduction in writes versus persisting every
sub-tick, at the cost of losing at most one in-progress bar's worth of
progress (a few seconds) if you reload mid-bar.

**The subtle part**: `replay.barIndex` doesn't arrive at its resumed value
immediately on mount — it starts at 0 (before the account has loaded), then
jumps once `useMarketReplay`'s own resume effect fires. A naive "only guard
the first firing" calibration would misread that jump as multiple days
completing instantly. The actual guard in `useAccount.ts` only treats a
_sequential_ `+1` change as a genuine bar close; any other jump (mount,
resume snap, switching accounts) recalibrates without rolling over. If you
ever refactor this, that distinction is the part most likely to silently
break — a non-sequential jump being misread as a real crossing would corrupt
`daily_pnls` with a phantom entry.

`day_started_at` (from the wall-clock iteration) is left in the schema,
unused — harmless, not worth a migration purely to remove it.

## Known risk spots if the build doesn't come up clean

- **`lightweight-charts` v5 typings** — if `npm run build` complains inside
  `CandlestickChart.tsx`, check that the installed version actually matches
  the v5 `addSeries(SeriesType, options)` pattern used here versus an older
  v4-style API.
- **Tailwind v4 CSS-first config** — there's no `tailwind.config.ts` by
  design (v4 moved theme config into `@theme` in `globals.css`). If Tailwind
  classes aren't applying, check `postcss.config.mjs` is wired to
  `@tailwindcss/postcss`, not a v3-style `tailwindcss` + `autoprefixer` pair.
- **RLS policies** — every insert here relies on `auth.uid() = user_id`
  matching. If reads/writes fail silently, double check anonymous sign-ins
  are actually enabled in the Supabase dashboard (step 3 above) — a missing
  session is the most likely cause of empty-but-no-error query results.
