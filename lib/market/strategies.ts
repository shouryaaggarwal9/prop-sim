import type { OptionsChain } from "./options";

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

function getLegPrice(
  chain: OptionsChain,
  type: "call" | "put",
  strike: number,
) {
  const legs = type === "call" ? chain.calls : chain.puts;
  return legs.find((l) => Math.abs(l.strike - strike) < 0.01);
}

export interface StrategyAnalysis {
  netDebit: number; // positive = you pay, negative = you receive
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

    const price = leg.side === "long" ? opt.ask : opt.bid;
    const mult = leg.quantity * 100;

    if (leg.side === "long") {
      netDebit += price * mult;
      delta += opt.delta * mult;
      gamma += opt.gamma * mult;
      theta += opt.theta * mult;
      vega += opt.vega * mult;
    } else {
      netDebit -= price * mult;
      delta -= opt.delta * mult;
      gamma -= opt.gamma * mult;
      theta -= opt.theta * mult;
      vega -= opt.vega * mult;
    }
  }

  // Margin calculation
  let marginRequired = 0;
  const isCredit = netDebit < 0;

  // Detect spread width for defined-risk strategies
  const calls = legs.filter((l) => l.instrument_type === "call");
  const puts = legs.filter((l) => l.instrument_type === "put");

  if (legs.some((l) => l.instrument_type === "equity")) {
    // Hedged strategies: margin = equity cost + any net debit
    const equityLeg = legs.find((l) => l.instrument_type === "equity");
    const eqCost = (equityLeg?.quantity ?? 0) * chain.underlyingPrice;
    marginRequired = eqCost + Math.max(0, netDebit);
  } else if (calls.length === 2 && puts.length === 2) {
    // Iron condor: width × 100 - net credit
    const callWidth = Math.abs((calls[0].strike ?? 0) - (calls[1].strike ?? 0));
    const putWidth = Math.abs((puts[0].strike ?? 0) - (puts[1].strike ?? 0));
    const width = Math.min(callWidth, putWidth);
    marginRequired = width * 100 - Math.abs(netDebit);
  } else if (calls.length === 2 || puts.length === 2) {
    // Vertical spread: width × 100 - net credit, or net debit for debit spreads
    const opts = calls.length === 2 ? calls : puts;
    const width = Math.abs((opts[0].strike ?? 0) - (opts[1].strike ?? 0));
    marginRequired = isCredit ? width * 100 - Math.abs(netDebit) : netDebit;
  } else {
    // Single leg or undefined: full cash
    marginRequired = Math.abs(netDebit);
  }

  marginRequired = Math.max(marginRequired, 0);

  // Max profit / loss estimation (simplified for 0DTE)
  // For multi-strike strategies, we compute at key test points
  const testPrices = [
    chain.underlyingPrice * 0.9,
    chain.underlyingPrice * 0.95,
    chain.underlyingPrice,
    chain.underlyingPrice * 1.05,
    chain.underlyingPrice * 1.1,
  ];

  const pnls = testPrices.map((s) => {
    let pnl = 0;
    for (const leg of legs) {
      if (leg.instrument_type === "equity") {
        const dir = leg.side === "long" ? 1 : -1;
        pnl += (s - chain.underlyingPrice) * leg.quantity * dir;
        continue;
      }
      const intrinsic =
        leg.instrument_type === "call"
          ? Math.max(0, s - (leg.strike ?? 0))
          : Math.max(0, (leg.strike ?? 0) - s);
      const entry = getLegPrice(chain, leg.instrument_type, leg.strike ?? 0);
      const entryPrice =
        leg.side === "long" ? (entry?.ask ?? 0) : (entry?.bid ?? 0);
      const dir = leg.side === "long" ? 1 : -1;
      pnl += (intrinsic - entryPrice) * leg.quantity * 100 * dir;
    }
    return pnl;
  });

  const maxProfit = Math.max(...pnls);
  const maxLoss = Math.min(...pnls);

  // Breakevens: interpolate where P&L crosses zero
  const breakevens: number[] = [];
  for (let i = 0; i < pnls.length - 1; i++) {
    if (
      (pnls[i] <= 0 && pnls[i + 1] >= 0) ||
      (pnls[i] >= 0 && pnls[i + 1] <= 0)
    ) {
      const t = pnls[i] / (pnls[i] - pnls[i + 1]);
      breakevens.push(testPrices[i] + t * (testPrices[i + 1] - testPrices[i]));
    }
  }

  return {
    netDebit,
    maxProfit,
    maxLoss: Math.abs(maxLoss),
    breakevens,
    marginRequired,
    greeks: { delta, gamma, theta, vega },
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

  // Check for duplicate strikes in same type/side (usually a mistake)
  const keys = new Set<string>();
  for (const leg of legs) {
    const key = `${leg.instrument_type}-${leg.side}-${leg.strike}`;
    if (keys.has(key)) return "Duplicate leg detected.";
    keys.add(key);
  }

  return null;
}
