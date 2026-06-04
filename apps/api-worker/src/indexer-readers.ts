import {
  createPostgresPredictIndexerReader,
  createPostgresPredictIndexerStore,
  startDeepBookPredictPricePoller,
  type DeepBookPredictPricePoller,
  type DeepBookPredictPricePollerOptions,
  type OraclePriceStats,
  type PredictIndexerReader,
  type PredictOraclePricePoint,
} from "@hot-hands/indexer";
import {
  createPostgresSqlClient,
  type PostgresSqlClient,
} from "@hot-hands/indexer/src/postgres-client";
import type {
  IndexedOraclePriceHistory,
  IndexedOraclePriceHistoryLoader,
} from "./oracle-prices";

export type IndexerReaders = {
  indexedOraclePriceHistoryLoader: IndexedOraclePriceHistoryLoader;
  reader: PredictIndexerReader;
  close(): Promise<void>;
  startPricePoller(
    options?: Pick<
      DeepBookPredictPricePollerOptions,
      "fetchImpl" | "intervalMs" | "onError" | "onPoll"
    >,
  ): DeepBookPredictPricePoller;
};

export function createIndexerReadersFromDatabaseUrl(databaseUrl: string): IndexerReaders {
  const client = createPostgresSqlClient({ databaseUrl });
  return createIndexerReadersFromSqlClient(client);
}

export function createIndexerReadersFromSqlClient(client: PostgresSqlClient): IndexerReaders {
  const reader = createPostgresPredictIndexerReader({ execute: client.execute });
  const writer = createPostgresPredictIndexerStore({ execute: client.execute });

  return {
    reader,
    indexedOraclePriceHistoryLoader: async ({ oracleId, maxPoints }) => {
      const points = await reader.listOraclePrices({
        oracleId,
        maxPoints,
        maxRawPoints: Math.max(maxPoints, 250_000),
      });
      const latestPrice = await reader.getLatestOraclePrice(oracleId);
      const stats = await reader.getOraclePriceStats(oracleId);

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
    },
    close: client.close,
    startPricePoller: (options = {}) =>
      startDeepBookPredictPricePoller({
        reader,
        writer,
        ...options,
      }),
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
