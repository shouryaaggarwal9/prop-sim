// lib/market/useMarketReplay.ts
import { useEffect, useRef, useState, useMemo } from "react";
import type { Bar } from "./types";

interface ReplayState {
  barIndex: number;
  subIndex: number;
  closedBars: Bar[];
  formingBar: Bar | null;
  isDone: boolean;
}

/** Interpolates N continuous 1-second price ticks through Open -> High -> Low -> Close */
function generateIntraTicks(bar: Bar, totalTicks = 60): number[] {
  const { open, high, low, close } = bar;
  const keyPoints = [open, high, low, close];
  const ticks: number[] = [];
  const segments = keyPoints.length - 1;
  const ticksPerSegment = Math.floor(totalTicks / segments);

  for (let s = 0; s < segments; s++) {
    const start = keyPoints[s];
    const end = keyPoints[s + 1];
    for (let i = 0; i < ticksPerSegment; i++) {
      const progress = i / ticksPerSegment;
      // Add subtle sub-penny organic jitter
      const noise = (Math.random() - 0.5) * 0.04;
      const price = start + (end - start) * progress + noise;
      ticks.push(Math.round(price * 100) / 100);
    }
  }
  ticks.push(close);
  return ticks;
}

export function useMarketReplay(
  bars: Bar[],
  opts: {
    tickMs: number; // e.g. 1000ms = 1 price tick per second
    ticksPerCandle?: number; // e.g. 60 ticks = 1 minute candle, 300 ticks = 5 minute candle
    startBarIndex?: number;
  },
) {
  const ticksPerCandle = opts.ticksPerCandle ?? 60; // 60 ticks per candle default

  const [state, setState] = useState<ReplayState>({
    barIndex: 0,
    subIndex: 0,
    closedBars: [],
    formingBar: null,
    isDone: false,
  });

  const barsRef = useRef(bars);
  barsRef.current = bars;

  // Pre-generate rich intra-bar ticks for all bars
  const enrichedBars = useMemo(() => {
    return bars.map((b) => ({
      ...b,
      ticks: generateIntraTicks(b, ticksPerCandle),
    }));
  }, [bars, ticksPerCandle]);

  const enrichedRef = useRef(enrichedBars);
  enrichedRef.current = enrichedBars;

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
  }, [bars]);

  useEffect(() => {
    if (enrichedBars.length === 0) return;

    const timer = setInterval(() => {
      setState((prev) => {
        if (prev.isDone) return prev;
        const currentBars = enrichedRef.current;
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
  }, [enrichedBars, opts.tickMs]);

  return state;
}
