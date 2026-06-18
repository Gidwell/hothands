export type PredictCanaryConfig = {
  serverUrl: string;
  predictPackageId: string;
  predictRegistryId: string;
  predictObjectId: string;
  quoteAssetType: string;
  btcOnly: boolean;
};

export type PredictOracleState = {
  predict_id: string;
  oracle_id: string;
  underlying_asset: string;
  expiry: number;
  min_strike: number;
  tick_size: number;
  status: string;
  activated_at?: number;
  settlement_price?: number;
  settled_at?: number;
  created_checkpoint?: number;
};

export type PredictLatestPrice = {
  oracle_id: string;
  spot: number;
  forward?: number;
  checkpoint?: number;
  checkpoint_timestamp_ms?: number;
  onchain_timestamp?: number;
};

export type PredictOraclePriceRow = {
  [key: string]: unknown;
  event_digest?: unknown;
  digest?: unknown;
  event_index?: unknown;
  event_seq?: unknown;
  oracle_id?: unknown;
  oracleId?: unknown;
  spot?: unknown;
  forward?: unknown;
  checkpoint?: unknown;
  checkpoint_timestamp_ms?: unknown;
  timestamp_ms?: unknown;
  timestampMs?: unknown;
  onchain_timestamp?: unknown;
};

export type PredictOraclePricePoint = {
  eventId?: string;
  oracleId: string;
  spot: number;
  forward?: number;
  checkpoint?: number;
  timestampMs: number;
  source: "oracles/prices" | "oracles/prices/candle_1m";
};

export type PredictOracleSviRow = {
  [key: string]: unknown;
  event_digest?: unknown;
  digest?: unknown;
  event_index?: unknown;
  event_seq?: unknown;
  oracle_id?: unknown;
  oracleId?: unknown;
  a?: unknown;
  b?: unknown;
  rho?: unknown;
  rho_negative?: unknown;
  rhoNegative?: unknown;
  m?: unknown;
  m_negative?: unknown;
  mNegative?: unknown;
  sigma?: unknown;
  checkpoint?: unknown;
  checkpoint_timestamp_ms?: unknown;
  timestamp_ms?: unknown;
  timestampMs?: unknown;
  onchain_timestamp?: unknown;
};

export type PredictOracleSviPoint = {
  eventId: string;
  oracleId: string;
  a: number;
  b: number;
  rho: number;
  rhoNegative: number;
  m: number;
  mNegative: number;
  sigma: number;
  checkpoint?: number;
  timestampMs: number;
  source: "oracles/svi";
};

export type PredictAvailableBtcMarket = {
  oracleId: string;
  expiry: number;
  expiryMs: number;
  intervalLabel: string;
  status: string;
  active: boolean;
  minStrike: number;
  tickSize: number;
  strikeCandidate: number | null;
  latestPrice: PredictLatestPrice | null;
};

export type PredictReadCanaryResult = {
  ok: boolean;
  status: string;
  latestOnchainCheckpoint?: number;
  maxCheckpointLag?: number;
  predictObjectId: string;
  quoteAssetEnabled: boolean;
  quoteAssets: string[];
  btcOracleCount: number;
  activeBtcOracleCount: number;
  btcOracles: PredictOracleState[];
  selectedBtcOracle: PredictOracleState | null;
  availableBtcMarkets: PredictAvailableBtcMarket[];
  latestPrice: PredictLatestPrice | null;
};

export type PredictReadCanaryOptions = {
  config?: PredictCanaryConfig;
  fetchImpl?: typeof fetch;
};

export type PredictPositionMintedRow = {
  [key: string]: unknown;
  trader?: unknown;
  manager_id?: unknown;
  managerId?: unknown;
  oracle_id?: unknown;
  oracleId?: unknown;
  expiry?: unknown;
  expiry_ms?: unknown;
  strike?: unknown;
  is_up?: unknown;
  isUp?: unknown;
  quantity?: unknown;
  cost?: unknown;
  event_digest?: unknown;
  digest?: unknown;
  transaction_digest?: unknown;
  checkpoint?: unknown;
  checkpoint_timestamp_ms?: unknown;
  timestamp_ms?: unknown;
  timestampMs?: unknown;
  event_index?: unknown;
  event_seq?: unknown;
};

export type PredictPositionRedeemedRow = {
  [key: string]: unknown;
  owner?: unknown;
  executor?: unknown;
  manager_id?: unknown;
  managerId?: unknown;
  oracle_id?: unknown;
  oracleId?: unknown;
  expiry?: unknown;
  expiry_ms?: unknown;
  strike?: unknown;
  is_up?: unknown;
  isUp?: unknown;
  quantity?: unknown;
  payout?: unknown;
  event_digest?: unknown;
  digest?: unknown;
  transaction_digest?: unknown;
  checkpoint?: unknown;
  checkpoint_timestamp_ms?: unknown;
  timestamp_ms?: unknown;
  timestampMs?: unknown;
  event_index?: unknown;
  event_seq?: unknown;
};

export type PredictTradeHistoryRow = {
  [key: string]: unknown;
  kind?: unknown;
  type?: unknown;
  trader?: unknown;
  owner?: unknown;
  executor?: unknown;
  manager_id?: unknown;
  managerId?: unknown;
  oracle_id?: unknown;
  oracleId?: unknown;
  expiry?: unknown;
  expiry_ms?: unknown;
  strike?: unknown;
  is_up?: unknown;
  isUp?: unknown;
  quantity?: unknown;
  cost?: unknown;
  payout?: unknown;
  event_digest?: unknown;
  digest?: unknown;
  transaction_digest?: unknown;
  checkpoint?: unknown;
  checkpoint_timestamp_ms?: unknown;
  timestamp_ms?: unknown;
  timestampMs?: unknown;
  event_index?: unknown;
  event_seq?: unknown;
};

export type PredictNormalizedTradeEvent = {
  eventId: string;
  kind: "mint" | "redeem";
  actor: string;
  trader?: string;
  managerId: string;
  oracleId: string;
  expiryMs: number;
  strike: number;
  isUp: boolean;
  quantity: number;
  cost?: number;
  payout?: number;
  transactionDigest?: string;
  checkpoint?: number;
  timestampMs: number;
  source: "positions/minted" | "positions/redeemed" | "trades/oracle";
};

export type MarketHeatTrader = {
  trader: string;
  managerId: string;
  hotScore: number;
  eventCount: number;
  mintCount: number;
  redeemCount: number;
  recentWinCount: number;
  realizedPnl: number;
  observedVolume: number;
  lastSeenMs: number;
};

export type PredictTradeHistoryClientOptions = {
  config?: PredictCanaryConfig;
  fetchImpl?: typeof fetch;
};

export type PredictOraclePriceClientOptions = {
  config?: PredictCanaryConfig;
  fetchImpl?: typeof fetch;
};

export type PredictOracleSviClientOptions = {
  config?: PredictCanaryConfig;
  fetchImpl?: typeof fetch;
};

export type PredictHistoryRequestOptions = {
  endTime?: number;
  limit?: number;
  startTime?: number;
};

type PredictServerStatus = {
  status: string;
  latest_onchain_checkpoint?: number;
  max_checkpoint_lag?: number;
};

type PredictState = {
  predict_id: string;
  quote_assets: string[];
};

export const DEEPBOOK_PREDICT_TESTNET_CONFIG: PredictCanaryConfig = {
  serverUrl: "https://predict-server.testnet.mystenlabs.com",
  predictPackageId:
    "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138",
  predictRegistryId:
    "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64",
  predictObjectId:
    "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
  quoteAssetType:
    "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC",
  btcOnly: true,
};

export function parsePredictCanaryConfig(
  env: Record<string, string | undefined>,
): PredictCanaryConfig {
  return {
    ...DEEPBOOK_PREDICT_TESTNET_CONFIG,
    serverUrl:
      env.HOT_HANDS_PREDICT_SERVER_URL?.replace(/\/+$/g, "") ??
      DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl,
    predictObjectId:
      env.HOT_HANDS_PREDICT_OBJECT_ID ??
      DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
    predictPackageId:
      env.HOT_HANDS_PREDICT_PACKAGE_ID ??
      DEEPBOOK_PREDICT_TESTNET_CONFIG.predictPackageId,
    predictRegistryId:
      env.HOT_HANDS_PREDICT_REGISTRY_ID ??
      DEEPBOOK_PREDICT_TESTNET_CONFIG.predictRegistryId,
    quoteAssetType:
      env.HOT_HANDS_PREDICT_QUOTE_ASSET ??
      DEEPBOOK_PREDICT_TESTNET_CONFIG.quoteAssetType,
    btcOnly: env.HOT_HANDS_PREDICT_BTC_ONLY !== "false",
  };
}

export function createPredictReadCanary({
  config = DEEPBOOK_PREDICT_TESTNET_CONFIG,
  fetchImpl = fetch,
}: PredictReadCanaryOptions = {}) {
  return {
    run: async (): Promise<PredictReadCanaryResult> => {
      const status = await fetchJson<PredictServerStatus>(
        fetchImpl,
        buildPredictServerUrl(config.serverUrl, "/status"),
      );
      const state = await fetchJson<PredictState>(
        fetchImpl,
        buildPredictServerUrl(
          config.serverUrl,
          `/predicts/${config.predictObjectId}/state`,
        ),
      );
      const oracles = await fetchJson<PredictOracleState[]>(
        fetchImpl,
        buildPredictServerUrl(
          config.serverUrl,
          `/predicts/${config.predictObjectId}/oracles`,
        ),
      );

      validatePredictState(state, config);
      const btcOracles = oracles.filter((oracle) => oracle.underlying_asset === "BTC");
      const selectedBtcOracle = selectBestBtcOracle(oracles);
      const activeBtcOracles = selectActiveBtcOracles(oracles);
      const latestPricesByOracleId = await fetchLatestPricesByOracleId(
        fetchImpl,
        config.serverUrl,
        activeBtcOracles,
      );
      const latestPrice =
        selectedBtcOracle === null
          ? null
          : latestPricesByOracleId.get(selectedBtcOracle.oracle_id) ??
            (await fetchLatestPriceOrNull(
              fetchImpl,
              config.serverUrl,
              selectedBtcOracle.oracle_id,
            ));

      return {
        ok: status.status === "OK" && state.predict_id === config.predictObjectId,
        status: status.status,
        latestOnchainCheckpoint: status.latest_onchain_checkpoint,
        maxCheckpointLag: status.max_checkpoint_lag,
        predictObjectId: state.predict_id,
        quoteAssetEnabled: state.quote_assets.some(
          (asset) => normalizeSuiType(asset) === normalizeSuiType(config.quoteAssetType),
        ),
        quoteAssets: state.quote_assets,
        btcOracleCount: btcOracles.length,
        activeBtcOracleCount: btcOracles.filter((oracle) => oracle.status === "active").length,
        btcOracles,
        selectedBtcOracle,
        availableBtcMarkets: activeBtcOracles.map((oracle) =>
          mapOracleToAvailableBtcMarket(
            oracle,
            latestPricesByOracleId.get(oracle.oracle_id) ?? null,
          ),
        ),
        latestPrice,
      };
    },
  };
}

export function createPredictTradeHistoryClient({
  config = DEEPBOOK_PREDICT_TESTNET_CONFIG,
  fetchImpl = fetch,
}: PredictTradeHistoryClientOptions = {}) {
  return {
    listMintedPositions: async (
      options: PredictHistoryRequestOptions = {},
    ): Promise<PredictNormalizedTradeEvent[]> => {
      const rows = await fetchJson<PredictPositionMintedRow[]>(
        fetchImpl,
        buildPredictServerUrl(config.serverUrl, "/positions/minted", options),
      );

      return rows.map(normalizePredictTradeRow);
    },
    listRedeemedPositions: async (
      options: PredictHistoryRequestOptions = {},
    ): Promise<PredictNormalizedTradeEvent[]> => {
      const rows = await fetchJson<PredictPositionRedeemedRow[]>(
        fetchImpl,
        buildPredictServerUrl(config.serverUrl, "/positions/redeemed", options),
      );

      return rows.map(normalizePredictTradeRow);
    },
    listOracleTrades: async (
      oracleId: string,
      options: PredictHistoryRequestOptions = {},
    ): Promise<PredictNormalizedTradeEvent[]> => {
      const rows = await fetchJson<PredictTradeHistoryRow[]>(
        fetchImpl,
        buildPredictServerUrl(config.serverUrl, `/trades/${oracleId}`, options),
      );

      return rows.map(normalizePredictTradeRow);
    },
  };
}

export function createPredictOraclePriceClient({
  config = DEEPBOOK_PREDICT_TESTNET_CONFIG,
  fetchImpl = fetch,
}: PredictOraclePriceClientOptions = {}) {
  return {
    getLatestOraclePrice: async (
      oracleId: string,
    ): Promise<PredictOraclePricePoint | null> => {
      const latestPrice = await fetchLatestPriceOrNull(
        fetchImpl,
        config.serverUrl,
        oracleId,
      );

      return latestPrice
        ? normalizePredictOraclePriceRow(latestPrice, oracleId)
        : null;
    },
    listOraclePrices: async (
      oracleId: string,
      options: PredictHistoryRequestOptions = {},
    ): Promise<PredictOraclePricePoint[]> => {
      const payload = await fetchJson<unknown>(
        fetchImpl,
        buildPredictServerUrl(config.serverUrl, `/oracles/${oracleId}/prices`, options),
      );

      return unwrapPredictOraclePriceRows(payload)
        .map((row) => normalizePredictOraclePriceRow(row, oracleId))
        .sort((left, right) => left.timestampMs - right.timestampMs);
    },
  };
}

export function createPredictOracleSviClient({
  config = DEEPBOOK_PREDICT_TESTNET_CONFIG,
  fetchImpl = fetch,
}: PredictOracleSviClientOptions = {}) {
  return {
    listOracleSvi: async (
      oracleId: string,
      options: PredictHistoryRequestOptions = {},
    ): Promise<PredictOracleSviPoint[]> => {
      const payload = await fetchJson<unknown>(
        fetchImpl,
        buildPredictServerUrl(config.serverUrl, `/oracles/${oracleId}/svi`, options),
      );

      return unwrapPredictOracleSviRows(payload)
        .map((row) => normalizePredictOracleSviRow(row, oracleId))
        .sort((left, right) => left.timestampMs - right.timestampMs);
    },
  };
}

export function normalizePredictOraclePriceRow(
  row: PredictOraclePriceRow,
  fallbackOracleId?: string,
): PredictOraclePricePoint {
  const oracleId = requiredString(
    row.oracle_id ?? row.oracleId ?? fallbackOracleId,
    "oracle_id",
  );
  const transactionDigest = stringValue(
    row.event_digest ?? row.digest,
  );
  const eventSeq = optionalNumber(row.event_index ?? row.event_seq);

  return {
    ...(transactionDigest
      ? { eventId: `price:${transactionDigest}:${eventSeq ?? 0}` }
      : {}),
    oracleId,
    spot: requiredNumber(row.spot, "spot"),
    ...(optionalNumber(row.forward) === undefined
      ? {}
      : { forward: optionalNumber(row.forward) }),
    ...(optionalNumber(row.checkpoint) === undefined
      ? {}
      : { checkpoint: optionalNumber(row.checkpoint) }),
    timestampMs: normalizeEpochMs(
      requiredNumber(
        row.checkpoint_timestamp_ms ??
          row.timestamp_ms ??
          row.timestampMs ??
          row.onchain_timestamp,
        "timestamp",
      ),
    ),
    source: "oracles/prices",
  };
}

export function normalizePredictOracleSviRow(
  row: PredictOracleSviRow,
  fallbackOracleId?: string,
): PredictOracleSviPoint {
  const oracleId = requiredString(
    row.oracle_id ?? row.oracleId ?? fallbackOracleId,
    "oracle_id",
  );
  const timestampMs = normalizeEpochMs(
    requiredNumber(
      row.checkpoint_timestamp_ms ??
        row.timestamp_ms ??
        row.timestampMs ??
        row.onchain_timestamp,
      "timestamp",
    ),
  );
  const transactionDigest = stringValue(
    row.digest ?? row.event_digest,
  );
  const eventSeq = optionalNumber(row.event_index ?? row.event_seq);

  return {
    eventId: transactionDigest
      ? `svi:${transactionDigest}:${eventSeq ?? 0}`
      : `svi:${oracleId}:${timestampMs}`,
    oracleId,
    a: requiredNumber(row.a, "a"),
    b: requiredNumber(row.b, "b"),
    rho: requiredNumber(row.rho, "rho"),
    rhoNegative: signFlagNumber(row.rho_negative ?? row.rhoNegative, "rho_negative"),
    m: requiredNumber(row.m, "m"),
    mNegative: signFlagNumber(row.m_negative ?? row.mNegative, "m_negative"),
    sigma: requiredNumber(row.sigma, "sigma"),
    ...(optionalNumber(row.checkpoint) === undefined
      ? {}
      : { checkpoint: optionalNumber(row.checkpoint) }),
    timestampMs,
    source: "oracles/svi",
  };
}

export function normalizePredictTradeRow(
  row: PredictPositionMintedRow | PredictPositionRedeemedRow | PredictTradeHistoryRow,
): PredictNormalizedTradeEvent {
  const rowKind = stringValue(row.kind ?? row.type)?.toLowerCase();
  const isRedeem = rowKind?.includes("redeem") ?? hasValue(row.payout);
  const kind = isRedeem ? "redeem" : "mint";
  const transactionDigest = stringValue(
    row.digest ?? row.transaction_digest ?? row.event_digest,
  );
  const eventSeq = optionalNumber(row.event_index ?? row.event_seq);
  const actor = requiredString(
    kind === "mint" ? row.trader : row.owner ?? row.executor,
    `${kind} actor`,
  );
  const source = rowKind
    ? "trades/oracle"
    : kind === "mint"
      ? "positions/minted"
      : "positions/redeemed";

  return {
    eventId: `${kind}:${transactionDigest ?? "unknown"}:${eventSeq ?? 0}`,
    kind,
    actor,
    trader: kind === "mint" ? actor : stringValue(row.owner ?? row.executor),
    managerId: requiredString(row.manager_id ?? row.managerId, "manager_id"),
    oracleId: requiredString(row.oracle_id ?? row.oracleId, "oracle_id"),
    expiryMs: normalizeEpochMs(requiredNumber(row.expiry_ms ?? row.expiry, "expiry")),
    strike: requiredNumber(row.strike, "strike"),
    isUp: booleanValue(row.is_up ?? row.isUp),
    quantity: requiredNumber(row.quantity, "quantity"),
    cost: optionalNumber(row.cost),
    payout: optionalNumber(row.payout),
    transactionDigest,
    checkpoint: optionalNumber(row.checkpoint),
    timestampMs: normalizeEpochMs(
      requiredNumber(
        row.checkpoint_timestamp_ms ?? row.timestamp_ms ?? row.timestampMs,
        "timestamp",
      ),
    ),
    source,
  };
}

function unwrapPredictOraclePriceRows(payload: unknown): PredictOraclePriceRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(isPredictOraclePriceRow);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["prices", "rows", "data"]) {
    const rows = record[key];
    if (Array.isArray(rows)) {
      return rows.filter(isPredictOraclePriceRow);
    }
  }

  return [];
}

function unwrapPredictOracleSviRows(payload: unknown): PredictOracleSviRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(isPredictOracleSviRow);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["svi", "rows", "data"]) {
    const rows = record[key];
    if (Array.isArray(rows)) {
      return rows.filter(isPredictOracleSviRow);
    }
  }

  return [];
}

function isPredictOraclePriceRow(row: unknown): row is PredictOraclePriceRow {
  return Boolean(row && typeof row === "object");
}

function isPredictOracleSviRow(row: unknown): row is PredictOracleSviRow {
  return Boolean(row && typeof row === "object");
}

export function computeMarketHeat(
  events: PredictNormalizedTradeEvent[],
  { nowMs = Date.now() }: { nowMs?: number } = {},
): MarketHeatTrader[] {
  const groups = new Map<string, HeatAccumulator>();

  for (const event of events) {
    const key = `${event.actor}:${event.managerId}`;
    const group = groups.get(key) ?? createHeatAccumulator(event.actor, event.managerId);
    groups.set(key, group);

    group.eventCount += 1;
    group.lastSeenMs = Math.max(group.lastSeenMs, event.timestampMs);

    if (event.kind === "mint") {
      group.mintCount += 1;
      group.observedVolume += event.cost ?? 0;
      const signature = positionSignature(event);
      group.openCosts.set(signature, (group.openCosts.get(signature) ?? 0) + (event.cost ?? 0));
      continue;
    }

    group.redeemCount += 1;
    const signature = positionSignature(event);
    const matchedCost = group.openCosts.get(signature) ?? 0;
    const pnl = (event.payout ?? 0) - matchedCost;
    group.realizedPnl += pnl;
    group.openCosts.set(signature, 0);

    if (pnl > 0 && nowMs - event.timestampMs <= ONE_DAY_MS) {
      group.recentWinCount += 1;
    }
  }

  return [...groups.values()]
    .map((group) => ({
      trader: group.trader,
      managerId: group.managerId,
      hotScore: computeHotScore(group),
      eventCount: group.eventCount,
      mintCount: group.mintCount,
      redeemCount: group.redeemCount,
      recentWinCount: group.recentWinCount,
      realizedPnl: group.realizedPnl,
      observedVolume: group.observedVolume,
      lastSeenMs: group.lastSeenMs,
    }))
    .sort(
      (left, right) =>
        right.hotScore - left.hotScore ||
        right.lastSeenMs - left.lastSeenMs ||
        left.trader.localeCompare(right.trader),
    );
}

export function buildPredictServerUrl(
  serverUrl: string,
  path: string,
  query: PredictHistoryRequestOptions = {},
): string {
  const url = new URL(serverUrl);
  url.pathname = joinPathSegments(url.pathname, path);
  url.search = "";
  url.hash = "";
  if (query.limit !== undefined) {
    url.searchParams.set("limit", String(query.limit));
  }
  if (query.startTime !== undefined) {
    url.searchParams.set("start_time", String(query.startTime));
  }
  if (query.endTime !== undefined) {
    url.searchParams.set("end_time", String(query.endTime));
  }

  return url.toString();
}

export function selectBestBtcOracle(
  oracles: PredictOracleState[],
): PredictOracleState | null {
  const btcOracles = oracles.filter((oracle) => oracle.underlying_asset === "BTC");
  const active = btcOracles.filter((oracle) => oracle.status === "active");
  const candidates = active.length > 0 ? active : btcOracles;

  return [...candidates].sort((left, right) => right.expiry - left.expiry)[0] ?? null;
}

function selectActiveBtcOracles(oracles: PredictOracleState[]): PredictOracleState[] {
  return oracles
    .filter(
      (oracle) =>
        oracle.underlying_asset === "BTC" &&
        oracle.status === "active",
    )
    .sort(
      (left, right) =>
        left.expiry - right.expiry ||
        left.oracle_id.localeCompare(right.oracle_id),
    );
}

async function fetchLatestPricesByOracleId(
  fetchImpl: typeof fetch,
  serverUrl: string,
  oracles: PredictOracleState[],
): Promise<Map<string, PredictLatestPrice>> {
  const entries = await Promise.all(
    oracles.map(async (oracle) => {
      const latestPrice = await fetchLatestPriceOrNull(
        fetchImpl,
        serverUrl,
        oracle.oracle_id,
      );

      return latestPrice ? ([oracle.oracle_id, latestPrice] as const) : null;
    }),
  );

  return new Map(
    entries.filter(
      (entry): entry is readonly [string, PredictLatestPrice] => entry !== null,
    ),
  );
}

async function fetchLatestPriceOrNull(
  fetchImpl: typeof fetch,
  serverUrl: string,
  oracleId: string,
): Promise<PredictLatestPrice | null> {
  try {
    return await fetchJson<PredictLatestPrice>(
      fetchImpl,
      buildPredictServerUrl(serverUrl, `/oracles/${oracleId}/prices/latest`),
    );
  } catch {
    return null;
  }
}

function mapOracleToAvailableBtcMarket(
  oracle: PredictOracleState,
  latestPrice: PredictLatestPrice | null,
): PredictAvailableBtcMarket {
  return {
    oracleId: oracle.oracle_id,
    expiry: oracle.expiry,
    expiryMs: normalizeEpochMs(oracle.expiry),
    intervalLabel: formatOracleIntervalLabel(oracle),
    status: oracle.status,
    active: oracle.status === "active",
    minStrike: oracle.min_strike,
    tickSize: oracle.tick_size,
    strikeCandidate: latestPrice
      ? snapStrikeToTick(latestPrice.forward ?? latestPrice.spot, oracle)
      : null,
    latestPrice,
  };
}

function snapStrikeToTick(price: number, oracle: PredictOracleState): number {
  const tickSize = Math.max(1, oracle.tick_size);
  const rounded = Math.round(price / tickSize) * tickSize;

  return Math.max(oracle.min_strike, rounded);
}

function formatOracleIntervalLabel(oracle: PredictOracleState): string {
  if (oracle.activated_at === undefined || oracle.expiry <= oracle.activated_at) {
    return "Active";
  }

  return formatDurationLabel(
    normalizeEpochMs(oracle.expiry) - normalizeEpochMs(oracle.activated_at),
  );
}

function formatDurationLabel(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "Exp";
  }

  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  if (minutes < 60) {
    const roundedMinutes = minutes > 20 ? Math.round(minutes / 15) * 15 : minutes;
    return `${roundedMinutes}m`;
  }

  if (minutes < 36 * 60) {
    return `${Math.round(minutes / 60)}h`;
  }

  return `${Math.round(minutes / (24 * 60))}d`;
}

function validatePredictState(state: PredictState, config: PredictCanaryConfig): void {
  if (state.predict_id !== config.predictObjectId) {
    throw new Error(
      `Predict server returned ${state.predict_id}; expected ${config.predictObjectId}.`,
    );
  }
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Predict server request failed (${response.status}) for ${url}.`);
  }

  return response.json() as Promise<T>;
}

type HeatAccumulator = MarketHeatTrader & {
  openCosts: Map<string, number>;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function createHeatAccumulator(trader: string, managerId: string): HeatAccumulator {
  return {
    trader,
    managerId,
    hotScore: 0,
    eventCount: 0,
    mintCount: 0,
    redeemCount: 0,
    recentWinCount: 0,
    realizedPnl: 0,
    observedVolume: 0,
    lastSeenMs: 0,
    openCosts: new Map(),
  };
}

function computeHotScore(group: HeatAccumulator): number {
  const activity = group.eventCount * 5;
  const volume = Math.min(30, Math.floor(group.observedVolume / 40_000));
  const wins = group.recentWinCount * 25;
  const positivePnl = Math.min(16, Math.floor(Math.max(0, group.realizedPnl) / 37_500));
  const negativePnl = Math.min(10, Math.floor(Math.max(0, -group.realizedPnl) / 40_000));

  return Math.max(0, activity + volume + wins + positivePnl - negativePnl);
}

function positionSignature(event: PredictNormalizedTradeEvent): string {
  return [
    event.managerId,
    event.oracleId,
    event.expiryMs,
    event.strike,
    event.isUp ? "up" : "down",
  ].join(":");
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function requiredString(value: unknown, field: string): string {
  const parsed = stringValue(value);
  if (!parsed) {
    throw new Error(`Predict trade row is missing ${field}.`);
  }

  return parsed;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new Error(`Predict trade row is missing numeric ${field}.`);
  }

  return parsed;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function signFlagNumber(value: unknown, field: string): number {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new Error(`Predict trade row is missing numeric ${field}.`);
  }

  return parsed;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return false;
}

function normalizeEpochMs(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function normalizeSuiType(type: string): string {
  return type.startsWith("0x") ? type : `0x${type}`;
}

function joinPathSegments(...segments: string[]): string {
  const path = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

  return `/${path}`;
}
