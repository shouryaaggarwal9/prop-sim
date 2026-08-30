const RISK_FREE_RATE = 0.05;
const STRIKE_INCREMENT = 2.5;
const STRIKE_RANGE_PCT = 0.05;
const SKEW = -6.0;
const SMILE = 45.0;
const ODT_VOL_MULTIPLIER = 2.0; // 0DTE ATM ≈ 2× VIX. Tune 1.5–2.5.
const TRADING_HOURS_PER_DAY = 6.5;
// const TRADING_DAYS_PER_YEAR = 252;
// const ANNUAL_TRADING_HOURS = TRADING_HOURS_PER_DAY * TRADING_DAYS_PER_YEAR; // 1638 hours
const CALENDAR_HOURS_PER_YEAR = 365 * 24; // 8760 hours

function normCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

interface BSGreeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

function blackScholes(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: "call" | "put",
): BSGreeks {
  // 1 minute floor in trading-year terms
  const minT = 1 / (CALENDAR_HOURS_PER_YEAR * 60);
  const effectiveT = Math.max(T, minT);

  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * effectiveT) /
    (sigma * Math.sqrt(effectiveT));
  const d2 = d1 - sigma * Math.sqrt(effectiveT);

  const Nd1 = normCDF(d1);
  const Nd2 = normCDF(d2);
  const Nd1Neg = normCDF(-d1);
  const Nd2Neg = normCDF(-d2);
  const pdfD1 = normPDF(d1);

  const discount = Math.exp(-r * effectiveT);

  let price: number;
  let delta: number;
  let gamma: number;
  let theta: number;
  let vega: number;

  if (type === "call") {
    price = S * Nd1 - K * discount * Nd2;
    delta = Nd1;
    theta =
      (-(S * pdfD1 * sigma) / (2 * Math.sqrt(effectiveT)) -
        r * K * discount * Nd2) /
      365;
  } else {
    price = K * discount * Nd2Neg - S * Nd1Neg;
    delta = Nd1 - 1;
    theta =
      (-(S * pdfD1 * sigma) / (2 * Math.sqrt(effectiveT)) +
        r * K * discount * Nd2Neg) /
      365;
  }

  gamma = pdfD1 / (S * sigma * Math.sqrt(effectiveT));
  vega = (S * pdfD1 * Math.sqrt(effectiveT)) / 100;

  if (T <= 0) {
    const intrinsic = type === "call" ? Math.max(0, S - K) : Math.max(0, K - S);
    price = intrinsic;
    delta = type === "call" ? (S > K ? 1 : 0) : S < K ? -1 : 0;
    gamma = 0;
    theta = 0;
    vega = 0;
  }

  return { price, delta, gamma, theta, vega };
}

export interface OptionLeg {
  strike: number;
  type: "call" | "put";
  iv: number;
  price: number;
  bid: number;
  ask: number;
  delta: number;
  gamma: number;
  theta: number; // per trading hour
  thetaDaily: number; // original per-day value
  vega: number;
  intrinsic: number;
  timeValue: number;
}

export interface OptionsChain {
  underlyingPrice: number;
  atmStrike: number;
  vix: number;
  hoursToClose: number;
  calls: OptionLeg[];
  puts: OptionLeg[];
}

function computeIV(
  underlyingPrice: number,
  strike: number,
  vix: number,
  hoursToClose: number,
): number {
  const moneyness = Math.log(strike / underlyingPrice);

  // Base IV reflects realistic 0DTE annualized implied volatility (1.1x - 1.3x VIX)
  const baseIV = vix * 1.15;

  // Steep 0DTE smile: OTM strikes retain a volatility premium
  // As expiry approaches, moneyness curvature steepens naturally
  const timeDampener = Math.max(0.2, Math.sqrt(hoursToClose / 6.5));
  const skewTerm = (SKEW / timeDampener) * moneyness;
  const smileTerm = (SMILE / timeDampener) * Math.pow(moneyness, 2);

  let iv = baseIV + skewTerm + smileTerm;
  const pctDist = Math.abs(strike - underlyingPrice) / underlyingPrice;
  iv *= 1 + 2.0 * pctDist;

  // Floor at 8% IV, cap at 150%
  return Math.max(0.08, Math.min(iv / 100, 1.5));
}

function computeSpread(
  underlyingPrice: number,
  strike: number,
  optionPrice: number,
  hoursToClose: number,
): number {
  const pctDist = Math.abs(strike - underlyingPrice) / underlyingPrice; // Base spread scales with option value (e.g., 1.5% to 3% of premium)

  const priceSpread = Math.max(0.02, optionPrice * 0.025); // Wing penalty: wider spreads away from ATM

  const wingMultiplier = 1.0 + 3.0 * pctDist; // Time decay penalty: spreads widen into the final 90 minutes

  const timeMultiplier =
    hoursToClose < 1.5 ? Math.max(1.0, 1.5 / Math.max(0.1, hoursToClose)) : 1.0; // Minimum tick size (0.01 for under $3, 0.05 typical for standard contracts)

  const rawSpread = priceSpread * wingMultiplier * timeMultiplier;

  return Math.max(0.02, Math.round(rawSpread * 100) / 100);
}

function generateStrikes(underlyingPrice: number): number[] {
  const center =
    Math.round(underlyingPrice / STRIKE_INCREMENT) * STRIKE_INCREMENT;
  const range = underlyingPrice * STRIKE_RANGE_PCT;
  const strikes: number[] = [];

  let s = center;
  while (s >= center - range) {
    strikes.unshift(Math.round(s * 100) / 100);
    s -= STRIKE_INCREMENT;
  }

  s = center + STRIKE_INCREMENT;
  while (s <= center + range) {
    strikes.push(Math.round(s * 100) / 100);
    s += STRIKE_INCREMENT;
  }

  return strikes;
}

export function generateOptionsChain(
  underlyingPrice: number,
  vix: number,
  hoursToClose: number,
): OptionsChain {
  const T = hoursToClose / CALENDAR_HOURS_PER_YEAR;
  const strikes = generateStrikes(underlyingPrice);
  const atmStrike =
    Math.round(underlyingPrice / STRIKE_INCREMENT) * STRIKE_INCREMENT;

  const calls: OptionLeg[] = [];
  const puts: OptionLeg[] = [];

  for (const strike of strikes) {
    const iv = computeIV(underlyingPrice, strike, vix, hoursToClose);

    const callGreeks = blackScholes(
      underlyingPrice,
      strike,
      T,
      RISK_FREE_RATE,
      iv,
      "call",
    );
    const putGreeks = blackScholes(
      underlyingPrice,
      strike,
      T,
      RISK_FREE_RATE,
      iv,
      "put",
    );

    const callSpread = computeSpread(
      underlyingPrice,
      strike,
      callGreeks.price,
      hoursToClose,
    );
    const putSpread = computeSpread(
      underlyingPrice,
      strike,
      putGreeks.price,
      hoursToClose,
    ); // Compute Bid/Ask before object instantiation

    const callBid = Math.max(
      0,
      Math.round((callGreeks.price - callSpread / 2) * 100) / 100,
    );
    const callAsk = Math.max(
      callBid + 0.01,
      Math.round((callGreeks.price + callSpread / 2) * 100) / 100,
    );

    const putBid = Math.max(
      0,
      Math.round((putGreeks.price - putSpread / 2) * 100) / 100,
    );
    const putAsk = Math.max(
      putBid + 0.01,
      Math.round((putGreeks.price + putSpread / 2) * 100) / 100,
    );

    calls.push({
      strike,
      type: "call",
      iv: Math.round(iv * 10000) / 10000,
      price: Math.round(callGreeks.price * 100) / 100,
      bid: callBid,
      ask: callAsk,
      delta: Math.round(callGreeks.delta * 100) / 100,
      gamma: Math.round(callGreeks.gamma * 10000) / 10000,
      theta: Math.round((callGreeks.theta / TRADING_HOURS_PER_DAY) * 100) / 100,
      thetaDaily: Math.round(callGreeks.theta * 100) / 100,
      vega: Math.round(callGreeks.vega * 100) / 100,
      intrinsic: Math.max(0, underlyingPrice - strike),
      timeValue: Math.max(
        0,
        callGreeks.price - Math.max(0, underlyingPrice - strike),
      ),
    });

    puts.push({
      strike,
      type: "put",
      iv: Math.round(iv * 10000) / 10000,
      price: Math.round(putGreeks.price * 100) / 100,
      bid: putBid,
      ask: putAsk,
      delta: Math.round(putGreeks.delta * 100) / 100,
      gamma: Math.round(putGreeks.gamma * 10000) / 10000,
      theta: Math.round((putGreeks.theta / TRADING_HOURS_PER_DAY) * 100) / 100,
      thetaDaily: Math.round(putGreeks.theta * 100) / 100,
      vega: Math.round(putGreeks.vega * 100) / 100,
      intrinsic: Math.max(0, strike - underlyingPrice),
      timeValue: Math.max(
        0,
        putGreeks.price - Math.max(0, strike - underlyingPrice),
      ),
    });
  }

  return {
    underlyingPrice,
    atmStrike,
    vix,
    hoursToClose,
    calls,
    puts,
  };
}

export function updateChainPrices(
  chain: OptionsChain,
  underlyingPrice: number,
  hoursToClose: number,
): OptionsChain {
  return generateOptionsChain(underlyingPrice, chain.vix, hoursToClose);
}

export function getLegPrice(
  chain: OptionsChain,
  type: "equity" | "call" | "put",
  strike: number,
): OptionLeg | undefined {
  if (type === "equity") return undefined;

  const legs = type === "call" ? chain.calls : chain.puts;
  return legs.find((l) => Math.abs(l.strike - strike) < 0.01);
}

export function getIntrinsicValue(
  type: "call" | "put",
  underlyingPrice: number,
  strike: number,
): number {
  return type === "call"
    ? Math.max(0, underlyingPrice - strike)
    : Math.max(0, strike - underlyingPrice);
}
