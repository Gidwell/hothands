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
  sviLimit?: number;
  includeOracleTrades?: boolean;
  includePrices?: boolean;
  includeSvi?: boolean;
};

export type DeepBookPredictBackfillSummary = {
  oracleCount: number;
  tradeEventCount: number;
  oraclePriceCount: number;
  oracleSviCount: number;
  positionSummaryCount: number;
  selectedOracleIds: string[];
};

export async function runDeepBookPredictBackfill({
  store,
  config = DEEPBOOK_PREDICT_TESTNET_CONFIG,
  fetchImpl = fetch,
  oracleIds,
  tradeLimit = 5_000,
  priceLimit = 10_000,
  sviLimit = 1_000,
  includeOracleTrades = true,
  includePrices = true,
  includeSvi = false,
}: DeepBookPredictBackfillOptions): Promise<DeepBookPredictBackfillSummary> {
  const canary = await createPredictReadCanary({ config, fetchImpl }).run();
  const btcOracles = canary.btcOracles;
  const selectedOracleIds = oracleIds ?? canary.availableBtcMarkets.map((market) => market.oracleId);
  await store.upsertOracles(btcOracles);

  const tradeClient = createPredictTradeHistoryClient({ config, fetchImpl });
  const [minted, redeemed] = await Promise.all([
    tradeClient.listMintedPositions({ limit: tradeLimit }),
    tradeClient.listRedeemedPositions({ limit: tradeLimit }),
  ]);
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
  const oraclePrices = includePrices
    ? await Promise.all(
      selectedOracleIds.map((oracleId) =>
        priceClient.listOraclePrices(oracleId, { limit: priceLimit }).catch(() => []),
      ),
    ).then((groups) => groups.flat())
    : [];
  const oraclePriceCount = await store.upsertOraclePrices(oraclePrices);

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
    selectedOracleIds,
  };
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
