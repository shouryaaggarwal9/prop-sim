/**
 * Pure trading-engine primitives.
 *
 * Rules for this file — violate any of these and the tests lose their meaning:
 *   1. No React, no Supabase, no network, no Date.now(), no randomness.
 *   2. Every function is deterministic: same inputs → same outputs.
 *   3. Money math lives HERE, not in hooks or components. Hooks orchestrate;
 *      they do not calculate.
 */

import type { InstrumentType, Side } from "./types";
import {
  getLegPrice,
  type OptionsChain,
  type OptionLeg,
} from "@/lib/market/options";

export const CONTRACT_MULTIPLIER = 100;

/** Tolerance for strike matching — mirrors existing convention (strikes are 2dp). */
export const STRIKE_EPSILON = 0.01;

/** Structural subset of Position needed for P&L — keeps call sites honest. */
export type PnlPosition = Pick<
  Position,
  "instrument_type" | "side" | "quantity" | "entry_price"
>;
interface Position {
  instrument_type: InstrumentType;
  side: Side;
  quantity: number;
  entry_price: number;
}

const direction = (side: Side): 1 | -1 => (side === "long" ? 1 : -1);
const multiplier = (instrument: InstrumentType): number =>
  instrument === "equity" ? 1 : CONTRACT_MULTIPLIER;

/**
 * Realized/unrealized P&L for ANY instrument/side combination.
 *
 * Regression history (do not delete these notes):
 *   C1 — the previous implementations computed option P&L as
 *        (exit - entry) * qty * 100 with NO side multiplier, so every SHORT
 *        option leg booked losses as profits. A covered call losing $800
 *        was recorded as +$800. This function is the single source of truth.
 */
export function positionPnl(pos: PnlPosition, exitPrice: number): number {
  return (
    (exitPrice - pos.entry_price) *
    pos.quantity *
    multiplier(pos.instrument_type) *
    direction(pos.side)
  );
}

/**
 * Type-aware option leg resolution. A put at strike K must NEVER resolve to
 * the call at strike K (chains contain both).
 *
 * Regression history: C2 — five call-sites used `calls.find(...) || puts.find(...)`,
 * pricing every put leg as a call.
 */
export function resolveLeg(
  chain: OptionsChain,
  type: "call" | "put",
  strike: number,
): OptionLeg {
  const leg = getLegPrice(chain, type, strike); // type-aware lookup
  if (!leg) {
    throw new Error(
      `resolveLeg: ${type} @ ${strike} not in chain (${chain.calls.length} calls / ${chain.puts.length} puts, spot ${chain.underlyingPrice}).`,
    );
  }
  return leg;
}

/**
 * Validates that a resting order would NOT fill instantly at a price
 * disconnected from the current market.
 *
 * Placement truth table (current = live price):
 *   limit buy  : trigger <= current   (waits below; equal ⇒ marketable, fair)
 *   limit sell : trigger >= current
 *   stop  buy  : trigger >= current
 *   stop  sell : trigger <= current
 *
 * Regression history: C3 — stop-buy @ $500 with market at $590 triggered
 * instantly, filled at $500, minted ~$9,000 of fake equity on one lot, and
 * passed the 6% evaluation in two clicks. Returns an error string (UI-safe)
 * or null when valid.
 */
export function validateTrigger(
  orderType: "limit" | "stop",
  side: Side,
  trigger: number,
  currentPrice: number,
): string | null {
  if (!(trigger > 0)) return "Trigger price must be positive.";

  const invalid =
    (orderType === "limit" && side === "long" && trigger > currentPrice) ||
    (orderType === "limit" && side === "short" && trigger < currentPrice) ||
    (orderType === "stop" && side === "long" && trigger < currentPrice) ||
    (orderType === "stop" && side === "short" && trigger > currentPrice);

  if (!invalid) return null;

  const expects =
    orderType === "limit"
      ? side === "long"
        ? "at or below"
        : "at or above"
      : side === "long"
        ? "at or above"
        : "at or below";

  return `${orderType} ${side} trigger must be ${expects} the current price (${currentPrice.toFixed(2)}).`;
}

/**
 * Merges newly inserted rows INTO local state instead of replacing it.
 *
 * Regression history: C4 — `fillPositions` did `setPositions(inserted)`,
 * orphaning any pre-existing positions: invisible in UI, never marked,
 * never closed at day end, permanently wrong in the database.
 */
export function mergeById<T extends { id: string }>(
  prev: T[],
  inserted: T[],
): T[] {
  const existing = new Set(prev.map((p) => p.id));
  return [...prev, ...inserted.filter((i) => !existing.has(i.id))];
}
