"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "@/lib/trading/useAccount";
import CandlestickChart from "@/components/CandlestickChart";
import AccountStats from "@/components/AccountStats";
import RuleStatusBar from "@/components/RuleStatusBar";
import OrderPanel from "@/components/OrderPanel";
import TradeLog from "@/components/TradeLog";
import { createCheckoutSession } from "@/app/actions/payments";
import { useEffect } from "react";
import PortfolioGreeksPanel from "./PortfolioGreeksPanel";

export default function TradeClient({ accountId }: { accountId: string }) {
  // MG-16
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
    reserved,
  } = useAccount(accountId);

  const searchParams = useSearchParams();
  const paymentSuccess = searchParams.get("payment") === "success";
  const paymentCanceled = searchParams.get("payment") === "canceled";

  // useEffect(() => {
  //   if (paymentSuccess) {
  //     const timer = setTimeout(() => {
  //       window.location.href = window.location.pathname; // hard refresh to clear ?payment=success
  //     }, 3000);
  //     return () => clearTimeout(timer);
  //   }
  // }, [paymentSuccess]);

  if (loading) {
    return <div className="p-8 text-sm text-muted">Loading account…</div>;
  }
  if (error || !account) {
    return (
      <div className="p-8 text-sm text-danger">
        {error ?? "Account not found."}
      </div>
    );
  }

  if (needsPayment) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="card space-y-6 p-8">
          <h1 className="text-xl font-semibold">Evaluation passed</h1>
          <p className="text-sm text-muted">
            Your evaluation is complete. Activate your funded account to start
            trading with real risk rules.
          </p>
          <div className="text-3xl font-bold">$100.00</div>
          <p className="text-xs text-muted">One-time evaluation fee</p>

          {paymentSuccess && (
            <p className="text-sm text-success">
              Payment received — refreshing…
            </p>
          )}
          {paymentCanceled && (
            <p className="text-sm text-danger">
              Payment canceled. You can try again.
            </p>
          )}

          <form
            action={() => createCheckoutSession(accountId)}
            className="space-y-3"
          >
            <button
              type="submit"
              className="btn-buy w-full"
              disabled={paymentSuccess}
            >
              {paymentSuccess ? "Activating…" : "Pay & activate account"}
            </button>
            <p className="text-xs text-muted">
              This is a Stripe test-mode checkout. Use card{" "}
              <code className="rounded bg-white/5 px-1">
                4242 4242 4242 4242
              </code>{" "}
              with any future date and CVC.
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {account.status === "passed" && account.phase === "evaluation" && (
        <div className="card mb-6 flex items-center justify-between border-success/30 bg-success/10 p-4">
          <p className="text-sm">
            Evaluation passed —{" "}
            {fundedAccountId
              ? "your funded account is ready."
              : "creating your funded account…"}
          </p>
          {fundedAccountId && (
            <Link href={`/trade/${fundedAccountId}`} className="btn-buy">
              Go to funded account
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <CandlestickChart closedBars={closedBars} formingBar={formingBar} />
          <TradeLog trades={trades} />
        </div>
        <div className="space-y-4">
          <AccountStats
            account={account}
            equity={equity}
            peakEquity={peakEquity}
            currentPrice={currentPrice}
          />
          <RuleStatusBar
            account={account}
            equity={equity}
            peakEquity={peakEquity}
          />
          <OrderPanel
            account={account}
            positions={positions}
            pendingOrder={pendingOrder}
            currentPrice={currentPrice}
            buyingPower={buyingPower}
            maxQuantity={maxQuantity}
            orderError={orderError}
            onPlaceOrder={placeOrder}
            onCancelOrder={cancelPendingOrder}
            onClosePosition={closePosition}
            onUpdatePositionRisk={updatePositionRisk}
            onPlaceOptionOrder={placeOptionOrder}
            optionsChain={optionsChain}
            onPlaceStrategy={placeStrategy}
            // MG-16
            availableCash={availableCash}
            leverage={account.leverage}
          />
          <PortfolioGreeksPanel greeks={portfolioGreeks} />
          {isReplayDone && (
            <p className="text-xs text-muted">
              This account has used all of its simulated price history — trading
              here has ended.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
