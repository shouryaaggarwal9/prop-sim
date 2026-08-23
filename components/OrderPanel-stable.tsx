"use client";

import { useState } from "react";
import type {
  Account,
  OrderType,
  PendingOrder,
  Position,
  Side,
} from "@/lib/trading/types";
import type { OptionsChain } from "@/lib/market/options";

const ORDER_TYPES: OrderType[] = ["market", "limit", "stop"];

type InstrumentTab = "equity" | "call" | "put";

export default function OrderPanel({
  account,
  positions,
  pendingOrder,
  currentPrice,
  buyingPower,
  maxQuantity,
  orderError,
  optionsChain,
  onPlaceOrder,
  onPlaceOptionOrder,
  onCancelOrder,
  onClosePosition,
  onUpdatePositionRisk,
}: {
  account: Account;
  positions: Position[];
  pendingOrder: PendingOrder | null;
  currentPrice: number;
  buyingPower: number;
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
  onCancelOrder: () => Promise<void>;
  onClosePosition: () => Promise<void>;
  onUpdatePositionRisk: (params: {
    stopLoss?: number | null;
    takeProfit?: number | null;
  }) => Promise<void>;
}) {
  const [tab, setTab] = useState<InstrumentTab>("equity");
  const [quantity, setQuantity] = useState(10);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [triggerPrice, setTriggerPrice] = useState<number>(
    Math.round(currentPrice),
  );
  const [stopLoss, setStopLoss] = useState<number | "">("");
  const [takeProfit, setTakeProfit] = useState<number | "">("");
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const disabled = account.status !== "active" || busy;

  const equityPos = positions.find((p) => p.instrument_type === "equity");
  const optionPositions = positions.filter(
    (p) => p.instrument_type === "call" || p.instrument_type === "put",
  );

  async function handlePlace(side: Side) {
    setBusy(true);
    await onPlaceOrder(
      side,
      quantity,
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
    await onPlaceOptionOrder(type, selectedStrike, quantity);
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

  /* ── Open positions view ── */
  if (positions.length > 0) {
    return (
      <div className="card space-y-3 p-4">
        <h3 className="text-sm font-medium">Positions</h3>

        {equityPos && (
          <div className="space-y-1 text-sm">
            <p>
              {equityPos.side === "long" ? "Long" : "Short"}{" "}
              {equityPos.quantity} SPY @ {equityPos.entry_price.toFixed(2)}
            </p>
            <p>
              Unrealized:{" "}
              <span
                className={
                  (currentPrice - equityPos.entry_price) *
                    (equityPos.side === "long" ? 1 : -1) *
                    equityPos.quantity >=
                  0
                    ? "text-success"
                    : "text-danger"
                }
              >
                {(
                  (currentPrice - equityPos.entry_price) *
                  (equityPos.side === "long" ? 1 : -1) *
                  equityPos.quantity
                ).toFixed(2)}
              </span>
            </p>
            {equityPos.stop_loss_price != null && (
              <p className="text-muted">
                SL: {equityPos.stop_loss_price.toFixed(2)}
              </p>
            )}
            {equityPos.take_profit_price != null && (
              <p className="text-muted">
                TP: {equityPos.take_profit_price.toFixed(2)}
              </p>
            )}
          </div>
        )}

        {optionPositions.map((pos) => {
          const leg = optionsChain
            ? optionsChain.calls.find(
                (l) => Math.abs(l.strike - (pos.strike ?? 0)) < 0.01,
              ) ||
              optionsChain.puts.find(
                (l) => Math.abs(l.strike - (pos.strike ?? 0)) < 0.01,
              )
            : null;
          const mark = leg ? (leg.bid + leg.ask) / 2 : pos.entry_price;
          const unrealized = (mark - pos.entry_price) * pos.quantity * 100;

          return (
            <div key={pos.id} className="space-y-1 text-sm">
              <p className="capitalize">
                {pos.instrument_type} {pos.quantity} @ {pos.strike?.toFixed(2)}{" "}
                ({pos.side})
              </p>
              <p>
                Entry: {pos.entry_price.toFixed(2)} | Mark: {mark.toFixed(2)}
              </p>
              <p>
                Unrealized:{" "}
                <span
                  className={unrealized >= 0 ? "text-success" : "text-danger"}
                >
                  {unrealized.toFixed(2)}
                </span>
              </p>
            </div>
          );
        })}

        {equityPos && (
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Stop Loss</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="input"
                placeholder={equityPos.stop_loss_price?.toFixed(2) ?? "None"}
                value={stopLoss}
                onChange={(e) =>
                  setStopLoss(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">
                Take Profit
              </label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="input"
                placeholder={equityPos.take_profit_price?.toFixed(2) ?? "None"}
                value={takeProfit}
                onChange={(e) =>
                  setTakeProfit(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              />
            </div>
            <button
              className="btn-secondary w-full"
              disabled={disabled}
              onClick={handleUpdateRisk}
            >
              Update risk
            </button>
          </div>
        )}

        <button
          className="btn-danger w-full"
          disabled={busy}
          onClick={handleClose}
        >
          Close all positions
        </button>
      </div>
    );
  }

  /* ── Pending order view ── */
  if (pendingOrder) {
    return (
      <div className="card space-y-3 p-4">
        <h3 className="text-sm font-medium">Pending order</h3>
        <p className="text-sm text-muted capitalize">
          {pendingOrder.order_type} {pendingOrder.side} {pendingOrder.quantity}{" "}
          @ {pendingOrder.trigger_price.toFixed(2)}
        </p>
        <button
          className="btn-secondary w-full"
          disabled={busy}
          onClick={handleCancel}
        >
          Cancel order
        </button>
      </div>
    );
  }

  /* ── Order entry view ── */
  return (
    <div className="card space-y-3 p-4">
      <h3 className="text-sm font-medium">Order</h3>

      <div className="flex gap-1">
        {(["equity", "call", "put"] as InstrumentTab[]).map((t) => (
          <button
            key={t}
            className={
              t === tab
                ? "btn-secondary flex-1 py-1.5! text-xs border-accent"
                : "btn-secondary flex-1 py-1.5! text-xs"
            }
            onClick={() => {
              setTab(t);
              setSelectedStrike(null);
            }}
          >
            {t === "equity" ? "Equity" : t === "call" ? "Call" : "Put"}
          </button>
        ))}
      </div>

      {tab === "equity" ? (
        <>
          <div className="flex gap-1">
            {ORDER_TYPES.map((type) => (
              <button
                key={type}
                className={
                  type === orderType
                    ? "btn-secondary flex-1 py-1.5! text-xs border-accent"
                    : "btn-secondary flex-1 py-1.5! text-xs"
                }
                onClick={() => setOrderType(type)}
              >
                {type[0].toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted">Quantity (shares)</label>
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() => setQuantity(Math.max(1, maxQuantity))}
              >
                Max: {maxQuantity}
              </button>
            </div>
            <input
              type="number"
              min={1}
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            />
          </div>

          {orderType !== "market" && (
            <div>
              <label className="mb-1 block text-xs text-muted">
                {orderType === "limit" ? "Limit price" : "Stop price"}
              </label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="input"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(Number(e.target.value))}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Stop Loss</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="input"
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
              <label className="mb-1 block text-xs text-muted">
                Take Profit
              </label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="input"
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

          <p className="text-xs text-muted">
            Buying power: {buyingPower.toFixed(0)}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-buy"
              disabled={disabled}
              onClick={() => handlePlace("long")}
            >
              Buy
            </button>
            <button
              className="btn-sell"
              disabled={disabled}
              onClick={() => handlePlace("short")}
            >
              Sell
            </button>
          </div>
        </>
      ) : (
        <>
          {!optionsChain ? (
            <p className="text-sm text-muted">Loading options chain…</p>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  Quantity (contracts)
                </label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Number(e.target.value)))
                  }
                />
              </div>

              <div className="max-h-48 overflow-y-auto rounded-lg border border-white/5">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#131316]">
                    <tr className="text-left text-muted">
                      <th className="px-2 py-1 font-normal">Strike</th>
                      <th className="px-2 py-1 font-normal">Bid</th>
                      <th className="px-2 py-1 font-normal">Ask</th>
                      <th className="px-2 py-1 font-normal">Δ</th>
                      <th className="px-2 py-1 font-normal">IV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === "call"
                      ? optionsChain.calls
                      : optionsChain.puts
                    ).map((leg) => (
                      <tr
                        key={leg.strike}
                        className={`cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/5 ${
                          selectedStrike === leg.strike ? "bg-accent/10" : ""
                        }`}
                        onClick={() => setSelectedStrike(leg.strike)}
                      >
                        <td className="px-2 py-1.5">{leg.strike.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-muted">
                          {leg.bid.toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5 text-muted">
                          {leg.ask.toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5">{leg.delta.toFixed(2)}</td>
                        <td className="px-2 py-1.5">
                          {(leg.iv * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedStrike && (
                <p className="text-xs text-muted">
                  Selected: {tab} @ {selectedStrike.toFixed(2)} × {quantity} = $
                  {(() => {
                    const leg = (
                      tab === "call" ? optionsChain.calls : optionsChain.puts
                    ).find((l) => l.strike === selectedStrike);
                    return leg ? (leg.ask * quantity * 100).toFixed(0) : "0";
                  })()}{" "}
                  premium (cash)
                </p>
              )}

              <p className="text-xs text-muted">
                Cash available: ${account.balance.toFixed(0)}
              </p>

              <button
                className={
                  tab === "call" ? "btn-buy w-full" : "btn-sell w-full"
                }
                disabled={disabled || !selectedStrike}
                onClick={() => handleOptionPlace(tab)}
              >
                Buy {tab}
              </button>
            </>
          )}
        </>
      )}

      {orderError && <p className="text-xs text-danger">{orderError}</p>}

      {account.status !== "active" && (
        <p className="text-xs text-muted">
          Trading is disabled — this account has{" "}
          {account.status === "passed" ? "passed" : "failed"} evaluation.
        </p>
      )}
    </div>
  );
}
