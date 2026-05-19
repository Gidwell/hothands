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
  selectedBtcOracle: PredictOracleState | null;
  latestPrice: PredictLatestPrice | null;
};

export type PredictReadCanaryOptions = {
  config?: PredictCanaryConfig;
  fetchImpl?: typeof fetch;
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
      const latestPrice = selectedBtcOracle
        ? await fetchJson<PredictLatestPrice>(
            fetchImpl,
            buildPredictServerUrl(
              config.serverUrl,
              `/oracles/${selectedBtcOracle.oracle_id}/prices/latest`,
            ),
          )
        : null;

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
        selectedBtcOracle,
        latestPrice,
      };
    },
  };
}

export function buildPredictServerUrl(serverUrl: string, path: string): string {
  const url = new URL(serverUrl);
  url.pathname = joinPathSegments(url.pathname, path);
  url.search = "";
  url.hash = "";

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
