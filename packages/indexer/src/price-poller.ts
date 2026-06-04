import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  createPredictOraclePriceClient,
  type PredictCanaryConfig,
  type PredictOraclePricePoint,
} from "./deepbook-predict";
import type { PredictIndexerReader } from "./postgres-reader";
import type { PredictIndexerWriter } from "./store";

export type DeepBookPredictPricePollSummary = {
  activeOracleCount: number;
  fetchedPriceCount: number;
  latestCheckpoint?: number;
  latestSourceTimestampMs?: number;
  upsertedPriceCount: number;
};

export type DeepBookPredictPricePollOptions = {
  config?: PredictCanaryConfig;
  fetchImpl?: typeof fetch;
  reader: Pick<PredictIndexerReader, "listBtcOracles">;
  writer: Pick<PredictIndexerWriter, "upsertOraclePrices">;
};

export type DeepBookPredictPricePollerOptions = DeepBookPredictPricePollOptions & {
  intervalMs?: number;
  onError?: (error: unknown) => void;
  onPoll?: (summary: DeepBookPredictPricePollSummary) => void;
};

export type DeepBookPredictPricePoller = {
  stop(): void;
};

export const DEFAULT_PRICE_POLL_INTERVAL_MS = 1_000;

export async function pollDeepBookPredictLatestPrices({
  config = DEEPBOOK_PREDICT_TESTNET_CONFIG,
  fetchImpl = fetch,
  reader,
  writer,
}: DeepBookPredictPricePollOptions): Promise<DeepBookPredictPricePollSummary> {
  const activeOracles = await reader.listBtcOracles({ includeSettled: false });
  const priceClient = createPredictOraclePriceClient({ config, fetchImpl });
  const prices = await Promise.all(
    activeOracles.map(async (oracle): Promise<PredictOraclePricePoint | null> => {
      try {
        return await priceClient.getLatestOraclePrice(oracle.oracle_id);
      } catch {
        return null;
      }
    }),
  ).then((points) =>
    points.filter((point): point is PredictOraclePricePoint => point !== null),
  );

  return {
    activeOracleCount: activeOracles.length,
    fetchedPriceCount: prices.length,
    ...latestPriceMetadata(prices),
    upsertedPriceCount: await writer.upsertOraclePrices(prices),
  };
}

function latestPriceMetadata(
  prices: readonly PredictOraclePricePoint[],
): Pick<DeepBookPredictPricePollSummary, "latestCheckpoint" | "latestSourceTimestampMs"> {
  const latest = prices.reduce<PredictOraclePricePoint | null>(
    (current, point) =>
      current === null || point.timestampMs > current.timestampMs ? point : current,
    null,
  );

  return latest
    ? {
        ...(latest.checkpoint === undefined ? {} : { latestCheckpoint: latest.checkpoint }),
        latestSourceTimestampMs: latest.timestampMs,
      }
    : {};
}

export function startDeepBookPredictPricePoller({
  intervalMs = DEFAULT_PRICE_POLL_INTERVAL_MS,
  onError,
  onPoll,
  ...options
}: DeepBookPredictPricePollerOptions): DeepBookPredictPricePoller {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isPolling = false;

  const scheduleNextPoll = () => {
    if (stopped) {
      return;
    }

    timer = setTimeout(runPoll, intervalMs);
  };

  const runPoll = async () => {
    if (isPolling) {
      scheduleNextPoll();
      return;
    }

    isPolling = true;
    try {
      onPoll?.(await pollDeepBookPredictLatestPrices(options));
    } catch (error) {
      onError?.(error);
    } finally {
      isPolling = false;
      scheduleNextPoll();
    }
  };

  void runPoll();

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    },
  };
}
