"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DEFAULT_RULES } from "@/lib/trading/rules";
import { EPOCH_META } from "@/lib/market/epochs";
import type { Account } from "@/lib/trading/types";
import WithdrawalPanel from "@/app/trade/[accountId]/WithdrawalPanel";

const STARTING_BALANCE = 50000;

const STATUS_BADGE_STYLES: Record<Account["status"], string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  passed: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-400",
};

const REGIME_BADGE_STYLES: Record<string, string> = {
  Trend: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  Range: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  "Low Vol": "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
  Crash: "border-rose-500/20 bg-rose-500/10 text-rose-400",
  Reversal: "border-purple-500/20 bg-purple-500/20 text-purple-400",
};

export default function DashboardClient({
  initialAccounts,
}: {
  initialAccounts: Account[];
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEpoch, setSelectedEpoch] = useState(EPOCH_META[0].slug);

  async function startChallenge() {
    setCreating(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error: rpcErr } = await supabase.rpc("create_evaluation", {
        p_epoch: selectedEpoch,
      });
      if (rpcErr) throw rpcErr;

      const account = (data as Account[])[0];
      setAccounts((prev) => [account, ...prev]);
      router.push(`/trade/${account.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to start a new evaluation.",
      );
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border-subtle pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            Terminal Evaluation Desk
          </h1>
          <p className="text-xs text-muted">
            Manage your active simulation accounts and launch new challenge
            epochs.
          </p>
        </div>
        <div className="mt-2 font-mono text-xs text-text-secondary sm:mt-0">
          Account Pool:{" "}
          <span className="font-semibold text-text">
            {accounts.length} Active
          </span>
        </div>
      </div>

      {/* Epoch Selector & Challenge Launcher */}
      <div className="card p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase text-text">
              Select Market Epoch
            </h2>
            <p className="text-xs text-muted">
              Choose the historical synthetic market regime you want to trade
              against.
            </p>
          </div>
          <span className="badge border-accent/30 bg-accent/10 text-accent font-mono text-[10px]">
            5-Minute Sub-Ticks
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EPOCH_META.map((epoch) => {
            const isSelected = selectedEpoch === epoch.slug;
            return (
              <label
                key={epoch.slug}
                className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all ${
                  isSelected
                    ? "border-accent bg-accent/10 shadow-lg shadow-accent/10"
                    : "border-border bg-surface-elevated hover:border-border-subtle hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="epoch"
                      value={epoch.slug}
                      checked={isSelected}
                      onChange={() => setSelectedEpoch(epoch.slug)}
                      className="accent-accent"
                    />
                    <span className="text-sm font-semibold text-text">
                      {epoch.name}
                    </span>
                  </div>
                  <span
                    className={`badge ${
                      REGIME_BADGE_STYLES[epoch.regime] ??
                      "border-border text-muted"
                    }`}
                  >
                    {epoch.regime}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-text-secondary">
                  {epoch.description}
                </p>
              </label>
            );
          })}
        </div>

        {/* Challenge Summary Banner */}
        <div className="rounded-xl border border-border-subtle bg-surface-elevated/70 p-4 text-xs space-y-2 font-mono">
          <div className="flex justify-between text-muted">
            <span>Starting Capital:</span>
            <span className="text-text font-bold">
              ${STARTING_BALANCE.toLocaleString()}.00
            </span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Profit Target:</span>
            <span className="text-emerald-400 font-bold">
              +{(DEFAULT_RULES.profitTargetPct * 100).toFixed(0)}% ($
              {(STARTING_BALANCE * DEFAULT_RULES.profitTargetPct).toFixed(2)})
            </span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Max Intraday Loss:</span>
            <span className="text-rose-400 font-bold">
              -{(DEFAULT_RULES.dailyLossPct * 100).toFixed(0)}% ($
              {(STARTING_BALANCE * DEFAULT_RULES.dailyLossPct).toFixed(2)})
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
            {error}
          </div>
        )}

        <button
          type="button"
          className="btn-buy w-full py-3"
          disabled={creating}
          onClick={startChallenge}
        >
          {creating
            ? "Minting Simulator Engine..."
            : "Initialize Evaluation Account"}
        </button>
      </div>

      {/* Account History & Payout Desk */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted font-mono">
          Your Account Portfolio
        </h3>

        {accounts.length === 0 ? (
          <div className="card p-8 text-center text-xs text-muted">
            No accounts deployed yet. Initialize your first evaluation desk
            above.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {accounts.map((acc) => (
              <div key={acc.id} className="card p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-text">
                      {acc.symbol}
                    </span>
                    <span className="badge border-border bg-surface-hover text-text-secondary capitalize font-mono text-[10px]">
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
                    <span
                      className={`badge ${STATUS_BADGE_STYLES[acc.status]}`}
                    >
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
                      Starting
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
                      Status
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
    </div>
  );
}
