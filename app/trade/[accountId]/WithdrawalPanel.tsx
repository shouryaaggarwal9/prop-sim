"use client";

import { useState, useEffect } from "react";
import type { Account, Withdrawal } from "@/lib/trading/types";
import { requestWithdrawal, getWithdrawals } from "@/app/actions/withdrawals";

export default function WithdrawalPanel({
  account,
  onWithdrawalComplete,
}: {
  account: Account;
  onWithdrawalComplete?: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [amount, setAmount] = useState<number | "">("");
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const withdrawableProfit = Math.max(
    0,
    account.balance - account.starting_balance,
  );

  useEffect(() => {
    async function fetchHistory() {
      const data = await getWithdrawals(account.id);
      setHistory(data as Withdrawal[]);
    }
    fetchHistory();
  }, [account.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    if (numAmount > withdrawableProfit) {
      setError(
        `Amount exceeds withdrawable profit ($${withdrawableProfit.toFixed(2)}).`,
      );
      return;
    }

    setLoading(true);
    const res = await requestWithdrawal(account.id, numAmount);
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setSuccess(
      `Successfully requested withdrawal of $${numAmount.toFixed(2)}.`,
    );
    setAmount("");

    const updated = await getWithdrawals(account.id);
    setHistory(updated as Withdrawal[]);

    if (onWithdrawalComplete) {
      await onWithdrawalComplete();
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-elevated/40">
      {/* ── Main Panel Header (Toggle) ── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between p-3.5 text-left transition-colors hover:bg-white/2"
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`text-xs text-muted transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            }`}
          >
            ▶
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-text font-mono">
            Payout Desk
          </span>
          <span className="badge border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
            Simulated
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-muted">Withdrawable:</span>
          <span
            className={`font-bold ${
              withdrawableProfit > 0
                ? "text-emerald-400"
                : "text-text-secondary"
            }`}
          >
            ${withdrawableProfit.toFixed(2)}
          </span>
        </div>
      </button>

      {/* ── Collapsible Body ── */}
      {isOpen && (
        <div className="space-y-4 border-t border-border-subtle p-4 font-mono text-xs">
          <div className="rounded-lg border border-border-subtle bg-surface-elevated/80 p-3 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted">Account Balance:</span>
              <span className="text-text">${account.balance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Starting Capital:</span>
              <span className="text-text-secondary">
                ${account.starting_balance.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between font-semibold border-t border-border-subtle pt-1.5">
              <span className="text-muted">Withdrawable Profit:</span>
              <span
                className={
                  withdrawableProfit > 0 ? "text-emerald-400" : "text-muted"
                }
              >
                ${withdrawableProfit.toFixed(2)}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-[10px] uppercase text-muted">
                  Amount ($)
                </label>
                {withdrawableProfit > 0 && (
                  <button
                    type="button"
                    className="text-[11px] text-accent hover:underline"
                    onClick={() => setAmount(withdrawableProfit)}
                  >
                    Max: ${withdrawableProfit.toFixed(2)}
                  </button>
                )}
              </div>
              <input
                type="number"
                min={0.01}
                max={withdrawableProfit}
                step={0.01}
                className="input text-xs"
                placeholder="0.00"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value === "" ? "" : Number(e.target.value))
                }
                disabled={loading || withdrawableProfit <= 0}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-[11px] text-rose-400">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-[11px] text-emerald-400">
                {success}
              </div>
            )}

            <button
              type="submit"
              className="btn-buy w-full py-2.5 text-xs font-bold"
              disabled={loading || withdrawableProfit <= 0 || !amount}
            >
              {loading ? "Processing Payout..." : "Request Payout"}
            </button>
          </form>

          {/* ── Collapsible Payout History ── */}
          {history.length > 0 && (
            <div className="rounded-lg border border-border-subtle bg-surface-elevated/40">
              <button
                type="button"
                onClick={() => setIsHistoryOpen((prev) => !prev)}
                className="flex w-full items-center justify-between p-2.5 text-left transition-colors hover:bg-white/2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] text-muted transition-transform duration-200 ${
                      isHistoryOpen ? "rotate-90" : ""
                    }`}
                  >
                    ▶
                  </span>
                  <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    Payout History ({history.length})
                  </span>
                </div>
                <span className="text-[10px] text-muted">
                  {isHistoryOpen ? "Hide" : "Show"}
                </span>
              </button>

              {isHistoryOpen && (
                <div className="max-h-40 overflow-y-auto border-t border-border-subtle p-2 space-y-1.5">
                  {history.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between rounded bg-surface px-2.5 py-1.5 text-[11px]"
                    >
                      <div>
                        <span className="font-semibold text-text">
                          ${w.amount.toFixed(2)}
                        </span>
                        <p className="text-[10px] text-muted">
                          {new Date(w.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="badge border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] capitalize">
                        {w.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
