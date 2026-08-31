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

  return (
    <div className="flex h-80 flex-col justify-between font-mono text-xs">
      {/* Scrollable Form Body with Fixed Height */}
      <div className="space-y-2 overflow-y-auto pr-1">
        {/* Archetype & Contracts Inline Controls */}
        <div className="grid grid-cols-[1fr_75px] gap-2">
          <div>
            <label className="mb-0.5 block text-[9px] uppercase text-muted">
              Strategy
            </label>
            <select
              className="input w-full py-1 text-[11px] font-sans"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as StrategyType)}
            >
              {STRATEGY_CONFIGS.map((c) => (
                <option
                  key={c.type}
                  value={c.type}
                  className="bg-surface text-text"
                >
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[9px] uppercase text-muted">
              Contracts
            </label>
            <input
              type="number"
              min={1}
              className="input py-1 text-[11px]"
              value={contracts}
              onChange={(e) =>
                setContracts(Math.max(1, Number(e.target.value)))
              }
            />
          </div>
        </div>

        {/* Scroll-contained Multi-Leg List */}
        <div className="max-h-24 space-y-1 overflow-y-auto pr-0.5">
          {legs.map((leg, i) => {
            const found = legIsResolvable(leg, chain);
            return (
              <div
                key={i}
                className={`flex items-center justify-between rounded-md border px-2 py-1 ${
                  found
                    ? "border-border-subtle bg-surface-elevated/60"
                    : "border-rose-500/40 bg-rose-500/10"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`badge px-1 py-0 text-[8px] ${
                      leg.side === "long"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                        : "border-rose-500/20 bg-rose-500/10 text-rose-400"
                    }`}
                  >
                    {leg.side.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-semibold uppercase text-text">
                    {leg.instrument_type}
                  </span>
                </div>

                {leg.instrument_type !== "equity" && (
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-muted">@</span>
                    <input
                      type="number"
                      step={2.5}
                      className={`input w-16 px-1.5 py-0.5 text-[10px] ${
                        !found ? "border-rose-500" : ""
                      }`}
                      value={leg.strike ?? ""}
                      onChange={(e) =>
                        updateLeg(i, { strike: Number(e.target.value) })
                      }
                    />
                  </div>
                )}
                <span className="text-[9px] text-muted">
                  ×{leg.quantity * contracts}
                </span>
              </div>
            );
          })}
        </div>

        {/* Fixed 2x2 Risk & Payoff Matrix */}
        <div className="rounded-lg border border-border-subtle bg-surface-elevated/70 p-2 text-[10px]">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
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
            <div className="flex justify-between">
              <span className="text-muted">Net Delta</span>
              <span
                className={
                  analysis.greeks.delta >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }
              >
                {analysis.greeks.delta >= 0 ? "+" : ""}
                {analysis.greeks.delta.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        {missingLegs.length > 0 && (
          <p className="rounded border border-rose-500/20 bg-rose-500/10 p-1 text-[9px] text-rose-400">
            Invalid strikes selected.
          </p>
        )}
        {!funds.affordable && funds.error && (
          <p className="rounded border border-rose-500/20 bg-rose-500/10 p-1 text-[9px] text-rose-400">
            {funds.error}
          </p>
        )}
      </div>

      {/* Pinned CTA Button */}
      <div className="border-t border-border-subtle pt-2">
        <button
          type="button"
          className={`w-full py-2.5 text-xs font-bold uppercase tracking-wider ${
            config.category === "credit" ? "btn-sell" : "btn-buy"
          }`}
          disabled={disabled || busy || !isValid || !funds.affordable}
          onClick={handleSubmit}
        >
          {busy ? "Executing..." : `Execute ${config.name}`}
        </button>
      </div>
    </div>
  );
}
