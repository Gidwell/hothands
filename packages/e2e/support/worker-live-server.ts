import {
  addSession,
  createTableState,
  removeSession,
  setSessionSpectatorId,
  summarizeTableState,
  touchSession,
  type TableState,
} from "../../../apps/api-worker/src/table-state";
import { createTableActivityBroadcast } from "../../../apps/api-worker/src/table-activity";
import { getCapturedTestnetMarketHeat } from "../../../apps/api-worker/src/market-heat";
import {
  encodeServerMessage,
  parseClientMessage,
  type TableDeltaMessage,
} from "../../../apps/api-worker/src/protocol";

const host = "127.0.0.1";
const port = Number(process.env.HOT_HANDS_E2E_WORKER_LIVE_WORKER_PORT ?? 8788);

const jsonHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json; charset=utf-8",
};

const corsHeaders = {
  "access-control-allow-origin": jsonHeaders["access-control-allow-origin"],
  "access-control-allow-methods": jsonHeaders["access-control-allow-methods"],
  "access-control-allow-headers": jsonHeaders["access-control-allow-headers"],
};

type LocalSocket = {
  data: { tableId: string };
  send: (message: string) => void;
};

const rooms = new Map<string, LocalTableRoom>();

Bun.serve({
  hostname: host,
  port,
  async fetch(request, server) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "local-worker-live-harness", stage: 1 });
    }

    if (url.pathname === "/testnet/market-heat") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      return json(getCapturedTestnetMarketHeat());
    }

    const tableMatch = url.pathname.match(
      /^\/tables\/([^/]+)(?:\/(summary|ws|activity))?$/,
    );
    if (!tableMatch) {
      return json(
        {
          error: "not_found",
          routes: [
            "/health",
            "/testnet/market-heat",
            "/tables/:tableId/summary",
            "/tables/:tableId/ws",
            "/tables/:tableId/activity",
          ],
        },
        404,
      );
    }

    const tableId = decodeURIComponent(tableMatch[1]);
    const action = tableMatch[2] ?? "summary";
    const room = getRoom(tableId);

    if (action === "summary" && request.method === "GET") {
      return json(room.summary());
    }

    if (action === "ws" && request.method === "GET") {
      if (server.upgrade(request, { data: { tableId } })) {
        return;
      }

      return json({ error: "expected_websocket_upgrade" }, 426);
    }

    if (action === "activity" && request.method === "POST") {
      return room.broadcastActivity(request);
    }

    return json({ error: "method_not_allowed" }, 405);
  },
  websocket: {
    open(socket) {
      getRoom(socket.data.tableId).open(socket);
    },
    message(socket, message) {
      getRoom(socket.data.tableId).message(socket, message);
    },
    close(socket) {
      getRoom(socket.data.tableId).close(socket);
    },
  },
});

console.log(`local worker-live harness listening on http://${host}:${port}`);

class LocalTableRoom {
  private readonly sockets = new Map<LocalSocket, string>();
  private readonly tableState: TableState;

  constructor(private readonly tableId: string) {
    this.tableState = createTableState(this.tableId, { nowMs: Date.now() });
  }

  open(socket: LocalSocket): void {
    const nowMs = Date.now();
    const sessionId = crypto.randomUUID();
    const spectatorId = crypto.randomUUID();
    const change = addSession(this.tableState, {
      sessionId,
      spectatorId,
      nowMs,
    });

    this.sockets.set(socket, sessionId);
    socket.send(
      encodeServerMessage({
        type: "welcome",
        table: this.summary(),
        spectatorId,
      }),
    );
    this.broadcastEvents(change.events);
  }

  message(socket: LocalSocket, message: string | Buffer): void {
    const sessionId = this.sockets.get(socket);
    if (!sessionId) {
      return;
    }

    if (typeof message !== "string") {
      this.sendError(socket, "bad_message", "Messages must be JSON strings.");
      return;
    }

    const parsed = parseClientMessage(message);
    if (!parsed) {
      this.sendError(socket, "bad_json", "Message does not match the realtime protocol.");
      return;
    }

    const nowMs = Date.now();
    if (parsed.type === "join") {
      if (parsed.spectatorId) {
        setSessionSpectatorId(this.tableState, sessionId, parsed.spectatorId, nowMs);
      } else {
        touchSession(this.tableState, sessionId, nowMs);
      }
      socket.send(
        encodeServerMessage({
          type: "welcome",
          table: this.summary(),
          spectatorId: parsed.spectatorId ?? sessionId,
        }),
      );
      return;
    }

    if (parsed.type === "ping") {
      touchSession(this.tableState, sessionId, nowMs);
      socket.send(
        encodeServerMessage({
          type: "pong",
          atMs: nowMs,
          nonce: parsed.nonce,
        }),
      );
    }
  }

  close(socket: LocalSocket): void {
    const sessionId = this.sockets.get(socket);
    if (!sessionId) {
      return;
    }

    this.sockets.delete(socket);
    this.broadcastEvents(removeSession(this.tableState, sessionId, Date.now()).events);
  }

  summary() {
    return summarizeTableState(this.tableState);
  }

  async broadcastActivity(request: Request): Promise<Response> {
    let activity: unknown;
    try {
      activity = await request.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }

    try {
      const broadcast = createTableActivityBroadcast(this.tableState, activity);
      for (const message of broadcast.messages) {
        this.broadcast(encodeServerMessage(message));
      }

      return json({
        ok: true,
        activityCount: Array.isArray(activity) ? activity.length : 0,
        broadcastCount: broadcast.messages.length,
        table: broadcast.summary,
      });
    } catch (error) {
      return json(
        {
          error: "bad_activity",
          message: error instanceof Error ? error.message : "Invalid activity trace",
        },
        400,
      );
    }
  }

  private broadcastEvents(events: TableDeltaMessage["event"][]): void {
    const summary = this.summary();
    for (const event of events) {
      this.broadcast(
        encodeServerMessage({
          type: "table_delta",
          tableId: this.tableId,
          atMs: Date.now(),
          spectatorCount: summary.spectatorCount,
          armedCount: summary.armedCount,
          perLeaderArmedCounts: summary.perLeaderArmedCounts,
          hotScore: summary.hotScore,
          event,
        }),
      );
    }
  }

  private broadcast(message: string): void {
    for (const socket of this.sockets.keys()) {
      socket.send(message);
    }
  }

  private sendError(
    socket: LocalSocket,
    code: "bad_json" | "bad_message" | "unsupported_message",
    message: string,
  ): void {
    socket.send(
      encodeServerMessage({
        type: "error",
        code,
        message,
      }),
    );
  }
}

function getRoom(tableId: string): LocalTableRoom {
  let room = rooms.get(tableId);
  if (!room) {
    room = new LocalTableRoom(tableId);
    rooms.set(tableId, room);
  }

  return room;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}
