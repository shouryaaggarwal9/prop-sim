"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMarketReplay } from "@/lib/market/useMarketReplay";
import { evaluateRules, DEFAULT_RULES } from "./rules";
import type {
  Account,
  Position,
  Trade,
  Side,
  OrderType,
  PendingOrder,
} from "./types";
import { getEpoch } from "../market/epochs";

const TOTAL_BARS = 600;
const BAR_SECONDS = 60;
const TICK_MS = 200;
const SUBTICKS_PER_BAR = 5;
const BARS_PER_SIMULATED_DAY = 78; // 6.5 hours × 12 five-minute bars

async function withLock(
  lockRef: { current: boolean },
  fn: () => Promise<void>,
): Promise<void> {
  if (lockRef.current) return;
  lockRef.current = true;
  try {
    await fn();
  } finally {
    lockRef.current = false;
  }
}

export function useAccount(accountId: string) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [account, setAccount] = useState<Account | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [fundedAccountId, setFundedAccountId] = useState<string | null>(null);
  const mutationLock = useRef(false);

  /* ── Load account + relations ── */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // then:
      // .eq("id", accountId)
      // .eq("user_id", user!.id)
      const { data: acc, error: accErr } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", accountId)
        .eq("user_id", user?.id)
        .single();
      if (accErr || !acc) {
        if (!cancelled) {
          setError("Account not found, or you don't have access to it.");
          setLoading(false);
        }
        return;
      }
      const { data: pos } = await supabase
        .from("positions")
        .select("*")
        .eq("account_id", accountId)
        .eq("user_id", user?.id)
        .maybeSingle();
      const { data: pending } = await supabase
        .from("pending_orders")
        .select("*")
        .eq("account_id", accountId)
        .eq("user_id", user?.id)
        .maybeSingle();
      const { data: trs } = await supabase
        .from("trades")
        .select("*")
        .eq("account_id", accountId)
        .eq("user_id", user?.id)
        .order("closed_at", { ascending: false });

      let funded: string | null = null;
      if (acc.status === "passed" && acc.phase === "evaluation") {
        const { data: fundedRow } = await supabase
          .from("accounts")
          .select("id")
          .eq("source_account_id", acc.id)
          .eq("user_id", user?.id)
          .maybeSingle();
        funded = fundedRow?.id ?? null;
      }

      if (!cancelled) {
        setAccount(acc as Account);
        setPosition((pos as Position) ?? null);
        setPendingOrder((pending as PendingOrder) ?? null);
        setTrades((trs as Trade[]) ?? []);
        setFundedAccountId(funded);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accountId, supabase]);

  /* ─-- Replay engine --─ */
  // const bars = useMemo(() => {
  //   if (!account) return [];
  //   const instrument = getInstrument(account.symbol);
  //   return generateSyntheticBars({
  //     seed: seedFromId(account.id),
  //     count: TOTAL_BARS,
  //     startPrice: instrument.startPrice,
  //     volatility: instrument.volatility,
  //     driftPerBar: instrument.driftPerBar,
  //     startTimeSec: Math.floor(new Date(account.created_at).getTime() / 1000),
  //     barSeconds: BAR_SECONDS,
  //     subTicks: SUBTICKS_PER_BAR,
  //   });
  // }, [account?.id, account?.created_at, account?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const bars = useMemo(() => {
    if (!account?.epoch) return [];
    const epoch = getEpoch(account.epoch);
    return epoch?.bars ?? [];
  }, [account?.epoch]);

  const replay = useMarketReplay(bars, {
    tickMs: TICK_MS,
    startBarIndex: account?.replay_bar_index ?? 0,
  });
  // const currentPrice = replay.formingBar?.close ?? bars[0]?.open ?? 0;
  const currentPrice = replay.formingBar?.close ?? bars[0]?.close ?? 0;

  const equity = useMemo(() => {
    if (!account) return 0;
    if (!position) return account.balance;
    const dir = position.side === "long" ? 1 : -1;
    const unrealized =
      (currentPrice - position.entry_price) * position.quantity * dir;
    return account.balance + unrealized;
  }, [account, position, currentPrice]);

  const peakEquity = Math.max(account?.peak_equity ?? 0, equity);
  const buyingPower = equity * (account?.leverage ?? 0);
  const maxQuantity =
    currentPrice > 0 ? Math.floor(buyingPower / currentPrice) : 0;
  const needsPayment =
    account?.phase === "funded" && account?.payment_status === "pending";

  /* ─-- Persistence helpers --─ */
  const persistAccount = useCallback(
    async (patch: Partial<Account>) => {
      if (!account) return;
      setAccount((prev) => (prev ? { ...prev, ...patch } : prev));
      await supabase.from("accounts").update(patch).eq("id", account.id);
    },
    [account, supabase],
  );

  /* ─-- Position lifecycle --─ */

  // CHANGED: accepts optional bracket prices
  const fillPosition = useCallback(
    async (
      side: Side,
      quantity: number,
      fillPrice: number,
      stopLoss?: number,
      takeProfit?: number,
    ) => {
      if (!account) return;
      const { data, error: insErr } = await supabase
        .from("positions")
        .insert({
          account_id: account.id,
          user_id: account.user_id,
          side,
          quantity,
          entry_price: fillPrice,
          stop_loss_price: stopLoss ?? null,
          take_profit_price: takeProfit ?? null,
        })
        .select()
        .single();
      if (!insErr && data) setPosition(data as Position);
    },
    [account, supabase],
  );

  // NEW: core close logic without its own lock wrapper.
  // Callers (closePosition, SL/TP effect, finalizeAccount, day-end) wrap it.
  const closePositionCore = useCallback(
    async (reason: string = "manual"): Promise<number | undefined> => {
      if (!account || !position) return;
      const dir = position.side === "long" ? 1 : -1;
      const pnl =
        (currentPrice - position.entry_price) * position.quantity * dir;
      const newBalance = account.balance + pnl;

      const { data: tradeRow } = await supabase
        .from("trades")
        .insert({
          account_id: account.id,
          user_id: account.user_id,
          side: position.side,
          quantity: position.quantity,
          entry_price: position.entry_price,
          exit_price: currentPrice,
          pnl,
          opened_at: position.opened_at,
          closed_at: new Date().toISOString(),
          close_reason: reason,
        })
        .select()
        .single();

      await supabase.from("positions").delete().eq("id", position.id);
      setPosition(null);
      if (tradeRow) setTrades((prev) => [tradeRow as Trade, ...prev]);
      return newBalance;
    },
    [account, position, currentPrice, supabase],
  );

  // CHANGED: accepts optional close reason (default 'manual')
  const closePosition = useCallback(
    async (reason: string = "manual") => {
      await withLock(mutationLock, async () => {
        const newBalance = await closePositionCore(reason);
        if (newBalance !== undefined) {
          await persistAccount({ balance: newBalance });
        }
      });
    },
    [closePositionCore, persistAccount],
  );

  // CHANGED: uses closePositionCore instead of duplicating close logic
  const finalizeAccount = useCallback(
    async (patch: Partial<Account>) => {
      await withLock(mutationLock, async () => {
        if (!account) return;
        let finalBalance = account.balance;

        if (position) {
          const closedBalance = await closePositionCore("day_end");
          finalBalance = closedBalance ?? account.balance;
        }

        if (pendingOrder) {
          await supabase
            .from("pending_orders")
            .delete()
            .eq("id", pendingOrder.id);
          setPendingOrder(null);
        }

        await persistAccount({ ...patch, balance: finalBalance });

        if (patch.status === "passed" && account.phase === "evaluation") {
          // Guard against duplicate funded accounts
          const { data: existing } = await supabase
            .from("accounts")
            .select("id")
            .eq("source_account_id", account.id)
            .maybeSingle();

          if (existing) {
            setFundedAccountId(existing.id);
            return;
          }

          const { data: funded, error: fundedErr } = await supabase
            .from("accounts")
            .insert({
              user_id: account.user_id,
              symbol: account.symbol,
              starting_balance: account.starting_balance,
              balance: account.starting_balance,
              peak_equity: account.starting_balance,
              day_start_equity: account.starting_balance,
              status: "active", // ← CHANGED: was "pending_payment"
              phase: "funded",
              payment_status: "pending", // gate lives here instead
              source_account_id: account.id,
            })
            .select()
            .single();

          if (fundedErr) {
            console.error("Funded account insert failed:", fundedErr);
            setError("Failed to create funded account. Check console.");
            return;
          }

          if (funded) setFundedAccountId(funded.id);
        }
      });
    },
    [
      account,
      position,
      pendingOrder,
      closePositionCore,
      supabase,
      persistAccount,
    ],
  );

  /* ─-- Persist replay progress --─ */
  const lastPersistedBarIndexRef = useRef<number | null>(null);
  useEffect(() => {
    if (!account) return;
    if (lastPersistedBarIndexRef.current === replay.barIndex) return;
    lastPersistedBarIndexRef.current = replay.barIndex;
    persistAccount({ replay_bar_index: replay.barIndex });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay.barIndex]);

  /* ─-- Day boundary (force-close overnight exposure) --─ */
  const lastBarIndexRef = useRef<number | null>(null);
  const lastDayRef = useRef<number | null>(null);
  useEffect(() => {
    if (!account || account.status !== "active") return;
    const day = Math.floor(replay.barIndex / BARS_PER_SIMULATED_DAY);
    const isSequential =
      lastBarIndexRef.current !== null &&
      replay.barIndex - lastBarIndexRef.current === 1;
    lastBarIndexRef.current = replay.barIndex;

    if (!isSequential) {
      lastDayRef.current = day;
      return;
    }
    if (day === lastDayRef.current) return;
    lastDayRef.current = day;

    withLock(mutationLock, async () => {
      let dayEndBalance = account.balance;

      if (position) {
        const closedBalance = await closePositionCore("day_end");
        dayEndBalance = closedBalance ?? account.balance;
      }

      if (pendingOrder) {
        await supabase
          .from("pending_orders")
          .delete()
          .eq("id", pendingOrder.id);
        setPendingOrder(null);
      }

      const completedDayPnL = dayEndBalance - account.day_start_equity;
      await persistAccount({
        balance: dayEndBalance,
        day_start_equity: dayEndBalance,
        daily_pnls: [...account.daily_pnls, completedDayPnL],
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay.barIndex]);

  /* ─-- Rule evaluation --─ */
  useEffect(() => {
    if (!account || account.status !== "active") return;
    const result = evaluateRules(
      {
        startingBalance: account.starting_balance,
        equity,
        peakEquity,
        dayStartEquity: account.day_start_equity,
        dailyPnls: account.daily_pnls,
        checkProfitTarget: account.phase === "evaluation",
      },
      DEFAULT_RULES,
    );
    if (result.status === "passed") {
      finalizeAccount({ status: "passed" });
    } else if (result.status === "failed") {
      finalizeAccount({ status: "failed", fail_reason: result.reason });
    } else if (peakEquity > account.peak_equity) {
      persistAccount({ peak_equity: peakEquity });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equity]);

  /* ─-- NEW: Auto-close on stop-loss / take-profit hit --─ */
  useEffect(() => {
    if (!account || !position || account.status !== "active") return;

    const slHit =
      position.stop_loss_price != null &&
      (position.side === "long"
        ? currentPrice <= position.stop_loss_price
        : currentPrice >= position.stop_loss_price);

    const tpHit =
      position.take_profit_price != null &&
      (position.side === "long"
        ? currentPrice >= position.take_profit_price
        : currentPrice <= position.take_profit_price);

    if (slHit || tpHit) {
      withLock(mutationLock, async () => {
        const newBalance = await closePositionCore(slHit ? "sl" : "tp");
        if (newBalance !== undefined) {
          await persistAccount({ balance: newBalance });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

  /* ─-- Pending order trigger --─ */
  useEffect(() => {
    if (!account || account.status !== "active" || !pendingOrder || position) {
      return;
    }
    if (needsPayment) {
      return;
    }
    const {
      side,
      order_type,
      trigger_price,
      stop_loss_price,
      take_profit_price,
    } = pendingOrder;

    const triggered =
      order_type === "limit"
        ? side === "long"
          ? currentPrice <= trigger_price
          : currentPrice >= trigger_price
        : side === "long"
          ? currentPrice >= trigger_price
          : currentPrice <= trigger_price;

    if (triggered) {
      withLock(mutationLock, async () => {
        const notional = pendingOrder.quantity * trigger_price;
        await supabase
          .from("pending_orders")
          .delete()
          .eq("id", pendingOrder.id);
        setPendingOrder(null);
        if (notional > buyingPower) {
          setOrderError(
            "Pending order cancelled — buying power dropped too low by the time it triggered.",
          );
          return;
        }
        await fillPosition(
          side,
          pendingOrder.quantity,
          trigger_price,
          stop_loss_price ?? undefined,
          take_profit_price ?? undefined,
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

  /* ─-- Order entry --─ */
  // CHANGED: accepts optional stopLoss & takeProfit
  const placeOrder = useCallback(
    async (
      side: Side,
      quantity: number,
      orderType: OrderType,
      triggerPrice?: number,
      stopLoss?: number,
      takeProfit?: number,
    ) => {
      await withLock(mutationLock, async () => {
        if (
          !account ||
          account.status !== "active" ||
          position ||
          pendingOrder ||
          quantity <= 0
        ) {
          return;
        }

        if (needsPayment) {
          setOrderError(
            "This funded account is awaiting activation payment — complete checkout before trading.",
          );
          return;
        }

        const referencePrice =
          orderType === "market" ? currentPrice : triggerPrice;
        if (!referencePrice || referencePrice <= 0) return;

        // Validate bracket levels against the intended entry price
        if (stopLoss != null) {
          if (side === "long" && stopLoss >= referencePrice) {
            setOrderError("Stop-loss must be below entry for long positions.");
            return;
          }
          if (side === "short" && stopLoss <= referencePrice) {
            setOrderError("Stop-loss must be above entry for short positions.");
            return;
          }
        }
        if (takeProfit != null) {
          if (side === "long" && takeProfit <= referencePrice) {
            setOrderError(
              "Take-profit must be above entry for long positions.",
            );
            return;
          }
          if (side === "short" && takeProfit >= referencePrice) {
            setOrderError(
              "Take-profit must be below entry for short positions.",
            );
            return;
          }
        }

        const notional = quantity * referencePrice;
        if (notional > buyingPower) {
          setOrderError(
            `Order size (${notional.toFixed(0)}) exceeds buying power (${buyingPower.toFixed(0)} at ${account.leverage}x leverage).`,
          );
          return;
        }
        setOrderError(null);

        if (orderType === "market") {
          await fillPosition(
            side,
            quantity,
            currentPrice,
            stopLoss,
            takeProfit,
          );
          return;
        }

        const { data, error: insErr } = await supabase
          .from("pending_orders")
          .insert({
            account_id: account.id,
            user_id: account.user_id,
            side,
            order_type: orderType,
            quantity,
            trigger_price: triggerPrice,
            stop_loss_price: stopLoss ?? null,
            take_profit_price: takeProfit ?? null,
          })
          .select()
          .single();
        if (!insErr && data) setPendingOrder(data as PendingOrder);
      });
    },
    [
      account,
      position,
      pendingOrder,
      currentPrice,
      buyingPower,
      supabase,
      fillPosition,
      needsPayment,
    ],
  );

  const cancelPendingOrder = useCallback(async () => {
    await withLock(mutationLock, async () => {
      if (!pendingOrder) return;
      await supabase.from("pending_orders").delete().eq("id", pendingOrder.id);
      setPendingOrder(null);
    });
  }, [pendingOrder, supabase]);

  /* ─-- NEW: Update SL/TP on an open position (exit orders) --─ */
  const updatePositionRisk = useCallback(
    async (params: {
      stopLoss?: number | null;
      takeProfit?: number | null;
    }) => {
      await withLock(mutationLock, async () => {
        if (!position) return;

        const patch: Partial<Position> = {};
        if ("stopLoss" in params) {
          if (params.stopLoss != null) {
            if (position.side === "long" && params.stopLoss >= currentPrice) {
              setOrderError("Stop-loss must be below current price for longs.");
              return;
            }
            if (position.side === "short" && params.stopLoss <= currentPrice) {
              setOrderError(
                "Stop-loss must be above current price for shorts.",
              );
              return;
            }
          }
          patch.stop_loss_price = params.stopLoss ?? null;
        }

        if ("takeProfit" in params) {
          if (params.takeProfit != null) {
            if (position.side === "long" && params.takeProfit <= currentPrice) {
              setOrderError(
                "Take-profit must be above current price for longs.",
              );
              return;
            }
            if (
              position.side === "short" &&
              params.takeProfit >= currentPrice
            ) {
              setOrderError(
                "Take-profit must be below current price for shorts.",
              );
              return;
            }
          }
          patch.take_profit_price = params.takeProfit ?? null;
        }

        setOrderError(null);
        await supabase.from("positions").update(patch).eq("id", position.id);
        setPosition((prev) => (prev ? { ...prev, ...patch } : prev));
      });
    },
    [position, currentPrice, supabase],
  );

  return {
    account,
    position,
    pendingOrder,
    trades,
    loading,
    error,
    orderError,
    closedBars: replay.closedBars,
    formingBar: replay.formingBar,
    currentPrice,
    equity,
    peakEquity,
    buyingPower,
    maxQuantity,
    isReplayDone: replay.isDone,
    fundedAccountId,
    placeOrder,
    cancelPendingOrder,
    closePosition,
    updatePositionRisk, // NEW
    needsPayment, // NEW
  };
}
