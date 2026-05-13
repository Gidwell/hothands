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

export interface Env {
  TABLE_ROOM: DurableObjectNamespace;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "api-worker", stage: 1 });
    }

    const tableMatch = url.pathname.match(/^\/tables\/([^/]+)(?:\/(summary|ws))?$/);
    if (!tableMatch) {
      return json(
        {
          error: "not_found",
          routes: ["/health", "/tables/:tableId/summary", "/tables/:tableId/ws"]
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

    return json({ error: "method_not_allowed" }, 405);
  }
};

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}
