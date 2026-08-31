"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
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
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
        fontSize: 10,
        fontFamily: "var(--font-mono, monospace)",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.03)" },
        horzLines: { color: "rgba(255, 255, 255, 0.03)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#6366f1",
          width: 1,
          style: 3,
          labelBackgroundColor: "#1e1e27",
        },
        horzLine: {
          color: "#6366f1",
          width: 1,
          style: 3,
          labelBackgroundColor: "#1e1e27",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.08)",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: 360, // Fixed height to guarantee X-axis fits on standard laptop viewports
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width: entry.contentRect.width });
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current && closedBars.length > 0) {
      seriesRef.current.setData(closedBars.map(toCandle));
    }
  }, [closedBars]);

  useEffect(() => {
    if (seriesRef.current && formingBar) {
      seriesRef.current.update(toCandle(formingBar));
    }
  }, [formingBar]);

  const activePrice =
    formingBar?.close ?? closedBars[closedBars.length - 1]?.close;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5 bg-surface-elevated/40">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-text">SPY</span>
          <span className="badge border-border bg-surface text-text-secondary text-[9px] font-mono">
            5M
          </span>
          <span className="text-[10px] text-muted">Synthetic Replay</span>
        </div>
        {activePrice !== undefined && (
          <div className="font-mono text-xs font-bold text-text">
            Mark:{" "}
            <span className="text-emerald-400">${activePrice.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div ref={containerRef} className="w-full p-1" />
    </div>
  );
}
