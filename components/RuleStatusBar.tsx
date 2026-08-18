import { DEFAULT_RULES } from "@/lib/trading/rules";
import type { Account } from "@/lib/trading/types";

function Bar({
  label,
  pct,
  tone,
}: {
  label: string;
  pct: number;
  tone: "accent" | "danger";
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span>{Math.round(clamped * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${tone === "accent" ? "bg-accent" : "bg-danger"}`}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function RuleStatusBar({
  account,
  equity,
  peakEquity,
}: {
  account: Account;
  equity: number;
  peakEquity: number;
}) {
  const dailyLossLimit = account.starting_balance * DEFAULT_RULES.dailyLossPct;
  const dailyLossUsed =
    Math.max(0, account.day_start_equity - equity) / dailyLossLimit;

  const trailingLimit = peakEquity * DEFAULT_RULES.trailingDrawdownPct;
  const drawdownUsed = Math.max(0, peakEquity - equity) / trailingLimit;

  const isFunded = account.phase === "funded";
  const totalProfit = equity - account.starting_balance;
  const profitTarget = account.starting_balance * DEFAULT_RULES.profitTargetPct;
  const profitProgress = totalProfit / profitTarget;

  const currentDayPnL = equity - account.day_start_equity;
  const allDailyPnls = [...account.daily_pnls, currentDayPnL];
  const maxSingleDayProfit = Math.max(0, ...allDailyPnls);
  const consistencyLimit =
    totalProfit > 0 ? totalProfit * DEFAULT_RULES.consistencyPct : 0;
  const consistencyUsed =
    consistencyLimit > 0 ? maxSingleDayProfit / consistencyLimit : 0;

  return (
    <div className="card space-y-3 p-4">
      <h3 className="text-sm font-medium">
        {isFunded ? "Funded account rules" : "Evaluation rules"}
      </h3>

      {!isFunded && (
        <>
          <Bar label="Profit target" pct={profitProgress} tone="accent" />
          {totalProfit > 0 && (
            <Bar
              label="Consistency limit used (largest single day)"
              pct={consistencyUsed}
              tone="danger"
            />
          )}
        </>
      )}
      <Bar label="Daily loss limit used" pct={dailyLossUsed} tone="danger" />
      <Bar label="Trailing drawdown used" pct={drawdownUsed} tone="danger" />

      {isFunded && (
        <p className="text-xs text-muted">
          Funded accounts have no profit target — just stay within the risk
          limits above.
        </p>
      )}
    </div>
  );
}
