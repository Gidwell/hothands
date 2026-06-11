import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  TickMarkType,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { OraclePriceChart, OraclePriceChartPoint } from "./oraclePriceChartModel";
import { formatUtcTimeZoneText } from "./timeZoneLabels";

const COMPACT_CHART_MIN_BAR_SPACING = 0.02;
const EXPANDED_CHART_MIN_BAR_SPACING = 0.02;
const COMPACT_CHART_DEFAULT_WINDOW_SECONDS = 15 * 60;
const EXPANDED_CHART_DEFAULT_WINDOW_SECONDS = 6 * 60 * 60;
const EXPIRY_AXIS_PADDING_SECONDS = 15 * 60;

export type OraclePriceChartRangeKey = "1H" | "6H" | "24H";

export type OraclePriceChartMarketContext = {
  expiryLabel: string;
  expiryMs: number;
  selectedSide: "UP" | "DOWN";
  selectedStrikeLabel: string;
  selectedStrikePrice: number;
  strikes: OraclePriceChartStrike[];
  timeRemainingLabel: string;
};

export type OraclePriceChartStrike = {
  id: string;
  label: string;
  price: number;
  selected: boolean;
};

type OracleChartOverlayState = {
  expiryX: number | null;
  strikeY: number | null;
};

type OracleChartTone = "positive" | "negative" | "flat";

const ORACLE_PRICE_CHART_RANGES: {
  key: OraclePriceChartRangeKey;
  label: string;
  seconds: number;
}[] = [
  { key: "1H", label: "1H", seconds: 60 * 60 },
  { key: "6H", label: "6H", seconds: EXPANDED_CHART_DEFAULT_WINDOW_SECONDS },
  { key: "24H", label: "24H", seconds: 24 * 60 * 60 },
];

type OraclePriceChartInitialView =
  | {
      mode: "fit-content";
    }
  | {
      from: UTCTimestamp;
      mode: "time-range";
      to: UTCTimestamp;
    };

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
  const changeSummary = hasChart ? buildOracleChangeSummary(chart.points) : null;

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
      </span>
      {hasChart ? (
        <div className="oracle-mini-chart-visual">
          <LightweightOraclePriceChart
            points={chart.points}
            compact
            fitResetKey={chart.oracleId}
            height={52}
            lineTone={changeSummary?.tone ?? "flat"}
          />
          {changeSummary ? (
            <span
              className={`oracle-mini-chart-change oracle-mini-chart-change-${changeSummary.tone}`}
              data-testid="oracle-mini-chart-change"
            >
              <strong>{changeSummary.label}</strong>
              <small>24h</small>
            </span>
          ) : null}
        </div>
      ) : (
        <span className="oracle-chart-empty">Waiting for price history</span>
      )}
    </button>
  );
}

function buildOracleChangeSummary(points: OraclePriceChartPoint[]): {
  label: string;
  tone: OracleChartTone;
} | null {
  const latestPoint = points.at(-1);
  if (!latestPoint || latestPoint.price <= 0) {
    return null;
  }

  const dayAgoMs = latestPoint.timestampMs - 24 * 60 * 60 * 1000;
  const comparisonPoint = points.find((point) => point.timestampMs >= dayAgoMs) ?? points[0];
  if (!comparisonPoint || comparisonPoint.price <= 0) {
    return null;
  }

  const change = (latestPoint.price - comparisonPoint.price) / comparisonPoint.price;
  const percent = change * 100;
  const tone = percent > 0.005 ? "positive" : percent < -0.005 ? "negative" : "flat";

  return {
    label: `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`,
    tone,
  };
}

function getOracleLineColor(compact: boolean, tone: OracleChartTone): string {
  if (!compact) {
    return "#8b6cff";
  }

  if (tone === "negative") {
    return "#ef4444";
  }

  if (tone === "positive") {
    return "#16a34a";
  }

  return "#8b6cff";
}

export function OraclePriceChartModal({
  chart,
  children,
  marketContext = null,
  nowMs = Date.now(),
  onClose,
}: {
  chart: OraclePriceChart | null;
  children?: ReactNode;
  marketContext?: OraclePriceChartMarketContext | null;
  nowMs?: number;
  onClose: () => void;
}) {
  const [rangeKey, setRangeKey] = useState<OraclePriceChartRangeKey>("6H");
  const [showSettlementLines, setShowSettlementLines] = useState(true);
  const hasChart = chart?.status === "ready" && chart.points.length >= 2;
  const visibleMarketContext = showSettlementLines ? marketContext : null;
  const activeRange =
    ORACLE_PRICE_CHART_RANGES.find((range) => range.key === rangeKey) ??
    ORACLE_PRICE_CHART_RANGES[1];
  const heading = marketContext
    ? `${chart?.marketLabel ?? "BTC/USD"} market chart`
    : chart?.title ?? "DeepBook BTC oracle price";
  const detail = marketContext
    ? `${marketContext.selectedSide} ${marketContext.selectedStrikeLabel} settles ${marketContext.expiryLabel}.`
    : "DeepBook oracle settlement feed.";

  return (
    <div className="oracle-chart-modal" role="dialog" aria-modal="true" aria-labelledby="oracle-chart-title">
      <div className="oracle-chart-modal-panel">
        <div className="oracle-chart-modal-header">
          <div>
            <span>{chart?.marketLabel ?? "BTC/USD"}</span>
            <h2 id="oracle-chart-title">{heading}</h2>
            <p>{detail}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close BTC oracle chart">
            Close
          </button>
        </div>
        <div className="oracle-chart-modal-meta">
          <strong>{chart?.latestPriceLabel ?? "No price yet"}</strong>
        </div>
        <div className="oracle-chart-toolbar" aria-label="Oracle chart controls">
          <div className="oracle-chart-range-controls" aria-label="Oracle chart range">
            {ORACLE_PRICE_CHART_RANGES.map((range) => (
              <button
                type="button"
                aria-pressed={range.key === rangeKey}
                data-testid={`oracle-chart-range-${range.key}`}
                key={range.key}
                onClick={() => setRangeKey(range.key)}
              >
                {range.label}
              </button>
            ))}
          </div>
          {marketContext ? (
            <button
              type="button"
              className="oracle-chart-settlement-toggle"
              aria-pressed={showSettlementLines}
              data-testid="oracle-chart-settlement-toggle"
              onClick={() => setShowSettlementLines((shown) => !shown)}
            >
              Settlement
            </button>
          ) : null}
        </div>
        <div className="oracle-expanded-chart" data-testid="oracle-expanded-chart">
          {hasChart ? (
            <LightweightOraclePriceChart
              points={chart.points}
              fitResetKey={buildOraclePriceChartFitResetKey({
                oracleId: chart.oracleId,
                rangeKey,
              })}
              height={320}
              marketContext={visibleMarketContext}
              nowMs={nowMs}
              rangeSeconds={activeRange.seconds}
            />
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

export function buildOraclePriceChartFitResetKey({
  oracleId,
  rangeKey,
}: {
  oracleId: string;
  rangeKey?: OraclePriceChartRangeKey;
}): string {
  return rangeKey ? `${oracleId}:${rangeKey}` : oracleId;
}

function LightweightOraclePriceChart({
  compact = false,
  fitResetKey,
  height,
  lineTone = "flat",
  marketContext = null,
  nowMs = Date.now(),
  points,
  rangeSeconds,
}: {
  compact?: boolean;
  fitResetKey?: string;
  height: number;
  lineTone?: OracleChartTone;
  marketContext?: OraclePriceChartMarketContext | null;
  nowMs?: number;
  points: OraclePriceChartPoint[];
  rangeSeconds?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const hasFitInitialDataRef = useRef(false);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [overlayState, setOverlayState] = useState<OracleChartOverlayState>({
    expiryX: null,
    strikeY: null,
  });
  const data = useMemo(() => buildLineData(points), [points]);
  const lineColor = getOracleLineColor(compact, lineTone);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
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
      localization: {
        timeFormatter: formatCrosshairLocalTime,
      },
      grid: {
        vertLines: { visible: !compact, color: "#eef3f8" },
        horzLines: { visible: !compact, color: "#eef3f8" },
      },
      crosshair: {
        mode: CrosshairMode.Hidden,
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      rightPriceScale: {
        visible: !compact,
        borderVisible: false,
      },
      timeScale: {
        visible: !compact,
        borderVisible: false,
        minBarSpacing: getOraclePriceChartMinBarSpacing({ compact }),
        timeVisible: true,
        secondsVisible: true,
        tickMarkFormatter: formatTickMarkLocalTime,
      },
      handleScale: !compact,
      handleScroll: !compact,
    });

    const series = chart.addSeries(LineSeries, {
      color: lineColor,
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: !compact,
      priceLineVisible: !compact,
      priceFormat: {
        type: "custom",
        formatter: formatOracleAxisPrice,
        minMove: 1,
      },
      priceLineColor: lineColor,
      priceLineStyle: LineStyle.Solid,
      priceLineWidth: 1,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    hasFitInitialDataRef.current = false;

    return () => {
      chartRef.current = null;
      priceLinesRef.current = [];
      seriesRef.current = null;
      hasFitInitialDataRef.current = false;
      setOverlayState({ expiryX: null, strikeY: null });
      chart.remove();
    };
  }, [compact, height, lineColor]);

  useEffect(() => {
    hasFitInitialDataRef.current = false;
  }, [fitResetKey]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || data.length < 2) {
      return;
    }

    series.setData(data);
    syncOracleMarketPriceLines(series, priceLinesRef, marketContext, compact);

    if (
      shouldAutoFitOraclePriceChart({
        compact,
        hasFitInitialData: hasFitInitialDataRef.current,
        pointCount: data.length,
      })
    ) {
      const initialView = getInitialOraclePriceChartView({
        compact,
        expiryTime: marketContext?.expiryMs,
        pointTimes: data.map((point) => point.time),
        rangeSeconds,
      });

      if (initialView.mode === "time-range") {
        chart.timeScale().setVisibleRange({
          from: initialView.from,
          to: initialView.to,
        });
      } else {
        chart.timeScale().fitContent();
      }
      hasFitInitialDataRef.current = true;
    }

    const updateOverlay = () => {
      const container = containerRef.current;
      const selectedStrike = marketContext?.selectedStrikePrice;
      const expirySeconds = marketContext
        ? Math.floor(marketContext.expiryMs / 1_000)
        : null;

      setOverlayState({
        expiryX:
          expirySeconds === null
            ? null
            : getOracleTimeCoordinate(chart, expirySeconds as UTCTimestamp, container),
        strikeY:
          selectedStrike === undefined
            ? null
            : series.priceToCoordinate(selectedStrike),
      });
    };

    updateOverlay();
    const handleVisibleRangeChange = () => updateOverlay();
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    };
  }, [compact, data, marketContext, rangeSeconds]);

  const canShowMarketOverlay =
    !compact &&
    marketContext !== null &&
    overlayState.strikeY !== null &&
    overlayState.expiryX !== null;

  return (
    <div className="oracle-chart-shell" style={{ height }}>
      {!compact && marketContext ? (
        <div className="oracle-market-chart-summary" data-testid="oracle-market-chart-summary">
          <strong>
            {marketContext.selectedSide} {marketContext.selectedStrikeLabel}
          </strong>
          <span>{formatOracleExpiryCountdown(marketContext.expiryMs, nowMs)}</span>
        </div>
      ) : null}
      {canShowMarketOverlay ? (
        <div
          className={`oracle-market-zones oracle-market-zones-${marketContext.selectedSide.toLowerCase()}`}
          aria-hidden="true"
          style={{
            "--oracle-expiry-x": `${overlayState.expiryX}px`,
            "--oracle-strike-y": `${overlayState.strikeY}px`,
          } as OracleMarketZoneStyle}
        >
          <div className="oracle-market-zone oracle-market-zone-up">UP</div>
          <div className="oracle-market-zone oracle-market-zone-down">DOWN</div>
          <div className="oracle-expiry-line" />
        </div>
      ) : null}
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

export function shouldAutoFitOraclePriceChart({
  compact,
  hasFitInitialData,
  pointCount,
}: {
  compact: boolean;
  hasFitInitialData: boolean;
  pointCount: number;
}): boolean {
  return pointCount >= 2 && (compact || !hasFitInitialData);
}

export function getOraclePriceChartMinBarSpacing({
  compact,
}: {
  compact: boolean;
}): number {
  return compact
    ? COMPACT_CHART_MIN_BAR_SPACING
    : EXPANDED_CHART_MIN_BAR_SPACING;
}

export function getInitialOraclePriceChartView({
  compact,
  expiryTime,
  pointTimes,
  rangeSeconds,
}: {
  compact: boolean;
  expiryTime?: number;
  pointTimes: number[];
  rangeSeconds?: number;
}): OraclePriceChartInitialView {
  if (pointTimes.length < 2) {
    return { mode: "fit-content" };
  }

  const sortedTimes = pointTimes
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right);
  const firstTime = sortedTimes[0];
  const latestTime = sortedTimes.at(-1);
  if (firstTime === undefined || latestTime === undefined) {
    return { mode: "fit-content" };
  }

  const expirySeconds =
    expiryTime === undefined || !Number.isFinite(expiryTime)
      ? null
      : Math.floor(expiryTime / 1_000);
  const visibleEnd =
    expirySeconds !== null && expirySeconds > latestTime
      ? expirySeconds + EXPIRY_AXIS_PADDING_SECONDS
      : latestTime;
  const historyWindowSeconds =
    rangeSeconds ?? getOraclePriceChartDefaultWindowSeconds({ compact });
  const visibleStart = Math.max(
    firstTime,
    latestTime - historyWindowSeconds,
  );
  if (visibleStart <= firstTime && visibleEnd <= latestTime) {
    return { mode: "fit-content" };
  }

  return {
    mode: "time-range",
    from: visibleStart as UTCTimestamp,
    to: visibleEnd as UTCTimestamp,
  };
}

function getOraclePriceChartDefaultWindowSeconds({
  compact,
}: {
  compact: boolean;
}): number {
  return compact
    ? COMPACT_CHART_DEFAULT_WINDOW_SECONDS
    : EXPANDED_CHART_DEFAULT_WINDOW_SECONDS;
}

function formatCrosshairLocalTime(time: Time): string {
  const date = timeToDate(time);
  if (!date) {
    return "";
  }

  return formatUtcTimeZoneText(new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date));
}

function formatTickMarkLocalTime(time: Time, tickMarkType: TickMarkType): string | null {
  const date = timeToDate(time);
  if (!date) {
    return null;
  }

  if (
    tickMarkType === TickMarkType.Time ||
    tickMarkType === TickMarkType.TimeWithSeconds
  ) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: tickMarkType === TickMarkType.TimeWithSeconds ? "2-digit" : undefined,
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatOracleAxisPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 10_000) {
    return rounded.toLocaleString("en-US");
  }

  return String(rounded);
}

function syncOracleMarketPriceLines(
  series: ISeriesApi<"Line">,
  priceLinesRef: MutableRefObject<IPriceLine[]>,
  marketContext: OraclePriceChartMarketContext | null,
  compact: boolean,
): void {
  for (const priceLine of priceLinesRef.current) {
    series.removePriceLine(priceLine);
  }
  priceLinesRef.current = [];

  if (compact || !marketContext) {
    return;
  }

  for (const strike of marketContext.strikes) {
    const color = strike.selected ? "#3ed982" : "rgba(62, 217, 130, 0.42)";
    priceLinesRef.current.push(
      series.createPriceLine({
        axisLabelColor: strike.selected ? "#16a34a" : "rgba(20, 83, 45, 0.92)",
        axisLabelTextColor: "#ffffff",
        axisLabelVisible: strike.selected,
        color,
        lineStyle: strike.selected ? LineStyle.Solid : LineStyle.Dashed,
        lineVisible: true,
        lineWidth: strike.selected ? 2 : 1,
        price: strike.price,
        title: strike.selected
          ? `Settlement ${strike.label}`
          : strike.label,
      }),
    );
  }
}

function formatOracleExpiryCountdown(expiryMs: number, nowMs: number): string {
  const remainingMs = Math.max(0, expiryMs - nowMs);
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `settles in ${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `settles in ${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `settles in ${minutes}m`;
  }

  return "settlement due";
}

function getOracleTimeCoordinate(
  chart: IChartApi,
  time: UTCTimestamp,
  container: HTMLDivElement | null,
): number | null {
  const directCoordinate = chart.timeScale().timeToCoordinate(time);
  if (directCoordinate !== null) {
    return directCoordinate;
  }

  const visibleRange = chart.timeScale().getVisibleRange();
  const width = container?.clientWidth ?? 0;
  const from = visibleRange ? timeValueToSeconds(visibleRange.from) : null;
  const to = visibleRange ? timeValueToSeconds(visibleRange.to) : null;
  if (
    width <= 0 ||
    from === null ||
    to === null ||
    to <= from
  ) {
    return null;
  }

  const ratio = (time - from) / (to - from);
  return Math.max(0, Math.min(width, ratio * width));
}

function timeValueToSeconds(time: Time): number | null {
  if (typeof time === "number") {
    return time;
  }

  if (typeof time === "string") {
    const timestamp = Date.parse(time);
    return Number.isFinite(timestamp) ? Math.floor(timestamp / 1_000) : null;
  }

  return Math.floor(new Date(time.year, time.month - 1, time.day).getTime() / 1_000);
}

function timeToDate(time: Time): Date | null {
  if (typeof time === "number") {
    return new Date(time * 1_000);
  }

  if (typeof time === "string") {
    const timestamp = Date.parse(time);
    return Number.isFinite(timestamp) ? new Date(timestamp) : null;
  }

  return new Date(time.year, time.month - 1, time.day);
}

type OracleMarketZoneStyle = CSSProperties & {
  "--oracle-expiry-x": string;
  "--oracle-strike-y": string;
};

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
