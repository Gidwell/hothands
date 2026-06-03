import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { OraclePriceChart, OraclePriceChartPoint } from "./oraclePriceChartModel";

export function OraclePriceChartCard({
  chart,
  fallbackPriceLabel,
  onOpen,
}: {
  chart: OraclePriceChart | null;
  fallbackPriceLabel: string;
  onOpen: () => void;
}) {
  const hasChart = chart?.status === "ready" && chart.points.length >= 2;
  const priceLabel = chart?.latestPriceLabel ?? fallbackPriceLabel;

  return (
    <button
      type="button"
      className="oracle-mini-chart"
      data-testid="oracle-mini-chart"
      onClick={onOpen}
    >
      <span className="oracle-mini-chart-copy">
        <span>BTC/USD</span>
        <strong>{priceLabel}</strong>
        <em>DeepBook oracle price</em>
      </span>
      {hasChart ? (
        <LightweightOraclePriceChart points={chart.points} compact height={52} />
      ) : (
        <span className="oracle-chart-empty">Waiting for price history</span>
      )}
    </button>
  );
}

export function OraclePriceChartModal({
  chart,
  children,
  onClose,
}: {
  chart: OraclePriceChart | null;
  children?: ReactNode;
  onClose: () => void;
}) {
  const hasChart = chart?.status === "ready" && chart.points.length >= 2;

  return (
    <div className="oracle-chart-modal" role="dialog" aria-modal="true" aria-labelledby="oracle-chart-title">
      <div className="oracle-chart-modal-panel">
        <div className="oracle-chart-modal-header">
          <div>
            <span>{chart?.marketLabel ?? "BTC/USD"}</span>
            <h2 id="oracle-chart-title">{chart?.title ?? "DeepBook BTC oracle price"}</h2>
            <p>{chart?.detail ?? "DeepBook Predict oracle price used for BTC market settlement."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close BTC oracle chart">
            Close
          </button>
        </div>
        <div className="oracle-chart-modal-meta">
          <span>{chart?.sourceLabel ?? "Live Testnet"}</span>
          <strong>{chart?.latestPriceLabel ?? "No price yet"}</strong>
        </div>
        <div className="oracle-expanded-chart" data-testid="oracle-expanded-chart">
          {hasChart ? (
            <LightweightOraclePriceChart points={chart.points} height={320} />
          ) : (
            <div className="oracle-chart-modal-empty">Waiting for DeepBook oracle price history.</div>
          )}
        </div>
        {children ? (
          <div className="oracle-chart-expanded-actions" data-testid="expanded-chart-actions">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LightweightOraclePriceChart({
  compact = false,
  height,
  points,
}: {
  compact?: boolean;
  height: number;
  points: OraclePriceChartPoint[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const data = useMemo(() => buildLineData(points), [points]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.length < 2) {
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      height,
      layout: {
        attributionLogo: false,
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: compact ? "transparent" : "#667085",
      },
      grid: {
        vertLines: { visible: !compact, color: "#eef3f8" },
        horzLines: { visible: !compact, color: "#eef3f8" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { visible: !compact },
        horzLine: { visible: !compact },
      },
      rightPriceScale: {
        visible: !compact,
        borderVisible: false,
      },
      timeScale: {
        visible: !compact,
        borderVisible: false,
        timeVisible: true,
      },
      handleScale: !compact,
      handleScroll: !compact,
    });

    const series = chart.addSeries(LineSeries, {
      color: "#16a34a",
      lineWidth: compact ? 2 : 3,
      crosshairMarkerVisible: !compact,
      lastValueVisible: !compact,
      priceLineVisible: !compact,
    });
    series.setData(data);
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [compact, data, height]);

  return (
    <div className="oracle-chart-shell" style={{ height }}>
      {!compact ? (
        <a
          className="tradingview-chart-mark"
          href="https://tradingview.github.io/lightweight-charts/"
          rel="noreferrer"
          target="_blank"
          aria-label="TradingView Lightweight Charts attribution"
        >
          <span aria-hidden="true">TV</span>
          <strong>TradingView</strong>
        </a>
      ) : null}
      <div ref={containerRef} className="oracle-chart-canvas" style={{ height }} />
    </div>
  );
}

function buildLineData(points: OraclePriceChartPoint[]): LineData<UTCTimestamp>[] {
  const bySecond = new Map<number, number>();

  for (const point of points) {
    if (!Number.isFinite(point.timestampMs) || !Number.isFinite(point.price)) {
      continue;
    }

    bySecond.set(Math.floor(point.timestampMs / 1000), point.price);
  }

  return [...bySecond.entries()]
    .sort(([left], [right]) => left - right)
    .map(([time, value]) => ({
      time: time as UTCTimestamp,
      value,
    }));
}
