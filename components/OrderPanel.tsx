"use client";

import { useState } from "react";
import type {
  Account,
  OrderType,
  PendingOrder,
  Position,
  Side,
} from "@/lib/trading/types";

const ORDER_TYPES: OrderType[] = ["market", "limit", "stop"];

export default function OrderPanel({
  account,
  position,
  pendingOrder,
  currentPrice,
  buyingPower,
  maxQuantity,
  orderError,
  onPlaceOrder,
  onCancelOrder,
  onClosePosition,
  onUpdatePositionRisk,
}: {
  account: Account;
  position: Position | null;
  pendingOrder: PendingOrder | null;
  currentPrice: number;
  buyingPower: number;
  maxQuantity: number;
  orderError: string | null;
  onPlaceOrder: (
    side: Side,
    quantity: number,
    orderType: OrderType,
    triggerPrice?: number,
    stopLoss?: number,
    takeProfit?: number,
  ) => Promise<void>;
  onCancelOrder: () => Promise<void>;
  onClosePosition: () => Promise<void>;
  onUpdatePositionRisk: (params: {
    stopLoss?: number | null;
    takeProfit?: number | null;
  }) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(10);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [triggerPrice, setTriggerPrice] = useState<number>(
    Math.round(currentPrice),
  );
  const [stopLoss, setStopLoss] = useState<number | "">("");
  const [takeProfit, setTakeProfit] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const disabled = account.status !== "active" || busy;

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

  /* ── Open position view ── */
  if (position) {
    const dir = position.side === "long" ? 1 : -1;
    const unrealized =
      (currentPrice - position.entry_price) * dir * position.quantity;

    return (
      <div className="card space-y-3 p-4">
        <h3 className="text-sm font-medium">Position</h3>

        <div className="space-y-1 text-sm">
          <p>
            {position.side === "long" ? "Long" : "Short"} {position.quantity} @{" "}
            {position.entry_price.toFixed(2)}
          </p>
          <p>
            Unrealized:{" "}
            <span className={unrealized >= 0 ? "text-success" : "text-danger"}>
              {unrealized.toFixed(2)}
            </span>
          </p>
          {position.stop_loss_price != null && (
            <p className="text-muted">
              SL: {position.stop_loss_price.toFixed(2)}
            </p>
          )}
          {position.take_profit_price != null && (
            <p className="text-muted">
              TP: {position.take_profit_price.toFixed(2)}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Stop Loss</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              className="input"
              placeholder={
                position.stop_loss_price != null
                  ? position.stop_loss_price.toFixed(2)
                  : "None"
              }
              value={stopLoss}
              onChange={(e) =>
                setStopLoss(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Take Profit</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              className="input"
              placeholder={
                position.take_profit_price != null
                  ? position.take_profit_price.toFixed(2)
                  : "None"
              }
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

        <button
          className="btn-danger w-full"
          disabled={busy}
          onClick={handleClose}
        >
          Close position
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
        {(pendingOrder.stop_loss_price != null ||
          pendingOrder.take_profit_price != null) && (
          <div className="text-xs text-muted">
            {pendingOrder.stop_loss_price != null && (
              <p>SL: {pendingOrder.stop_loss_price.toFixed(2)}</p>
            )}
            {pendingOrder.take_profit_price != null && (
              <p>TP: {pendingOrder.take_profit_price.toFixed(2)}</p>
            )}
          </div>
        )}
        <p className="text-xs text-muted">
          Waiting for price to trigger — current: {currentPrice.toFixed(2)}
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
          <label className="text-xs text-muted">Quantity</label>
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
          <p className="mt-1 text-xs text-muted">
            Current: {currentPrice.toFixed(2)}
          </p>
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
              setStopLoss(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Take Profit</label>
          <input
            type="number"
            min={0.01}
            step={0.01}
            className="input"
            placeholder="Optional"
            value={takeProfit}
            onChange={(e) =>
              setTakeProfit(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>
      </div>

      <p className="text-xs text-muted">
        Buying power: {buyingPower.toFixed(0)}
      </p>

      {orderError && <p className="text-xs text-danger">{orderError}</p>}

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

      {account.status !== "active" && (
        <p className="text-xs text-muted">
          Trading is disabled — this account has
          {account.status === "passed" ? "passed" : "failed"} evaluation.
        </p>
      )}
    </div>
  );
}
