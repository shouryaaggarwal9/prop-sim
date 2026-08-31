"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EPOCH_META } from "@/lib/market/epochs";
import type { Account } from "@/lib/trading/types";
import WithdrawalPanel from "@/app/trade/[accountId]/WithdrawalPanel";

const STATUS_BADGE_STYLES: Record<Account["status"], string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  passed: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-400",
};

export default function PortfolioClient({
  initialAccounts,
}: {
  initialAccounts: Account[];
}) {
  const router = useRouter();
  const [accounts] = useState<Account[]>(initialAccounts);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            Account Portfolio
          </h1>
          <p className="text-xs text-muted">
            Monitor and manage your active evaluation desks, funded accounts,
            and simulated payouts.
          </p>
        </div>
        <button
          type="button"
          className="btn-buy text-xs"
          onClick={() => router.push("/dashboard")}
        >
          + New Evaluation Desk
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="card p-12 text-center space-y-3">
          <p className="text-sm text-muted">No accounts deployed yet.</p>
          <button
            type="button"
            className="btn-buy text-xs"
            onClick={() => router.push("/dashboard")}
          >
            Launch Your First Challenge Desk
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="card p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-base font-bold text-text">
                    {acc.symbol}
                  </span>
                  <span className="badge border-border bg-surface-elevated text-text-secondary capitalize font-mono text-[10px]">
                    {acc.phase}
                  </span>
                  {acc.epoch && (
                    <span className="text-xs text-muted font-mono">
                      [
                      {EPOCH_META.find((e) => e.slug === acc.epoch)?.name ??
                        acc.epoch}
                      ]
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className={`badge ${STATUS_BADGE_STYLES[acc.status]}`}>
                    {acc.status}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary py-1 text-xs"
                    onClick={() => router.push(`/trade/${acc.id}`)}
                  >
                    Enter Trading Desk →
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 font-mono text-xs">
                <div className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-2.5">
                  <span className="text-[10px] text-muted uppercase">
                    Balance
                  </span>
                  <div className="font-bold text-text">
                    ${acc.balance.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-2.5">
                  <span className="text-[10px] text-muted uppercase">
                    Starting Capital
                  </span>
                  <div className="text-text-secondary">
                    ${acc.starting_balance.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-2.5">
                  <span className="text-[10px] text-muted uppercase">
                    Leverage
                  </span>
                  <div className="text-text-secondary">{acc.leverage}x</div>
                </div>
                <div className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-2.5">
                  <span className="text-[10px] text-muted uppercase">
                    Desk Phase
                  </span>
                  <div className="capitalize text-accent font-semibold">
                    {acc.phase}
                  </div>
                </div>
              </div>

              {/* Funded Account Payout Desk Section */}
              {acc.phase === "funded" && acc.status === "active" && (
                <div className="border-t border-border-subtle pt-3">
                  <WithdrawalPanel
                    account={acc}
                    onWithdrawalComplete={async () => {
                      window.location.reload();
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
