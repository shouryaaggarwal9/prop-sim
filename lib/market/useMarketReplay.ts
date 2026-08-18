import { useEffect, useRef, useState } from "react";
import type { Bar } from "./types";

interface ReplayState {
  barIndex: number;
  subIndex: number;
  closedBars: Bar[];
  formingBar: Bar | null;
  isDone: boolean;
}

/** Ticks through `bars` one sub-tick at a time, building a live "forming" candle
 *  out of each bar's precomputed intra-bar ticks before committing it to closedBars
 *  and moving to the next bar.
 *
 *  Resumes from `startBarIndex` instead of always starting at bar 0 — since
 *  `bars` is deterministically regenerated from a seed, resuming only needs
 *  the index to pick back up from, not any persisted candle data.
 *
 *  IMPORTANT: the reset effect below deliberately does NOT list `startBarIndex`
 *  in its dependency array — only `bars`. `startBarIndex` is typically backed
 *  by a value the caller persists continuously during live play (see
 *  useAccount's replay_bar_index sync). If this effect reacted to every
 *  change in that value, every persisted write would re-trigger a full reset
 *  — wiping the in-flight forming candle back to null and causing currentPrice
 *  to visibly jump to bars[0].open until ticking rebuilds it. `startBarIndex`
 *  is read once, when `bars` itself changes (i.e. a genuinely different
 *  series — new account, or the initial load). Do not add it back without
 *  re-solving that problem first. */
export function useMarketReplay(
  bars: Bar[],
  opts: { tickMs: number; startBarIndex?: number },
) {
  const [state, setState] = useState<ReplayState>({
    barIndex: 0,
    subIndex: 0,
    closedBars: [],
    formingBar: null,
    isDone: false,
  });
  const barsRef = useRef(bars);
  barsRef.current = bars;

  useEffect(() => {
    if (bars.length === 0) {
      setState({
        barIndex: 0,
        subIndex: 0,
        closedBars: [],
        formingBar: null,
        isDone: true,
      });
      return;
    }
    const resumeAt = Math.min(
      Math.max(0, opts.startBarIndex ?? 0),
      bars.length,
    );
    setState({
      barIndex: resumeAt,
      subIndex: 0,
      closedBars: bars.slice(0, resumeAt),
      formingBar: null,
      isDone: resumeAt >= bars.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars]);

  useEffect(() => {
    if (bars.length === 0) return;
    const timer = setInterval(() => {
      setState((prev) => {
        if (prev.isDone) return prev;
        const currentBars = barsRef.current;
        const bar = currentBars[prev.barIndex];
        if (!bar) return { ...prev, isDone: true };

        const nextSub = prev.subIndex + 1;
        const upto = bar.ticks.slice(0, nextSub + 1);
        const forming: Bar = {
          time: bar.time,
          open: upto[0],
          close: upto[upto.length - 1],
          high: Math.max(...upto),
          low: Math.min(...upto),
          ticks: upto,
        };

        const barClosed = nextSub >= bar.ticks.length - 1;
        if (!barClosed) {
          return { ...prev, subIndex: nextSub, formingBar: forming };
        }

        const nextBarIndex = prev.barIndex + 1;
        return {
          barIndex: nextBarIndex,
          subIndex: 0,
          closedBars: [...prev.closedBars, forming],
          formingBar: forming,
          isDone: nextBarIndex >= currentBars.length,
        };
      });
    }, opts.tickMs);
    return () => clearInterval(timer);
  }, [bars, opts.tickMs]);

  return state;
}
