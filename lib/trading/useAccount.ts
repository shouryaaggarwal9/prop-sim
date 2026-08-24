"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { positionPnl, resolveLeg, validateTrigger, mergeById } from "./engine";
import { getEpoch } from "@/lib/market/epochs";
import { useMarketReplay } from "@/lib/market/useMarketReplay";
import { evaluateRules, DEFAULT_RULES } from "./rules";
import type {
  Account,
  Position,
  Trade,
  Side,
  OrderType,
  PendingOrder,
  InstrumentType,
} from "./types";
import {
  generateOptionsChain,
  updateChainPrices,
  type OptionLeg,
  getLegPrice,
  getIntrinsicValue,
  type OptionsChain,
} from "@/lib/market/options";

import {
  analyzeStrategy,
  validateStrategy,
  type StrategyType,
  type StrategyLegInput,
} from "@/lib/market/strategies";

const TICK_MS = 200;
const BARS_PER_SIMULATED_DAY = 78;

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
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [fundedAccountId, setFundedAccountId] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const [optionsChain, setOptionsChain] = useState<OptionsChain | null>(null);
  const lastKnownVixRef = useRef<number>(16.0);
  const [portfolioGreeks, setPortfolioGreeks] = useState({
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
  });

  /* ── Load account + relations ── */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setError("Not authenticated.");
          setLoading(false);
        }
        return;
      }

      const { data: acc, error: accErr } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", accountId)
        .eq("user_id", user.id)
        .single();

      if (accErr || !acc) {
        if (!cancelled) {
          setError("Account not found, or you don't have access to it.");
          setLoading(false);
        }
        return;
      }

      const { data: posData } = await supabase
        .from("positions")
        .select("*")
        .eq("account_id", accountId)
        .eq("user_id", user.id);

      const { data: pending } = await supabase
        .from("pending_orders")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();

      const { data: trs } = await supabase
        .from("trades")
        .select("*")
        .eq("account_id", accountId)
        .order("closed_at", { ascending: false });

      let funded: string | null = null;
      if (acc.status === "passed" && acc.phase === "evaluation") {
        const { data: fundedRow } = await supabase
          .from("accounts")
          .select("id")
          .eq("source_account_id", acc.id)
          .maybeSingle();
        funded = fundedRow?.id ?? null;
      }

      if (!cancelled) {
        setAccount(acc as Account);
        setPositions((posData as Position[]) ?? []);
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

  /* ── Bars from epoch ── */
  const bars = useMemo(() => {
    if (!account?.epoch) return [];
    const epoch = getEpoch(account.epoch);
    return epoch?.bars ?? [];
  }, [account?.epoch]);

  const replay = useMarketReplay(bars, {
    tickMs: TICK_MS,
    startBarIndex: account?.replay_bar_index ?? 0,
  });
  const currentPrice = replay.formingBar?.close ?? bars[0]?.close ?? 0;

  /* ── Equity: unrealized across all positions ── */
  const equity = useMemo(() => {
    if (!account) return 0;
    let total = account.balance;

    for (const pos of positions) {
      if (pos.instrument_type === "equity") {
        total += positionPnl(pos, currentPrice);
      } else {
        const leg = optionsChain
          ? getLegPrice(optionsChain, pos.instrument_type, pos.strike ?? 0)
          : null;
        const mark = leg ? (leg.bid + leg.ask) / 2 : pos.entry_price;
        total += positionPnl(pos, mark); // ← direction now honored for shorts
      }
    } //UA-2
    return total;
  }, [account, positions, currentPrice, optionsChain]);

  const getCalendarDate = useCallback(() => {
    if (!account || bars.length === 0) return null;
    const barTime = bars[replay.barIndex]?.time;
    if (!barTime) return null;
    return new Date(barTime * 1000).toISOString().split("T")[0];
  }, [account, bars, replay.barIndex]);

  const generateDayChain = useCallback(() => {
    if (!account || bars.length === 0) return;
    const dateStr = getCalendarDate();
    if (!dateStr) return;

    const epoch = getEpoch(account.epoch);
    let vix = epoch?.vix?.[dateStr] ?? lastKnownVixRef.current;
    lastKnownVixRef.current = vix;

    const barsIntoDay = replay.barIndex % BARS_PER_SIMULATED_DAY;
    const barsRemaining = BARS_PER_SIMULATED_DAY - barsIntoDay;
    const hoursToClose = (barsRemaining * 5) / 60; // 5 minutes per bar

    const chain = generateOptionsChain(currentPrice, vix, hoursToClose);
    setOptionsChain(chain);
  }, [account, bars, replay.barIndex, currentPrice, getCalendarDate]);

  const peakEquity = Math.max(account?.peak_equity ?? 0, equity);
  const buyingPower = equity * (account?.leverage ?? 0);
  const maxQuantity =
    currentPrice > 0 ? Math.floor(buyingPower / currentPrice) : 0;

  /* ── Persistence helpers ── */
  const persistAccount = useCallback(
    async (patch: Partial<Account>) => {
      if (!account) return;
      setAccount((prev) => (prev ? { ...prev, ...patch } : prev));
      const { error } = await supabase
        .from("accounts")
        .update(patch)
        .eq("id", account.id);
      if (error) console.error("persistAccount FAILED:", patch, error);
    },
    [account, supabase],
  );

  /* ── Position lifecycle ── */

  const fillPositions = useCallback(
    async (
      legs: Array<{
        instrument_type: InstrumentType;
        side: Side;
        quantity: number;
        entry_price: number;
        strike?: number | null;
        entry_iv?: number | null;
        strategy_id?: string | null;
        expiration_date?: string | null;
        stop_loss_price?: number | null;
        take_profit_price?: number | null;
      }>,
    ) => {
      if (!account || legs.length === 0) return;
      const inserts = legs.map((leg) => ({
        account_id: account.id,
        user_id: account.user_id,
        instrument_type: leg.instrument_type,
        side: leg.side,
        quantity: leg.quantity,
        entry_price: leg.entry_price,
        strike: leg.strike ?? null,
        entry_iv: leg.entry_iv ?? null,
        strategy_id: leg.strategy_id ?? null,
        expiration_date: leg.expiration_date ?? null,
        stop_loss_price: leg.stop_loss_price ?? null,
        take_profit_price: leg.take_profit_price ?? null, //UA-4
      }));

      const { data, error: insErr } = await supabase
        .from("positions")
        .insert(inserts)
        .select();

      if (!insErr && data)
        setPositions((prev) => mergeById(prev, data as Position[])); // ← FIX C4 //UA-4
    },
    [account, supabase],
  );

  /** Closes a single position, returns { pnl, tradeRow } */
  const closePositionCore = useCallback(
    async (
      pos: Position,
      exitPrice: number,
      reason: string,
    ): Promise<{ pnl: number; tradeRow: Trade | null }> => {
      const pnl = positionPnl(pos, exitPrice); //UA-3

      const { data: tradeRow } = await supabase
        .from("trades")
        .insert({
          account_id: pos.account_id,
          user_id: pos.user_id,
          instrument_type: pos.instrument_type,
          side: pos.side,
          quantity: pos.quantity,
          entry_price: pos.entry_price,
          exit_price: exitPrice,
          strike: pos.strike,
          pnl,
          opened_at: pos.opened_at,
          closed_at: new Date().toISOString(),
          close_reason: reason,
          strategy_id: pos.strategy_id,
        })
        .select()
        .single();

      await supabase.from("positions").delete().eq("id", pos.id);

      return { pnl, tradeRow: tradeRow as Trade | null };
    },
    [supabase],
  );

  /* ── Auto-close on stop-loss / take-profit hit ── */
  useEffect(() => {
    if (!account || account.status !== "active") return;
    const equityPos = positions.find((p) => p.instrument_type === "equity");
    if (!equityPos) return;

    const sl = equityPos.stop_loss_price;
    const tp = equityPos.take_profit_price;
    const long = equityPos.side === "long";

    const hitSL =
      sl != null && (long ? currentPrice <= sl : currentPrice >= sl);
    const hitTP =
      tp != null && (long ? currentPrice >= tp : currentPrice <= tp);
    if (!hitSL && !hitTP) return;

    const exitPrice = hitSL ? sl! : tp!;
    const reason = hitSL ? "sl" : "tp"; // both allowed by the DB CHECK constraint

    withLock(mutationLock, async () => {
      const { pnl } = await closePositionCore(equityPos, exitPrice, reason);
      setPositions((prev) => prev.filter((p) => p.id !== equityPos.id));
      // if (account) await persistAccount({ balance: account.balance + pnl });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]); //UA-7

  /** Closes ALL positions atomically. Returns total PnL. */
  const closeAllPositions = useCallback(
    async (reason: string = "manual"): Promise<number> => {
      if (!account || positions.length === 0) return 0;

      let totalPnl = 0;
      const newTrades: Trade[] = [];
      const closedIds: string[] = [];

      for (const pos of positions) {
        let exitPrice: number;

        if (pos.instrument_type === "equity") {
          exitPrice = currentPrice;
        } else {
          exitPrice = getIntrinsicValue(
            pos.instrument_type,
            currentPrice,
            pos.strike ?? 0,
          );
        }

        const { pnl, tradeRow } = await closePositionCore(
          pos,
          exitPrice,
          reason,
        );
        totalPnl += pnl;
        if (tradeRow) newTrades.push(tradeRow);
        closedIds.push(pos.id);
      }

      setPositions((prev) => prev.filter((p) => !closedIds.includes(p.id)));
      setTrades((prev) => [...newTrades, ...prev]);

      return totalPnl;
    },
    [account, positions, currentPrice, closePositionCore],
  );

  /** Manual close — for backward compat with existing UI */
  const closePosition = useCallback(async () => {
    await withLock(mutationLock, async () => {
      const totalPnl = await closeAllPositions("manual");
      if (totalPnl !== 0 && account) {
        await persistAccount({ balance: account.balance + totalPnl });
      }
    });
  }, [account, closeAllPositions, persistAccount]);

  /** Finalize account (pass/fail) — force-closes everything */
  const finalizeAccount = useCallback(
    async (patch: Partial<Account>) => {
      await withLock(mutationLock, async () => {
        if (!account) return;
        let finalBalance = account.balance;

        if (positions.length > 0) {
          const totalPnl = await closeAllPositions("day_end");
          finalBalance = account.balance + totalPnl;
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
              epoch: account.epoch,
              starting_balance: account.starting_balance,
              balance: account.starting_balance,
              peak_equity: account.starting_balance,
              day_start_equity: account.starting_balance,
              status: "active",
              phase: "funded",
              payment_status: "pending",
              source_account_id: account.id,
            })
            .select()
            .single();

          if (fundedErr) {
            console.error("Funded account insert failed:", fundedErr);
            setError("Failed to create funded account.");
            return;
          }

          if (funded) setFundedAccountId(funded.id);
        }
      });
    },
    [
      account,
      positions,
      pendingOrder,
      closeAllPositions,
      supabase,
      persistAccount,
    ],
  );

  /* ── Persist replay progress ── */
  const lastPersistedBarIndexRef = useRef<number | null>(null);
  useEffect(() => {
    if (!account || account.status !== "active") return; //UA-9
    if (lastPersistedBarIndexRef.current === replay.barIndex) return;
    lastPersistedBarIndexRef.current = replay.barIndex;
    persistAccount({ replay_bar_index: replay.barIndex });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay.barIndex]);

  /* ── Day boundary (force-close all overnight exposure) ── */
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
      generateDayChain(); // Generate chain on mount/resume
      return;
    }
    if (day === lastDayRef.current) return;
    lastDayRef.current = day;

    withLock(mutationLock, async () => {
      let dayEndBalance = account.balance;

      if (positions.length > 0) {
        const totalPnl = await closeAllPositions("day_end");
        dayEndBalance = account.balance + totalPnl;
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

      // New day: generate fresh chain
      generateDayChain();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay.barIndex]);

  useEffect(() => {
    if (!optionsChain || !account || account.status !== "active") return;
    const barsIntoDay = replay.barIndex % BARS_PER_SIMULATED_DAY;
    const barsRemaining = BARS_PER_SIMULATED_DAY - barsIntoDay;
    const hoursToClose = (barsRemaining * 5) / 60;

    if (Math.abs(hoursToClose - optionsChain.hoursToClose) > 0.1) {
      setOptionsChain(
        updateChainPrices(optionsChain, currentPrice, hoursToClose),
      );
    } else if (Math.abs(currentPrice - optionsChain.underlyingPrice) > 0.05) {
      setOptionsChain(
        updateChainPrices(optionsChain, currentPrice, hoursToClose),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, replay.barIndex]);

  /* ── Rule evaluation ── */
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

  /* ── Pending order trigger ── */
  useEffect(() => {
    if (
      !account ||
      account.status !== "active" ||
      !pendingOrder ||
      positions.length > 0
    )
      return;
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
        await fillPositions([
          {
            instrument_type: "equity",
            side,
            quantity: pendingOrder.quantity,
            entry_price: trigger_price,
            stop_loss_price: stop_loss_price ?? null, // destructured at top of effect ✓
            take_profit_price: take_profit_price ?? null,
          },
        ]);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

  /* ── Single-leg equity order ── */
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
          positions.length > 0 ||
          pendingOrder ||
          quantity <= 0
        )
          return;

        const referencePrice =
          orderType === "market" ? currentPrice : triggerPrice;
        if (!referencePrice || referencePrice <= 0) return;

        const notional = quantity * referencePrice;
        if (notional > buyingPower) {
          setOrderError(
            `Order size (${notional.toFixed(0)}) exceeds buying power (${buyingPower.toFixed(0)} at ${account.leverage}x leverage).`,
          );
          return;
        }

        // Validate risk prices against the FILL price (current for market,
        // trigger for resting orders) — same rules as updatePositionRisk.
        if (stopLoss != null) {
          if (side === "long" && stopLoss >= referencePrice) {
            setOrderError("Stop-loss must be below fill price for longs.");
            return;
          }
          if (side === "short" && stopLoss <= referencePrice) {
            setOrderError("Stop-loss must be above fill price for shorts.");
            return;
          }
        }
        if (takeProfit != null) {
          if (side === "long" && takeProfit <= referencePrice) {
            setOrderError("Take-profit must be above fill price for longs.");
            return;
          }
          if (side === "short" && takeProfit >= referencePrice) {
            setOrderError("Take-profit must be below fill price for shorts.");
            return;
          }
        }

        setOrderError(null);

        if (orderType === "market") {
          await fillPositions([
            {
              instrument_type: "equity",
              side,
              quantity, // ← local parameter (was: pendingOrder.quantity)
              entry_price: currentPrice, // ← market fills AT market (was: trigger_price)
              stop_loss_price: stopLoss ?? null,
              take_profit_price: takeProfit ?? null,
            },
          ]);
          return;
        }

        // Past this point TS knows orderType is "limit" | "stop" — UA-5 lives HERE.
        const triggerError = validateTrigger(
          orderType,
          side,
          triggerPrice!,
          currentPrice,
        );
        if (triggerError) {
          setOrderError(triggerError);
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
      positions,
      pendingOrder,
      currentPrice,
      buyingPower,
      supabase,
      fillPositions,
    ],
  );

  const cancelPendingOrder = useCallback(async () => {
    await withLock(mutationLock, async () => {
      if (!pendingOrder) return;
      await supabase.from("pending_orders").delete().eq("id", pendingOrder.id);
      setPendingOrder(null);
    });
  }, [pendingOrder, supabase]);

  /* ── Update SL/TP on open equity position ── */
  const updatePositionRisk = useCallback(
    async (params: {
      stopLoss?: number | null;
      takeProfit?: number | null;
    }) => {
      await withLock(mutationLock, async () => {
        const equityPos = positions.find((p) => p.instrument_type === "equity");
        if (!equityPos) return;

        const patch: Partial<Position> = {};
        if ("stopLoss" in params) {
          if (params.stopLoss != null) {
            if (equityPos.side === "long" && params.stopLoss >= currentPrice) {
              setOrderError("Stop-loss must be below current price for longs.");
              return;
            }
            if (equityPos.side === "short" && params.stopLoss <= currentPrice) {
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
            if (
              equityPos.side === "long" &&
              params.takeProfit <= currentPrice
            ) {
              setOrderError(
                "Take-profit must be above current price for longs.",
              );
              return;
            }
            if (
              equityPos.side === "short" &&
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
        await supabase.from("positions").update(patch).eq("id", equityPos.id);
        setPositions((prev) =>
          prev.map((p) => (p.id === equityPos.id ? { ...p, ...patch } : p)),
        );
      });
    },
    [positions, currentPrice, supabase],
  );

  const needsPayment =
    account?.phase === "funded" && account?.payment_status === "pending";

  const placeOptionOrder = useCallback(
    async (type: "call" | "put", strike: number, quantity: number) => {
      await withLock(mutationLock, async () => {
        if (
          !account ||
          account.status !== "active" ||
          !optionsChain ||
          quantity <= 0
        )
          return;

        const leg = getLegPrice(optionsChain, type, strike);
        if (!leg) {
          setOrderError("Selected strike not available in current chain.");
          return;
        }

        const premium = leg.ask * quantity * 100;
        if (premium > account.balance) {
          setOrderError(
            `Premium ($${premium.toFixed(0)}) exceeds available cash ($${account.balance.toFixed(0)}). Options require full cash coverage.`,
          );
          return;
        }

        setOrderError(null);

        const dateStr =
          getCalendarDate() ?? new Date().toISOString().split("T")[0];

        await fillPositions([
          {
            instrument_type: type,
            side: "long",
            quantity,
            entry_price: leg.ask,
            strike,
            entry_iv: leg.iv,
            expiration_date: dateStr,
          },
        ]);
      });
    },
    [account, optionsChain, getCalendarDate, fillPositions],
  );

  const placeStrategy = useCallback(
    async (type: StrategyType, legs: StrategyLegInput[]) => {
      await withLock(mutationLock, async () => {
        if (!account || account.status !== "active" || !optionsChain) return;

        const validationError = validateStrategy(legs);
        if (validationError) {
          setOrderError(validationError);
          return;
        }

        const analysis = analyzeStrategy(legs, optionsChain);

        if (analysis.marginRequired > account.balance) {
          setOrderError(
            `Margin required ($${analysis.marginRequired.toFixed(0)}) exceeds available cash ($${account.balance.toFixed(0)}).`,
          );
          return;
        }

        setOrderError(null);

        const strategyId = crypto.randomUUID();
        const dateStr =
          getCalendarDate() ?? new Date().toISOString().split("T")[0];

        // Phase A — resolve EVERY leg before touching the database.
        const resolvedLegs: Array<{
          instrument_type: InstrumentType;
          side: Side;
          quantity: number;
          entry_price: number;
          strike: number | null;
          entry_iv: number | null;
          strategy_id: string;
          expiration_date: string | null;
        }> = [];

        for (const leg of legs) {
          if (leg.instrument_type === "equity") {
            resolvedLegs.push({
              instrument_type: leg.instrument_type,
              side: leg.side,
              quantity: leg.quantity,
              entry_price: currentPrice,
              strike: null,
              entry_iv: null,
              strategy_id: strategyId,
              expiration_date: null,
            });
            continue;
          }

          let opt: OptionLeg;
          try {
            opt = resolveLeg(
              optionsChain,
              leg.instrument_type,
              leg.strike ?? 0,
            );
          } catch {
            setOrderError(
              `${leg.instrument_type} @ ${leg.strike} is no longer in the current chain. Reopen the builder and resubmit.`,
            );
            return; // ← legal & total: aborts the ENTIRE strategy, not one leg
          }

          resolvedLegs.push({
            instrument_type: leg.instrument_type,
            side: leg.side,
            quantity: leg.quantity,
            entry_price: leg.side === "long" ? opt.ask : opt.bid,
            strike: leg.strike ?? null,
            entry_iv: opt.iv,
            strategy_id: strategyId,
            expiration_date: dateStr,
          });
        }

        // Phase B — all legs resolved cleanly; only now do we persist.
        await fillPositions(resolvedLegs);
      });
    },
    [account, optionsChain, currentPrice, getCalendarDate, fillPositions],
  );

  useEffect(() => {
    if (!optionsChain) {
      setPortfolioGreeks({ delta: 0, gamma: 0, theta: 0, vega: 0 });
      return;
    }

    let delta = 0;
    let gamma = 0;
    let theta = 0;
    let vega = 0;

    for (const pos of positions) {
      if (pos.instrument_type === "equity") {
        delta += pos.quantity * (pos.side === "long" ? 1 : -1);
        continue;
      }
      const leg = getLegPrice(
        optionsChain,
        pos.instrument_type,
        pos.strike ?? 0,
      );
      if (!leg) continue;

      const mult = pos.quantity * 100;
      const dir = pos.side === "long" ? 1 : -1;

      delta += leg.delta * mult * dir;
      gamma += leg.gamma * mult * dir;
      theta += leg.theta * mult * dir;
      vega += leg.vega * mult * dir;
    }

    setPortfolioGreeks({
      delta: Math.round(delta * 100) / 100,
      gamma: Math.round(gamma * 100) / 100,
      theta: Math.round(theta * 100) / 100,
      vega: Math.round(vega * 100) / 100,
    });
  }, [positions, optionsChain]);

  return {
    account,
    positions,
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
    needsPayment,
    placeOrder,
    cancelPendingOrder,
    closePosition,
    updatePositionRisk,
    fillPositions, // Exposed for Phase 2 strategy builder
    closeAllPositions, // Exposed for Phase 2
    placeOptionOrder,
    optionsChain,
    portfolioGreeks,
    placeStrategy,
  };
}
