import { DEFAULT_RULES } from "@/lib/trading/rules";
import type { Account } from "@/lib/trading/types";

function MetricPill({
  label,
  value,
  limit,
  pct,
  tone,
}: {
  label: string;
  value: number;
  limit: number;
  pct: number;
  tone: "accent" | "danger" | "success";
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  const isNearBreach = tone === "danger" && clamped >= 0.75;
  const isBreached = tone === "danger" && clamped >= 1.0;

  const barColor =
    tone === "accent"
      ? "bg-accent"
      : tone === "success"
        ? "bg-emerald-400"
        : isBreached
          ? "bg-rose-600 animate-pulse"
          : isNearBreach
            ? "bg-amber-400"
            : "bg-rose-400";

  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-border-subtle bg-surface-elevated/60 px-3 py-1.5 font-mono text-[11px]">
      <div className="flex-1">
        <div className="flex justify-between text-muted">
          <span>{label}</span>
          <span className="font-semibold text-text">
            ${value.toFixed(0)} / ${limit.toFixed(0)} (
            {Math.round(clamped * 100)}%)
          </span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${clamped * 100}%` }}
          />
        </div>
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isFunded && (
        <MetricPill
          label="Profit Target"
          value={Math.max(0, totalProfit)}
          limit={profitTarget}
          pct={profitProgress}
          tone="accent"
        />
      )}
      <MetricPill
        label="Intraday Loss"
        value={dailyLossUsedAmount}
        limit={dailyLossLimit}
        pct={dailyLossUsed}
        tone="danger"
      />
      <MetricPill
        label="Trailing Drawdown"
        value={drawdownUsedAmount}
        limit={trailingLimit}
        pct={drawdownUsed}
        tone="danger"
      />
    </div>
  );
}
