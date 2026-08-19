export default function PortfolioGreeksPanel({
  greeks,
}: {
  greeks: { delta: number; gamma: number; theta: number; vega: number };
}) {
  return (
    <div className="card space-y-2 p-4">
      <h3 className="text-sm font-medium">Portfolio Greeks</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted">Delta</p>
          <p className={greeks.delta >= 0 ? "text-success" : "text-danger"}>
            {greeks.delta >= 0 ? "+" : ""}
            {greeks.delta.toFixed(0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Gamma</p>
          <p>{greeks.gamma.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Theta</p>
          <p className={greeks.theta >= 0 ? "text-success" : "text-danger"}>
            {greeks.theta >= 0 ? "+" : ""}
            {greeks.theta.toFixed(0)}/day
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Vega</p>
          <p>{greeks.vega.toFixed(0)}</p>
        </div>
      </div>
      <p className="text-[10px] text-muted">
        Delta ≈ {Math.round(greeks.delta)} shares of SPY exposure
      </p>
    </div>
  );
}
