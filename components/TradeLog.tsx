import type { Trade } from "@/lib/trading/types";

const REASON_BADGES: Record<string, { label: string; style: string }> = {
  manual: {
    label: "Manual",
    style: "border-border bg-surface-hover text-text-secondary",
  },
  sl: {
    label: "Stop Loss",
    style: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  },
  tp: {
    label: "Take Profit",
    style: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  day_end: {
    label: "Day End",
    style: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  finalized: {
    label: "Finalized",
    style: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  },
  liquidation: {
    label: "Liquidation",
    style: "border-rose-500/30 bg-rose-500/20 text-rose-300 font-bold",
  },
};

export default function TradeLog({ trades }: { trades: Trade[] }) {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text font-mono">
            Execution Log
          </h3>
          <span className="badge border-border bg-surface-elevated text-muted font-mono text-[10px]">
            {trades.length} Closed
          </span>
        </div>
        <span className="text-[11px] font-mono text-muted">
          Immutable Ledger
        </span>
      </div>

      {trades.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted">
          No executed trades recorded for this account.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 bg-surface border-b border-border-subtle text-[10px] uppercase text-muted">
              <tr>
                <th className="py-2 px-2 font-normal">Side</th>
                <th className="py-2 px-2 font-normal">Instrument</th>
                <th className="py-2 px-2 font-normal">Qty</th>
                <th className="py-2 px-2 font-normal">Entry</th>
                <th className="py-2 px-2 font-normal">Exit</th>
                <th className="py-2 px-2 font-normal">Reason</th>
                <th className="py-2 px-2 text-right font-normal">
                  P&amp;L ($)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {trades.map((t) => {
                const isProfitable = t.pnl >= 0;
                const reasonMeta = REASON_BADGES[t.close_reason] ?? {
                  label: t.close_reason,
                  style: "border-border text-muted",
                };

                return (
                  <tr key={t.id} className="hover:bg-white/2 transition-colors">
                    <td className="py-2.5 px-2">
                      <span
                        className={`badge text-[10px] ${
                          t.side === "long"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : "border-rose-500/20 bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {t.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-text">
                      <span className="font-semibold">
                        {t.instrument_type.toUpperCase()}
                      </span>
                      {t.strike && (
                        <span className="ml-1 text-[10px] text-muted">
                          @{t.strike}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-text-secondary">
                      {t.quantity}
                    </td>
                    <td className="py-2.5 px-2 tabular-nums text-text">
                      ${t.entry_price.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 tabular-nums text-text">
                      ${t.exit_price.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`badge text-[10px] ${reasonMeta.style}`}>
                        {reasonMeta.label}
                      </span>
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-bold tabular-nums ${
                        isProfitable ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {isProfitable ? "+" : ""}
                      {t.pnl.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
