export type OraclePriceChartStatus = "ready" | "unavailable";

export type OraclePriceChartPoint = {
  timestampMs: number;
  price: number;
  forwardPrice?: number;
  checkpoint?: number;
};

export type OraclePriceChartHistoryRange = {
  startTimestampMs: number;
  endTimestampMs: number;
  totalPointCount: number;
  returnedPointCount: number;
  maxPoints: number;
  downsampled: boolean;
};

export type OraclePriceChart = {
  status: OraclePriceChartStatus;
  oracleId: string;
  marketLabel: "BTC/USD";
  sourceLabel: string;
  title: string;
  detail: string;
  latestPriceLabel: string | null;
  historyRange?: OraclePriceChartHistoryRange;
  points: OraclePriceChartPoint[];
};

export type LoadOraclePriceChartOptions = {
  apiBaseUrl?: string;
  endTimestampMs?: number;
  maxPoints?: number;
  oracleId: string;
  startTimestampMs?: number;
  fetcher?: typeof fetch;
};

export type LoadOraclePriceChartTickOptions = LoadOraclePriceChartOptions & {
  chart: OraclePriceChart | null;
};

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8789";
const ORACLE_CHART_MAX_POINTS = 10_000;

export async function loadOraclePriceChart({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  endTimestampMs,
  maxPoints = ORACLE_CHART_MAX_POINTS,
  oracleId,
  startTimestampMs,
  fetcher = fetch,
}: LoadOraclePriceChartOptions): Promise<OraclePriceChart> {
  try {
    const response = await fetcher(
      buildOraclePriceChartUrl(apiBaseUrl, {
        endTimestampMs,
        maxPoints,
        oracleId,
        startTimestampMs,
      }),
    );
    if (!response.ok) {
      return buildUnavailableOraclePriceChart(oracleId);
    }

    return buildOraclePriceChartFromPayload(await response.json(), oracleId);
  } catch {
    return buildUnavailableOraclePriceChart(oracleId);
  }
}

export async function loadOraclePriceChartTick({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  oracleId,
  chart,
  fetcher = fetch,
}: LoadOraclePriceChartTickOptions): Promise<OraclePriceChart | null> {
  if (!chart || chart.status !== "ready" || chart.oracleId !== oracleId) {
    return chart;
  }

  try {
    const response = await fetcher(buildPriceSnapshotUrl(apiBaseUrl));
    if (!response.ok) {
      return chart;
    }

    const tick = parseOraclePriceTickFromSnapshot(await response.json(), oracleId);
    if (!tick) {
      return chart;
    }

    return mergeOraclePriceChartTick(chart, tick);
  } catch {
    return chart;
  }
}

export function buildOraclePriceChartFromTick(
  oracleId: string,
  tick: OraclePriceChartPoint,
): OraclePriceChart {
  return {
    status: "ready",
    oracleId,
    marketLabel: "BTC/USD",
    sourceLabel: "Indexed Testnet",
    title: "DeepBook BTC oracle price",
    detail: "DeepBook Predict oracle price used for BTC market settlement.",
    latestPriceLabel: formatUsdPrice(tick.price),
    points: [tick],
  };
}

export function shouldLoadOraclePriceChartHistory({
  apiBaseUrl,
  isOpen,
  oracleId,
}: {
  apiBaseUrl?: string | null;
  isOpen: boolean;
  oracleId?: string | null;
}): boolean {
  return Boolean(isOpen && apiBaseUrl?.trim() && oracleId?.trim());
}

function buildOraclePriceChartFromPayload(payload: unknown, oracleId: string): OraclePriceChart {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const points = parseOraclePriceChartPoints(record.points);
  const latestPrice = numberValue(record.latestPrice);
  const latestPointPrice = points.at(-1)?.price;
  const latestPriceLabel = formatUsdPrice(
    latestPrice && latestPrice > 0 ? latestPrice : latestPointPrice,
  );
  const historyRange = parseOraclePriceChartHistoryRange(record.historyRange);

  if (points.length < 2) {
    return buildUnavailableOraclePriceChart(oracleId);
  }

  return {
    status: "ready",
    oracleId: stringValue(record.oracleId) ?? oracleId,
    marketLabel: "BTC/USD",
    sourceLabel: formatSourceLabel(record.source),
    title: stringValue(record.title) ?? "DeepBook BTC oracle price",
    detail:
      stringValue(record.detail) ??
      "DeepBook Predict oracle price used for BTC market settlement.",
    latestPriceLabel,
    ...(historyRange === undefined ? {} : { historyRange }),
    points,
  };
}

function buildUnavailableOraclePriceChart(oracleId: string): OraclePriceChart {
  return {
    status: "unavailable",
    oracleId,
    marketLabel: "BTC/USD",
    sourceLabel: "Live Testnet",
    title: "DeepBook BTC oracle price",
    detail: "Waiting for DeepBook oracle price history.",
    latestPriceLabel: null,
    points: [],
  };
}

function parseOraclePriceChartPoints(value: unknown): OraclePriceChartPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(parseOraclePriceChartPoint)
    .filter((point): point is OraclePriceChartPoint => point !== null)
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

function parseOraclePriceChartPoint(value: unknown): OraclePriceChartPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const timestampMs = numberValue(record.timestampMs);
  const price = numberValue(record.price);
  if (
    timestampMs === undefined ||
    price === undefined ||
    timestampMs <= 0 ||
    price <= 0
  ) {
    return null;
  }

  const forwardPrice = numberValue(record.forwardPrice);
  const checkpoint = numberValue(record.checkpoint);

  return {
    timestampMs,
    price,
    ...(forwardPrice === undefined ? {} : { forwardPrice }),
    ...(checkpoint === undefined ? {} : { checkpoint }),
  };
}

function buildOraclePriceChartUrl(
  apiBaseUrl: string,
  {
    endTimestampMs,
    maxPoints,
    oracleId,
    startTimestampMs,
  }: {
    endTimestampMs?: number;
    maxPoints: number;
    oracleId: string;
    startTimestampMs?: number;
  },
): string {
  const url = new URL("/testnet/oracle-prices", normalizeBaseUrl(apiBaseUrl));
  url.searchParams.set("oracleId", oracleId);
  url.searchParams.set("maxPoints", String(maxPoints));
  if (isPositiveFiniteNumber(startTimestampMs)) {
    url.searchParams.set("startTimestampMs", String(Math.floor(startTimestampMs)));
  }
  if (isPositiveFiniteNumber(endTimestampMs)) {
    url.searchParams.set("endTimestampMs", String(Math.floor(endTimestampMs)));
  }

  return url.toString();
}

function buildPriceSnapshotUrl(apiBaseUrl: string): string {
  return new URL("/testnet/price-snapshot", normalizeBaseUrl(apiBaseUrl)).toString();
}

function parseOraclePriceTickFromSnapshot(
  payload: unknown,
  oracleId: string,
): OraclePriceChartPoint | null {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const markets = Array.isArray(record.markets) ? record.markets : [];
  const matchingMarket = markets.find((market) => {
    if (!market || typeof market !== "object") {
      return false;
    }

    return stringValue((market as Record<string, unknown>).oracleId) === oracleId;
  });

  if (!matchingMarket || typeof matchingMarket !== "object") {
    return null;
  }

  const market = matchingMarket as Record<string, unknown>;
  const pricingModel =
    market.pricingModel && typeof market.pricingModel === "object"
      ? (market.pricingModel as Record<string, unknown>)
      : {};
  const timestampMs =
    numberValue(market.latestPriceTimestampMs) ?? numberValue(pricingModel.timestampMs);
  const price = numberValue(market.latestPrice);
  if (
    timestampMs === undefined ||
    price === undefined ||
    timestampMs <= 0 ||
    price <= 0
  ) {
    return null;
  }

  const forwardPrice = numberValue(pricingModel.forwardPrice);
  const checkpoint = numberValue(market.latestPriceCheckpoint);

  return {
    timestampMs,
    price,
    ...(forwardPrice === undefined ? {} : { forwardPrice }),
    ...(checkpoint === undefined ? {} : { checkpoint }),
  };
}

export function mergeOraclePriceChartTick(
  chart: OraclePriceChart,
  tick: OraclePriceChartPoint,
): OraclePriceChart {
  const tickSecond = Math.floor(tick.timestampMs / 1000);
  const hadTick = chart.points.some(
    (point) => Math.floor(point.timestampMs / 1000) === tickSecond,
  );
  const points = [
    ...chart.points.filter(
      (point) => Math.floor(point.timestampMs / 1000) !== tickSecond,
    ),
    tick,
  ]
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .slice(-ORACLE_CHART_MAX_POINTS);
  const latestPoint = points.at(-1);
  const historyRange =
    chart.historyRange === undefined
      ? undefined
      : {
          ...chart.historyRange,
          startTimestampMs: points[0]?.timestampMs ?? chart.historyRange.startTimestampMs,
          endTimestampMs: Math.max(
            chart.historyRange.endTimestampMs,
            latestPoint?.timestampMs ?? chart.historyRange.endTimestampMs,
          ),
          returnedPointCount: points.length,
          totalPointCount: Math.max(
            chart.historyRange.totalPointCount + (hadTick ? 0 : 1),
            points.length,
          ),
        };

  return {
    ...chart,
    latestPriceLabel: formatUsdPrice(latestPoint?.price),
    ...(historyRange === undefined ? {} : { historyRange }),
    points,
  };
}

function normalizeBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
}

function formatSourceLabel(value: unknown): string {
  const source = stringValue(value);
  if (source === "live_testnet") {
    return "Live Testnet";
  }

  if (source === "indexed_testnet") {
    return "Indexed Testnet";
  }

  return "DeepBook";
}

function formatUsdPrice(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function parseOraclePriceChartHistoryRange(
  value: unknown,
): OraclePriceChartHistoryRange | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const startTimestampMs = numberValue(record.startTimestampMs);
  const endTimestampMs = numberValue(record.endTimestampMs);
  const totalPointCount = numberValue(record.totalPointCount);
  const returnedPointCount = numberValue(record.returnedPointCount);
  const maxPoints = numberValue(record.maxPoints);
  const downsampled = booleanValue(record.downsampled);
  if (
    startTimestampMs === undefined ||
    endTimestampMs === undefined ||
    totalPointCount === undefined ||
    returnedPointCount === undefined ||
    maxPoints === undefined ||
    downsampled === undefined ||
    startTimestampMs <= 0 ||
    endTimestampMs <= 0 ||
    totalPointCount < 0 ||
    returnedPointCount < 0 ||
    maxPoints <= 0
  ) {
    return undefined;
  }

  return {
    startTimestampMs,
    endTimestampMs,
    totalPointCount,
    returnedPointCount,
    maxPoints,
    downsampled,
  };
}
