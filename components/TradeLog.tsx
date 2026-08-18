import type { Trade } from "@/lib/trading/types";

export default function TradeLog({ trades }: { trades: Trade[] }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-medium">Trade log</h3>
      {trades.length === 0 ? (
        <p className="text-sm text-muted">No closed trades yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="pb-2 font-normal">Side</th>
                <th className="pb-2 font-normal">Qty</th>
                <th className="pb-2 font-normal">Entry</th>
                <th className="pb-2 font-normal">Exit</th>
                <th className="pb-2 pr-0 text-right font-normal">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 capitalize">{t.side}</td>
                  <td className="py-1.5">{t.quantity}</td>
                  <td className="py-1.5 tabular-nums">{t.entry_price.toFixed(2)}</td>
                  <td className="py-1.5 tabular-nums">{t.exit_price.toFixed(2)}</td>
                  <td className={`py-1.5 text-right tabular-nums ${t.pnl >= 0 ? "text-success" : "text-danger"}`}>
                    {t.pnl >= 0 ? "+" : ""}
                    {t.pnl.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
