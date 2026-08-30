"use client";

import { useState, useEffect, useMemo } from "react";
import type { OptionsChain } from "@/lib/market/options";
import {
  STRATEGY_CONFIGS,
  analyzeStrategy,
  type StrategyType,
  type StrategyLegInput,
} from "@/lib/market/strategies";
import { quoteFunds, type MarginLeg } from "@/lib/trading/margin";

export default function StrategyBuilder({
  chain,
  onPlaceStrategy,
  disabled,
  availableCash,
  leverage,
}: {
  chain: OptionsChain;
  onPlaceStrategy: (
    type: StrategyType,
    legs: StrategyLegInput[],
  ) => Promise<void>;
  disabled: boolean;
  availableCash: number;
  leverage: number;
}) {
  const [selectedType, setSelectedType] =
    useState<StrategyType>("bull_call_spread");
  const [contracts, setContracts] = useState(1);
  const [legs, setLegs] = useState<StrategyLegInput[]>([]);
  const [busy, setBusy] = useState(false);

  const config = STRATEGY_CONFIGS.find((c) => c.type === selectedType)!;

  useEffect(() => {
    const defaults = config.defaultLegs(chain.atmStrike, 2.5);
    setLegs(defaults);
    setContracts(1);
  }, [selectedType, chain.atmStrike, config]);

  const scaledLegs = useMemo(
    () => legs.map((l) => ({ ...l, quantity: l.quantity * contracts })),
    [legs, contracts],
  );
  const analysis = useMemo(
    () => analyzeStrategy(scaledLegs, chain),
    [scaledLegs, chain],
  );

  const pricedLegs: MarginLeg[] = legs.map((l) => {
    if (l.instrument_type === "equity") {
      return { ...l, entry_price: chain.underlyingPrice };
    }
    const list = l.instrument_type === "call" ? chain.calls : chain.puts;
    const opt = list.find((o) => Math.abs(o.strike - (l.strike ?? 0)) < 0.01);
    return {
      ...l,
      entry_price: opt ? (l.side === "long" ? opt.ask : opt.bid) : 0,
    };
  });

  const funds = useMemo(
    () => quoteFunds(availableCash, pricedLegs, leverage),
    [availableCash, pricedLegs, leverage],
  );

  function legIsResolvable(leg: StrategyLegInput, ch: OptionsChain): boolean {
    if (leg.instrument_type === "equity") return true;
    const list = leg.instrument_type === "call" ? ch.calls : ch.puts;
    return list.some((l) => Math.abs(l.strike - (leg.strike ?? 0)) < 0.01);
  }

  const missingLegs = legs.filter((l) => !legIsResolvable(l, chain));
  const isValid =
    legs.length > 0 && legs.every((l) => legIsResolvable(l, chain));

  async function handleSubmit() {
    if (!isValid) return;
    setBusy(true);
    await onPlaceStrategy(selectedType, scaledLegs);
    setBusy(false);
  }

  function updateLeg(index: number, patch: Partial<StrategyLegInput>) {
    setLegs((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
  }

  const cleanBreakevens = analysis.breakevens.filter(
    (b) => !isNaN(b) && isFinite(b),
  );

  return (
    <div className="space-y-3 font-mono text-xs">
      <div>
        <label className="mb-1 block text-[10px] uppercase text-muted">
          Select Strategy Archetype
        </label>
        <select
          className="input w-full font-sans text-xs"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as StrategyType)}
        >
          {STRATEGY_CONFIGS.map((c) => (
            <option
              key={c.type}
              value={c.type}
              className="bg-surface text-text"
            >
              {c.name} ({c.category.toUpperCase()})
            </option>
          ))}
        </select>
      </div>

      <p className="font-sans text-[11px] leading-relaxed text-text-secondary">
        {config.description}
      </p>

      <div>
        <label className="mb-1 block text-[10px] uppercase text-muted">
          Contracts Multiplier
        </label>
        <input
          type="number"
          min={1}
          className="input"
          value={contracts}
          onChange={(e) => setContracts(Math.max(1, Number(e.target.value)))}
        />
      </div>

      {/* Leg Configurator */}
      <div className="space-y-1.5">
        <label className="block text-[10px] uppercase text-muted">
          Multi-Leg Configuration
        </label>
        {legs.map((leg, i) => {
          const found = legIsResolvable(leg, chain);
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg border p-2 transition-all ${
                found
                  ? "border-border-subtle bg-surface-elevated/70"
                  : "border-rose-500/40 bg-rose-500/10"
              }`}
            >
              <span
                className={`badge text-[10px] ${
                  leg.side === "long"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-rose-500/20 bg-rose-500/10 text-rose-400"
                }`}
              >
                {leg.side.toUpperCase()}
              </span>
              <span className="text-[11px] font-semibold text-text uppercase">
                {leg.instrument_type}
              </span>
              {leg.instrument_type !== "equity" && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted">@</span>
                  <input
                    type="number"
                    step={2.5}
                    className={`input w-20 px-2 py-1 text-xs ${
                      !found ? "border-rose-500 focus:ring-rose-500" : ""
                    }`}
                    value={leg.strike ?? ""}
                    onChange={(e) =>
                      updateLeg(i, { strike: Number(e.target.value) })
                    }
                  />
                </div>
              )}
              <span className="ml-auto text-[11px] text-muted">
                ×{leg.quantity * contracts}
              </span>
            </div>
          );
        })}
      </div>

      {missingLegs.length > 0 && (
        <p className="rounded-md border border-rose-500/20 bg-rose-500/10 p-2 text-[11px] text-rose-400">
          {missingLegs.length} leg strike(s) unlisted in 0DTE chain. Adjust
          strike prices.
        </p>
      )}

      {!funds.affordable && funds.error && (
        <p className="rounded-md border border-rose-500/20 bg-rose-500/10 p-2 text-[11px] text-rose-400">
          {funds.error}
        </p>
      )}

      {/* Analytical Payoff Matrix */}
      <div className="rounded-xl border border-border-subtle bg-surface-elevated/60 p-3 space-y-1.5 font-mono text-[11px]">
        <div className="flex justify-between">
          <span className="text-muted">
            Net {analysis.netDebit >= 0 ? "Debit" : "Credit"}
          </span>
          <span className="font-bold text-text">
            ${Math.abs(analysis.netDebit).toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Max Profit</span>
          <span className="font-bold text-emerald-400">
            ${analysis.maxProfit.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Max Loss</span>
          <span className="font-bold text-rose-400">
            ${analysis.maxLoss.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between border-t border-border-subtle pt-1 text-[10px] text-muted">
          <span>Margin Reserve: ${funds.reservation.toFixed(2)}</span>
          <span>
            Cash Delta: {funds.upfront >= 0 ? "+" : "-"}$
            {Math.abs(funds.upfront).toFixed(2)}
          </span>
        </div>
        {cleanBreakevens.length > 0 && (
          <div className="flex justify-between text-text-secondary">
            <span className="text-muted">Breakeven</span>
            <span>
              {cleanBreakevens.map((b) => `$${b.toFixed(2)}`).join(" | ")}
            </span>
          </div>
        )}
        <div className="flex justify-between text-text-secondary">
          <span className="text-muted">Net Delta (Δ)</span>
          <span
            className={
              analysis.greeks.delta >= 0 ? "text-emerald-400" : "text-rose-400"
            }
          >
            {analysis.greeks.delta >= 0 ? "+" : ""}
            {analysis.greeks.delta.toFixed(2)}
          </span>
        </div>
      </div>

      <button
        type="button"
        className={`w-full py-2.5 ${config.category === "credit" ? "btn-sell" : "btn-buy"}`}
        disabled={disabled || busy || !isValid || !funds.affordable}
        onClick={handleSubmit}
      >
        {busy ? "Executing Strategy..." : `Execute ${config.name}`}
      </button>
    </div>
  );
}
