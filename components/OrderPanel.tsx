"use client";

import { useState } from "react";
import type {
  Account,
  OrderType,
  PendingOrder,
  Position,
  Side,
} from "@/lib/trading/types";
import { type OptionsChain } from "@/lib/market/options";
import {
  type StrategyType,
  type StrategyLegInput,
} from "@/lib/market/strategies";
import StrategyBuilder from "./StrategyBuilder";

const ORDER_TYPES: OrderType[] = ["market", "limit", "stop"];
type InstrumentTab = "equity" | "options" | "strategies";

export default function OrderPanel({
  account,
  positions: _positions,
  pendingOrder: _pendingOrder,
  currentPrice,
  buyingPower,
  availableCash,
  leverage,
  maxQuantity,
  orderError,
  optionsChain,
  onPlaceOrder,
  onPlaceOptionOrder,
  onPlaceStrategy,
  onCancelOrder: _onCancelOrder,
  onClosePosition: _onClosePosition,
  onUpdatePositionRisk: _onUpdatePositionRisk,
}: {
  account: Account;
  positions: Position[];
  pendingOrder: PendingOrder | null;
  currentPrice: number;
  buyingPower: number;
  availableCash: number;
  leverage: number;
  maxQuantity: number;
  orderError: string | null;
  optionsChain: OptionsChain | null;
  onPlaceOrder: (
    side: Side,
    quantity: number,
    orderType: OrderType,
    triggerPrice?: number,
    stopLoss?: number,
    takeProfit?: number,
  ) => Promise<void>;
  onPlaceOptionOrder: (
    type: "call" | "put",
    strike: number,
    quantity: number,
  ) => Promise<void>;
  onPlaceStrategy: (
    type: StrategyType,
    legs: StrategyLegInput[],
  ) => Promise<void>;
  onCancelOrder: () => Promise<void>;
  onClosePosition: () => Promise<void>;
  onUpdatePositionRisk: (params: {
    stopLoss?: number | null;
    takeProfit?: number | null;
  }) => Promise<void>;
}) {
  const [tab, setTab] = useState<InstrumentTab>("equity");
  const [optionSubTab, setOptionSubTab] = useState<"call" | "put">("call");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [triggerPrice, setTriggerPrice] = useState<number>(
    Math.round(currentPrice),
  );
  const [stopLoss, setStopLoss] = useState<number | "">("");
  const [takeProfit, setTakeProfit] = useState<number | "">("");
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareQty, setShareQty] = useState(10);
  const [contractQty, setContractQty] = useState(1);
  const disabled = account.status !== "active" || busy;

  async function handlePlace(side: Side) {
    setBusy(true);
    await onPlaceOrder(
      side,
      shareQty,
      orderType,
      orderType === "market" ? undefined : triggerPrice,
      stopLoss === "" ? undefined : stopLoss,
      takeProfit === "" ? undefined : takeProfit,
    );
    setBusy(false);
  }

  async function handleOptionPlace(type: "call" | "put") {
    if (!selectedStrike) return;
    setBusy(true);
    await onPlaceOptionOrder(type, selectedStrike, contractQty);
    setBusy(false);
  }

  return (
    <div className="card flex h-97.5 flex-col justify-between p-3.5 font-mono text-xs">
      <div>
        {/* Top Header */}
        <div className="mb-2 flex items-center justify-between border-b border-border-subtle pb-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text">
            Order Desk
          </h3>
          <span className="text-[10px] text-muted uppercase">
            {leverage}x Leverage
          </span>
        </div>

        {/* Primary Tabs */}
        <div className="mb-2.5 flex rounded-lg border border-border-subtle bg-surface-elevated/80 p-0.5 font-sans">
          {(["equity", "options", "strategies"] as InstrumentTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`flex-1 rounded-md py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
                t === tab
                  ? "bg-surface text-text border border-border-subtle shadow-sm"
                  : "text-muted hover:text-text"
              }`}
              onClick={() => {
                setTab(t);
                setSelectedStrike(null);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main Tab Views with Pinned Bounding Heights */}
      {tab === "equity" ? (
        <div className="flex h-80 flex-col justify-between">
          <div className="space-y-2">
            {/* Order Type Selector */}
            <div className="grid grid-cols-3 gap-1">
              {ORDER_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`btn-secondary py-1 text-[10px] capitalize ${
                    type === orderType
                      ? "border-accent text-accent bg-accent/10"
                      : "text-text-secondary"
                  }`}
                  onClick={() => setOrderType(type)}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Quantity and Trigger Price Row */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-0.5 flex items-center justify-between">
                  <label className="text-[9px] uppercase text-muted">
                    Quantity
                  </label>
                  <button
                    type="button"
                    className="text-[9px] text-accent hover:underline"
                    onClick={() => setShareQty(Math.max(1, maxQuantity))}
                  >
                    Max: {maxQuantity}
                  </button>
                </div>
                <input
                  type="number"
                  min={1}
                  className="input py-1 text-xs"
                  value={shareQty}
                  onChange={(e) =>
                    setShareQty(Math.max(1, Number(e.target.value)))
                  }
                />
              </div>

              {/* Reserved Trigger Price space keeps height uniform */}
              <div>
                <label className="mb-0.5 block text-[9px] uppercase text-muted">
                  {orderType === "market"
                    ? "Order Type"
                    : orderType === "limit"
                      ? "Limit Price"
                      : "Stop Price"}
                </label>
                {orderType === "market" ? (
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 py-1 px-2 text-center text-xs text-muted">
                    Market Fill
                  </div>
                ) : (
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    className="input py-1 text-xs"
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(Number(e.target.value))}
                  />
                )}
              </div>
            </div>

            {/* Risk Inputs */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-[9px] uppercase text-muted">
                  Stop Loss
                </label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  className="input py-1 text-xs"
                  placeholder="Optional"
                  value={stopLoss}
                  onChange={(e) =>
                    setStopLoss(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[9px] uppercase text-muted">
                  Take Profit
                </label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  className="input py-1 text-xs"
                  placeholder="Optional"
                  value={takeProfit}
                  onChange={(e) =>
                    setTakeProfit(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted border-t border-border-subtle pt-1.5">
              <span>Buying Power</span>
              <span className="font-semibold text-text">
                ${buyingPower.toFixed(2)}
              </span>
            </div>

            {orderError && (
              <div className="rounded border border-rose-500/20 bg-rose-500/10 p-1 text-[10px] text-rose-400">
                {orderError}
              </div>
            )}
          </div>

          {/* Pinned Equity Actions */}
          <div className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-2">
            <button
              type="button"
              className="btn-buy py-2.5 text-xs font-bold"
              disabled={disabled}
              onClick={() => handlePlace("long")}
            >
              Buy / Long
            </button>
            <button
              type="button"
              className="btn-sell py-2.5 text-xs font-bold"
              disabled={disabled}
              onClick={() => handlePlace("short")}
            >
              Sell / Short
            </button>
          </div>
        </div>
      ) : tab === "options" ? (
        <div className="flex h-80 flex-col justify-between">
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_75px] gap-2">
              <div className="grid grid-cols-2 gap-1 font-sans">
                {(["call", "put"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`btn-secondary py-1 text-xs capitalize ${
                      t === optionSubTab
                        ? t === "call"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                          : "border-rose-500/40 bg-rose-500/10 text-rose-400"
                        : "text-muted"
                    }`}
                    onClick={() => setOptionSubTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div>
                <input
                  type="number"
                  min={1}
                  className="input py-1 text-xs"
                  placeholder="Qty"
                  value={contractQty}
                  onChange={(e) =>
                    setContractQty(Math.max(1, Number(e.target.value)))
                  }
                />
              </div>
            </div>

            {!optionsChain ? (
              <div className="py-8 text-center text-xs text-muted">
                Loading options chain...
              </div>
            ) : (
              <div className="max-h-35 overflow-y-auto rounded-lg border border-border-subtle bg-surface-elevated/40">
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-surface border-b border-border-subtle text-[9px] uppercase text-muted">
                    <tr>
                      <th className="px-1.5 py-1 font-normal">Strike</th>
                      <th className="px-1.5 py-1 font-normal">Bid</th>
                      <th className="px-1.5 py-1 font-normal">Ask</th>
                      <th className="px-1.5 py-1 font-normal">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {(optionSubTab === "call"
                      ? optionsChain.calls
                      : optionsChain.puts
                    ).map((leg) => (
                      <tr
                        key={leg.strike}
                        className={`cursor-pointer transition-colors hover:bg-white/3 ${
                          selectedStrike === leg.strike
                            ? "bg-accent/15 font-semibold text-text"
                            : "text-text-secondary"
                        }`}
                        onClick={() => setSelectedStrike(leg.strike)}
                      >
                        <td className="px-1.5 py-1 text-text">
                          ${leg.strike.toFixed(2)}
                        </td>
                        <td className="px-1.5 py-1 text-muted">
                          ${leg.bid.toFixed(2)}
                        </td>
                        <td className="px-1.5 py-1 text-muted">
                          ${leg.ask.toFixed(2)}
                        </td>
                        <td className="px-1.5 py-1">{leg.delta.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-muted">
              <span>Cash Available:</span>
              <span className="font-semibold text-text">
                ${availableCash.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Pinned Option CTA */}
          <div className="border-t border-border-subtle pt-2">
            <button
              type="button"
              className={`w-full py-2.5 text-xs font-bold uppercase tracking-wider ${
                optionSubTab === "call" ? "btn-buy" : "btn-sell"
              }`}
              disabled={disabled || !selectedStrike}
              onClick={() => handleOptionPlace(optionSubTab)}
            >
              {selectedStrike
                ? `Buy ${optionSubTab.toUpperCase()} @ $${selectedStrike.toFixed(2)}`
                : "Select a Strike"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          {!optionsChain ? (
            <div className="py-8 text-center text-xs text-muted">
              Loading options chain...
            </div>
          ) : (
            <StrategyBuilder
              chain={optionsChain}
              onPlaceStrategy={onPlaceStrategy}
              disabled={disabled}
              availableCash={availableCash}
              leverage={leverage}
            />
          )}
        </div>
      )}
    </div>
  );
}
