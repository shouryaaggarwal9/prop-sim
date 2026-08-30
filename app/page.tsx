import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden px-4 py-16 sm:py-24">
      {/* Background Glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-125 w-200 -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" />

      {/* Hero Section */}
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1 text-xs font-medium text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          Zero Real Capital at Risk • 100% Deterministic Engine
        </div>

        <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          Simulated Prop Evaluation <br />
          <span className="bg-linear-to-r from-accent via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            Built for Serious Execution
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
          Test your strategies on tick-accurate replayed SPY market epochs
          against real evaluation rules: trailing drawdowns, daily loss
          boundaries, and 0DTE options chains—engineered into an
          institutional-grade simulation desk.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/signup" className="btn-buy px-8 py-3 text-sm">
            Launch Evaluation Desk
          </Link>
          <Link href="/dashboard" className="btn-secondary px-6 py-3 text-sm">
            View Live Terminal
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="relative z-10 mx-auto mt-20 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">
            Capital Allocations
          </div>
          <div className="mt-2 text-2xl font-bold text-text">$50,000.00</div>
          <p className="mt-1 text-xs text-text-secondary">
            Simulated starting balance per desk.
          </p>
        </div>

        <div className="card p-5">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">
            Profit Target
          </div>
          <div className="mt-2 text-2xl font-bold text-success">
            +6.0% Target
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            Consistency-gated pass condition.
          </p>
        </div>

        <div className="card p-5">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">
            Max Daily Drawdown
          </div>
          <div className="mt-2 text-2xl font-bold text-danger">3.0% Limit</div>
          <p className="mt-1 text-xs text-text-secondary">
            Strict intraday equity loss ceiling.
          </p>
        </div>

        <div className="card p-5">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">
            Market Coverage
          </div>
          <div className="mt-2 text-2xl font-bold text-accent">
            Spot &amp; 0DTE
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            Black-Scholes multi-leg chain pricing.
          </p>
        </div>
      </div>

      {/* Feature Highlights Section */}
      <div className="relative z-10 mx-auto mt-24 max-w-5xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Complete Prop Trading Lifecycle
          </h2>
          <p className="mt-2 text-xs text-muted sm:text-sm">
            Everything structured from evaluation phase to funded account
            verification.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="card-elevated p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 border border-accent/20 font-mono text-sm font-bold text-accent">
              01
            </div>
            <h3 className="mt-4 text-base font-semibold">
              1. Evaluation Phase
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
              Select your market regime (The Grind, The Chop, The Rout) and
              navigate deterministic 5-minute ticks with live risk validation.
            </p>
          </div>

          <div className="card-elevated p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 font-mono text-sm font-bold text-emerald-400">
              02
            </div>
            <h3 className="mt-4 text-base font-semibold">
              2. Target Clearance &amp; Pay
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
              Hit your 6% target within consistency rules. Lock in your verified
              status and activate the simulated funded account.
            </p>
          </div>

          <div className="card-elevated p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 font-mono text-sm font-bold text-indigo-400">
              03
            </div>
            <h3 className="mt-4 text-base font-semibold">
              3. Funded Payout Desk
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
              Trade under live funded parameters. Extract simulated trading
              profits directly through our integrated Payout Desk.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
