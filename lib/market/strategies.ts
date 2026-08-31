import { getLegPrice, type OptionsChain } from "./options";

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
    description: "Long ATM call, short OTM call. Defined-risk upside.",
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
    description: "Long ATM put, short OTM put. Defined-risk downside.",
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
    description:
      "Short OTM put, long lower put. Collect premium, bullish skew.",
    category: "credit",
    defaultLegs: (atm, step) => [
      {
        instrument_type: "put",
        side: "short",
        strike: atm - step,
        quantity: 1,
      },
      {
        instrument_type: "put",
        side: "long",
        strike: atm - step * 3,
        quantity: 1,
      },
    ],
  },
  {
    type: "bear_call_spread",
    name: "Bear Call Spread",
    description:
      "Short OTM call, long higher call. Collect premium, bearish skew.",
    category: "credit",
    defaultLegs: (atm, step) => [
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
    type: "iron_condor",
    name: "Iron Condor",
    description:
      "Short OTM strangle with long wings. Range-bound theta harvest.",
    category: "credit",
    defaultLegs: (atm, step) => [
      {
        instrument_type: "put",
        side: "long",
        strike: atm - step * 4,
        quantity: 1,
      },
      {
        instrument_type: "put",
        side: "short",
        strike: atm - step * 2,
        quantity: 1,
      },
      {
        instrument_type: "call",
        side: "short",
        strike: atm + step * 2,
        quantity: 1,
      },
      {
        instrument_type: "call",
        side: "long",
        strike: atm + step * 4,
        quantity: 1,
      },
    ],
  },
  {
    type: "covered_call",
    name: "Covered Call",
    description: "Long 100 shares, short OTM call. Income overlay.",
    category: "hedged",
    defaultLegs: (atm, step) => [
      { instrument_type: "equity", side: "long", quantity: 100 },
      {
        instrument_type: "call",
        side: "short",
        strike: atm + step * 2,
        quantity: 1,
      },
    ],
  },
  {
    type: "protective_put",
    name: "Protective Put",
    description: "Long 100 shares, long OTM put. Downside insurance.",
    category: "hedged",
    defaultLegs: (atm, step) => [
      { instrument_type: "equity", side: "long", quantity: 100 },
      {
        instrument_type: "put",
        side: "long",
        strike: atm - step * 2,
        quantity: 1,
      },
    ],
  },
];

export interface StrategyAnalysis {
  netDebit: number;
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

  const keyPrices = new Set<number>([
    chain.underlyingPrice * 0.9,
    chain.underlyingPrice * 1.1,
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

  let marginRequired = 0;
  const isCredit = netDebit < 0;
  const calls = legs.filter((l) => l.instrument_type === "call");
  const puts = legs.filter((l) => l.instrument_type === "put");

  if (legs.some((l) => l.instrument_type === "equity")) {
    marginRequired = Math.max(0, netDebit);
  } else if (calls.length === 2 && puts.length === 2) {
    const callWidth = Math.abs((calls[0].strike ?? 0) - (calls[1].strike ?? 0));
    const putWidth = Math.abs((puts[0].strike ?? 0) - (puts[1].strike ?? 0));
    const maxWingWidth = Math.max(callWidth, putWidth);
    const qty = Math.max(calls[0].quantity, puts[0].quantity);

    marginRequired = maxWingWidth * 100 * qty - Math.abs(netDebit);
  } else if (calls.length === 2 || puts.length === 2) {
    const opts = calls.length === 2 ? calls : puts;
    const width = Math.abs((opts[0].strike ?? 0) - (opts[1].strike ?? 0));
    const qty = opts[0].quantity;

    marginRequired = isCredit
      ? width * 100 * qty - Math.abs(netDebit)
      : netDebit;
  } else {
    marginRequired = Math.max(0, netDebit);
  }

  marginRequired = Math.max(0, Math.round(marginRequired * 100) / 100);

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
    return terminalValue - netDebit;
  });

  const maxProfit = Math.round(Math.max(...pnls) * 100) / 100;
  const maxLoss = Math.round(Math.abs(Math.min(...pnls)) * 100) / 100;

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
