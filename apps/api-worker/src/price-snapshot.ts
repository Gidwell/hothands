import {
  createPredictReadCanary,
  type PredictAvailableBtcMarket,
  type PredictIndexerReader,
  type PredictLatestPrice,
  type PredictOraclePricePoint,
  type PredictOracleState,
  type PredictOracleSviPoint
} from "@hot-hands/indexer";
import {
  getCapturedTestnetMarketHeat,
  type MarketHeatPrice,
  type MarketHeatPricingModel,
  type MarketHeatSource,
  type MarketHeatTradeMarket
} from "./market-heat";

export interface PriceSnapshotProjection {
  source: MarketHeatSource;
  mode: "testnet";
  capturedAt: string;
  marketPrice: MarketHeatPrice;
  markets: MarketHeatTradeMarket[];
}

export interface TestnetPriceSnapshotOptions {
  fetchImpl?: typeof fetch;
  mode?: "live" | "captured";
  reader?: PredictIndexerReader;
}

const PRICE_SNAPSHOT_ORACLE_LIMIT = 128;

export async function getTestnetPriceSnapshot({
  fetchImpl = fetch,
  mode = "live",
  reader
}: TestnetPriceSnapshotOptions = {}): Promise<PriceSnapshotProjection> {
  if (mode === "captured") {
    return getCapturedPriceSnapshot();
  }

  if (reader) {
    try {
      const indexed = await getIndexedPriceSnapshot(reader);
      if (indexed.markets.length > 0 || indexed.marketPrice.price > 0) {
        return indexed;
      }
    } catch {
      // Fall through to public Predict below.
    }
  }

  try {
    return await getLivePriceSnapshot(fetchImpl);
  } catch {
    return getCapturedPriceSnapshot();
  }
}

async function getIndexedPriceSnapshot(
  reader: PredictIndexerReader
): Promise<PriceSnapshotProjection> {
  const oracles = (await reader.listBtcOracles({
    includeSettled: false,
    limit: PRICE_SNAPSHOT_ORACLE_LIMIT
  })).filter((oracle) => oracle.status === "active");
  const latestPricesByOracleId = await loadLatestIndexedPricesByOracleId(reader, oracles);
  const latestSviByOracleId = await loadLatestIndexedSviByOracleId(reader, oracles);
  const markets = oracles.map((oracle) =>
    mapIndexedBtcMarket(
      oracle,
      latestPricesByOracleId.get(oracle.oracle_id) ?? null,
      latestSviByOracleId.get(oracle.oracle_id) ?? null
    )
  );
  const selectedPrice = selectBestIndexedPrice(oracles, latestPricesByOracleId);

  return {
    source: "indexed_testnet",
    mode: "testnet",
    capturedAt: new Date().toISOString(),
    marketPrice: {
      market: "BTC-USD",
      price: normalizePredictPrice(selectedPrice?.spot ?? 0),
      source: "indexed_testnet"
    },
    markets
  };
}

async function getLivePriceSnapshot(fetchImpl: typeof fetch): Promise<PriceSnapshotProjection> {
  const canary = await createPredictReadCanary({ fetchImpl }).run();

  if (!canary.ok) {
    throw new Error("Predict read canary did not return ok.");
  }

  return {
    source: "live_testnet",
    mode: "testnet",
    capturedAt: new Date().toISOString(),
    marketPrice: {
      market: "BTC-USD",
      price: normalizePredictPrice(canary.latestPrice?.spot ?? 0),
      source: "live_testnet"
    },
    markets: canary.availableBtcMarkets.map(mapAvailableBtcMarket)
  };
}

function getCapturedPriceSnapshot(): PriceSnapshotProjection {
  const captured = getCapturedTestnetMarketHeat();

  return {
    source: captured.source,
    mode: "testnet",
    capturedAt: captured.capturedAt,
    marketPrice: captured.marketPrice,
    markets: captured.markets
  };
}

async function loadLatestIndexedPricesByOracleId(
  reader: PredictIndexerReader,
  oracles: PredictOracleState[]
): Promise<Map<string, PredictOraclePricePoint>> {
  const entries = await Promise.all(
    oracles.map(async (oracle) => {
      try {
        const latestPrice = await reader.getLatestOraclePrice(oracle.oracle_id);

        return latestPrice ? ([oracle.oracle_id, latestPrice] as const) : null;
      } catch {
        return null;
      }
    })
  );

  return new Map(
    entries.filter(
      (entry): entry is readonly [string, PredictOraclePricePoint] => entry !== null
    )
  );
}

async function loadLatestIndexedSviByOracleId(
  reader: PredictIndexerReader,
  oracles: PredictOracleState[]
): Promise<Map<string, PredictOracleSviPoint>> {
  if (!reader.getLatestOracleSvi) {
    return new Map();
  }

  const entries = await Promise.all(
    oracles.map(async (oracle) => {
      try {
        const latestSvi = await reader.getLatestOracleSvi?.(oracle.oracle_id);

        return latestSvi ? ([oracle.oracle_id, latestSvi] as const) : null;
      } catch {
        return null;
      }
    })
  );

  return new Map(
    entries.filter(
      (entry): entry is readonly [string, PredictOracleSviPoint] => entry !== null
    )
  );
}

function selectBestIndexedPrice(
  oracles: PredictOracleState[],
  latestPricesByOracleId: Map<string, PredictOraclePricePoint>
): PredictOraclePricePoint | null {
  const bestOracle = [...oracles]
    .filter((oracle) => latestPricesByOracleId.has(oracle.oracle_id))
    .sort(
      (left, right) =>
        normalizeEpochMs(right.expiry) - normalizeEpochMs(left.expiry) ||
        left.oracle_id.localeCompare(right.oracle_id)
    )[0];

  return bestOracle ? latestPricesByOracleId.get(bestOracle.oracle_id) ?? null : null;
}

function mapAvailableBtcMarket(market: PredictAvailableBtcMarket): MarketHeatTradeMarket {
  const latestPrice = market.latestPrice ? normalizePredictPrice(market.latestPrice.spot) : null;
  const strikeCandidatePrice =
    market.strikeCandidate === null ? null : normalizePredictPrice(market.strikeCandidate);

  return {
    oracleId: market.oracleId,
    market: "BTC-USD",
    expiry: market.expiry,
    expiryMs: market.expiryMs,
    intervalLabel: market.intervalLabel,
    active: market.active,
    status: market.status,
    strikeCandidate: market.strikeCandidate,
    strikeCandidatePrice,
    latestPrice,
    latestPriceLabel: formatPriceLabel(latestPrice),
    ...latestPredictPriceMetadata(market.latestPrice)
  };
}

function mapIndexedBtcMarket(
  oracle: PredictOracleState,
  latestPrice: PredictOraclePricePoint | null,
  latestSvi: PredictOracleSviPoint | null
): MarketHeatTradeMarket {
  const latestPriceValue = latestPrice ? normalizePredictPrice(latestPrice.spot) : null;
  const strikeCandidate = latestPrice
    ? snapIndexedStrikeToTick(latestPrice.forward ?? latestPrice.spot, oracle)
    : null;
  const strikeCandidatePrice =
    strikeCandidate === null ? null : normalizePredictPrice(strikeCandidate);
  const expiryMs = normalizeEpochMs(oracle.expiry);

  return {
    oracleId: oracle.oracle_id,
    market: "BTC-USD",
    expiry: oracle.expiry,
    expiryMs,
    intervalLabel: formatIndexedOracleIntervalLabel(oracle),
    active: oracle.status === "active",
    status: oracle.status,
    strikeCandidate,
    strikeCandidatePrice,
    latestPrice: latestPriceValue,
    latestPriceLabel: formatPriceLabel(latestPriceValue),
    ...latestPredictPriceMetadata(latestPrice),
    ...(latestPrice?.forward === undefined || latestSvi === null
      ? {}
      : { pricingModel: mapIndexedPricingModel(latestPrice, latestSvi) })
  };
}

function latestPredictPriceMetadata(
  latestPrice: PredictLatestPrice | PredictOraclePricePoint | null | undefined
): Pick<MarketHeatTradeMarket, "latestPriceTimestampMs" | "latestPriceCheckpoint"> {
  if (!latestPrice) {
    return {};
  }

  const timestampMs =
    "timestampMs" in latestPrice
      ? latestPrice.timestampMs
      : latestPrice.checkpoint_timestamp_ms ?? latestPrice.onchain_timestamp;
  const normalizedTimestampMs =
    typeof timestampMs === "number" && Number.isFinite(timestampMs) && timestampMs > 0
      ? normalizeEpochMs(timestampMs)
      : undefined;

  return {
    ...(normalizedTimestampMs === undefined
      ? {}
      : { latestPriceTimestampMs: normalizedTimestampMs }),
    ...(typeof latestPrice.checkpoint === "number" && Number.isFinite(latestPrice.checkpoint)
      ? { latestPriceCheckpoint: latestPrice.checkpoint }
      : {})
  };
}

function mapIndexedPricingModel(
  latestPrice: PredictOraclePricePoint,
  latestSvi: PredictOracleSviPoint
): MarketHeatPricingModel {
  return {
    forward: latestPrice.forward ?? latestPrice.spot,
    forwardPrice: normalizePredictPrice(latestPrice.forward ?? latestPrice.spot),
    a: latestSvi.a,
    b: latestSvi.b,
    rho: signedSviParam(latestSvi.rho, latestSvi.rhoNegative),
    m: signedSviParam(latestSvi.m, latestSvi.mNegative),
    sigma: latestSvi.sigma,
    timestampMs: Math.max(latestPrice.timestampMs, latestSvi.timestampMs)
  };
}

function signedSviParam(positiveMagnitude: number, negativeMagnitude: number): number {
  if (negativeMagnitude <= 0) {
    return positiveMagnitude;
  }

  return positiveMagnitude > 0 ? -positiveMagnitude : -negativeMagnitude;
}

function snapIndexedStrikeToTick(price: number, oracle: PredictOracleState): number {
  const tickSize = Math.max(1, oracle.tick_size);
  const rounded = Math.round(price / tickSize) * tickSize;

  return Math.max(oracle.min_strike, rounded);
}

function formatIndexedOracleIntervalLabel(oracle: PredictOracleState): string {
  if (oracle.activated_at === undefined) {
    return "Active";
  }

  const durationMs = normalizeEpochMs(oracle.expiry) - normalizeEpochMs(oracle.activated_at);

  return durationMs > 0 ? formatDurationLabel(durationMs) : "Active";
}

function formatDurationLabel(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "Exp";
  }

  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  if (minutes < 90) {
    const roundedMinutes = minutes > 20 ? Math.round(minutes / 15) * 15 : minutes;
    return `${roundedMinutes}m`;
  }

  if (minutes < 36 * 60) {
    return `${Math.round(minutes / 60)}h`;
  }

  return `${Math.round(minutes / (24 * 60))}d`;
}

function formatPriceLabel(price: number | null): string | null {
  if (price === null) {
    return null;
  }

  return `$${Math.round(price).toLocaleString("en-US")}`;
}

function normalizeEpochMs(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function normalizePredictPrice(value: number): number {
  if (value >= 1_000_000_000_000) {
    return Math.round(value / 1_000_000_000);
  }

  if (value >= 1_000_000_000) {
    return Math.round(value / 1_000_000);
  }

  return Math.round(value);
}
