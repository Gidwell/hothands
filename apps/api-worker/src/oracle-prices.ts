import {
  createPredictOraclePriceClient,
  type PredictOraclePricePoint
} from "@hot-hands/indexer";

export interface OraclePriceChartProjection {
  source: "live_testnet";
  market: "BTC-USD";
  oracleId: string;
  title: string;
  detail: string;
  latestPrice: number | null;
  points: OraclePriceChartPoint[];
}

export interface OraclePriceChartPoint {
  timestampMs: number;
  price: number;
  forwardPrice?: number;
  checkpoint?: number;
}

export interface OraclePriceHistoryOptions {
  fetchImpl?: typeof fetch;
  oracleId: string;
}

export async function getTestnetOraclePrices({
  fetchImpl = fetch,
  oracleId
}: OraclePriceHistoryOptions): Promise<OraclePriceChartProjection> {
  const client = createPredictOraclePriceClient({ fetchImpl });
  const points = (await client.listOraclePrices(oracleId)).map(mapOraclePricePoint);
  const latestPoint = points.at(-1) ?? null;

  return {
    source: "live_testnet",
    market: "BTC-USD",
    oracleId,
    title: "DeepBook BTC oracle price",
    detail: "DeepBook Predict oracle price used for BTC market settlement.",
    latestPrice: latestPoint?.price ?? null,
    points
  };
}

function mapOraclePricePoint(point: PredictOraclePricePoint): OraclePriceChartPoint {
  return {
    timestampMs: point.timestampMs,
    price: normalizePredictPrice(point.spot),
    ...(point.forward === undefined ? {} : { forwardPrice: normalizePredictPrice(point.forward) }),
    ...(point.checkpoint === undefined ? {} : { checkpoint: point.checkpoint })
  };
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
