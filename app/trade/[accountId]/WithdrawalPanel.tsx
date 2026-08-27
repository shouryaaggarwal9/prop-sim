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
    <div className="card space-y-4 p-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <h3 className="text-sm font-medium">Payout Desk</h3>
        <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">
          Simulated
        </span>
      </div>

      <div className="rounded-lg border border-white/5 bg-white/2 p-3 text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-muted">Account Balance:</span>
          <span>${account.balance.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Starting Capital:</span>
          <span>${account.starting_balance.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-medium border-t border-white/5 pt-1">
          <span className="text-muted">Withdrawable Profit:</span>
          <span
            className={withdrawableProfit > 0 ? "text-success" : "text-muted"}
          >
            ${withdrawableProfit.toFixed(2)}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-muted">Amount ($)</label>
            {withdrawableProfit > 0 && (
              <button
                type="button"
                className="text-xs text-accent hover:underline"
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
            className="input w-full"
            placeholder="0.00"
            value={amount}
            onChange={(e) =>
              setAmount(e.target.value === "" ? "" : Number(e.target.value))
            }
            disabled={loading || withdrawableProfit <= 0}
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        {success && <p className="text-xs text-success">{success}</p>}

        <button
          type="submit"
          className="btn-buy w-full"
          disabled={loading || withdrawableProfit <= 0 || !amount}
        >
          {loading ? "Processing..." : "Request Payout"}
        </button>
      </form>

      {history.length > 0 && (
        <div className="space-y-2 border-t border-white/5 pt-3">
          <h4 className="text-xs font-medium text-muted">Payout History</h4>
          <div className="max-h-36 overflow-y-auto space-y-1">
            {history.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded bg-white/2 px-2 py-1.5 text-xs"
              >
                <div>
                  <span className="font-medium">${w.amount.toFixed(2)}</span>
                  <p className="text-[10px] text-muted">
                    {new Date(w.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-success capitalize">
                  {w.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
