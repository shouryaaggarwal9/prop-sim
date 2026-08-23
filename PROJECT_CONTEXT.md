# PropSim Project Context

## Purpose of this document

This is a factual context handoff for an LLM working on this repository. It describes the checked-in project as observed, not an idealized product specification. Statements about implemented behavior are based on the current source tree. Where documentation, schema, types, and runtime code disagree, the disagreement is called out explicitly. Do not assume that a declared type, README statement, or SQL table is synchronized with the runtime until verified.

## Source-of-truth rules

1. For current runtime behavior, prefer the live TypeScript/TSX implementation.
2. For the intended product concept, use `README.md`, but treat its Phase 1 claims as stale where the live code contradicts them.
3. For the database contract, compare `supabase/schema.sql` with every Supabase query and the interfaces in `lib/trading/types.ts`; they are currently inconsistent.
4. `rough.txt` and `app/globals.css.txt` are scratch/older material, not evidence of active behavior.
5. No automated tests are present. A clean static diagnostic does not prove that the app, database, auth, or Stripe integration works at runtime.

## Product identity

The project is named **PropSim** (`package.json` name: `propsim`). It is a simulated prop-trading evaluation platform inspired by entry-level challenge products. A user trades replayed synthetic SPY market data against account rules. It is explicitly a simulation: the repository does not implement real market data, real brokerage connectivity, or real-money trading.

The current code models:

- Starting balance: normally `$50,000` when an evaluation is created in the dashboard.
- Evaluation profit target: `6%` of starting balance.
- Daily loss limit: `3%` of starting balance.
- Trailing drawdown: `6%` of peak equity.
- Consistency limit: `40%` of total profit may be concentrated in one simulated day when the evaluation target is reached.
- A funded-account follow-up can be created when an evaluation passes; the funded account starts with pending payment status.

The product name, exact fee, and all production/business policies should not be inferred beyond the code. The Stripe checkout fee currently used by code is `$100.00`.

## Repository structure

```text
.
├── .env.local.example
├── .gitignore
├── README.md
├── PROJECT_CONTEXT.md              # This handoff document
├── next-env.d.ts
├── next.config.mjs
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── proxy.ts
├── rough.txt
├── tsconfig.json
├── app
│   ├── globals.css
│   ├── globals.css.txt
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (auth)
│   │   ├── layout.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── login/page.tsx
│   │   ├── reset-password/page.tsx
│   │   ├── signup/page.tsx
│   │   └── verify-email/page.tsx
│   ├── actions
│   │   ├── auth.ts
│   │   ├── payments.ts
│   │   └── withdrawals.ts
│   ├── api/webhooks/stripe/route.ts
│   ├── auth/callback/route.ts
│   ├── dashboard
│   │   ├── DashboardClient.tsx
│   │   └── page.tsx
│   └── trade/[accountId]
│       ├── page.tsx
│       ├── PortfolioGreeksPanel.tsx
│       └── TradeClient.tsx
├── components
│   ├── AccountStats.tsx
│   ├── CandlestickChart.tsx
│   ├── Navbar.tsx
│   ├── OrderPanel-stable.tsx
│   ├── OrderPanel.tsx
│   ├── RuleStatusBar.tsx
│   ├── StrategyBuilder.tsx
│   └── TradeLog.tsx
├── data/spy
│   ├── epoch-the-chop.json
│   ├── epoch-the-grind.json
│   ├── epoch-the-recovery.json
│   ├── epoch-the-rout.json
│   └── epoch-the-squeeze.json
├── lib
│   ├── stripe.ts
│   ├── market
│   │   ├── epochs.ts
│   │   ├── options.ts
│   │   ├── strategies.ts
│   │   ├── types.ts
│   │   └── useMarketReplay.ts
│   ├── supabase
│   │   ├── client.ts
│   │   ├── middleware.ts
│   │   └── server.ts
│   └── trading
│       ├── rules.ts
│       ├── types.ts
│       └── useAccount.ts
└── supabase/schema.sql
```

## Application routes

- `/`: public landing page. Presents the product and links into the app.
- `/login`: email/password login form.
- `/signup`: email/password registration form.
- `/forgot-password`: requests a password reset email.
- `/reset-password`: submits a new password.
- `/verify-email`: verification notice/page.
- `/auth/callback`: exchanges a Supabase auth callback code for a session and redirects.
- `/dashboard`: authenticated account list and evaluation creation.
- `/trade/[accountId]`: authenticated trading screen for one owned account.
- `/api/webhooks/stripe`: public Stripe webhook endpoint. It is excluded from the route protection matcher.

`proxy.ts` refreshes the Supabase session and redirects unauthenticated users to `/login` for protected routes. The trade page also performs a server-side account ownership check. The dashboard server page loads the authenticated user before rendering its client component.

## Authentication and session flow

The current implementation uses Supabase email/password auth with the Supabase SSR package and cookie-backed server sessions.

- `app/actions/auth.ts` contains server actions for sign-up, sign-in, sign-out, password-reset request, and password update.
- Sign-up redirects users to email verification using the configured site URL.
- `app/auth/callback/route.ts` exchanges the callback code for a session and redirects to the requested/default route.
- `lib/supabase/client.ts` creates the browser client.
- `lib/supabase/server.ts` creates a server client using request cookies.
- `lib/supabase/middleware.ts` contains an older/commented-out helper and is not the active route entry point.
- `proxy.ts` is the active session-refresh/protection boundary.

The README describes anonymous sign-ins and says auth UI, SSR, and middleware are absent. That description is stale relative to the current tree. The current repository does not establish whether anonymous sign-ins are still enabled in the Supabase project.

## Main user/data flows

### Create and open an evaluation

1. An authenticated user reaches `/dashboard`.
2. The server page obtains the current user and account data.
3. `DashboardClient.tsx` allows selecting an epoch and inserting an evaluation account directly through the browser Supabase client.
4. The new account stores an epoch selection and evaluation-related values expected by current TypeScript/runtime code.
5. The dashboard lists accounts and available epochs.

The exact current database insert shape should be checked against `DashboardClient.tsx` and the deployed schema before running the app; the checked-in schema is missing several fields used by current code.

### Load and trade an account

1. `/trade/[accountId]/page.tsx` verifies the signed-in user owns the requested account.
2. `TradeClient.tsx` composes the trading UI and displays a pending-payment state for funded accounts.
3. `useAccount(accountId)` loads the account, positions, pending order, trades, and any derived funded-account relationship.
4. The account's selected epoch is loaded from `lib/market/epochs.ts`.
5. `useMarketReplay` advances through the epoch every `200 ms`, using the account's persisted replay bar index as its starting point.
6. Current equity is calculated from persisted balance plus unrealized equity and option P&L.
7. Rules are evaluated when live equity changes.
8. Mutations are written directly from the browser to Supabase and depend on RLS.
9. Replay bar progress is persisted when the replay bar index changes.
10. Every `78` bars, the simulated day ends: open positions and pending orders are closed/removed, daily P&L is recorded, and a new option chain is generated.

A local `useRef` mutation lock serializes mutations within one hook instance/tab. It does not provide cross-tab, cross-device, or database-level concurrency control.

## Market replay

`data/spy/*.json` contains checked-in synthetic/replayed OHLC data. The five epochs are imported and indexed by `lib/market/epochs.ts`:

| Epoch                |  Bars | Date range from audit         |
| -------------------- | ----: | ----------------------------- |
| `epoch-the-grind`    | 1,524 | 2024-11-01 through 2024-11-29 |
| `epoch-the-chop`     | 1,638 | 2025-01-02 through 2025-02-03 |
| `epoch-the-squeeze`  | 1,716 | 2025-02-10 through 2025-03-12 |
| `epoch-the-rout`     | 1,716 | 2025-04-01 through 2025-05-01 |
| `epoch-the-recovery` | 1,794 | 2025-05-05 through 2025-06-05 |

`lib/market/types.ts` defines the OHLC bar and intrabar tick shapes. Each bar contains precomputed ticks.

`lib/market/useMarketReplay.ts`:

- Uses a timer interval whose default caller value is `200 ms`.
- Builds a forming candle from successive intrabar ticks.
- Commits a bar after all ticks are consumed.
- Uses five subticks per bar in the trading hook.
- Returns `barIndex`, `subIndex`, `closedBars`, `formingBar`, and `isDone`.
- Resumes from `startBarIndex`; closed bars before that index are reconstructed by slicing the deterministic data.
- Intentionally resets on `bars` changes, not every `startBarIndex` update, to avoid wiping a forming candle during replay-index persistence.

`README.md` claims a missing `lib/market/generateSeries.ts` seeded generator. That file does not exist. The active implementation uses checked-in JSON instead.

## Trading domain types

`lib/trading/types.ts` defines these current application interfaces:

- `AccountStatus`: `active`, `passed`, `failed`, or `pending_payment`.
- `AccountPhase`: `evaluation` or `funded`.
- `OrderType`: `market`, `limit`, or `stop`.
- `InstrumentType`: `equity`, `call`, or `put`.
- `Position`: instrument, side, quantity, entry price, optional strike/IV/strategy/expiration, and optional stop-loss/take-profit prices.
- `Trade`: closed position record with instrument, prices, strike, P&L, close reason, and optional strategy ID.
- `PendingOrder`: equity limit/stop order with trigger and optional risk prices.
- `Withdrawal`: pending/processing/completed/rejected withdrawal record.

`Account` also expects `phase`, `epoch`, `payment_status`, `replay_bar_index`, `daily_pnls`, `leverage`, `source_account_id`, and `day_started_at` in addition to basic balance/status fields.

## Evaluation rules

`lib/trading/rules.ts` is the pure rule engine. `DEFAULT_RULES` is:

```text
profitTargetPct       = 0.06
 dailyLossPct          = 0.03
trailingDrawdownPct   = 0.06
consistencyPct        = 0.40
```

On each evaluation:

1. `currentDayPnL = equity - dayStartEquity`.
2. Daily loss fails when current day P&L is less than or equal to `-startingBalance * dailyLossPct`.
3. Trailing drawdown fails when `peakEquity - equity` is greater than or equal to `peakEquity * trailingDrawdownPct`.
4. For evaluation accounts only, total profit is `equity - startingBalance`.
5. A pass requires total profit at or above the target and the largest positive daily P&L, including the current day, to be no more than `totalProfit * consistencyPct`.
6. Funded accounts skip profit-target and consistency checks but continue to receive daily-loss and trailing-drawdown checks.
7. Failure checks occur before pass checks, so a simultaneous breach wins over a pass.
8. Reaching the profit target while failing consistency leaves the account active; it does not fail it.

The hook updates peak equity when live equity exceeds the persisted peak. The rule engine itself is pure and has no database/UI side effects.

## Equity and order behavior

`lib/trading/useAccount.ts` is the primary orchestration hook.

### Equity positions

- Supports long and short market orders.
- Supports equity limit and stop pending orders.
- The UI/hook permits only one position-entry workflow at a time: existing positions or a pending order prevent another entry.
- Buying power is `equity * leverage`.
- Equity P&L is `(currentPrice - entryPrice) * quantity * direction`.
- Pending limit orders trigger when price crosses favorably toward the trigger; stop orders trigger in the opposite directional condition.
- Triggered pending orders use the trigger price as entry price, then are deleted.
- Manual close uses current price.

### Stop-loss and take-profit

Risk prices can be accepted and persisted on equity positions/pending orders, and the UI validates their direction relative to current price. However, the auto-close effect in `useAccount.ts` is currently an explicit no-op placeholder. Stop-loss and take-profit do not currently close positions automatically.

### Options

- Long call/put purchases are supported.
- Premium uses the option ask and quantity times `100`.
- Option purchases require full cash coverage against account balance, not leverage-based buying power.
- At simulated day end, options are closed at intrinsic value.
- Options use generated chains rather than exchange data.

### Strategies

`lib/market/strategies.ts` defines seven templates:

- Bull call spread
- Bear put spread
- Bull put spread
- Bear call spread
- Iron condor
- Covered call
- Protective put

`StrategyBuilder.tsx` allows strategy selection, leg editing, analysis, and submission. `validateStrategy` rejects empty strategies, non-positive quantities, option legs without strikes, and duplicate instrument/side/strike keys. `analyzeStrategy` calculates net debit/credit, payoff-derived max profit/loss, breakevens, estimated margin, and aggregate Greeks.

The analysis samples key strikes plus underlying bounds at `85%` and `115%` of current underlying price. This means the sampled max profit/loss is not a general mathematical proof for all strategy shapes, especially unbounded positions. Strategy entry currently identifies an option by strike by searching calls before puts without first requiring the leg's instrument type; a same-strike put can therefore resolve to a call.

## Options model

`lib/market/options.ts` generates synthetic option chains using Black-Scholes-style calculations:

- Risk-free rate: `5%`.
- Strike increment: `$2.50`.
- Strike range: approximately `5%` around the underlying.
- Base IV: `vix * 1.15`, with skew/smile adjustments and distance adjustment.
- IV floor: `8%`; cap: `150%`.
- Uses a minimum time floor for non-expired Black-Scholes calculations.
- Generates call and put legs with theoretical price, bid, ask, IV, delta, gamma, theta, vega, intrinsic value, and time value.
- Bid/ask spread widens with distance and near expiry.
- `updateChainPrices` regenerates the chain with current underlying and remaining hours.
- `getLegPrice` selects a call or put by requested type and strike.
- `getIntrinsicValue` calculates expiration intrinsic value.

The chain is regenerated at day boundaries and refreshed as price or remaining simulated time changes. The trading hook initially uses an epoch VIX value for the simulated calendar date, falling back to a remembered VIX of `16.0` when no value is available.

## Payments and funded accounts

`app/actions/payments.ts` creates Stripe Checkout sessions and records pending payment information. The current hard-coded checkout amount is `$100.00`. Checkout metadata includes account and user identifiers.

`app/api/webhooks/stripe/route.ts`:

- Reads the raw request body.
- Verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`.
- Uses the Stripe event metadata to identify the account/user context.
- Updates the account to an active/paid funded state and marks the payment succeeded.

The webhook does not independently establish that the metadata belongs to the account owner before activation. The exact update/insert contract must be checked against the deployed database because the checked-in schema lacks payment-related tables/columns.

When an evaluation passes, `useAccount` closes positions, removes pending orders, updates the evaluation, and attempts to create a funded account linked by `source_account_id`. The funded account starts with the evaluation's starting balance and `payment_status: "pending"`. `TradeClient.tsx` derives `needsPayment` from funded phase plus pending payment status.

The payment-success refresh effect in `TradeClient.tsx` is commented out, so a browser may remain on the payment state until a manual refresh or another state update.

## Withdrawals

`app/actions/withdrawals.ts` provides server actions:

- `requestWithdrawal` checks that the account belongs to the user, is funded and active, and that the requested amount is greater than zero and no greater than account balance, then inserts a pending withdrawal.
- `getWithdrawals` lists withdrawals for an account.

There is no visible withdrawal UI in the current route/component inventory. There is no processing, completion, rejection, balance reservation, or duplicate-request prevention implemented by these actions.

## Database and security contract

`supabase/schema.sql` creates only these tables:

- `public.accounts`
- `public.positions`
- `public.trades`

All three have `user_id` foreign keys to `auth.users`, account foreign keys cascade to positions/trades, and RLS policies require `auth.uid() = user_id` for all operations.

The checked-in schema is an earlier contract and does not define tables currently queried by runtime code, including `pending_orders`, `payments`, and `withdrawals`. It also lacks current runtime fields such as `phase`, `epoch`, `payment_status`, `daily_pnls`, `replay_bar_index`, leverage/source-account data, position instrument/option metadata, risk-price fields, and trade close metadata. Its account status check allows only `active`, `passed`, and `failed`, while TypeScript includes `pending_payment`.

Do not “fix” this mismatch by guessing a migration. First inspect the intended deployment schema, current Supabase database, and all query/insert/update shapes.

RLS protects rows according to `user_id`, but browser-side direct mutations are not database transactions. The client lock prevents re-entry only inside one `useAccount` instance. Multiple tabs/devices can still race.

## Environment variables

The repository explicitly references:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SECRET_KEY`

`.env.local.example` documents only the two public Supabase variables. Code uses non-null assertions for environment access, so missing values are generally discovered at runtime rather than through centralized configuration validation. Never expose secret Stripe/Supabase service keys to browser code.

## Dependencies and commands

`package.json` declares:

- Next.js `^16.3.0`
- React/React DOM `^19.2.0`
- `@supabase/ssr` and `@supabase/supabase-js`
- Stripe `^22.5.0`
- `lightweight-charts` `^5.2.0`
- Tailwind CSS `^4.3.0` with `@tailwindcss/postcss`
- TypeScript `^5.7.0`
- ESLint 9 and `eslint-config-next`

Scripts:

```text
npm run dev
npm run build
npm run start
npm run lint
```

`package-lock.json` is the npm lockfile (lockfile version 3) and records the resolved dependency tree. `next.config.mjs` enables React strict mode. `postcss.config.mjs` wires Tailwind v4's PostCSS plugin. `tsconfig.json` uses strict TypeScript, ES2020, bundler resolution, and the `@/*` path alias. `next-env.d.ts` is generated Next.js type-reference material.

## Complete file inventory

### Root/configuration

- `.env.local.example`: public Supabase environment variable examples; incomplete relative to current runtime references.
- `.gitignore`: ignores dependencies, Next build output, environment files, logs, and TypeScript build info.
- `README.md`: product description, old setup instructions, architecture notes, concurrency explanation, replay persistence notes, and known build-risk notes. Partly stale.
- `PROJECT_CONTEXT.md`: this factual LLM handoff.
- `rough.txt`: scratchpad with obsolete/alternative options, strategy, and debug material. Not active source.
- `package.json`: package metadata, dependency declarations, and npm scripts.
- `package-lock.json`: locked npm dependency resolution.
- `next.config.mjs`: Next configuration; React strict mode is enabled.
- `postcss.config.mjs`: Tailwind v4 PostCSS configuration.
- `tsconfig.json`: TypeScript compiler configuration and `@/*` alias.
- `next-env.d.ts`: generated Next.js declarations.
- `proxy.ts`: active Supabase session refresh and protected-route redirect logic.

### App shell and public/auth routes

- `app/layout.tsx`: root layout, global metadata, navigation, and page shell.
- `app/page.tsx`: public landing page.
- `app/globals.css`: active Tailwind v4 theme and global utility styles.
- `app/globals.css.txt`: duplicate/older CSS implementation; not imported as the active stylesheet.
- `app/(auth)/layout.tsx`: centered auth layout.
- `app/(auth)/login/page.tsx`: login form.
- `app/(auth)/signup/page.tsx`: registration form.
- `app/(auth)/forgot-password/page.tsx`: password-reset request form.
- `app/(auth)/reset-password/page.tsx`: new-password form.
- `app/(auth)/verify-email/page.tsx`: email-verification notice.
- `app/auth/callback/route.ts`: Supabase auth code exchange callback.

### Server actions and API

- `app/actions/auth.ts`: authentication server actions.
- `app/actions/payments.ts`: Stripe Checkout creation and payment-recording action.
- `app/actions/withdrawals.ts`: withdrawal validation/insertion and withdrawal-history action.
- `app/api/webhooks/stripe/route.ts`: Stripe webhook signature verification and funded-account activation.

### Dashboard and trading pages

- `app/dashboard/page.tsx`: authenticated server-side dashboard loader.
- `app/dashboard/DashboardClient.tsx`: client dashboard; evaluation creation and account/epoch listing.
- `app/trade/[accountId]/page.tsx`: server-side trade route ownership check.
- `app/trade/[accountId]/TradeClient.tsx`: trading page composition, payment state, and client orchestration.
- `app/trade/[accountId]/PortfolioGreeksPanel.tsx`: portfolio delta/gamma/theta/vega display.

### Reusable UI components

- `components/Navbar.tsx`: navigation and sign-out control.
- `components/AccountStats.tsx`: current price, balance, equity, leverage, and P&L display.
- `components/CandlestickChart.tsx`: `lightweight-charts` v5 candlestick chart wrapper.
- `components/OrderPanel.tsx`: equity order controls, option controls, strategy controls, pending-order state, risk controls, and close controls.
- `components/OrderPanel-stable.tsx`: older duplicate order panel without current strategy support.
- `components/RuleStatusBar.tsx`: visual rule utilization/status indicators.
- `components/StrategyBuilder.tsx`: strategy templates, editable legs, analysis, and strategy submission; currently contains visible debug output.
- `components/TradeLog.tsx`: closed-trade table.

### Libraries

- `lib/stripe.ts`: server-side Stripe client construction.
- `lib/supabase/client.ts`: browser Supabase client.
- `lib/supabase/server.ts`: cookie-backed server Supabase client.
- `lib/supabase/middleware.ts`: commented/older middleware helper.
- `lib/market/types.ts`: OHLC bar and intrabar tick types.
- `lib/market/epochs.ts`: imports and indexes the five SPY epochs.
- `lib/market/useMarketReplay.ts`: interval-driven replay state machine and durable-index resume support.
- `lib/market/options.ts`: synthetic option chain, Black-Scholes calculations, IV, bid/ask, intrinsic values, and Greeks.
- `lib/market/strategies.ts`: strategy templates, strategy analysis, margin estimate, and validation.
- `lib/trading/types.ts`: account, position, trade, order, withdrawal, status, and instrument interfaces.
- `lib/trading/rules.ts`: pure evaluation rule definitions and evaluator.
- `lib/trading/useAccount.ts`: account loading, replay integration, equity calculation, order/position lifecycle, persistence, day boundaries, option chains, Greeks, and rule finalization.

### Data

- `data/spy/epoch-the-grind.json`: 1,524-bar checked-in SPY replay epoch.
- `data/spy/epoch-the-chop.json`: 1,638-bar checked-in SPY replay epoch.
- `data/spy/epoch-the-squeeze.json`: 1,716-bar checked-in SPY replay epoch.
- `data/spy/epoch-the-rout.json`: 1,716-bar checked-in SPY replay epoch.
- `data/spy/epoch-the-recovery.json`: 1,794-bar checked-in SPY replay epoch.

### Database

- `supabase/schema.sql`: initial accounts/positions/trades schema and RLS policies; does not represent the full current runtime contract.

## Verified limitations and risk areas

- The checked-in SQL schema is incompatible with several current queries and interfaces unless a newer external migration exists.
- Stop-loss/take-profit auto-execution is not implemented despite fields and UI support.
- Option P&L in `closePositionCore` does not apply long/short direction, so short option legs can be accounted for incorrectly.
- Option display/Greek lookup in parts of `useAccount.ts` searches by strike without matching call versus put type first.
- Strategy payoff bounds are sampled, not a complete unbounded payoff analysis.
- The client mutation lock is tab-local and does not prevent multi-tab/device races.
- Stripe webhook activation does not independently verify metadata ownership.
- Payment-state refresh after success is not active.
- Withdrawal actions are not wired to a visible page and have no processing lifecycle.
- Strategy debug data is visibly rendered by `StrategyBuilder.tsx`.
- No tests are checked in.
- No runtime database, Stripe configuration, migration history, deployed environment, or successful end-to-end run can be established from source inspection alone.

## Explicit non-assumptions for future work

- Do not assume the README describes the current implementation.
- Do not assume `schema.sql` is the schema currently deployed.
- Do not assume a missing Supabase row means the user has no data; RLS/session/configuration may be the cause.
- Do not assume the simulation is financially accurate or suitable for real trading.
- Do not add real market feeds, brokerage execution, or financial claims without a separate product requirement.
- Do not infer undocumented environment values, account defaults, or business rules from names alone.
- Before changing shared trading behavior, verify both the TypeScript interfaces and the actual database contract, then add focused tests because none currently exist.
