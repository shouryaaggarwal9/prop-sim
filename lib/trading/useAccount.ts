"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { positionPnl, resolveLeg, validateTrigger, mergeById } from "./engine";
import { getEpoch } from "@/lib/market/epochs";
import { useMarketReplay } from "@/lib/market/useMarketReplay";
import { evaluateRules, DEFAULT_RULES } from "./rules";
import {
  isOptionType,
  type Account,
  type Position,
  type Trade,
  type Side,
  type OrderType,
  type PendingOrder,
  type InstrumentType,
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

import {
  quoteFunds,
  upfrontCash,
  settlementCashDelta,
  reservationFor,
  availability,
  type MarginLeg,
} from "./margin";

// const TICK_MS = 200;
// const BARS_PER_SIMULATED_DAY = 78;

const TICK_MS = 60000;
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

  // const replay = useMarketReplay(bars, {
  //   tickMs: TICK_MS,
  //   startBarIndex: account?.replay_bar_index ?? 0,
  // });

  const replay = useMarketReplay(bars, {
    tickMs: 1000, // Price updates every 1.0 second
    ticksPerCandle: 30, // Candle stays alive and forms for 60 seconds (or 300 for full 5 mins)
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
        const optionType = isOptionType(pos.instrument_type)
          ? pos.instrument_type
          : null;
        const leg =
          optionType && optionsChain
            ? getLegPrice(optionsChain, optionType, pos.strike ?? 0)
            : null;
        const mark = leg ? (leg.bid + leg.ask) / 2 : pos.entry_price;

        // MG-3
        // C5 MODEL: balance already contains this leg's upfront premium flow,
        // so equity adds the leg's MARK VALUE (not P&L). Identity:
        // (starting − entry·q·100·d) + mark·q·100·d ≡ starting + unrealizedPnl.
        const dir = pos.side === "long" ? 1 : -1;
        total += mark * pos.quantity * 100 * dir;
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

  //MG-2 below
  /* ── C5 LEDGER: reservations derived live from the open book ── */
  const leverage = account?.leverage ?? 10;
  const reserved = reservationFor(positions, leverage);
  const availableCash = availability(account?.balance ?? 0, reserved);
  const maxQuantity =
    currentPrice > 0
      ? Math.floor((availableCash * leverage) / currentPrice)
      : 0;

  /* ── P3: server-truth readers ── */
  const refreshAccount = useCallback(async () => {
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .single();
    if (!error && data) setAccount(data as Account);
  }, [accountId, supabase]);

  const refetchTrades = useCallback(async () => {
    const { data } = await supabase
      .from("trades")
      .select("*")
      .eq("account_id", accountId)
      .order("closed_at", { ascending: false });
    if (data) setTrades(data as Trade[]);
  }, [accountId, supabase]);

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

      // P3: ONE atomic server transaction — inserts + upfront cash.
      const { data, error: rpcErr } = await supabase.rpc("apply_fill", {
        p_account_id: account.id,
        p_legs: legs,
      });
      if (rpcErr || !data) {
        setOrderError(rpcErr?.message ?? "Fill rejected by server.");
        return;
      }

      // SETOF functions return ARRAYS — index the array, destructure the row.
      const [row] = data as Array<{
        inserted_ids: string[];
        new_balance: number;
      }>;
      if (
        !row ||
        !Array.isArray(row.inserted_ids) ||
        row.inserted_ids.length !== legs.length
      ) {
        setOrderError("Fill returned incomplete data from server.");
        return;
      }
      const { inserted_ids: insertedIds, new_balance: newBalance } = row;

      // Local mirror built from OUR legs + THEIR ids.
      setPositions((prev) =>
        mergeById(
          prev,
          legs.map((leg, i) => ({
            id: insertedIds[i],
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
            take_profit_price: leg.take_profit_price ?? null,
            opened_at: new Date().toISOString(),
          })),
        ),
      );
      // Server's balance wins.
      setAccount((prev) => (prev ? { ...prev, balance: newBalance } : prev));
    },
    [account, supabase],
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
      // P3: atomic — trade row + position delete + cash, one transaction.
      const { error: rpcErr } = await supabase.rpc("close_positions", {
        p_account_id: account.id,
        p_exits: [{ position_id: equityPos.id, exit_price: exitPrice }],
        p_reason: reason,
      });
      if (rpcErr) {
        if (rpcErr.message.includes("missing")) {
          // Another writer closed it first (second tab/race). Trust the server.
          setPositions((prev) => prev.filter((p) => p.id !== equityPos.id));
          await Promise.all([refreshAccount(), refetchTrades()]);
          return;
        }
        setOrderError(rpcErr.message);
        return;
      }
      setPositions((prev) => prev.filter((p) => p.id !== equityPos.id));
      await Promise.all([refreshAccount(), refetchTrades()]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]); //UA-7 · P3

  /** Closes ALL positions atomically. Returns total PnL. */
  /** Closes ALL positions via one atomic RPC. Returns settlement applied. */
  const closeAllPositions = useCallback(
    async (reason: string = "manual"): Promise<number> => {
      if (!account || positions.length === 0) return 0;

      // Exit-price policy stays client-side (Phase-3 boundary decision B):
      // day-end/finalized settle at intrinsic; intraday manual closes at mid.
      const exits = positions.map((pos) => {
        let exitPrice: number;
        if (pos.instrument_type === "equity") {
          exitPrice = currentPrice;
        } else if (reason === "day_end" || reason === "finalized") {
          exitPrice = getIntrinsicValue(
            pos.instrument_type,
            currentPrice,
            pos.strike ?? 0,
          );
        } else {
          const optionType = isOptionType(pos.instrument_type)
            ? pos.instrument_type
            : null;
          const leg =
            optionType && optionsChain
              ? getLegPrice(optionsChain, optionType, pos.strike ?? 0)
              : null;
          exitPrice = leg ? (leg.bid + leg.ask) / 2 : pos.entry_price;
        }
        return { position_id: pos.id, exit_price: exitPrice };
      });

      const { data, error: rpcErr } = await supabase.rpc("close_positions", {
        p_account_id: account.id,
        p_exits: exits,
        p_reason: reason,
      });
      if (rpcErr) {
        setOrderError(rpcErr.message);
        return 0;
      }

      setPositions([]);
      await Promise.all([refetchTrades(), refreshAccount()]);
      return (data as number) ?? 0;
    },
    [
      account,
      positions,
      currentPrice,
      optionsChain,
      supabase,
      refetchTrades,
      refreshAccount,
    ],
  );

  /** Manual close-all — balance/trades handled inside the RPC. */
  const closePosition = useCallback(async () => {
    await withLock(mutationLock, async () => {
      await closeAllPositions("manual");
    });
  }, [closeAllPositions]);

  /** Finalize account (pass/fail) — force-closes everything */
  /** Finalize (pass/fail) — force-close, status flip, and funded-child minting
   *  occur in ONE server transaction; UNIQUE index still backs the twin-mint. */
  const finalizeAccount = useCallback(
    async (patch: {
      status: "passed" | "failed";
      fail_reason?: "daily_loss" | "trailing_drawdown" | null;
    }) => {
      await withLock(mutationLock, async () => {
        if (!account) return;

        const exits = positions.map((pos) => ({
          position_id: pos.id,
          exit_price:
            pos.instrument_type === "equity"
              ? currentPrice
              : getIntrinsicValue(
                  pos.instrument_type,
                  currentPrice,
                  pos.strike ?? 0,
                ),
        }));

        const { data, error: rpcErr } = await supabase.rpc("finalize_account", {
          p_account_id: account.id,
          p_status: patch.status,
          p_fail_reason: patch.fail_reason ?? null,
          p_exits: exits,
        });
        if (rpcErr) {
          console.error("[finalize]", rpcErr.message);
          setError("Failed to finalize account.");
          return;
        }

        const result = data as {
          balance: number;
          funded_account_id: string | null;
        };
        setPendingOrder(null);
        await Promise.all([refetchTrades(), refreshAccount()]);

        if (patch.status === "passed" && account.phase === "evaluation") {
          if (result.funded_account_id) {
            setFundedAccountId(result.funded_account_id);
          } else {
            // Child pre-existed (earlier pass). Re-link, never re-mint.
            const { data: existing } = await supabase
              .from("accounts")
              .select("id")
              .eq("source_account_id", account.id)
              .maybeSingle();
            if (existing) setFundedAccountId(existing.id);
          }
        }
      });
    },
    [account, positions, currentPrice, supabase, refetchTrades, refreshAccount],
  );

  /* ── Persist replay progress ── */
  const lastPersistedBarIndexRef = useRef<number | null>(null);
  useEffect(() => {
    if (!account || account.status !== "active") return; //UA-9
    if (lastPersistedBarIndexRef.current === replay.barIndex) return;
    lastPersistedBarIndexRef.current = replay.barIndex;
    supabase
      .rpc("set_replay_index", {
        p_account_id: account.id,
        p_index: replay.barIndex,
      })
      .then(({ error }) => {
        if (error) console.error("[replay-index]", error.message);
      });
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
      // P3: ONE transaction — settle all, purge pendings, roll the day.
      const exits = positions.map((pos) => ({
        position_id: pos.id,
        exit_price:
          pos.instrument_type === "equity"
            ? currentPrice
            : getIntrinsicValue(
                pos.instrument_type,
                currentPrice,
                pos.strike ?? 0,
              ),
      }));

      const { error: rpcErr } = await supabase.rpc("day_close", {
        p_account_id: account.id,
        p_exits: exits,
      });
      if (rpcErr) {
        console.error("[day_close]", rpcErr.message);
        return;
      }

      setPositions([]);
      setPendingOrder(null);
      await Promise.all([refetchTrades(), refreshAccount()]);
      generateDayChain(); // fresh chain for the new simulated day
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
      setAccount((prev) =>
        prev ? { ...prev, peak_equity: peakEquity } : prev,
      );
      supabase
        .rpc("update_peak_equity", {
          p_account_id: account.id,
          p_peak: peakEquity,
        })
        .then(({ error }) => {
          if (error) console.error("[peak]", error.message);
        });
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
        await supabase.rpc("cancel_pending_order", {
          p_account_id: account.id,
          p_order_id: pendingOrder.id,
        });
        setPendingOrder(null);
        const funds = quoteFunds(
          availableCash,
          [
            {
              instrument_type: "equity",
              side,
              quantity: pendingOrder.quantity,
              entry_price: trigger_price,
            },
          ],
          account.leverage,
        );
        if (!funds.affordable) {
          setOrderError(
            funds.error ??
              "Pending order cancelled — insufficient funds at trigger.",
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
  }, [currentPrice, availableCash]);

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

        // MG-9

        // C5: unified funds gate — reserves notional ÷ leverage
        const funds = quoteFunds(
          availableCash,
          [
            {
              instrument_type: "equity",
              side,
              quantity,
              entry_price: referencePrice,
            },
          ],
          account.leverage,
        );
        if (!funds.affordable) {
          setOrderError(funds.error);
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

        const { data, error: rpcErr } = await supabase.rpc(
          "place_pending_order",
          {
            p_account_id: account.id,
            p_side: side,
            p_order_type: orderType,
            p_quantity: quantity,
            p_trigger: triggerPrice!,
            p_sl: stopLoss ?? null,
            p_tp: takeProfit ?? null,
          },
        );
        if (rpcErr) {
          setOrderError(rpcErr.message);
          return;
        }
        const [orderRow] = (data ?? []) as PendingOrder[];
        if (!orderRow) {
          setOrderError("Server accepted the order but returned no row.");
          return;
        }
        setPendingOrder(orderRow);
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
      availableCash,
    ],
  );

  // P-3 U10
  const cancelPendingOrder = useCallback(async () => {
    await withLock(mutationLock, async () => {
      if (!pendingOrder || !account) return;
      const { error } = await supabase.rpc("cancel_pending_order", {
        p_account_id: account.id,
        p_order_id: pendingOrder.id,
      });
      if (error) setOrderError(error.message);
      else setPendingOrder(null);
    });
  }, [pendingOrder, account, supabase]);

  /* ── Update SL/TP on open equity position ── */
  const updatePositionRisk = useCallback(
    async (params: {
      stopLoss?: number | null;
      takeProfit?: number | null;
    }) => {
      await withLock(mutationLock, async () => {
        // copilot ne bola hai yeh
        if (!account) return;
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
        await supabase.rpc("update_position_risk", {
          p_account_id: account.id, // account is possibly null
          p_position_id: equityPos.id,
          p_stop_loss: patch.stop_loss_price ?? null,
          p_take_profit: patch.take_profit_price ?? null,
        });
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

        // MG-11

        const funds = quoteFunds(
          availableCash,
          [
            {
              instrument_type: type,
              side: "long",
              quantity,
              strike,
              entry_price: leg.ask,
            },
          ],
          account.leverage,
        );
        if (!funds.affordable) {
          setOrderError(funds.error);
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
    [account, optionsChain, getCalendarDate, fillPositions, availableCash],
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

        // MG-12 (12a)

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

        // MG-12 (12b)
        // C5 gate: exact worst-case reservation + immediate premium flows,
        // checked against fully-resolved leg prices (no estimates).
        const funds = quoteFunds(availableCash, resolvedLegs, account.leverage);
        if (!funds.affordable) {
          setOrderError(funds.error);
          return;
        }
        setOrderError(null);

        // Phase B — all legs resolved cleanly; only now do we persist.
        await fillPositions(resolvedLegs);
      });
    },
    [
      account,
      optionsChain,
      currentPrice,
      getCalendarDate,
      fillPositions,
      availableCash,
    ],
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

  // MG-13

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
    reserved,
    availableCash,
    leverage,
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
