"use client";

import { useState, useEffect, useMemo } from "react";
import type { OptionsChain } from "@/lib/market/options";
import {
  STRATEGY_CONFIGS,
  analyzeStrategy,
  type StrategyType,
  type StrategyLegInput,
} from "@/lib/market/strategies";
// MG-18
import { quoteFunds, type MarginLeg } from "@/lib/trading/margin";

function StrategyBuilder({
  chain,
  onPlaceStrategy,
  disabled,
  // MG-17
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
  ); //SB-1
  const analysis = useMemo(
    () => analyzeStrategy(scaledLegs, chain),
    [scaledLegs, chain],
  );

  //MG-19

  // Price legs with the SAME convention the engine uses (long→ask, short→bid,
  // type-aware) so displayed funds always match enforcement.
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
    <div className="space-y-3">
      <select
        className="input w-full"
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value as StrategyType)}
      >
        {STRATEGY_CONFIGS.map((c) => (
          <option key={c.type} value={c.type}>
            {c.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted">{config.description}</p>
      <div>
        <label className="mb-1 block text-xs text-muted">Contracts</label>
        <input
          type="number"
          min={1}
          className="input"
          value={contracts}
          onChange={(e) => setContracts(Math.max(1, Number(e.target.value)))}
        />
      </div>
      <div className="space-y-2">
        {legs.map((leg, i) => {
          const found = legIsResolvable(leg, chain);
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg border p-2 ${
                found
                  ? "border-white/5 bg-white/2"
                  : "border-danger/30 bg-danger/5"
              }`}
            >
              <span className="w-16 text-xs font-medium capitalize">
                {leg.side}
              </span>
              <span className="w-12 text-xs text-muted">
                {leg.instrument_type}
              </span>
              {leg.instrument_type !== "equity" && (
                <input
                  type="number"
                  step={2.5}
                  className={`input w-24 text-xs ${!found ? "border-danger" : ""}`}
                  value={leg.strike ?? ""}
                  onChange={(e) =>
                    updateLeg(i, { strike: Number(e.target.value) })
                  }
                />
              )}
              <span className="ml-auto text-xs text-muted">
                x{leg.quantity}
              </span>
            </div>
          );
        })}
      </div>
      {missingLegs.length > 0 && (
        <p className="text-xs text-danger">
          {missingLegs.length} leg(s) not found in chain. Adjust strikes.
        </p>
      )}
      {/* MG-20 */}
      {!funds.affordable && funds.error && (
        <p className="text-xs text-danger">{funds.error}</p>
      )}
      .
      <div className="rounded-lg border border-white/5 bg-white/2 p-3 text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-muted">
            Net {analysis.netDebit >= 0 ? "Debit" : "Credit"}
          </span>
          <span>${Math.abs(analysis.netDebit).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Max Profit</span>
          <span className="text-success">${analysis.maxProfit.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Max Loss</span>
          <span className="text-danger">${analysis.maxLoss.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          {/* MG-20 */}
          <span className="text-muted">
            Reserved → ${funds.reservation.toFixed(2)}
          </span>
          <span className="text-muted">
            Upfront → {funds.upfront >= 0 ? "+" : "-"}$
            {Math.abs(funds.upfront).toFixed(2)}
          </span>
        </div>
        {cleanBreakevens.length > 0 && (
          <div className="flex justify-between">
            <span className="text-muted">Breakeven</span>
            <span>{cleanBreakevens.map((b) => b.toFixed(2)).join(", ")}</span>
          </div>
        )}
        <div className="border-t border-white/5 pt-1 flex justify-between">
          <span className="text-muted">Δ</span>
          <span>{analysis.greeks.delta.toFixed(2)}</span>
        </div>
      </div>
      <button
        className={
          config.category === "credit" ? "btn-sell w-full" : "btn-buy w-full"
        }
        // MG-20
        disabled={disabled || busy || !isValid || !funds.affordable}
        onClick={handleSubmit}
      >
        {busy ? "Executing..." : `Place ${config.name}`}
      </button>
    </div>
  );
}

export default StrategyBuilder;
