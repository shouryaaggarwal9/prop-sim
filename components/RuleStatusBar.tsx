import { DEFAULT_RULES } from "@/lib/trading/rules";
import type { Account } from "@/lib/trading/types";

function MetricGauge({
  label,
  value,
  limit,
  pct,
  tone,
  prefix = "$",
}: {
  label: string;
  value?: number;
  limit?: number;
  pct: number;
  tone: "accent" | "danger" | "success";
  prefix?: string;
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  const isNearBreach = tone === "danger" && clamped >= 0.75;
  const isBreached = tone === "danger" && clamped >= 1.0;

  const barColor =
    tone === "accent"
      ? "bg-accent shadow-sm shadow-accent/50"
      : tone === "success"
        ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
        : isBreached
          ? "bg-rose-600 shadow-sm shadow-rose-600/80"
          : isNearBreach
            ? "bg-amber-400 shadow-sm shadow-amber-400/50"
            : "bg-rose-400 shadow-sm shadow-rose-400/30";

  return (
    <div className="space-y-1.5 rounded-lg border border-border-subtle bg-surface-elevated/60 p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary font-medium">{label}</span>
        <span className="font-mono text-[11px] font-semibold text-text">
          {Math.round(clamped * 100)}%
          {value !== undefined && limit !== undefined && (
            <span className="ml-1 text-[10px] text-muted font-normal">
              ({prefix}
              {value.toFixed(0)} / {prefix}
              {limit.toFixed(0)})
            </span>
          )}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover p-px">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
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
  const dailyLossUsedAmount = Math.max(0, account.day_start_equity - equity);
  const dailyLossUsed = dailyLossUsedAmount / dailyLossLimit;

  const trailingLimit = peakEquity * DEFAULT_RULES.trailingDrawdownPct;
  const drawdownUsedAmount = Math.max(0, peakEquity - equity);
  const drawdownUsed = drawdownUsedAmount / trailingLimit;

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
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-border-subtle pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text font-mono">
          {isFunded ? "Funded Risk Parameters" : "Evaluation Rules Health"}
        </h3>
        <span className="badge border-border bg-surface-hover text-text-secondary text-[10px] font-mono">
          Strict Mode
        </span>
      </div>

      <div className="space-y-2">
        {!isFunded && (
          <>
            <MetricGauge
              label="Profit Target (6.0%)"
              value={Math.max(0, totalProfit)}
              limit={profitTarget}
              pct={profitProgress}
              tone="accent"
            />
            {totalProfit > 0 && (
              <MetricGauge
                label="Consistency Concentration (Max 40%)"
                value={maxSingleDayProfit}
                limit={consistencyLimit}
                pct={consistencyUsed}
                tone="danger"
              />
            )}
          </>
        )}

        <MetricGauge
          label="Intraday Loss Used (3.0% Max)"
          value={dailyLossUsedAmount}
          limit={dailyLossLimit}
          pct={dailyLossUsed}
          tone="danger"
        />

        <MetricGauge
          label="Trailing Drawdown Used (6.0% Max)"
          value={drawdownUsedAmount}
          limit={trailingLimit}
          pct={drawdownUsed}
          tone="danger"
        />
      </div>

      {isFunded && (
        <p className="text-[11px] leading-relaxed text-muted">
          Funded accounts operate with no profit ceiling. Keep daily loss and
          peak trailing drawdowns within risk boundaries to maintain funded
          status.
        </p>
      )}
    </div>
  );
}
