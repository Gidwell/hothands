import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  createPredictOraclePriceClient,
  createPredictOracleSviClient,
  createPredictReadCanary,
  createPredictTradeHistoryClient,
  type PredictCanaryConfig,
} from "./deepbook-predict";
import { summarizePredictPositions, type PredictIndexerWriter } from "./store";

export type DeepBookPredictBackfillOptions = {
  store: PredictIndexerWriter;
  config?: PredictCanaryConfig;
  fetchImpl?: typeof fetch;
  oracleIds?: string[];
  tradeLimit?: number;
  priceLimit?: number;
  priceRangeEndMs?: number;
  priceRangeStartMs?: number;
  priceSampleMs?: number;
  priceWindowConcurrency?: number;
  priceWindowMs?: number;
  sviLimit?: number;
  includeAllBtcOraclePrices?: boolean;
  includeOracleTrades?: boolean;
  includePositions?: boolean;
  includePrices?: boolean;
  includeSvi?: boolean;
};

export type DeepBookPredictBackfillSummary = {
  oracleCount: number;
  tradeEventCount: number;
  oraclePriceCount: number;
  oracleSviCount: number;
  positionSummaryCount: number;
  selectedPriceOracleIds: string[];
  selectedOracleIds: string[];
};

const DEFAULT_PRICE_WINDOW_MS = 60 * 60_000;
const DEFAULT_PRICE_WINDOW_CONCURRENCY = 2;

export async function runDeepBookPredictBackfill({
  store,
  config = DEEPBOOK_PREDICT_TESTNET_CONFIG,
  fetchImpl = fetch,
  oracleIds,
  tradeLimit = 5_000,
  priceLimit = 10_000,
  priceRangeEndMs,
  priceRangeStartMs,
  priceSampleMs,
  priceWindowConcurrency = DEFAULT_PRICE_WINDOW_CONCURRENCY,
  priceWindowMs = DEFAULT_PRICE_WINDOW_MS,
  sviLimit = 1_000,
  includeAllBtcOraclePrices = false,
  includeOracleTrades = true,
  includePositions = true,
  includePrices = true,
  includeSvi = false,
}: DeepBookPredictBackfillOptions): Promise<DeepBookPredictBackfillSummary> {
  const canary = await createPredictReadCanary({ config, fetchImpl }).run();
  const btcOracles = canary.btcOracles;
  const selectedOracleIds = oracleIds ?? canary.availableBtcMarkets.map((market) => market.oracleId);
  await store.upsertOracles(btcOracles);

  const tradeClient = createPredictTradeHistoryClient({ config, fetchImpl });
  const [minted, redeemed] = includePositions
    ? await Promise.all([
      tradeClient.listMintedPositions({ limit: tradeLimit }),
      tradeClient.listRedeemedPositions({ limit: tradeLimit }),
    ])
    : [[], []];
  const oracleTrades = includeOracleTrades
    ? await fetchOracleTrades(tradeClient, selectedOracleIds, tradeLimit)
    : [];
  const tradeEvents = [
    ...minted,
    ...redeemed,
    ...oracleTrades,
  ];
  const tradeEventCount = await store.upsertTradeEvents(tradeEvents);
  const positionSummaryCount = await store.upsertPositionSummaries(
    summarizePredictPositions(tradeEvents),
  );

  const priceClient = createPredictOraclePriceClient({ config, fetchImpl });
  const selectedPriceOracleIds = includeAllBtcOraclePrices
    ? btcOracles
      .filter((oracle) => oracle.underlying_asset === "BTC")
      .map((oracle) => oracle.oracle_id)
    : selectedOracleIds;
  const oraclePriceCount = includePrices
    ? await backfillOraclePrices(store, priceClient, selectedPriceOracleIds, {
      limit: priceLimit,
      rangeEndMs: priceRangeEndMs,
      rangeStartMs: priceRangeStartMs,
      sampleMs: priceSampleMs,
      windowConcurrency: priceWindowConcurrency,
      windowMs: priceWindowMs,
    })
    : 0;

  const sviClient = createPredictOracleSviClient({ config, fetchImpl });
  const oracleSvi = includeSvi
    ? await Promise.all(
      selectedOracleIds.map((oracleId) =>
        sviClient.listOracleSvi(oracleId, { limit: sviLimit }).catch(() => []),
      ),
    ).then((groups) => groups.flat())
    : [];
  const oracleSviCount = await store.upsertOracleSvi(oracleSvi);

  return {
    oracleCount: btcOracles.length,
    tradeEventCount,
    oraclePriceCount,
    oracleSviCount,
    positionSummaryCount,
    selectedPriceOracleIds,
    selectedOracleIds,
  };
}

async function backfillOraclePrices(
  store: Pick<PredictIndexerWriter, "upsertOraclePrices">,
  priceClient: ReturnType<typeof createPredictOraclePriceClient>,
  oracleIds: string[],
  {
    limit,
    rangeEndMs,
    rangeStartMs,
    sampleMs,
    windowConcurrency,
    windowMs,
  }: {
    limit: number;
    rangeEndMs?: number;
    rangeStartMs?: number;
    sampleMs?: number;
    windowConcurrency: number;
    windowMs: number;
  },
) {
  const fetchForOracle = async (oracleId: string) => {
    if (rangeStartMs !== undefined && rangeEndMs !== undefined) {
      return backfillOraclePriceWindows(store, priceClient, oracleId, {
        rangeEndMs,
        rangeStartMs,
        sampleMs,
        windowMs,
      });
    }

    const points = await priceClient.listOraclePrices(oracleId, { limit }).catch(() => []);
    return store.upsertOraclePrices(points);
  };

  return runWithConcurrency(oracleIds, Math.max(1, Math.floor(windowConcurrency)), fetchForOracle)
    .then((counts) => counts.reduce((total, count) => total + count, 0));
}

async function backfillOraclePriceWindows(
  store: Pick<PredictIndexerWriter, "upsertOraclePrices">,
  priceClient: ReturnType<typeof createPredictOraclePriceClient>,
  oracleId: string,
  {
    rangeEndMs,
    rangeStartMs,
    sampleMs,
    windowMs,
  }: {
    rangeEndMs: number;
    rangeStartMs: number;
    sampleMs?: number;
    windowMs: number;
  },
) {
  if (rangeEndMs < rangeStartMs) {
    return 0;
  }

  let writtenCount = 0;
  let windowStartMs = rangeStartMs;
  const normalizedWindowMs = Math.max(1, Math.floor(windowMs));
  while (windowStartMs <= rangeEndMs) {
    const windowEndMs = Math.min(rangeEndMs, windowStartMs + normalizedWindowMs);
    const windowPoints = await priceClient
      .listOraclePrices(oracleId, {
        startTime: windowStartMs,
        endTime: windowEndMs,
      })
      .catch(() => []);
    const sampledPoints =
      sampleMs === undefined ? windowPoints : sampleOraclePricePoints(windowPoints, sampleMs);
    writtenCount += await store.upsertOraclePrices(sampledPoints);
    windowStartMs = windowEndMs + 1;
  }

  return writtenCount;
}

function sampleOraclePricePoints<
  T extends { eventId?: string; timestampMs: number },
>(points: T[], sampleMs: number): T[] {
  const normalizedSampleMs = Math.floor(sampleMs);
  if (normalizedSampleMs <= 1 || points.length <= 2) {
    return points;
  }

  const sorted = [...points].sort(
    (left, right) =>
      left.timestampMs - right.timestampMs ||
      (left.eventId ?? "").localeCompare(right.eventId ?? ""),
  );
  const selected = new Map<number, T>();

  for (const point of sorted) {
    const bucket = Math.floor(point.timestampMs / normalizedSampleMs);
    if (!selected.has(bucket)) {
      selected.set(bucket, point);
    }
  }

  const lastPoint = sorted.at(-1);
  const values = [...selected.values()];
  if (lastPoint && values.at(-1) !== lastPoint) {
    values.push(lastPoint);
  }

  return values;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index]);
      }
    },
  );

  await Promise.all(workers);

  return results;
}

async function fetchOracleTrades(
  tradeClient: ReturnType<typeof createPredictTradeHistoryClient>,
  oracleIds: string[],
  limit: number,
) {
  return Promise.all(
    oracleIds.map((oracleId) =>
      tradeClient.listOracleTrades(oracleId, { limit }).catch(() => []),
    ),
  ).then((groups) => groups.flat());
}
