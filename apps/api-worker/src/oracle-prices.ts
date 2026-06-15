import {
  createPredictOraclePriceClient,
  type OraclePriceStats,
  type PredictIndexerReader,
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
  endTimestampMs?: number;
  oracleId: string;
  market: typeof MARKET;
  maxPoints: number;
  startTimestampMs?: number;
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
  endTimestampMs?: number;
  fetchImpl?: typeof fetch;
  indexedOraclePriceHistoryLoader?: IndexedOraclePriceHistoryLoader;
  maxPoints?: number;
  oracleId: string;
  startTimestampMs?: number;
}

export async function getTestnetOraclePrices({
  endTimestampMs,
  fetchImpl = fetch,
  indexedOraclePriceHistoryLoader,
  maxPoints = DEFAULT_ORACLE_PRICE_HISTORY_MAX_POINTS,
  oracleId,
  startTimestampMs
}: OraclePriceHistoryOptions): Promise<OraclePriceChartProjection> {
  const requestedMaxPoints = normalizeMaxPoints(maxPoints);
  const requestedStartTimestampMs = positiveNumber(startTimestampMs);
  const requestedEndTimestampMs = positiveNumber(endTimestampMs);
  const indexedProjection = await getIndexedOraclePriceProjection({
    endTimestampMs: requestedEndTimestampMs,
    indexedOraclePriceHistoryLoader,
    maxPoints: requestedMaxPoints,
    oracleId,
    startTimestampMs: requestedStartTimestampMs
  });
  if (indexedProjection) {
    return indexedProjection;
  }

  const client = createPredictOraclePriceClient({ fetchImpl });
  const points = (
    await client.listOraclePrices(oracleId, {
      endTime: requestedEndTimestampMs,
      limit: requestedMaxPoints,
      startTime: requestedStartTimestampMs,
    })
  ).map(mapOraclePricePoint);
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

export function createIndexedOraclePriceHistoryLoader(
  reader: PredictIndexerReader,
): IndexedOraclePriceHistoryLoader {
  return async ({ endTimestampMs, oracleId, maxPoints, startTimestampMs }) => {
    const points = await reader.listOraclePrices({
      fromMs: startTimestampMs,
      oracleId,
      toMs: endTimestampMs,
      maxPoints,
      maxRawPoints: Math.max(maxPoints, 250_000),
    });
    const latestPrice = await reader.getLatestOraclePrice(oracleId);
    const stats =
      startTimestampMs === undefined && endTimestampMs === undefined
        ? await reader.getOraclePriceStats(oracleId)
        : null;

    if (points.length === 0) {
      return null;
    }

    return {
      latestPrice: latestPrice ? normalizePredictPrice(latestPrice.spot) : null,
      ...buildIndexedHistoryStats(points, maxPoints, stats),
      points: points.map((point) => ({
        timestampMs: point.timestampMs,
        price: normalizePredictPrice(point.spot),
        ...(point.forward === undefined
          ? {}
          : { forwardPrice: normalizePredictPrice(point.forward) }),
        ...(point.checkpoint === undefined ? {} : { checkpoint: point.checkpoint }),
      })),
    };
  };
}

async function getIndexedOraclePriceProjection({
  endTimestampMs,
  indexedOraclePriceHistoryLoader,
  maxPoints,
  oracleId,
  startTimestampMs
}: {
  endTimestampMs?: number;
  indexedOraclePriceHistoryLoader?: IndexedOraclePriceHistoryLoader;
  maxPoints: number;
  oracleId: string;
  startTimestampMs?: number;
}): Promise<OraclePriceChartProjection | null> {
  if (!indexedOraclePriceHistoryLoader) {
    return null;
  }

  try {
    const history = await indexedOraclePriceHistoryLoader({
      endTimestampMs,
      market: MARKET,
      maxPoints,
      oracleId,
      startTimestampMs
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

function buildIndexedHistoryStats(
  points: PredictOraclePricePoint[],
  maxPoints: number,
  stats: OraclePriceStats | null,
): Omit<IndexedOraclePriceHistory, "points" | "latestPrice"> {
  const firstPoint = points[0];
  const latestPoint = points.at(-1) ?? firstPoint;
  const totalPointCount = stats?.totalPointCount ?? points.length;

  return {
    startTimestampMs: stats?.startTimestampMs ?? firstPoint.timestampMs,
    endTimestampMs: stats?.endTimestampMs ?? latestPoint.timestampMs,
    totalPointCount,
    downsampled: totalPointCount > points.length,
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
