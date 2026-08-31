"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "@/lib/trading/useAccount";
import CandlestickChart from "@/components/CandlestickChart";
import RuleStatusBar from "@/components/RuleStatusBar";
import OrderPanel from "@/components/OrderPanel";
import BottomDock from "@/components/BottomDock";
import { createCheckoutSession } from "@/app/actions/payments";
import { useEffect, useMemo } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { EVALUATION_FEE_CENTS, formatUsd } from "@/lib/constants";

export default function TradeClient({ accountId }: { accountId: string }) {
  const {
    account,
    positions,
    pendingOrder,
    trades,
    loading,
    error,
    orderError,
    closedBars,
    formingBar,
    currentPrice,
    equity,
    peakEquity,
    buyingPower,
    maxQuantity,
    isReplayDone,
    fundedAccountId,
    placeOrder,
    cancelPendingOrder,
    closePosition,
    updatePositionRisk,
    needsPayment,
    optionsChain,
    placeOptionOrder,
    portfolioGreeks,
    placeStrategy,
    availableCash,
  } = useAccount(accountId);

  const searchParams = useSearchParams();
  const paymentSuccess = searchParams.get("payment") === "success";
  const paymentCanceled = searchParams.get("payment") === "canceled";

  const supabase = useMemo(() => getSupabaseClient(), []);
  useEffect(() => {
    if (!paymentSuccess || !account) return;
    let cancelled = false;
    const startedAt = Date.now();
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("accounts")
        .select("payment_status")
        .eq("id", accountId)
        .single();
      if (cancelled) return;
      if (data?.payment_status === "paid") {
        window.location.replace(window.location.pathname);
      } else if (Date.now() - startedAt > 30000) {
        clearInterval(poll);
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [paymentSuccess, account, accountId, supabase]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="flex items-center gap-3 font-mono text-xs text-text-secondary">
          <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
          Initializing simulation feed...
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="mx-auto max-w-lg p-12">
        <div className="card border-danger/30 bg-danger/10 p-6 text-center text-xs text-danger">
          {error ?? "Account not found."}
        </div>
      </div>
    );
  }

  if (needsPayment) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="card space-y-6 p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Evaluation Passed
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Activate Funded Account
          </h1>
          <p className="text-xs leading-relaxed text-text-secondary">
            Your evaluation is complete. Complete the one-time activation fee to
            unlock your funded account desk.
          </p>
          <div className="text-4xl font-bold font-mono text-text">
            {formatUsd(EVALUATION_FEE_CENTS)}
          </div>
          <form
            action={() => createCheckoutSession(accountId)}
            className="space-y-3"
          >
            <button
              type="submit"
              className="btn-buy w-full py-3"
              disabled={paymentSuccess}
            >
              {paymentSuccess ? "Activating Desk..." : "Pay & Activate Desk"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const dailyPnL = equity - account.day_start_equity;
  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const hasOptionExposure =
    Math.abs(portfolioGreeks.delta) > 0 || Math.abs(portfolioGreeks.theta) > 0;

  return (
    <div className="flex-1 w-full max-w-[1720px] mx-auto p-3 md:p-4 space-y-2.5">
      {/* ── Top Metric Header with Inline Greeks ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface/90 px-4 py-2 backdrop-blur-md font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-text">{account.symbol}</span>
          <span className="badge border-accent/30 bg-accent/10 text-accent text-[10px]">
            {account.epoch ?? "Standard"}
          </span>
          <span className="badge border-border bg-surface-elevated text-text-secondary capitalize text-[10px]">
            {account.phase}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <div>
            <span className="text-muted mr-1">Mark:</span>
            <span className="font-bold text-text">
              ${currentPrice.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-muted mr-1">Equity:</span>
            <span className="font-bold text-text">${equity.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-muted mr-1">Available:</span>
            <span className="text-text-secondary">
              ${availableCash.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-muted mr-1">Daily:</span>
            <span
              className={`font-bold ${dailyPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}
            >
              {dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-muted mr-1">Total P&amp;L:</span>
            <span
              className={`font-bold ${totalPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}
            >
              {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
            </span>
          </div>

          {/* Inline Live Greeks Strip */}
          {hasOptionExposure && (
            <div className="flex items-center gap-2 border-l border-border-subtle pl-3 text-[10px] text-muted">
              <span>
                Δ{" "}
                <strong
                  className={
                    portfolioGreeks.delta >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {portfolioGreeks.delta >= 0 ? "+" : ""}
                  {portfolioGreeks.delta.toFixed(1)}
                </strong>
              </span>
              <span>
                Θ{" "}
                <strong
                  className={
                    portfolioGreeks.theta >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {portfolioGreeks.theta >= 0 ? "+" : ""}
                  {portfolioGreeks.theta.toFixed(1)}/d
                </strong>
              </span>
              <span>
                ν{" "}
                <strong className="text-text">
                  {portfolioGreeks.vega.toFixed(1)}
                </strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Horizontal Risk Ribbon ── */}
      <RuleStatusBar
        account={account}
        equity={equity}
        peakEquity={peakEquity}
      />

      {/* ── Main Workstation ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_390px] xl:grid-cols-[1fr_420px] items-start">
        {/* Left Column */}
        <div className="space-y-3">
          <CandlestickChart closedBars={closedBars} formingBar={formingBar} />
          <BottomDock
            positions={positions}
            pendingOrder={pendingOrder}
            trades={trades}
            currentPrice={currentPrice}
            optionsChain={optionsChain}
            onClosePosition={closePosition}
            onCancelPendingOrder={cancelPendingOrder}
          />
        </div>

        {/* Right Column: Order Desk Only */}
        <div>
          <OrderPanel
            account={account}
            positions={positions}
            pendingOrder={pendingOrder}
            currentPrice={currentPrice}
            buyingPower={buyingPower}
            availableCash={availableCash}
            leverage={account.leverage}
            maxQuantity={maxQuantity}
            orderError={orderError}
            optionsChain={optionsChain}
            onPlaceOrder={placeOrder}
            onPlaceOptionOrder={placeOptionOrder}
            onPlaceStrategy={placeStrategy}
            onCancelOrder={cancelPendingOrder}
            onClosePosition={closePosition}
            onUpdatePositionRisk={updatePositionRisk}
          />
        </div>
      </div>
    </div>
  );
}
