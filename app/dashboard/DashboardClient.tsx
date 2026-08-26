"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DEFAULT_RULES } from "@/lib/trading/rules";
import { EPOCH_META } from "@/lib/market/epochs";
import type { Account } from "@/lib/trading/types";

const STARTING_BALANCE = 50000;

// git add RR7

const STATUS_STYLES: Record<Account["status"], string> = {
  active: "bg-accent/15 text-accent",
  passed: "bg-success/15 text-success",
  failed: "bg-danger/15 text-danger",
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

      // P3: server mints the account (ownership derived from the session,
      // balance enforced server-side). Returns the full row.
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
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold">Your evaluations</h1>

      <div className="card mb-6 space-y-4 p-5">
        <h2 className="text-sm font-medium">Start new evaluation</h2>

        <div className="space-y-2">
          {EPOCH_META.map((epoch) => (
            <label
              key={epoch.slug}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                selectedEpoch === epoch.slug
                  ? "border-accent bg-accent/5"
                  : "border-white/5 hover:border-white/10"
              }`}
            >
              <input
                type="radio"
                name="epoch"
                value={epoch.slug}
                checked={selectedEpoch === epoch.slug}
                onChange={() => setSelectedEpoch(epoch.slug)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{epoch.name}</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
                    {epoch.regime}
                  </span>
                </div>
                <p className="text-xs text-muted">{epoch.description}</p>
              </div>
            </label>
          ))}
        </div>

        <button
          className="btn-buy w-full"
          disabled={creating}
          onClick={startChallenge}
        >
          {creating ? "Starting…" : "Start evaluation"}
        </button>
      </div>

      <p className="mb-6 text-sm text-muted">
        Starting balance ${STARTING_BALANCE.toLocaleString()}. Pass by reaching{" "}
        {(DEFAULT_RULES.profitTargetPct * 100).toFixed(0)}% profit; fail by
        exceeding a {(DEFAULT_RULES.dailyLossPct * 100).toFixed(0)}% daily loss
        or a {(DEFAULT_RULES.trailingDrawdownPct * 100).toFixed(0)}% trailing
        drawdown from your equity peak.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-muted">
          No evaluations yet — start one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((acc) => (
            <li key={acc.id}>
              <button
                className="card flex w-full items-center justify-between p-4 text-left hover:border-accent/50"
                onClick={() => router.push(`/trade/${acc.id}`)}
              >
                <div>
                  <p className="font-medium">
                    {acc.symbol}
                    <span className="ml-2 text-xs font-normal text-muted capitalize">
                      {acc.phase}
                    </span>
                    {acc.epoch && (
                      <span className="ml-2 text-[10px] text-muted">
                        {EPOCH_META.find((e) => e.slug === acc.epoch)?.name ??
                          acc.epoch}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    Started {new Date(acc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`badge ${STATUS_STYLES[acc.status]}`}>
                  {acc.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
