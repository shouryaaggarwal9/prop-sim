/**
 * Pure margin & cash-flow engine — implements the C5 ledger model.
 *
 * MODEL: one cash pool (balance); reservations DERIVED from open positions.
 *   ENTRY   : option legs exchange premium immediately (long pays ask,
 *             short receives bid). Equity moves no cash (leverage model).
 *   RESERVE : equity → notional ÷ leverage; long-only structures → 0;
 *             defined-risk credit structures → EXACT worst-case settlement
 *             outflow (gross wing width; the credit already sits in balance);
 *             hedged (covered call / protective put) → shares' margin only.
 *   SETTLE  : options book exit-side exchange only; equity books full P&L.
 *   LAW     : upfrontCash(leg) + settlementCashDelta(leg, exit)
 *               ≡ positionPnl(leg, exit)
 *             so starting_balance + Σ(trade.pnl) = balance stays THE invariant.
 *
 * COVERAGE RULE (v1, bounded-tail-risk):
 *   A structure is placeable iff its worst-case settlement loss is FINITE:
 *     - net put quantity ≥ 0        (else unbounded loss as spot falls)
 *     - net call qty + shares/100 ≥ 0 (else unbounded loss as spot rises)
 *   Verticals & condors satisfy this via their long wings; naked singles and
 *   uncovered ratio shorts fail it. Share-covered calls satisfy it exactly.
 *
 * Pure. Deterministic. No React, no Supabase, no clocks, no randomness.
 *
 * Regression history:
 *   A — original validator demanded SAME-STRIKE longs, outlawing every
 *       credit spread/condor; replaced by bounded-tail-risk rule.
 */

import type { InstrumentType, Side } from "./types";
import { positionPnl, CONTRACT_MULTIPLIER } from "./engine";

export interface MarginLeg {
  instrument_type: InstrumentType;
  side: Side;
  quantity: number;
  strike?: number | null;
  entry_price: number;
}

const EPSILON = 1e-6;

/* ── UPFRONT CASH ── +credit into balance / -debit out of it. Equity: 0. */
export function upfrontCash(legs: MarginLeg[]): number {
  let cash = 0;
  for (const leg of legs) {
    if (leg.instrument_type === "equity") continue;
    const dir = leg.side === "long" ? 1 : -1;
    cash -= leg.entry_price * leg.quantity * CONTRACT_MULTIPLIER * dir;
  }
  return cash;
}

/* ── COVERAGE ── null when worst-case loss is bounded; else reason. */
export function validateCoverage(legs: MarginLeg[]): string | null {
  let netPuts = 0;
  let netCalls = 0;
  let shares = 0;

  for (const leg of legs) {
    const dir = leg.side === "long" ? 1 : -1;
    if (leg.instrument_type === "equity") {
      if (leg.side === "long") shares += leg.quantity;
      continue;
    }
    if (leg.instrument_type === "put") netPuts += dir * leg.quantity;
    else netCalls += dir * leg.quantity;
  }

  if (netPuts < -EPSILON) {
    return `Uncovered net short puts (${netPuts}) — short puts require a long put wing at a lower strike.`;
  }
  if (netCalls + shares / CONTRACT_MULTIPLIER < -EPSILON) {
    return `Uncovered net short calls (${netCalls}, ${shares} shares held) — short calls require a long call wing at a higher strike or 100 owned shares per contract.`;
  }
  return null;
}

/* ── MAX SETTLEMENT OUTFLOW ── exact worst-case gross cash OUT at expiry
 * across all terminal prices. Payoff is piecewise-linear; sampling every
 * strike plus one point beyond each edge is exhaustive (segments are linear,
 * so extrema live at endpoints/tails). Throws if coverage fails.
 * NOTE: shares are folded into call coverage first, so partially-hedged
 * books may overstate slightly — conservative by design. */
export function optionMaxOutflow(
  legs: MarginLeg[],
  sharesAvailable?: number,
): number {
  const coverageError = validateCoverage(legs);
  if (coverageError) throw new Error(coverageError);

  // Fold long shares into residual short calls (absorb, floor at zero).
  let shareQty =
    sharesAvailable ??
    legs.reduce(
      (s, l) =>
        s +
        (l.instrument_type === "equity" && l.side === "long" ? l.quantity : 0),
      0,
    );

  const eff: Array<{ type: "call" | "put"; strike: number; net: number }> = [];
  const acc = new Map<
    string,
    { net: number; type: "call" | "put"; strike: number }
  >();

  for (const leg of legs) {
    if (leg.instrument_type === "equity") continue;
    const strike = Math.round((leg.strike ?? 0) * 100) / 100;
    const key = `${leg.instrument_type}@${strike.toFixed(2)}`;
    const dir = leg.side === "long" ? 1 : -1;
    const row = acc.get(key) ?? {
      net: 0,
      type: leg.instrument_type as "call" | "put",
      strike,
    };
    row.net += dir * leg.quantity;
    acc.set(key, row);
  }
  for (const row of acc.values()) {
    let net = row.net;
    if (row.type === "call" && net < 0 && shareQty > 0) {
      const absorb = Math.min(shareQty / CONTRACT_MULTIPLIER, -net);
      net += absorb;
      shareQty -= absorb * CONTRACT_MULTIPLIER;
    }
    if (Math.abs(net) > EPSILON)
      eff.push({ type: row.type, strike: row.strike, net });
  }

  if (eff.length === 0) return 0;

  const strikes = [...new Set(eff.map((e) => e.strike))].sort((a, b) => a - b);
  const points: number[] = [strikes[0] - 5];
  for (let i = 0; i < strikes.length; i++) {
    points.push(strikes[i]);
    if (i < strikes.length - 1) points.push((strikes[i] + strikes[i + 1]) / 2);
  }
  points.push(strikes[strikes.length - 1] + 5);

  let worst = 0;
  for (const S of points) {
    let delta = 0;
    for (const e of eff) {
      const intrinsic =
        e.type === "call"
          ? Math.max(0, S - e.strike)
          : Math.max(0, e.strike - S);
      delta += e.net * intrinsic * CONTRACT_MULTIPLIER;
    }
    worst = Math.min(worst, delta);
  }
  return -worst;
}

/* ── RESERVATION ── buying power locked while the workflow is open.
 * Entry notional deliberately NOT mark-to-market (spec judgment call #1). */
export function reservationFor(legs: MarginLeg[], leverage: number): number {
  let equityNotional = 0;
  let shares = 0;
  for (const leg of legs) {
    if (leg.instrument_type !== "equity") continue;
    equityNotional += leg.entry_price * leg.quantity;
    if (leg.side === "long") shares += leg.quantity;
  }
  const hasOptions = legs.some((l) => l.instrument_type !== "equity");
  const optionReserve = hasOptions ? optionMaxOutflow(legs, shares) : 0;
  return equityNotional / leverage + optionReserve;
}

export function availability(balance: number, reserved: number): number {
  return balance - reserved;
}

export interface FundsQuote {
  upfront: number;
  reservation: number;
  affordable: boolean;
  error: string | null;
}

/** One-call pre-flight for any placement path. */
export function quoteFunds(
  balance: number,
  legs: MarginLeg[],
  leverage: number,
): FundsQuote {
  const coverageError = validateCoverage(legs);
  const upfront = coverageError ? 0 : upfrontCash(legs);
  const reservation = coverageError ? Infinity : reservationFor(legs, leverage);
  const affordable =
    !coverageError && balance + upfront >= reservation - EPSILON;

  let error: string | null = coverageError;
  if (!coverageError && !affordable) {
    const shortfall = reservation - upfront - balance;
    error = `Insufficient funds: this workflow locks ${reservation.toFixed(
      2,
    )} in margin against ${upfront >= 0 ? "credit" : "debit"} of ${Math.abs(
      upfront,
    ).toFixed(
      2,
    )} — you are ${shortfall.toFixed(2)} short of the required free cash.`;
  }
  return { upfront, reservation, affordable, error };
}

/* ── SETTLEMENT ── cash applied to balance when a leg closes at exitPrice.
 * Identity (tested): upfrontCash([leg]) + this ≡ positionPnl(leg, exit). */
export function settlementCashDelta(
  leg: {
    instrument_type: InstrumentType;
    side: Side;
    quantity: number;
    entry_price: number;
  },
  exitPrice: number,
): number {
  if (leg.instrument_type === "equity") {
    return positionPnl(leg, exitPrice);
  }
  const dir = leg.side === "long" ? 1 : -1;
  return dir * exitPrice * leg.quantity * CONTRACT_MULTIPLIER;
}
