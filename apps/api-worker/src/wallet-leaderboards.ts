import {
  buildWalletPerformanceEntries,
  buildWalletPerformanceLeaderboards,
  type PredictIndexerReader
} from "@hot-hands/indexer";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

export type TestnetWalletLeaderboardsOptions = {
  reader: PredictIndexerReader;
  limit?: number;
  nowMs?: number;
  positionLimit?: number;
};

export type TestnetWalletPerformanceOptions = {
  reader: PredictIndexerReader;
  wallet: string;
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

export async function getTestnetWalletPerformance({
  reader,
  wallet,
  nowMs = Date.now(),
  positionLimit = 10_000
}: TestnetWalletPerformanceOptions) {
  const normalizedWallet = normalizeWalletRequestValue(wallet);

  if (!normalizedWallet) {
    throw new Error("wallet must be a valid Sui address.");
  }

  const [positions, oracles] = await Promise.all([
    reader.listPositionSummaries({ owner: normalizedWallet, limit: positionLimit }),
    reader.listBtcOracles({ includeSettled: true }),
  ]);
  const [entry] = buildWalletPerformanceEntries(positions, {
    nowMs,
    oracles
  });

  return {
    source: "indexed_testnet",
    wallet: normalizedWallet,
    entry: entry ?? null
  };
}

export function parseWalletLeaderboardRequest(url: URL) {
  return {
    limit: readOptionalPositiveIntegerSearchParam(url, "limit"),
    positionLimit: readOptionalPositiveIntegerSearchParam(url, "positionLimit")
  };
}

export function parseWalletPerformanceRequest(url: URL) {
  return {
    wallet: url.searchParams.get("wallet") ?? "",
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

function normalizeWalletRequestValue(wallet: string): string | null {
  const trimmedWallet = wallet.trim();
  return isValidSuiAddress(trimmedWallet) ? normalizeSuiAddress(trimmedWallet) : null;
}
