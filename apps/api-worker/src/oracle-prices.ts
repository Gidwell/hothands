import {
  createPredictOraclePriceClient,
  type PredictOraclePricePoint
} from "@hot-hands/indexer";

const DEFAULT_ORACLE_PRICE_HISTORY_MAX_POINTS = 10_000;
const MARKET = "BTC-USD";
const TITLE = "DeepBook BTC oracle price";
const DETAIL = "DeepBook Predict oracle price used for BTC market settlement.";

export type OraclePriceHistorySource = "indexed_testnet" | "live_testnet";

export interface OraclePriceChartProjection {
  source: OraclePriceHistorySource;
  market: typeof MARKET;
  oracleId: string;
  title: string;
  detail: string;
  latestPrice: number | null;
  historyRange?: OraclePriceHistoryRange;
  points: OraclePriceChartPoint[];
}

export interface OraclePriceHistoryRange {
  startTimestampMs: number;
  endTimestampMs: number;
  totalPointCount: number;
  returnedPointCount: number;
  maxPoints: number;
  downsampled: boolean;
}

export interface OraclePriceChartPoint {
  timestampMs: number;
  price: number;
  forwardPrice?: number;
  checkpoint?: number;
}

export interface IndexedOraclePriceHistoryRequest {
  oracleId: string;
  market: typeof MARKET;
  maxPoints: number;
}

export interface IndexedOraclePriceHistory {
  points: OraclePriceChartPoint[];
  totalPointCount?: number;
  startTimestampMs?: number;
  endTimestampMs?: number;
  downsampled?: boolean;
  latestPrice?: number | null;
}

export type IndexedOraclePriceHistoryLoader = (
  request: IndexedOraclePriceHistoryRequest
) => Promise<IndexedOraclePriceHistory | null | undefined>;

export interface OraclePriceHistoryOptions {
  fetchImpl?: typeof fetch;
  indexedOraclePriceHistoryLoader?: IndexedOraclePriceHistoryLoader;
  maxPoints?: number;
  oracleId: string;
}

export async function getTestnetOraclePrices({
  fetchImpl = fetch,
  indexedOraclePriceHistoryLoader,
  maxPoints = DEFAULT_ORACLE_PRICE_HISTORY_MAX_POINTS,
  oracleId
}: OraclePriceHistoryOptions): Promise<OraclePriceChartProjection> {
  const requestedMaxPoints = normalizeMaxPoints(maxPoints);
  const indexedProjection = await getIndexedOraclePriceProjection({
    indexedOraclePriceHistoryLoader,
    maxPoints: requestedMaxPoints,
    oracleId
  });
  if (indexedProjection) {
    return indexedProjection;
  }

  const client = createPredictOraclePriceClient({ fetchImpl });
  const points = (await client.listOraclePrices(oracleId, { limit: requestedMaxPoints }))
    .map(mapOraclePricePoint);
  const latestPoint = points.at(-1) ?? null;

  return {
    source: "live_testnet",
    market: MARKET,
    oracleId,
    title: TITLE,
    detail: DETAIL,
    latestPrice: latestPoint?.price ?? null,
    points
  };
}

async function getIndexedOraclePriceProjection({
  indexedOraclePriceHistoryLoader,
  maxPoints,
  oracleId
}: {
  indexedOraclePriceHistoryLoader?: IndexedOraclePriceHistoryLoader;
  maxPoints: number;
  oracleId: string;
}): Promise<OraclePriceChartProjection | null> {
  if (!indexedOraclePriceHistoryLoader) {
    return null;
  }

  try {
    const history = await indexedOraclePriceHistoryLoader({
      market: MARKET,
      maxPoints,
      oracleId
    });
    if (!history) {
      return null;
    }

    const points = normalizeOraclePriceChartPoints(history.points);
    if (points.length === 0) {
      return null;
    }

    const latestPoint = points.at(-1) ?? null;

    return {
      source: "indexed_testnet",
      market: MARKET,
      oracleId,
      title: TITLE,
      detail: DETAIL,
      latestPrice: history.latestPrice ?? latestPoint?.price ?? null,
      historyRange: buildHistoryRange(history, points, maxPoints),
      points
    };
  } catch {
    return null;
  }
}

function mapOraclePricePoint(point: PredictOraclePricePoint): OraclePriceChartPoint {
  return {
    timestampMs: point.timestampMs,
    price: normalizePredictPrice(point.spot),
    ...(point.forward === undefined ? {} : { forwardPrice: normalizePredictPrice(point.forward) }),
    ...(point.checkpoint === undefined ? {} : { checkpoint: point.checkpoint })
  };
}

function normalizeOraclePriceChartPoints(points: OraclePriceChartPoint[]): OraclePriceChartPoint[] {
  return points
    .filter(isUsableOraclePricePoint)
    .map((point) => ({
      timestampMs: point.timestampMs,
      price: roundPrice(point.price),
      ...(point.forwardPrice === undefined ? {} : { forwardPrice: roundPrice(point.forwardPrice) }),
      ...(point.checkpoint === undefined ? {} : { checkpoint: point.checkpoint })
    }))
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

function isUsableOraclePricePoint(point: OraclePriceChartPoint): boolean {
  return (
    Number.isFinite(point.timestampMs) &&
    Number.isFinite(point.price) &&
    point.timestampMs > 0 &&
    point.price > 0
  );
}

function buildHistoryRange(
  history: IndexedOraclePriceHistory,
  points: OraclePriceChartPoint[],
  maxPoints: number
): OraclePriceHistoryRange {
  const firstPoint = points[0];
  const latestPoint = points.at(-1) ?? firstPoint;
  const returnedPointCount = points.length;
  const totalPointCount = positiveInteger(history.totalPointCount) ?? returnedPointCount;

  return {
    startTimestampMs: positiveNumber(history.startTimestampMs) ?? firstPoint.timestampMs,
    endTimestampMs: positiveNumber(history.endTimestampMs) ?? latestPoint.timestampMs,
    totalPointCount,
    returnedPointCount,
    maxPoints,
    downsampled: history.downsampled ?? totalPointCount > returnedPointCount
  };
}

function normalizeMaxPoints(value: number): number {
  return positiveInteger(value) ?? DEFAULT_ORACLE_PRICE_HISTORY_MAX_POINTS;
}

function positiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
}

function positiveNumber(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizePredictPrice(value: number): number {
  if (value >= 1_000_000_000_000) {
    return roundPrice(value / 1_000_000_000);
  }

  if (value >= 1_000_000_000) {
    return roundPrice(value / 1_000_000);
  }

  return roundPrice(value);
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}
