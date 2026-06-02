import {
  buildPredictServerUrl,
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  type PredictOracleState
} from "@hot-hands/indexer";

export interface TestnetOracleSettlement {
  source: "live_testnet";
  oracleId: string;
  status: string;
  settlementPrice: number | null;
  settledAtMs: number | null;
}

export async function getTestnetOracleSettlement({
  fetchImpl = fetch,
  oracleId
}: {
  fetchImpl?: typeof fetch;
  oracleId: string;
}): Promise<TestnetOracleSettlement> {
  if (!oracleId.trim()) {
    throw new Error("oracleId is required");
  }

  const oracles = await fetchJson<PredictOracleState[]>(
    fetchImpl,
    buildPredictServerUrl(
      DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl,
      `/predicts/${DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId}/oracles`
    )
  );
  const oracle = oracles.find((candidate) => candidate.oracle_id === oracleId);
  if (!oracle) {
    throw new Error("Oracle not found");
  }

  return {
    source: "live_testnet",
    oracleId: oracle.oracle_id,
    status: oracle.status,
    settlementPrice: finiteNumberOrNull(oracle.settlement_price),
    settledAtMs: normalizeEpochMs(finiteNumberOrNull(oracle.settled_at))
  };
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Predict server read failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

function finiteNumberOrNull(value: number | undefined | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEpochMs(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return value < 10_000_000_000 ? value * 1000 : value;
}
