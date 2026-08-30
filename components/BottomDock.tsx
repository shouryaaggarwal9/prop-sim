"use client";

import { useState } from "react";
import {
  isOptionType,
  type Position,
  type Trade,
  type PendingOrder,
} from "@/lib/trading/types";
import { type OptionsChain, getLegPrice } from "@/lib/market/options";
import { positionPnl } from "@/lib/trading/engine";

const REASON_BADGES: Record<string, { label: string; style: string }> = {
  manual: {
    label: "Manual",
    style: "border-border bg-surface-hover text-text-secondary",
  },
  sl: {
    label: "Stop Loss",
    style: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  },
  tp: {
    label: "Take Profit",
    style: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  day_end: {
    label: "Day End",
    style: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  finalized: {
    label: "Finalized",
    style: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  },
  liquidation: {
    label: "Liquidation",
    style: "border-rose-500/30 bg-rose-500/20 text-rose-300 font-bold",
  },
};

export default function BottomDock({
  positions,
  pendingOrder,
  trades,
  currentPrice,
  optionsChain,
  onClosePosition,
  onCancelPendingOrder,
}: {
  positions: Position[];
  pendingOrder: PendingOrder | null;
  trades: Trade[];
  currentPrice: number;
  optionsChain: OptionsChain | null;
  onClosePosition: () => Promise<void>;
  onCancelPendingOrder: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"positions" | "trades">(
    "positions",
  );

  return (
    <div className="card overflow-hidden font-mono text-xs">
      {/* Dock Tabs */}
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-elevated/40 px-3 py-1.5">
        <div className="flex items-center gap-1 font-sans">
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
              activeTab === "positions"
                ? "bg-surface text-text border border-border-subtle shadow-sm"
                : "text-muted hover:text-text"
            }`}
            onClick={() => setActiveTab("positions")}
          >
            Inventory ({positions.length + (pendingOrder ? 1 : 0)})
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
              activeTab === "trades"
                ? "bg-surface text-text border border-border-subtle shadow-sm"
                : "text-muted hover:text-text"
            }`}
            onClick={() => setActiveTab("trades")}
          >
            Execution Log ({trades.length})
          </button>
        </div>

        {activeTab === "positions" && positions.length > 0 && (
          <button
            type="button"
            className="btn-sell px-2.5 py-0.5 text-[10px]"
            onClick={onClosePosition}
          >
            Flatten All
          </button>
        )}
      </div>

      {/* Dock Body */}
      <div className="p-3">
        {activeTab === "positions" ? (
          positions.length === 0 && !pendingOrder ? (
            <div className="py-6 text-center text-xs text-muted font-sans">
              No active positions or pending orders in inventory.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Pending Order Row */}
              {pendingOrder && (
                <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="badge border-amber-500/30 bg-amber-500/20 text-amber-300 text-[10px]">
                      QUEUED
                    </span>
                    <span className="font-semibold text-text uppercase">
                      {pendingOrder.order_type} {pendingOrder.side}{" "}
                      {pendingOrder.quantity} SPY @ $
                      {pendingOrder.trigger_price.toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary px-2 py-0.5 text-[10px] text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10"
                    onClick={onCancelPendingOrder}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Positions Table */}
              {positions.length > 0 && (
                <div className="max-h-52 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-surface border-b border-border-subtle text-[10px] uppercase text-muted">
                      <tr>
                        <th className="py-1.5 px-2 font-normal">Side</th>
                        <th className="py-1.5 px-2 font-normal">Type</th>
                        <th className="py-1.5 px-2 font-normal">Qty</th>
                        <th className="py-1.5 px-2 font-normal">Entry</th>
                        <th className="py-1.5 px-2 font-normal">Mark</th>
                        <th className="py-1.5 px-2 font-normal">SL / TP</th>
                        <th className="py-1.5 px-2 text-right font-normal">
                          Unrealized P&amp;L
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {positions.map((p) => {
                        const optionType = isOptionType(p.instrument_type)
                          ? p.instrument_type
                          : null;
                        const leg =
                          optionType && optionsChain
                            ? getLegPrice(
                                optionsChain,
                                optionType,
                                p.strike ?? 0,
                              )
                            : null;
                        const mark =
                          p.instrument_type === "equity"
                            ? currentPrice
                            : leg
                              ? (leg.bid + leg.ask) / 2
                              : p.entry_price;
                        const pnl = positionPnl(p, mark);

                        return (
                          <tr key={p.id} className="hover:bg-white/2">
                            <td className="py-2 px-2">
                              <span
                                className={`badge text-[10px] ${
                                  p.side === "long"
                                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                    : "border-rose-500/20 bg-rose-500/10 text-rose-400"
                                }`}
                              >
                                {p.side.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-text font-semibold uppercase">
                              {p.instrument_type}{" "}
                              {p.strike ? `@${p.strike.toFixed(2)}` : ""}
                            </td>
                            <td className="py-2 px-2 text-text-secondary">
                              {p.quantity}
                            </td>
                            <td className="py-2 px-2 tabular-nums text-text">
                              ${p.entry_price.toFixed(2)}
                            </td>
                            <td className="py-2 px-2 tabular-nums text-text">
                              ${mark.toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-muted">
                              {p.stop_loss_price != null
                                ? `$${p.stop_loss_price.toFixed(2)}`
                                : "—"}{" "}
                              /{" "}
                              {p.take_profit_price != null
                                ? `$${p.take_profit_price.toFixed(2)}`
                                : "—"}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-bold tabular-nums ${
                                pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        ) : trades.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted font-sans">
            No executed trades recorded yet.
          </div>
        ) : (
          <div className="max-h-52 overflow-y-auto overflow-x-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-surface border-b border-border-subtle text-[10px] uppercase text-muted">
                <tr>
                  <th className="py-1.5 px-2 font-normal">Side</th>
                  <th className="py-1.5 px-2 font-normal">Instrument</th>
                  <th className="py-1.5 px-2 font-normal">Qty</th>
                  <th className="py-1.5 px-2 font-normal">Entry</th>
                  <th className="py-1.5 px-2 font-normal">Exit</th>
                  <th className="py-1.5 px-2 font-normal">Reason</th>
                  <th className="py-1.5 px-2 text-right font-normal">
                    P&amp;L
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {trades.map((t) => {
                  const isProfitable = t.pnl >= 0;
                  const reasonMeta = REASON_BADGES[t.close_reason] ?? {
                    label: t.close_reason,
                    style: "border-border text-muted",
                  };
                  return (
                    <tr key={t.id} className="hover:bg-white/2">
                      <td className="py-2 px-2">
                        <span
                          className={`badge text-[10px] ${
                            t.side === "long"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                              : "border-rose-500/20 bg-rose-500/10 text-rose-400"
                          }`}
                        >
                          {t.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-text font-semibold uppercase">
                        {t.instrument_type}{" "}
                        {t.strike ? `@${t.strike.toFixed(2)}` : ""}
                      </td>
                      <td className="py-2 px-2 text-text-secondary">
                        {t.quantity}
                      </td>
                      <td className="py-2 px-2 tabular-nums text-text">
                        ${t.entry_price.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 tabular-nums text-text">
                        ${t.exit_price.toFixed(2)}
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className={`badge text-[10px] ${reasonMeta.style}`}
                        >
                          {reasonMeta.label}
                        </span>
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-bold tabular-nums ${
                          isProfitable ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isProfitable ? "+" : ""}${t.pnl.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
