"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Bar } from "@/lib/market/types";

function toCandle(bar: Bar) {
  return {
    time: bar.time as UTCTimestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

export default function CandlestickChart({
  closedBars,
  formingBar,
}: {
  closedBars: Bar[];
  formingBar: Bar | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: "#0a0a0c" }, textColor: "#8b8b96" },
      grid: {
        vertLines: { color: "#1a1a20" },
        horzLines: { color: "#1a1a20" },
      },
      width: container.clientWidth,
      height: 420,
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    function handleResize() {
      if (container) chart.applyOptions({ width: container.clientWidth });
    }
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    seriesRef.current?.setData(closedBars.map(toCandle));
  }, [closedBars]);

  useEffect(() => {
    if (formingBar) seriesRef.current?.update(toCandle(formingBar));
  }, [formingBar]);

  return <div ref={containerRef} className="card p-2" />;
}
