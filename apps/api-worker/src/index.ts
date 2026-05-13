import {
  type ClientMessage,
  type SocketSession,
  type TableDeltaMessage,
  type TableSummary,
  encodeServerMessage,
  parseClientMessage
} from "./protocol";

export interface Env {
  TABLE_ROOM: DurableObjectNamespace<TableRoom>;
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
  private readonly sessions = new Map<WebSocket, SocketSession>();
  private updatedAtMs = Date.now();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {
    this.tableId = state.id.name ?? state.id.toString();
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

    const session: SocketSession = {
      spectatorId: crypto.randomUUID(),
      armed: false,
      joinedAtMs: Date.now(),
      lastSeenAtMs: Date.now()
    };

    this.sessions.set(socket, session);
    this.updatedAtMs = session.joinedAtMs;

    socket.send(
      encodeServerMessage({
        type: "welcome",
        table: this.summary(),
        spectatorId: session.spectatorId
      })
    );
    this.broadcastDelta("spectator_joined");

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
    const session = this.sessions.get(socket);
    if (!session) {
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

    this.handleClientMessage(socket, session, message);
  }

  private handleClientMessage(
    socket: WebSocket,
    session: SocketSession,
    message: ClientMessage
  ): void {
    session.lastSeenAtMs = Date.now();

    switch (message.type) {
      case "join":
        if (message.spectatorId) {
          session.spectatorId = message.spectatorId;
        }
        socket.send(
          encodeServerMessage({
            type: "welcome",
            table: this.summary(),
            spectatorId: session.spectatorId
          })
        );
        return;

      case "ping":
        socket.send(
          encodeServerMessage({
            type: "pong",
            atMs: session.lastSeenAtMs,
            nonce: message.nonce
          })
        );
        return;

      case "arm_copy":
        if (!session.armed) {
          session.armed = true;
          this.updatedAtMs = session.lastSeenAtMs;
          this.broadcastDelta("copy_armed");
        }
        return;

      case "disarm_copy":
        if (session.armed) {
          session.armed = false;
          this.updatedAtMs = session.lastSeenAtMs;
          this.broadcastDelta("copy_disarmed");
        }
        return;
    }
  }

  private close(socket: WebSocket): void {
    const session = this.sessions.get(socket);
    if (!session) {
      return;
    }

    this.sessions.delete(socket);
    this.updatedAtMs = Date.now();
    this.broadcastDelta(session.armed ? "copy_disarmed" : "spectator_left");

    if (session.armed) {
      this.broadcastDelta("spectator_left");
    }
  }

  private summary(): TableSummary {
    return {
      tableId: this.tableId,
      spectatorCount: this.sessions.size,
      armedCount: this.armedCount(),
      updatedAtMs: this.updatedAtMs
    };
  }

  private armedCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.armed) {
        count += 1;
      }
    }
    return count;
  }

  private broadcastDelta(event: TableDeltaMessage["event"]): void {
    const message = encodeServerMessage({
      type: "table_delta",
      tableId: this.tableId,
      atMs: Date.now(),
      spectatorCount: this.sessions.size,
      armedCount: this.armedCount(),
      event
    });

    for (const socket of this.sessions.keys()) {
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

function tableRoom(env: Env, tableId: string): DurableObjectStub<TableRoom> {
  const id = env.TABLE_ROOM.idFromName(tableId);
  return env.TABLE_ROOM.get(id);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}
