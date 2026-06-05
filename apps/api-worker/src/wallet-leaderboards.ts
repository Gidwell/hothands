import {
  buildWalletPerformanceLeaderboards,
  type PredictIndexerReader
} from "@hot-hands/indexer";

export type TestnetWalletLeaderboardsOptions = {
  reader: PredictIndexerReader;
  limit?: number;
  nowMs?: number;
  positionLimit?: number;
};

export async function getTestnetWalletLeaderboards({
  reader,
  limit = 25,
  nowMs = Date.now(),
  positionLimit = 10_000
}: TestnetWalletLeaderboardsOptions) {
  const [positions, oracles] = await Promise.all([
    reader.listPositionSummaries({ limit: positionLimit }),
    reader.listBtcOracles({ includeSettled: true }),
  ]);

  return {
    source: "indexed_testnet",
    leaderboards: buildWalletPerformanceLeaderboards(positions, {
      limit,
      nowMs,
      oracles
    })
  };
}

export function parseWalletLeaderboardRequest(url: URL) {
  return {
    limit: readOptionalPositiveIntegerSearchParam(url, "limit"),
    positionLimit: readOptionalPositiveIntegerSearchParam(url, "positionLimit")
  };
}

function readOptionalPositiveIntegerSearchParam(url: URL, name: string): number | undefined {
  const value = url.searchParams.get(name);
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}
