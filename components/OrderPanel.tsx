"use client";

import { useState } from "react";
import type {
  Account,
  OrderType,
  PendingOrder,
  Position,
  Side,
} from "@/lib/trading/types";
import { type OptionsChain, getLegPrice } from "@/lib/market/options";
import { isOptionType } from "@/lib/trading/types";
import { positionPnl } from "@/lib/trading/engine";
import {
  type StrategyType,
  type StrategyLegInput,
} from "@/lib/market/strategies";
import StrategyBuilder from "./StrategyBuilder";

const ORDER_TYPES: OrderType[] = ["market", "limit", "stop"];
type InstrumentTab = "equity" | "options" | "strategies";

export default function OrderPanel({
  account,
  positions,
  pendingOrder,
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
  onCancelOrder,
  onClosePosition,
  onUpdatePositionRisk,
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

  const equityPos = positions.find((p) => p.instrument_type === "equity");
  const optionPositions = positions.filter(
    (p): p is Position & { instrument_type: "call" | "put" } =>
      p.instrument_type === "call" || p.instrument_type === "put",
  );

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

  async function handleClose() {
    setBusy(true);
    await onClosePosition();
    setBusy(false);
  }

  async function handleCancel() {
    setBusy(true);
    await onCancelOrder();
    setBusy(false);
  }

  async function handleUpdateRisk() {
    setBusy(true);
    await onUpdatePositionRisk({
      stopLoss: stopLoss === "" ? null : stopLoss,
      takeProfit: takeProfit === "" ? null : takeProfit,
    });
    setBusy(false);
  }

  /* ── 1. ACTIVE POSITIONS VIEW ── */
  if (positions.length > 0) {
    return (
      <div className="card space-y-4 p-4 font-mono">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text">
              Active Inventory
            </h3>
            <span className="badge border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]">
              {positions.length} Open
            </span>
          </div>
          <span className="text-[10px] text-muted uppercase">
            Market Exposure
          </span>
        </div>

        {equityPos && (
          <div className="rounded-xl border border-border-subtle bg-surface-elevated/70 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text">
                <span
                  className={`badge mr-2 text-[10px] ${
                    equityPos.side === "long"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border-rose-500/20 bg-rose-500/10 text-rose-400"
                  }`}
                >
                  {equityPos.side.toUpperCase()}
                </span>
                {equityPos.quantity} SPY @ ${equityPos.entry_price.toFixed(2)}
              </span>
              <span
                className={`font-bold tabular-nums ${
                  positionPnl(equityPos, currentPrice) >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {positionPnl(equityPos, currentPrice) >= 0 ? "+" : ""}$
                {positionPnl(equityPos, currentPrice).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-muted border-t border-border-subtle pt-2">
              <span>
                SL:{" "}
                {equityPos.stop_loss_price != null
                  ? `$${equityPos.stop_loss_price.toFixed(2)}`
                  : "None"}
              </span>
              <span>
                TP:{" "}
                {equityPos.take_profit_price != null
                  ? `$${equityPos.take_profit_price.toFixed(2)}`
                  : "None"}
              </span>
            </div>
          </div>
        )}

        {optionPositions.map((pos) => {
          const optionType = isOptionType(pos.instrument_type)
            ? pos.instrument_type
            : null;
          const leg =
            optionType && optionsChain
              ? getLegPrice(optionsChain, optionType, pos.strike ?? 0)
              : null;
          const mark = leg ? (leg.bid + leg.ask) / 2 : pos.entry_price;
          const unrealized = positionPnl(pos, mark);

          return (
            <div
              key={pos.id}
              className="rounded-xl border border-border-subtle bg-surface-elevated/70 p-3 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="badge border-border bg-surface text-text font-semibold uppercase text-[10px] mr-1.5">
                    {pos.instrument_type}
                  </span>
                  <span className="text-text font-medium">
                    {pos.quantity} × ${pos.strike?.toFixed(2)} ({pos.side})
                  </span>
                </div>
                <span
                  className={`font-bold tabular-nums ${
                    unrealized >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {unrealized >= 0 ? "+" : ""}${unrealized.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-muted border-t border-border-subtle pt-1.5">
                <span>Entry: ${pos.entry_price.toFixed(2)}</span>
                <span>Mark: ${mark.toFixed(2)}</span>
              </div>
            </div>
          );
        })}

        {equityPos && (
          <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-elevated/40 p-3 text-xs">
            <div className="text-[10px] uppercase text-muted font-semibold">
              Intraday Risk Parameters
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] text-muted">
                  Stop Loss ($)
                </label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  className="input text-xs"
                  placeholder={
                    equityPos.stop_loss_price?.toFixed(2) ?? "Optional"
                  }
                  value={stopLoss}
                  onChange={(e) =>
                    setStopLoss(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted">
                  Take Profit ($)
                </label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  className="input text-xs"
                  placeholder={
                    equityPos.take_profit_price?.toFixed(2) ?? "Optional"
                  }
                  value={takeProfit}
                  onChange={(e) =>
                    setTakeProfit(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary w-full py-1.5 text-xs"
              disabled={disabled}
              onClick={handleUpdateRisk}
            >
              Update Protection
            </button>
          </div>
        )}

        <button
          type="button"
          className="btn-sell w-full py-2.5 text-xs font-bold"
          disabled={busy}
          onClick={handleClose}
        >
          {busy ? "Flattening..." : "Flatten All Positions"}
        </button>
      </div>
    );
  }

  /* ── 2. PENDING ORDER VIEW ── */
  if (pendingOrder) {
    return (
      <div className="card space-y-4 p-4 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text">
            Queued Order
          </h3>
          <span className="badge border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px]">
            Trigger Pending
          </span>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-elevated/70 p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold capitalize text-text">
              {pendingOrder.order_type} {pendingOrder.side}
            </span>
            <span className="font-bold text-accent">
              {pendingOrder.quantity} SPY @ $
              {pendingOrder.trigger_price.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-muted border-t border-border-subtle pt-2">
            <span>
              SL:{" "}
              {pendingOrder.stop_loss_price != null
                ? `$${pendingOrder.stop_loss_price.toFixed(2)}`
                : "None"}
            </span>
            <span>
              TP:{" "}
              {pendingOrder.take_profit_price != null
                ? `$${pendingOrder.take_profit_price.toFixed(2)}`
                : "None"}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn-secondary w-full py-2.5 text-xs text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10"
          disabled={busy}
          onClick={handleCancel}
        >
          {busy ? "Cancelling..." : "Cancel Queued Order"}
        </button>
      </div>
    );
  }

  /* ── 3. ORDER ENTRY VIEW ── */
  return (
    <div className="card space-y-4 p-4 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-border-subtle pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text font-mono">
          Order Placement Desk
        </h3>
        <span className="text-[10px] text-muted font-mono uppercase">
          Leverage: {leverage}x
        </span>
      </div>

      {/* Primary Tab Navigation */}
      <div className="flex rounded-lg border border-border-subtle bg-surface-elevated/80 p-1 font-sans">
        {(["equity", "options", "strategies"] as InstrumentTab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold uppercase tracking-wider transition-all ${
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

      {tab === "equity" ? (
        <div className="space-y-3">
          {/* Order Type Selector */}
          <div className="grid grid-cols-3 gap-1">
            {ORDER_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`btn-secondary py-1 text-[11px] capitalize ${
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

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[10px] uppercase text-muted">
                Quantity (Shares)
              </label>
              <button
                type="button"
                className="text-[11px] text-accent hover:underline"
                onClick={() => setShareQty(Math.max(1, maxQuantity))}
              >
                Max: {maxQuantity}
              </button>
            </div>
            <input
              type="number"
              min={1}
              className="input text-xs"
              value={shareQty}
              onChange={(e) => setShareQty(Math.max(1, Number(e.target.value)))}
            />
          </div>

          {orderType !== "market" && (
            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted">
                {orderType === "limit"
                  ? "Limit Execution Price"
                  : "Stop Trigger Price"}
              </label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="input text-xs"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(Number(e.target.value))}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted">
                Stop Loss
              </label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="input text-xs"
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
              <label className="mb-1 block text-[10px] uppercase text-muted">
                Take Profit
              </label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="input text-xs"
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

          <div className="flex items-center justify-between text-[11px] text-muted border-t border-border-subtle pt-2">
            <span>Buying Power</span>
            <span className="font-semibold text-text">
              ${buyingPower.toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
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
        <div className="space-y-3">
          {/* Sub-tab: Call / Put */}
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
                Buy {t}
              </button>
            ))}
          </div>

          {!optionsChain ? (
            <div className="py-8 text-center text-xs text-muted">
              Loading 0DTE options chain...
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-muted">
                  Contracts (×100)
                </label>
                <input
                  type="number"
                  min={1}
                  className="input text-xs"
                  value={contractQty}
                  onChange={(e) =>
                    setContractQty(Math.max(1, Number(e.target.value)))
                  }
                />
              </div>

              <div className="max-h-52 overflow-y-auto rounded-lg border border-border-subtle bg-surface-elevated/40">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-surface border-b border-border-subtle text-[10px] uppercase text-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-normal">Strike</th>
                      <th className="px-2 py-1.5 font-normal">Bid</th>
                      <th className="px-2 py-1.5 font-normal">Ask</th>
                      <th className="px-2 py-1.5 font-normal">Δ</th>
                      <th className="px-2 py-1.5 font-normal">IV</th>
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
                        <td className="px-2 py-1.5 text-text">
                          ${leg.strike.toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5 text-muted">
                          ${leg.bid.toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5 text-muted">
                          ${leg.ask.toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5">{leg.delta.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-muted">
                          {(leg.iv * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedStrike && (
                <div className="rounded-lg border border-border-subtle bg-surface-elevated/70 p-2 text-[11px] text-text-secondary space-y-1">
                  <div className="flex justify-between">
                    <span>Target Contract:</span>
                    <span className="font-semibold text-text uppercase">
                      {optionSubTab} @ ${selectedStrike.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Premium Outflow:</span>
                    <span className="font-bold text-accent">
                      $
                      {(() => {
                        const leg = (
                          optionSubTab === "call"
                            ? optionsChain.calls
                            : optionsChain.puts
                        ).find((l) => l.strike === selectedStrike);
                        return leg
                          ? (leg.ask * contractQty * 100).toFixed(2)
                          : "0.00";
                      })()}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>Available Cash:</span>
                <span className="font-semibold text-text">
                  ${availableCash.toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                className={`w-full py-2.5 text-xs font-bold ${
                  optionSubTab === "call" ? "btn-buy" : "btn-sell"
                }`}
                disabled={disabled || !selectedStrike}
                onClick={() => handleOptionPlace(optionSubTab)}
              >
                Place {optionSubTab.toUpperCase()} Order
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
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

      {orderError && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-[11px] text-rose-400">
          {orderError}
        </div>
      )}

      {account.status !== "active" && (
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-2.5 text-[11px] text-muted text-center">
          Trading suspended — Account is {account.status}.
        </div>
      )}
    </div>
  );
}
