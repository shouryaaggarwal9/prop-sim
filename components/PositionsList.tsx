"use client";

import { useState } from "react";
import type { Position } from "@/lib/trading/types";

export default function PositionsList({
  positions,
  currentPrice,
  onClose,
  onUpdateRisk,
}: {
  positions: Position[];
  currentPrice: number;
  onClose: (positionIds?: string[]) => Promise<void>;
  onUpdateRisk?: (
    positionId: string,
    stopLossPrice: number | null,
    takeProfitPrice: number | null,
  ) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slInput, setSlInput] = useState("");
  const [tpInput, setTpInput] = useState("");
  const [saving, setSaving] = useState(false);

  if (positions.length === 0) return null;

  function startEditing(pos: Position) {
    setEditingId(pos.id);
    setSlInput(pos.stop_loss_price != null ? String(pos.stop_loss_price) : "");
    setTpInput(
      pos.take_profit_price != null ? String(pos.take_profit_price) : "",
    );
  }

  async function handleSaveRisk(positionId: string) {
    if (!onUpdateRisk) return;
    setSaving(true);
    const sl = slInput.trim() !== "" ? Number(slInput) : null;
    const tp = tpInput.trim() !== "" ? Number(tpInput) : null;
    await onUpdateRisk(
      positionId,
      sl != null && !isNaN(sl) ? sl : null,
      tp != null && !isNaN(tp) ? tp : null,
    );
    setSaving(false);
    setEditingId(null);
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text font-mono">
            Open Positions
          </h3>
          <span className="badge border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
            {positions.length} Active
          </span>
        </div>
        <button
          type="button"
          onClick={() => onClose()}
          className="btn-sell px-2.5 py-1 text-[11px]"
        >
          Flatten All
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead className="border-b border-border-subtle text-[10px] uppercase text-muted">
            <tr>
              <th className="py-2 px-2 font-normal">Side</th>
              <th className="py-2 px-2 font-normal">Instrument</th>
              <th className="py-2 px-2 font-normal">Qty</th>
              <th className="py-2 px-2 font-normal">Entry</th>
              <th className="py-2 px-2 font-normal">Mark</th>
              <th className="py-2 px-2 font-normal">SL / TP</th>
              <th className="py-2 px-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {positions.map((p) => {
              const isEditing = editingId === p.id;
              return (
                <tr key={p.id} className="hover:bg-white/2 transition-colors">
                  <td className="py-2.5 px-2">
                    <span
                      className={`badge text-[10px] ${
                        p.side === "long"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : "border-rose-500/20 bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {p.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 font-semibold text-text">
                    {p.instrument_type.toUpperCase()}
                    {p.strike && (
                      <span className="ml-1 text-[10px] text-muted">
                        @{p.strike}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-text-secondary">
                    {p.quantity}
                  </td>
                  <td className="py-2.5 px-2 tabular-nums text-text">
                    ${p.entry_price.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-2 tabular-nums text-text">
                    ${currentPrice.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          placeholder="SL"
                          className="input w-16 px-1.5 py-1 text-[11px]"
                          value={slInput}
                          onChange={(e) => setSlInput(e.target.value)}
                        />
                        <input
                          type="number"
                          step="any"
                          placeholder="TP"
                          className="input w-16 px-1.5 py-1 text-[11px]"
                          value={tpInput}
                          onChange={(e) => setTpInput(e.target.value)}
                        />
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted">
                        {p.stop_loss_price != null
                          ? `$${p.stop_loss_price.toFixed(2)}`
                          : "—"}{" "}
                        /{" "}
                        {p.take_profit_price != null
                          ? `$${p.take_profit_price.toFixed(2)}`
                          : "—"}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="btn-buy px-2 py-0.5 text-[10px]"
                            disabled={saving}
                            onClick={() => handleSaveRisk(p.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn-secondary px-2 py-0.5 text-[10px]"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn-secondary px-2 py-0.5 text-[10px]"
                            onClick={() => startEditing(p)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-sell px-2 py-0.5 text-[10px]"
                            onClick={() => onClose([p.id])}
                          >
                            Close
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
