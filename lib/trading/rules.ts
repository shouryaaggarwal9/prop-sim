export interface RuleThresholds {
  /** Fraction of starting balance that counts as passing, e.g. 0.06 = 6%. */
  profitTargetPct: number;
  /** Fraction of starting balance that may be lost in a single simulated day. */
  dailyLossPct: number;
  /** Fraction of peak equity the account may give back before breaching (trailing). */
  trailingDrawdownPct: number;
  /** No single day's profit may exceed this fraction of total profit at the
   *  moment the profit target is hit — otherwise the account keeps trading
   *  instead of passing, until profit is spread across more days. */
  consistencyPct: number;
}

/** Thresholds are intentionally unremarkable — the point of this project is the
 *  engine, not the exact numbers. Loosely modeled on real prop-firm evaluations. */

// this is the "real" ruleset, but it's too strict for testing — you have to trade for a while to pass, and you can fail in a single day. Use the test rules below instead.

export const DEFAULT_RULES: RuleThresholds = {
  profitTargetPct: 0.06, // 6% profit target
  dailyLossPct: 0.03,
  trailingDrawdownPct: 0.06,
  consistencyPct: 0.4, // 40% of total profit may be concentrated in a single day
};

// only for testing, so you can pass in a single trade and see the account pass/fail immediately
// export const DEFAULT_RULES: RuleThresholds = {
//   profitTargetPct: 0.001, // 0.1% target ($50 on $50,000) -> 1 small trade hits the target
//   dailyLossPct: 0.2, // 20% cushion so you don't fail by accident
//   trailingDrawdownPct: 0.2, // 20% drawdown cushion
//   consistencyPct: 1.0, // 100% consistency allows passing on Day 1 in a single trade
// };

export interface RuleCheckInput {
  startingBalance: number;
  equity: number;
  peakEquity: number;
  dayStartEquity: number;
  /** P&L of each completed simulated day (not including the day in progress). */
  dailyPnls: number[];
  /** False for funded accounts — they're never subject to a profit target or
   *  the consistency rule, only ongoing risk limits (daily loss, drawdown). */
  checkProfitTarget: boolean;
}

export type RuleResult =
  | { status: "active" }
  | { status: "passed" }
  | { status: "failed"; reason: "daily_loss" | "trailing_drawdown" };

/** Evaluated every tick against live equity. Order matters: a breach takes
 *  priority over a simultaneous pass (you can't pass an account that just blew
 *  its daily loss limit on the same tick). Reaching the profit target without
 *  satisfying the consistency rule does not fail the account — it just keeps
 *  trading until the ratio improves. */
export function evaluateRules(
  input: RuleCheckInput,
  t: RuleThresholds,
): RuleResult {
  const currentDayPnL = input.equity - input.dayStartEquity;

  const dailyLossLimit = input.startingBalance * t.dailyLossPct;
  if (currentDayPnL <= -dailyLossLimit) {
    return { status: "failed", reason: "daily_loss" };
  }

  const trailingLimit = input.peakEquity * t.trailingDrawdownPct;
  if (input.peakEquity - input.equity >= trailingLimit) {
    return { status: "failed", reason: "trailing_drawdown" };
  }

  if (input.checkProfitTarget) {
    const totalProfit = input.equity - input.startingBalance;
    const profitTarget = input.startingBalance * t.profitTargetPct;
    if (totalProfit >= profitTarget) {
      const allDailyPnls = [...input.dailyPnls, currentDayPnL];
      const maxSingleDayProfit = Math.max(0, ...allDailyPnls);
      const consistencyOk =
        totalProfit <= 0 ||
        maxSingleDayProfit <= totalProfit * t.consistencyPct;
      if (consistencyOk) {
        return { status: "passed" };
      }
      // Target reached but concentrated in too few days — stays active.
    }
  }

  return { status: "active" };
}
