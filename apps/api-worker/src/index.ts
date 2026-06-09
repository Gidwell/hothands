import {
  type ClientMessage,
  type TableDeltaMessage,
  type TableSummary,
  encodeServerMessage,
  parseClientMessage
} from "./protocol";
import {
  addSession,
  armCopy,
  createTableState,
  disarmCopy,
  getSession,
  removeSession,
  setSessionSpectatorId,
  summarizeTableState,
  touchSession,
  type TableState
} from "./table-state";
import { createTableActivityBroadcast } from "./table-activity";
import { getTestnetMarketHeat } from "./market-heat";
import { getTestnetOraclePrices } from "./oracle-prices";
import { getTestnetOracleSettlement } from "./oracle-settlement";
import { getTestnetPriceSnapshot } from "./price-snapshot";
import { getMainnetSuinsNames } from "./suins-names";
import { readThroughResponseCache, type ResponseCache } from "./response-cache";
import type { PredictIndexerReader } from "@hot-hands/indexer";
import {
  getTestnetPredictRedeemQuote,
  getTestnetPredictQuote,
  type InspectPredictQuoteQuantity,
  type PredictQuoteRequest,
  type PredictRedeemQuoteRequest
} from "./predict-quote";
import {
  getTestnetWalletLeaderboards,
  parseWalletLeaderboardRequest
} from "./wallet-leaderboards";

export interface Env {
  TABLE_ROOM: DurableObjectNamespace;
  fetch?: typeof fetch;
  indexerReader?: PredictIndexerReader;
  inspectPredictQuoteQuantity?: InspectPredictQuoteQuantity;
}

const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json; charset=utf-8"
};

const CORS_HEADERS = {
  "access-control-allow-origin": JSON_HEADERS["access-control-allow-origin"],
  "access-control-allow-methods": JSON_HEADERS["access-control-allow-methods"],
  "access-control-allow-headers": JSON_HEADERS["access-control-allow-headers"]
};

const TESTNET_SNAPSHOT_CACHE_TTL_MS = 1_000;
const responseCache: ResponseCache = new Map();
const cacheNamespaceIds = new WeakMap<object, number>();
let nextCacheNamespaceId = 1;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "api-worker", stage: 1 });
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
            key: testnetCacheKey(
              includeExpired ? "market-heat:expired" : "market-heat:live",
              env
            ),
            ttlMs: TESTNET_SNAPSHOT_CACHE_TTL_MS,
            load: () =>
              getTestnetMarketHeat({
                fetchImpl: env.fetch ?? fetch,
                includeExpired,
                reader: env.indexerReader
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
            key: testnetCacheKey("price-snapshot", env),
            ttlMs: TESTNET_SNAPSHOT_CACHE_TTL_MS,
            load: () =>
              getTestnetPriceSnapshot({
                fetchImpl: env.fetch ?? fetch,
                reader: env.indexerReader
              })
          })
        ).value
      );
    }

    if (url.pathname === "/testnet/wallet-leaderboards") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      if (!env.indexerReader) {
        return json({ error: "indexer_unavailable" }, 503);
      }

      try {
        return json(
          await getTestnetWalletLeaderboards({
            reader: env.indexerReader,
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

      return json(await getMainnetSuinsNames(url, { fetchImpl: env.fetch ?? fetch }));
    }

    if (url.pathname === "/testnet/quote") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      try {
        return json(
          await getTestnetPredictQuote(parsePredictQuoteRequest(url), {
            inspectQuantity: env.inspectPredictQuoteQuantity
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

    if (url.pathname === "/testnet/redeem-quote") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      try {
        return json(
          await getTestnetPredictRedeemQuote(parsePredictRedeemQuoteRequest(url), {
            inspectQuantity: env.inspectPredictQuoteQuantity
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
            fetchImpl: env.fetch ?? fetch,
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
            fetchImpl: env.fetch ?? fetch,
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

    const tableMatch = url.pathname.match(
      /^\/tables\/([^/]+)(?:\/(summary|ws|activity))?$/
    );
    if (!tableMatch) {
      return json(
        {
          error: "not_found",
          routes: [
            "/health",
            "/testnet/market-heat",
            "/testnet/price-snapshot",
            "/testnet/oracle-settlement",
            "/testnet/oracle-prices",
            "/testnet/wallet-leaderboards",
            "/testnet/quote",
            "/testnet/redeem-quote",
            "/tables/:tableId/summary",
            "/tables/:tableId/ws",
            "/tables/:tableId/activity"
          ]
        },
        404
      );
    }

    const tableId = decodeURIComponent(tableMatch[1]);
    const action = tableMatch[2] ?? "summary";
    const room = tableRoom(env, tableId);

    if (action === "summary" && request.method === "GET") {
      return room.fetch(new Request("https://table-room/summary"));
    }

    if (action === "ws" && request.method === "GET") {
      return room.fetch(request);
    }

    if (action === "activity" && request.method === "POST") {
      return room.fetch(
        new Request("https://table-room/activity", {
          method: "POST",
          body: request.body
        })
      );
    }

    return json({ error: "method_not_allowed" }, 405);
  }
};

function testnetCacheKey(name: string, env: Env): string {
  return [
    "testnet",
    name,
    env.fetch ? `fetch:${cacheNamespaceId(env.fetch)}` : "fetch:global",
    env.indexerReader ? `reader:${cacheNamespaceId(env.indexerReader)}` : "reader:none"
  ].join(":");
}

function parseIncludeExpiredRequest(url: URL): boolean {
  return url.searchParams.get("includeExpired") === "true";
}

function cacheNamespaceId(value: object): number {
  const existing = cacheNamespaceIds.get(value);
  if (existing !== undefined) {
    return existing;
  }

  const next = nextCacheNamespaceId;
  nextCacheNamespaceId += 1;
  cacheNamespaceIds.set(value, next);
  return next;
}

export class TableRoom implements DurableObject {
  private readonly tableId: string;
  private readonly sockets = new Map<WebSocket, string>();
  private readonly tableState: TableState;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {
    this.tableId = state.id.name ?? state.id.toString();
    this.tableState = createTableState(this.tableId, { nowMs: Date.now() });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/summary") {
      return json(this.summary());
    }

    if (url.pathname === "/activity" && request.method === "POST") {
      return this.broadcastActivity(request);
    }

    if (request.headers.get("upgrade") !== "websocket") {
      return json({ error: "expected_websocket_upgrade" }, 426);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.accept(server);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  private accept(socket: WebSocket): void {
    socket.accept();

    const nowMs = Date.now();
    const sessionId = crypto.randomUUID();
    const spectatorId = crypto.randomUUID();
    const change = addSession(this.tableState, {
      sessionId,
      spectatorId,
      nowMs
    });

    this.sockets.set(socket, sessionId);

    socket.send(
      encodeServerMessage({
        type: "welcome",
        table: this.summary(),
        spectatorId
      })
    );
    this.broadcastEvents(change.events);

    socket.addEventListener("message", (event) => {
      this.handleSocketMessage(socket, event.data);
    });

    socket.addEventListener("close", () => {
      this.close(socket);
    });

    socket.addEventListener("error", () => {
      this.close(socket);
    });
  }

  private handleSocketMessage(socket: WebSocket, data: unknown): void {
    const sessionId = this.sockets.get(socket);
    if (!sessionId || !getSession(this.tableState, sessionId)) {
      return;
    }

    if (typeof data !== "string") {
      this.sendError(socket, "bad_message", "Messages must be JSON strings.");
      return;
    }

    const message = parseClientMessage(data);
    if (!message) {
      this.sendError(socket, "bad_json", "Message does not match the realtime protocol.");
      return;
    }

    this.handleClientMessage(socket, sessionId, message);
  }

  private handleClientMessage(
    socket: WebSocket,
    sessionId: string,
    message: ClientMessage
  ): void {
    const nowMs = Date.now();

    switch (message.type) {
      case "join":
        if (!message.spectatorId) {
          touchSession(this.tableState, sessionId, nowMs);
        }
        if (message.spectatorId) {
          setSessionSpectatorId(this.tableState, sessionId, message.spectatorId, nowMs);
        }
        socket.send(
          encodeServerMessage({
            type: "welcome",
            table: this.summary(),
            spectatorId: getSession(this.tableState, sessionId)?.spectatorId ?? sessionId
          })
        );
        return;

      case "ping":
        touchSession(this.tableState, sessionId, nowMs);
        socket.send(
          encodeServerMessage({
            type: "pong",
            atMs: nowMs,
            nonce: message.nonce
          })
        );
        return;

      case "arm_copy":
        this.broadcastEvents(
          armCopy(this.tableState, sessionId, message.leaderId, nowMs).events
        );
        return;

      case "disarm_copy":
        this.broadcastEvents(disarmCopy(this.tableState, sessionId, nowMs).events);
        return;
    }
  }

  private close(socket: WebSocket): void {
    const sessionId = this.sockets.get(socket);
    if (!sessionId) {
      return;
    }

    this.sockets.delete(socket);
    this.broadcastEvents(removeSession(this.tableState, sessionId, Date.now()).events);
  }

  private summary(): TableSummary {
    return summarizeTableState(this.tableState);
  }

  private broadcastEvents(events: TableDeltaMessage["event"][]): void {
    for (const event of events) {
      this.broadcastDelta(event);
    }
  }

  private async broadcastActivity(request: Request): Promise<Response> {
    let activity: unknown;
    try {
      activity = await request.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }

    try {
      const broadcast = createTableActivityBroadcast(this.tableState, activity);
      for (const message of broadcast.messages) {
        this.broadcastEncoded(encodeServerMessage(message));
      }

      return json({
        ok: true,
        activityCount: Array.isArray(activity) ? activity.length : 0,
        broadcastCount: broadcast.messages.length,
        table: broadcast.summary
      });
    } catch (error) {
      return json(
        {
          error: "bad_activity",
          message: error instanceof Error ? error.message : "Invalid activity trace"
        },
        400
      );
    }
  }

  private broadcastDelta(event: TableDeltaMessage["event"]): void {
    const summary = summarizeTableState(this.tableState);
    const message = encodeServerMessage({
      type: "table_delta",
      tableId: this.tableId,
      atMs: Date.now(),
      spectatorCount: summary.spectatorCount,
      armedCount: summary.armedCount,
      perLeaderArmedCounts: summary.perLeaderArmedCounts,
      hotScore: summary.hotScore,
      event
    });

    for (const socket of this.sockets.keys()) {
      socket.send(message);
    }
  }

  private broadcastEncoded(message: string): void {
    for (const socket of this.sockets.keys()) {
      socket.send(message);
    }
  }

  private sendError(
    socket: WebSocket,
    code: "bad_json" | "bad_message" | "unsupported_message",
    message: string
  ): void {
    socket.send(
      encodeServerMessage({
        type: "error",
        code,
        message
      })
    );
  }
}

function tableRoom(env: Env, tableId: string): DurableObjectStub {
  const id = env.TABLE_ROOM.idFromName(tableId);
  return env.TABLE_ROOM.get(id);
}

function parsePredictQuoteRequest(url: URL): PredictQuoteRequest {
  return {
    oracleId: requireSearchParam(url, "oracleId"),
    expiry: requireSearchParam(url, "expiry"),
    strike: requireSearchParam(url, "strike"),
    side: requireSearchParam(url, "side"),
    spendUsd: requireSearchParam(url, "spendUsd"),
    estimatedPrice: url.searchParams.get("estimatedPrice")
  };
}

function parsePredictRedeemQuoteRequest(url: URL): PredictRedeemQuoteRequest {
  return {
    oracleId: requireSearchParam(url, "oracleId"),
    expiry: requireSearchParam(url, "expiry"),
    strike: requireSearchParam(url, "strike"),
    side: requireSearchParam(url, "side"),
    quantity: requireSearchParam(url, "quantity")
  };
}

function requireSearchParam(url: URL, key: string): string {
  const value = url.searchParams.get(key)?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}
