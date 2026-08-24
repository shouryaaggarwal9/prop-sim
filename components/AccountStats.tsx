import type { Account } from "@/lib/trading/types";

const STATUS_STYLES: Record<Account["status"], string> = {
  active: "bg-accent/15 text-accent",
  passed: "bg-success/15 text-success",
  failed: "bg-danger/15 text-danger",
  pending_payment: "bg-muted/15 text-muted",
};

const FAIL_REASON_LABEL: Record<string, string> = {
  daily_loss: "Daily loss limit breached",
  trailing_drawdown: "Trailing drawdown breached",
};

export default function AccountStats({
  account,
  equity,
  currentPrice,
}: {
  account: Account;
  equity: number;
  peakEquity: number;
  currentPrice: number;
}) {
  const dailyPnL = equity - account.day_start_equity;
  const totalPnL = equity - account.starting_balance;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">
          {account.symbol}
          <span className="ml-2 text-xs font-normal text-muted capitalize">
            {account.phase}
          </span>
        </h2>
        <span className={`badge ${STATUS_STYLES[account.status]}`}>
          {account.status}
        </span>
      </div>

      {account.status === "failed" && account.fail_reason && (
        <p className="text-xs text-danger">
          {FAIL_REASON_LABEL[account.fail_reason]}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted">Price</dt>
        <dd className="text-right tabular-nums">{currentPrice.toFixed(2)}</dd>

        <dt className="text-muted">Balance</dt>
        <dd className="text-right tabular-nums">
          ${account.balance.toFixed(2)}
        </dd>

        <dt className="text-muted">Equity</dt>
        <dd className="text-right tabular-nums">${equity.toFixed(2)}</dd>

        <dt className="text-muted">Leverage</dt>
        <dd className="text-right tabular-nums">{account.leverage}x</dd>

        <dt className="text-muted">Daily P&amp;L</dt>
        <dd
          className={`text-right tabular-nums ${dailyPnL >= 0 ? "text-success" : "text-danger"}`}
        >
          {dailyPnL >= 0 ? "+" : ""}
          {dailyPnL.toFixed(2)}
        </dd>

        <dt className="text-muted">Total P&amp;L</dt>
        <dd
          className={`text-right tabular-nums ${totalPnL >= 0 ? "text-success" : "text-danger"}`}
        >
          {totalPnL >= 0 ? "+" : ""}
          {totalPnL.toFixed(2)}
        </dd>
      </dl>
    </div>
  );
}
