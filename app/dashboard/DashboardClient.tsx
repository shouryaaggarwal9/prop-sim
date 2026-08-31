"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DEFAULT_RULES } from "@/lib/trading/rules";
import { EPOCH_META } from "@/lib/market/epochs";
import type { Account } from "@/lib/trading/types";

const STARTING_BALANCE = 50000;

const REGIME_BADGE_STYLES: Record<string, string> = {
  Trend: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  Range: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  "Low Vol": "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
  Crash: "border-rose-500/20 bg-rose-500/10 text-rose-400",
  Reversal: "border-purple-500/20 bg-purple-500/20 text-purple-400",
};

export default function DashboardClient() {
  const router = useRouter();
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
      router.push(`/trade/${account.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to initialize evaluation desk.",
      );
      setCreating(false);
    }
  }

  return (
    <div className="w-full max-w-3xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-text sm:text-xl">
            Launch Evaluation Desk
          </h1>
          <p className="text-[11px] text-muted">
            Select a synthetic market regime to initialize your deterministic
            simulation desk.
          </p>
        </div>
        <span className="badge border-accent/30 bg-accent/10 text-accent font-mono text-[10px]">
          5M Sub-Ticks
        </span>
      </div>

      {/* Main Epoch Selection Card */}
      <div className="card p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {EPOCH_META.map((epoch) => {
            const isSelected = selectedEpoch === epoch.slug;
            return (
              <label
                key={epoch.slug}
                className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-3 transition-all ${
                  isSelected
                    ? "border-accent bg-accent/10 shadow-md shadow-accent/10"
                    : "border-border bg-surface-elevated hover:border-border-subtle hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="epoch"
                      value={epoch.slug}
                      checked={isSelected}
                      onChange={() => setSelectedEpoch(epoch.slug)}
                      className="accent-accent h-3.5 w-3.5"
                    />
                    <span className="text-xs font-semibold text-text">
                      {epoch.name}
                    </span>
                  </div>
                  <span
                    className={`badge text-[9px] ${
                      REGIME_BADGE_STYLES[epoch.regime] ??
                      "border-border text-muted"
                    }`}
                  >
                    {epoch.regime}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
                  {epoch.description}
                </p>
              </label>
            );
          })}
        </div>

        {/* Challenge Summary Parameters */}
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border-subtle bg-surface-elevated/70 p-3 font-mono text-center">
          <div className="space-y-0.5">
            <div className="text-[10px] text-muted uppercase">
              Starting Balance
            </div>
            <div className="text-xs font-bold text-text">
              ${STARTING_BALANCE.toLocaleString()}
            </div>
          </div>
          <div className="space-y-0.5 border-x border-border-subtle px-1">
            <div className="text-[10px] text-muted uppercase">
              Profit Target
            </div>
            <div className="text-xs font-bold text-emerald-400">
              +{(DEFAULT_RULES.profitTargetPct * 100).toFixed(0)}% ($
              {(STARTING_BALANCE * DEFAULT_RULES.profitTargetPct).toFixed(0)})
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] text-muted uppercase">
              Daily Loss Limit
            </div>
            <div className="text-xs font-bold text-rose-400">
              -{(DEFAULT_RULES.dailyLossPct * 100).toFixed(0)}% ($
              {(STARTING_BALANCE * DEFAULT_RULES.dailyLossPct).toFixed(0)})
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-center text-xs text-rose-400">
            {error}
          </div>
        )}

        <button
          type="button"
          className="btn-buy w-full py-2.5 text-xs font-bold"
          disabled={creating}
          onClick={startChallenge}
        >
          {creating
            ? "Minting Simulator Engine..."
            : "Initialize Evaluation Account"}
        </button>
      </div>
    </div>
  );
}
