import { getTestnetMarketHeat } from "./market-heat";
import {
  handleHotHandsAppRequest,
  type VerifyWalletSignature
} from "./app-auth";
import type { HotHandsAppStore } from "./app-storage";
import {
  getTestnetOraclePrices,
  type IndexedOraclePriceHistoryLoader
} from "./oracle-prices";
import type {
  PredictIndexerJobStatus,
  PredictIndexerReader,
  PredictNormalizedTradeEvent
} from "@hot-hands/indexer";
import { getTestnetOracleSettlement } from "./oracle-settlement";
import { getTestnetPriceSnapshot } from "./price-snapshot";
import { getMainnetSuinsNames } from "./suins-names";
import { readThroughResponseCache, type ResponseCache } from "./response-cache";
import {
  getTestnetPredictRedeemQuote,
  getTestnetPredictQuote,
  type InspectPredictQuoteQuantity
} from "./predict-quote";
import { createIndexerReadersFromDatabaseUrl } from "./indexer-readers";
import {
  getTestnetWalletLeaderboards,
  parseWalletLeaderboardRequest
} from "./wallet-leaderboards";

interface BunServer {
  readonly url: URL;
  readonly port: number;
  stop(closeActiveConnections?: boolean): void;
}

interface BunRuntime {
  readonly env: Record<string, string | undefined>;
  serve(options: {
    hostname: string;
    port: number;
    fetch(request: Request): Response | Promise<Response>;
  }): BunServer;
}

declare const Bun: BunRuntime;

export interface TestnetDevServerFetchOptions {
  fetchImpl?: typeof fetch;
  appStore?: HotHandsAppStore;
  createSessionToken?: () => string;
  indexerReader?: PredictIndexerReader;
  indexedOraclePriceHistoryLoader?: IndexedOraclePriceHistoryLoader;
  inspectPredictQuoteQuantity?: InspectPredictQuoteQuantity;
  nowMs?: () => number;
  randomId?: () => string;
  verifyWalletSignature?: VerifyWalletSignature;
}

export interface TestnetDevServerOptions extends TestnetDevServerFetchOptions {
  hostname?: string;
  port?: number;
}

const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_PORT = 8789;
const TESTNET_DEV_SERVER_ROUTES = [
  "/health",
  "/app/auth/challenge",
  "/app/auth/session",
  "/app/follows",
  "/app/copy-receipts",
  "/testnet/indexer-status",
  "/testnet/market-heat",
  "/testnet/price-snapshot",
  "/testnet/oracle-settlement",
  "/testnet/oracle-prices",
  "/testnet/mainnet-suins-names",
  "/testnet/portfolio-events",
  "/testnet/quote",
  "/testnet/redeem-quote",
  "/testnet/wallet-leaderboards"
];

const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "content-type": "application/json; charset=utf-8"
};

const CORS_HEADERS = {
  "access-control-allow-origin": JSON_HEADERS["access-control-allow-origin"],
  "access-control-allow-methods": JSON_HEADERS["access-control-allow-methods"],
  "access-control-allow-headers": JSON_HEADERS["access-control-allow-headers"]
};

const TESTNET_SNAPSHOT_CACHE_TTL_MS = 1_000;

export function createTestnetDevServerFetch({
  appStore,
  createSessionToken,
  fetchImpl = fetch,
  indexerReader,
  indexedOraclePriceHistoryLoader,
  inspectPredictQuoteQuantity,
  nowMs = Date.now,
  randomId,
  verifyWalletSignature
}: TestnetDevServerFetchOptions = {}): (request: Request) => Promise<Response> {
  const responseCache: ResponseCache = new Map();

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "api-worker-testnet-dev", stage: 3 });
    }

    const appResponse = await handleHotHandsAppRequest(request, {
      appStore,
      createSessionToken,
      nowMs,
      randomId,
      verifyWalletSignature
    });
    if (appResponse) {
      return appResponse;
    }

    if (url.pathname === "/testnet/market-heat") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      const includeExpired = parseIncludeExpiredRequest(url);
      return json(
        (
          await readThroughResponseCache({
            cache: responseCache,
            key: includeExpired ? "testnet:market-heat:expired" : "testnet:market-heat:live",
            ttlMs: TESTNET_SNAPSHOT_CACHE_TTL_MS,
            nowMs,
            load: () =>
              getTestnetMarketHeat({
                fetchImpl,
                includeExpired,
                reader: indexerReader
              })
          })
        ).value
      );
    }

    if (url.pathname === "/testnet/price-snapshot") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      return json(
        (
          await readThroughResponseCache({
            cache: responseCache,
            key: "testnet:price-snapshot",
            ttlMs: TESTNET_SNAPSHOT_CACHE_TTL_MS,
            nowMs,
            load: () => getTestnetPriceSnapshot({ fetchImpl, reader: indexerReader })
          })
        ).value
      );
    }

    if (url.pathname === "/testnet/indexer-status") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      if (!indexerReader) {
        return json({ error: "indexer_unavailable" }, 503);
      }

      return json(await getIndexedIndexerStatus(indexerReader));
    }

    if (url.pathname === "/testnet/wallet-leaderboards") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      if (!indexerReader) {
        return json({ error: "indexer_unavailable" }, 503);
      }

      try {
        return json(
          await getTestnetWalletLeaderboards({
            reader: indexerReader,
            ...parseWalletLeaderboardRequest(url)
          })
        );
      } catch (error) {
        return json(
          {
            error: "wallet_leaderboards_failed",
            message: error instanceof Error ? error.message : "Unable to load wallet leaderboards."
          },
          400
        );
      }
    }

    if (url.pathname === "/testnet/mainnet-suins-names") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      return json(await getMainnetSuinsNames(url, { fetchImpl }));
    }

    if (url.pathname === "/testnet/quote") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      try {
        return json(
          await getTestnetPredictQuote(parsePredictQuoteRequest(url), {
            inspectQuantity: inspectPredictQuoteQuantity
          })
        );
      } catch (error) {
        return json(
          {
            error: "quote_failed",
            message: error instanceof Error ? error.message : "Unable to quote trade."
          },
          400
        );
      }
    }

    if (url.pathname === "/testnet/portfolio-events") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      if (!indexerReader) {
        return json({ error: "indexer_unavailable" }, 503);
      }

      try {
        return json(
          await getIndexedPortfolioEvents({
            eventType: readPortfolioEventType(url),
            indexerReader,
            limit: readOptionalPositiveIntegerSearchParam(url, "limit") ?? 50,
            managerId: url.searchParams.get("managerId")?.trim() || undefined,
            owner: url.searchParams.get("wallet")?.trim() || undefined
          })
        );
      } catch (error) {
        return json(
          {
            error: "portfolio_events_failed",
            message: error instanceof Error ? error.message : "Unable to load portfolio events."
          },
          400
        );
      }
    }

    if (url.pathname === "/testnet/redeem-quote") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      try {
        return json(
          await getTestnetPredictRedeemQuote(parsePredictRedeemQuoteRequest(url), {
            inspectQuantity: inspectPredictQuoteQuantity
          })
        );
      } catch (error) {
        return json(
          {
            error: "redeem_quote_failed",
            message: error instanceof Error ? error.message : "Unable to quote redeem."
          },
          400
        );
      }
    }

    if (url.pathname === "/testnet/oracle-settlement") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      try {
        return json(
          await getTestnetOracleSettlement({
            fetchImpl,
            oracleId: requireSearchParam(url, "oracleId")
          })
        );
      } catch (error) {
        return json(
          {
            error: "oracle_settlement_failed",
            message: error instanceof Error ? error.message : "Unable to load oracle settlement."
          },
          400
        );
      }
    }

    if (url.pathname === "/testnet/oracle-prices") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      try {
        return json(
          await getTestnetOraclePrices({
            fetchImpl,
            indexedOraclePriceHistoryLoader,
            maxPoints: readOptionalPositiveIntegerSearchParam(url, "maxPoints"),
            oracleId: requireSearchParam(url, "oracleId")
          })
        );
      } catch (error) {
        return json(
          {
            error: "oracle_prices_failed",
            message: error instanceof Error ? error.message : "Unable to load oracle price history."
          },
          400
        );
      }
    }

    return json(
      {
        error: "not_found",
        routes: TESTNET_DEV_SERVER_ROUTES
      },
      404
    );
  };
}

async function getIndexedIndexerStatus(indexerReader: PredictIndexerReader) {
  const jobs = await indexerReader.listIndexerJobStatuses();
  const mappedJobs = jobs.map(mapIndexedIndexerJobStatus);

  return {
    ok: mappedJobs.length > 0 && mappedJobs.every((job) => job.status === "ok" && !job.stale),
    source: "indexed_testnet",
    staleJobCount: mappedJobs.filter((job) => job.stale).length,
    jobs: mappedJobs
  };
}

function mapIndexedIndexerJobStatus(job: PredictIndexerJobStatus) {
  const stale = isIndexerJobStale(job);

  return {
    ...job,
    stale
  };
}

function isIndexerJobStale(job: PredictIndexerJobStatus): boolean {
  if (job.status === "error" || job.consecutiveErrorCount > 0) {
    return true;
  }

  if (job.lastSuccessAtMs === undefined || job.lastPollCompletedAtMs === undefined) {
    return true;
  }

  return (
    job.source === "oracles/prices/latest" &&
    job.observedUpdateGapMs !== undefined &&
    job.observedUpdateGapMs > job.pollIntervalMs * 10
  );
}

export function createTestnetDevServer({
  hostname = DEFAULT_HOSTNAME,
  port = DEFAULT_PORT,
  appStore,
  createSessionToken,
  fetchImpl = fetch,
  indexerReader,
  indexedOraclePriceHistoryLoader,
  inspectPredictQuoteQuantity,
  nowMs,
  randomId,
  verifyWalletSignature
}: TestnetDevServerOptions = {}): BunServer {
  return Bun.serve({
    hostname,
    port,
    fetch: createTestnetDevServerFetch({
      appStore,
      createSessionToken,
      fetchImpl,
      indexerReader,
      indexedOraclePriceHistoryLoader,
      inspectPredictQuoteQuantity,
      nowMs,
      randomId,
      verifyWalletSignature
    })
  });
}

function parsePredictQuoteRequest(url: URL) {
  return {
    oracleId: requireSearchParam(url, "oracleId"),
    expiry: requireSearchParam(url, "expiry"),
    strike: requireSearchParam(url, "strike"),
    side: requireSearchParam(url, "side"),
    spendUsd: requireSearchParam(url, "spendUsd"),
    estimatedPrice: url.searchParams.get("estimatedPrice")
  };
}

function parsePredictRedeemQuoteRequest(url: URL) {
  return {
    oracleId: requireSearchParam(url, "oracleId"),
    expiry: requireSearchParam(url, "expiry"),
    strike: requireSearchParam(url, "strike"),
    side: requireSearchParam(url, "side"),
    quantity: requireSearchParam(url, "quantity")
  };
}

function parseIncludeExpiredRequest(url: URL): boolean {
  return url.searchParams.get("includeExpired") === "true";
}

async function getIndexedPortfolioEvents({
  eventType,
  indexerReader,
  limit,
  managerId,
  owner
}: {
  eventType: "mint" | "redeem";
  indexerReader: PredictIndexerReader;
  limit: number;
  managerId?: string;
  owner?: string;
}) {
  if (!managerId && !owner) {
    throw new Error("managerId or wallet is required");
  }

  const events = await indexerReader.listRecentTradeEvents({
    kind: eventType,
    limit,
    managerId,
    owner
  });

  return {
    data: events.map((event) => mapIndexedPortfolioEvent(event, eventType)),
    hasNextPage: false,
    nextCursor: null
  };
}

function mapIndexedPortfolioEvent(
  event: PredictNormalizedTradeEvent,
  eventType: "mint" | "redeem"
) {
  const { txDigest, eventSeq } = splitIndexedEventId(event.eventId, eventType);

  return {
    id: {
      txDigest,
      eventSeq
    },
    parsedJson: {
      manager_id: event.managerId,
      oracle_id: event.oracleId,
      expiry: event.expiryMs,
      strike: event.strike,
      is_up: event.isUp,
      quantity: event.quantity,
      ...(event.cost === undefined ? {} : { cost: event.cost }),
      ...(event.payout === undefined ? {} : { payout: event.payout })
    },
    timestampMs: event.timestampMs
  };
}

function splitIndexedEventId(eventId: string, eventType: "mint" | "redeem") {
  const [kind, digest, seq] = eventId.split(":");

  return {
    txDigest: kind === eventType && digest ? digest : eventId,
    eventSeq: seq ?? "0"
  };
}

function requireSearchParam(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function readPortfolioEventType(url: URL): "mint" | "redeem" {
  const eventType = requireSearchParam(url, "eventType");
  if (eventType !== "mint" && eventType !== "redeem") {
    throw new Error("eventType must be mint or redeem.");
  }

  return eventType;
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

function normalizeEpochSeconds(value: number): number {
  return value < 1_000_000_000_000 ? value : Math.floor(value / 1000);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

function readPort(value: string | undefined): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}

if ((import.meta as { main?: boolean }).main) {
  const indexerReaders = Bun.env.DATABASE_URL
    ? createIndexerReadersFromDatabaseUrl(Bun.env.DATABASE_URL)
    : undefined;
  const server = createTestnetDevServer({
    appStore: indexerReaders?.appStore,
    hostname: Bun.env.HOST ?? DEFAULT_HOSTNAME,
    indexerReader: indexerReaders?.reader,
    indexedOraclePriceHistoryLoader: indexerReaders?.indexedOraclePriceHistoryLoader,
    port: readPort(Bun.env.HOT_HANDS_TESTNET_API_PORT ?? Bun.env.PORT)
  });

  console.log(`Testnet API dev server listening on ${server.url}`);
  console.log(`Routes: GET ${TESTNET_DEV_SERVER_ROUTES.join(", GET ")}`);
  console.log(
    `Indexer reads: ${indexerReaders ? "enabled from DATABASE_URL" : "disabled"}`
  );
}
