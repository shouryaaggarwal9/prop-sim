// import type { OptionsChain, OptionLeg } from "./options";
import { getLegPrice, type OptionsChain, type OptionLeg } from "./options";

export type StrategyType =
  | "bull_call_spread"
  | "bear_put_spread"
  | "bull_put_spread"
  | "bear_call_spread"
  | "iron_condor"
  | "covered_call"
  | "protective_put";

export interface StrategyLegInput {
  instrument_type: "equity" | "call" | "put";
  side: "long" | "short";
  strike?: number;
  quantity: number;
}

export interface StrategyConfig {
  type: StrategyType;
  name: string;
  description: string;
  category: "debit" | "credit" | "hedged";
  defaultLegs: (atmStrike: number, step: number) => StrategyLegInput[];
}

export const STRATEGY_CONFIGS: StrategyConfig[] = [
  {
    type: "bull_call_spread",
    name: "Bull Call Spread",
    description:
      "Long lower call, short higher call. Limited risk, limited reward.",
    category: "debit",
    defaultLegs: (atm, step) => [
      { instrument_type: "call", side: "long", strike: atm, quantity: 1 },
      {
        instrument_type: "call",
        side: "short",
        strike: atm + step * 2,
        quantity: 1,
      },
    ],
  },
  {
    type: "bear_put_spread",
    name: "Bear Put Spread",
    description: "Long higher put, short lower put. Bearish with defined risk.",
    category: "debit",
    defaultLegs: (atm, step) => [
      { instrument_type: "put", side: "long", strike: atm, quantity: 1 },
      {
        instrument_type: "put",
        side: "short",
        strike: atm - step * 2,
        quantity: 1,
      },
    ],
  },
  {
    type: "bull_put_spread",
    name: "Bull Put Spread",
    description: "Short higher put, long lower put. Collect premium, bullish.",
    category: "credit",
    defaultLegs: (atm, step) => [
      { instrument_type: "put", side: "short", strike: atm, quantity: 1 },
      {
        instrument_type: "put",
        side: "long",
        strike: atm - step * 2,
        quantity: 1,
      },
    ],
  },
  {
    type: "bear_call_spread",
    name: "Bear Call Spread",
    description:
      "Short lower call, long higher call. Collect premium, bearish.",
    category: "credit",
    defaultLegs: (atm, step) => [
      { instrument_type: "call", side: "short", strike: atm, quantity: 1 },
      {
        instrument_type: "call",
        side: "long",
        strike: atm + step * 2,
        quantity: 1,
      },
    ],
  },
  {
    type: "iron_condor",
    name: "Iron Condor",
    description: "Short strangle with long wings. Profit from low volatility.",
    category: "credit",
    defaultLegs: (atm, step) => [
      {
        instrument_type: "put",
        side: "long",
        strike: atm - step * 3,
        quantity: 1,
      },
      {
        instrument_type: "put",
        side: "short",
        strike: atm - step,
        quantity: 1,
      },
      {
        instrument_type: "call",
        side: "short",
        strike: atm + step,
        quantity: 1,
      },
      {
        instrument_type: "call",
        side: "long",
        strike: atm + step * 3,
        quantity: 1,
      },
    ],
  },
  {
    type: "covered_call",
    name: "Covered Call",
    description: "Long equity, short OTM call. Income strategy.",
    category: "hedged",
    defaultLegs: (atm, step) => [
      { instrument_type: "equity", side: "long", quantity: 100 },
      {
        instrument_type: "call",
        side: "short",
        strike: atm + step,
        quantity: 1,
      },
    ],
  },
  {
    type: "protective_put",
    name: "Protective Put",
    description: "Long equity, long put. Insurance strategy.",
    category: "hedged",
    defaultLegs: (atm, step) => [
      { instrument_type: "equity", side: "long", quantity: 100 },
      { instrument_type: "put", side: "long", strike: atm - step, quantity: 1 },
    ],
  },
];

export interface StrategyAnalysis {
  netDebit: number; // positive = debit paid, negative = credit received
  maxProfit: number;
  maxLoss: number;
  breakevens: number[];
  marginRequired: number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
}

export function analyzeStrategy(
  legs: StrategyLegInput[],
  chain: OptionsChain,
): StrategyAnalysis {
  let netDebit = 0;
  let delta = 0;
  let gamma = 0;
  let theta = 0;
  let vega = 0;

  // Track all key strike boundaries for exact expiration payoff evaluation
  const keyPrices = new Set<number>([
    chain.underlyingPrice * 0.85,
    chain.underlyingPrice * 1.15,
  ]);

  for (const leg of legs) {
    if (leg.instrument_type === "equity") {
      const cost = chain.underlyingPrice * leg.quantity;
      if (leg.side === "long") {
        netDebit += cost;
        delta += leg.quantity;
      } else {
        netDebit -= cost;
        delta -= leg.quantity;
      }
      continue;
    }

    const opt = getLegPrice(chain, leg.instrument_type, leg.strike ?? 0);
    if (!opt) continue;

    if (leg.strike) keyPrices.add(leg.strike);

    // Long pays Ask, Short receives Bid
    const executionPrice = leg.side === "long" ? opt.ask : opt.bid;
    const mult = leg.quantity * 100;

    if (leg.side === "long") {
      netDebit += executionPrice * mult;
      delta += opt.delta * mult;
      gamma += opt.gamma * mult;
      theta += opt.theta * mult;
      vega += opt.vega * mult;
    } else {
      netDebit -= executionPrice * mult;
      delta -= opt.delta * mult;
      gamma -= opt.gamma * mult;
      theta -= opt.theta * mult;
      vega -= opt.vega * mult;
    }
  }

  netDebit = Math.round(netDebit * 100) / 100;

  // Margin Calculations
  let marginRequired = 0;
  const isCredit = netDebit < 0;
  const calls = legs.filter((l) => l.instrument_type === "call");
  const puts = legs.filter((l) => l.instrument_type === "put");

  if (legs.some((l) => l.instrument_type === "equity")) {
    // netDebit already includes the equity cost from the loop above
    marginRequired = Math.max(0, netDebit);
  } else if (calls.length === 2 && puts.length === 2) {
    // Iron Condor: Max risk is the widest wing * 100 * quantity, minus the net credit received
    const callWidth = Math.abs((calls[0].strike ?? 0) - (calls[1].strike ?? 0));
    const putWidth = Math.abs((puts[0].strike ?? 0) - (puts[1].strike ?? 0));
    const maxWingWidth = Math.max(callWidth, putWidth);
    const qty = Math.max(calls[0].quantity, puts[0].quantity); // Use the largest leg quantity

    marginRequired = maxWingWidth * 100 * qty - Math.abs(netDebit);
  } else if (calls.length === 2 || puts.length === 2) {
    // Spreads: Risk is width * 100 * quantity minus credit (if short), or just net debit (if long)
    const opts = calls.length === 2 ? calls : puts;
    const width = Math.abs((opts[0].strike ?? 0) - (opts[1].strike ?? 0));
    const qty = opts[0].quantity;

    marginRequired = isCredit
      ? width * 100 * qty - Math.abs(netDebit)
      : netDebit;
  } else {
    // Naked Long Options: Margin is strictly the premium paid
    marginRequired = Math.max(0, netDebit);
  }

  marginRequired = Math.max(0, Math.round(marginRequired * 100) / 100);

  // Exact Expiration Payoff Curve Across All Strikes
  const sortedPrices = Array.from(keyPrices).sort((a, b) => a - b);
  const testPrices: number[] = [];

  for (let i = 0; i < sortedPrices.length; i++) {
    testPrices.push(sortedPrices[i]);
    if (i < sortedPrices.length - 1) {
      testPrices.push((sortedPrices[i] + sortedPrices[i + 1]) / 2);
    }
  }

  const pnls = testPrices.map((spot) => {
    let terminalValue = 0;
    for (const leg of legs) {
      const mult = leg.quantity * (leg.instrument_type === "equity" ? 1 : 100);
      const dir = leg.side === "long" ? 1 : -1;

      if (leg.instrument_type === "equity") {
        terminalValue += spot * mult * dir;
      } else if (leg.instrument_type === "call") {
        terminalValue += Math.max(0, spot - (leg.strike ?? 0)) * mult * dir;
      } else {
        terminalValue += Math.max(0, (leg.strike ?? 0) - spot) * mult * dir;
      }
    }
    // Net P&L = Terminal Value - Net Debit Paid
    return terminalValue - netDebit;
  });

  const maxProfit = Math.round(Math.max(...pnls) * 100) / 100;
  const maxLoss = Math.round(Math.abs(Math.min(...pnls)) * 100) / 100;

  // Breakeven Point Detection
  const breakevens: number[] = [];
  for (let i = 0; i < pnls.length - 1; i++) {
    if (
      (pnls[i] <= 0 && pnls[i + 1] >= 0) ||
      (pnls[i] >= 0 && pnls[i + 1] <= 0)
    ) {
      const denom = pnls[i + 1] - pnls[i];
      if (denom !== 0) {
        const t = -pnls[i] / denom;
        breakevens.push(
          testPrices[i] + t * (testPrices[i + 1] - testPrices[i]),
        );
      }
    }
  }

  return {
    netDebit,
    maxProfit,
    maxLoss,
    breakevens: breakevens.map((b) => Math.round(b * 100) / 100),
    marginRequired,
    greeks: {
      delta: Math.round(delta * 100) / 100,
      gamma: Math.round(gamma * 10000) / 10000,
      theta: Math.round(theta * 100) / 100,
      vega: Math.round(vega * 100) / 100,
    },
  };
}

export function validateStrategy(legs: StrategyLegInput[]): string | null {
  if (legs.length === 0) return "Strategy has no legs.";

  for (const leg of legs) {
    if (leg.quantity <= 0) return "All quantities must be positive.";
    if (leg.instrument_type !== "equity" && !leg.strike) {
      return "Options require a strike price.";
    }
  }

  const keys = new Set<string>();
  for (const leg of legs) {
    const key = `${leg.instrument_type}-${leg.side}-${leg.strike}`;
    if (keys.has(key)) return "Duplicate leg detected.";
    keys.add(key);
  }

  return null;
}
