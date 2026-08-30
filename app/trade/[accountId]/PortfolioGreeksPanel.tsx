export default function PortfolioGreeksPanel({
  greeks,
}: {
  greeks: { delta: number; gamma: number; theta: number; vega: number };
}) {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between border-b border-border-subtle pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text font-mono">
          Portfolio Greeks
        </h3>
        <span className="badge border-accent/20 bg-accent/10 text-accent font-mono text-[10px]">
          Live Net Risk
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 font-mono">
        <div className="rounded-lg border border-border-subtle bg-surface-elevated/70 p-2.5">
          <p className="text-[10px] uppercase text-muted">Delta (Δ)</p>
          <p
            className={`text-sm font-bold ${
              greeks.delta >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {greeks.delta >= 0 ? "+" : ""}
            {greeks.delta.toFixed(2)}
          </p>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface-elevated/70 p-2.5">
          <p className="text-[10px] uppercase text-muted">Gamma (Γ)</p>
          <p className="text-sm font-bold text-text">
            {greeks.gamma.toFixed(4)}
          </p>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface-elevated/70 p-2.5">
          <p className="text-[10px] uppercase text-muted">Theta (Θ / Day)</p>
          <p
            className={`text-sm font-bold ${
              greeks.theta >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {greeks.theta >= 0 ? "+" : ""}
            {greeks.theta.toFixed(2)}
          </p>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface-elevated/70 p-2.5">
          <p className="text-[10px] uppercase text-muted">Vega (ν)</p>
          <p className="text-sm font-bold text-text">
            {greeks.vega.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-white/5 bg-white/1 px-2.5 py-1.5 font-mono text-[10px] text-muted">
        Net Delta ≈{" "}
        <span className="text-text font-semibold">
          {Math.round(greeks.delta)}
        </span>{" "}
        SPY share equiv.
      </div>
    </div>
  );
}
