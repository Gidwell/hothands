import type { RealtimeActivityTraceItem } from "@hot-hands/shared";
import apiWorker, { TableRoom, type Env } from "../../../apps/api-worker/src/index";
import type { ServerMessage } from "../../../apps/api-worker/src/protocol";

export type ObservedServerMessage = ServerMessage;

type MessagePredicate = (messages: ObservedServerMessage[]) => boolean;
type ResponseInitWithWebSocket = ResponseInit & { webSocket?: WebSocket };
type SocketEventType = "message" | "close" | "error";
type SocketEvent = { data?: unknown };
type SocketListener = (event: SocketEvent) => void;

export interface RealtimeWorkerHarness {
  subscribe(tableId: string): Promise<RealtimeSocketClient>;
  postActivity(tableId: string, trace: RealtimeActivityTraceItem[]): Promise<Response>;
}

export interface RealtimeSocketClient {
  readonly messages: ObservedServerMessage[];
  waitForMessages(predicate: MessagePredicate, timeoutMs?: number): Promise<ObservedServerMessage[]>;
  close(): void;
}

export function createRealtimeWorkerHarness(): RealtimeWorkerHarness {
  installWorkerRuntimeGlobals();

  const namespace = new InMemoryTableRoomNamespace();
  const env = { TABLE_ROOM: namespace as unknown as DurableObjectNamespace } as Env;
  namespace.setEnv(env);

  return {
    async subscribe(tableId: string): Promise<RealtimeSocketClient> {
      const response = await fetchWorker(env, `/tables/${tableId}/ws`, {
        headers: { upgrade: "websocket" },
      }) as Response & { webSocket?: WebSocket };
      const socket = response.webSocket;

      if (response.status !== 101 || !socket) {
        throw new Error(`Expected WebSocket upgrade, received ${response.status}`);
      }

      socket.accept?.();
      return new RealtimeSocketObserver(socket);
    },

    postActivity(tableId: string, trace: RealtimeActivityTraceItem[]): Promise<Response> {
      return fetchWorker(env, `/tables/${tableId}/activity`, {
        method: "POST",
        body: JSON.stringify(trace),
      });
    },
  };
}

class InMemoryTableRoomNamespace {
  private env?: Env;
  private readonly rooms = new Map<string, TableRoom>();

  setEnv(env: Env): void {
    this.env = env;
  }

  idFromName(name: string): DurableObjectId {
    return {
      name,
      toString: () => name,
    } as DurableObjectId;
  }

  get(id: DurableObjectId): DurableObjectStub {
    const tableId = id.name ?? id.toString();
    let room = this.rooms.get(tableId);

    if (!room) {
      if (!this.env) {
        throw new Error("Realtime worker harness env is not initialized");
      }
      room = new TableRoom({ id } as DurableObjectState, this.env);
      this.rooms.set(tableId, room);
    }

    return {
      fetch: (request: Request) => room.fetch(request),
    } as DurableObjectStub;
  }
}

class RealtimeSocketObserver implements RealtimeSocketClient {
  readonly messages: ObservedServerMessage[] = [];
  private readonly waiters = new Set<{
    predicate: MessagePredicate;
    resolve: (messages: ObservedServerMessage[]) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>();

  constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      this.messages.push(JSON.parse(event.data) as ObservedServerMessage);
      this.flushWaiters();
    });
  }

  waitForMessages(
    predicate: MessagePredicate,
    timeoutMs = 1_000,
  ): Promise<ObservedServerMessage[]> {
    if (predicate(this.messages)) {
      return Promise.resolve([...this.messages]);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve: (messages: ObservedServerMessage[]) => resolve([...messages]),
        reject,
        timeoutId: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(`Timed out waiting for realtime messages after ${timeoutMs}ms`));
        }, timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }

  close(): void {
    this.socket.close();
  }

  private flushWaiters(): void {
    for (const waiter of this.waiters) {
      if (!waiter.predicate(this.messages)) {
        continue;
      }

      clearTimeout(waiter.timeoutId);
      this.waiters.delete(waiter);
      waiter.resolve(this.messages);
    }
  }
}

class WorkerResponse extends Response {
  readonly webSocket?: WebSocket;

  constructor(body?: BodyInit | null, init?: ResponseInitWithWebSocket) {
    super(body, init);
    this.webSocket = init?.webSocket;
  }
}

class InMemoryWebSocket {
  private accepted = false;
  private peer?: InMemoryWebSocket;
  private readonly listeners: Record<SocketEventType, Set<SocketListener>> = {
    message: new Set(),
    close: new Set(),
    error: new Set(),
  };

  accept(): void {
    this.accepted = true;
  }

  send(data: string): void {
    if (!this.accepted || !this.peer?.accepted) {
      return;
    }

    this.peer.dispatch("message", { data });
  }

  addEventListener(type: SocketEventType, listener: SocketListener): void {
    this.listeners[type].add(listener);
  }

  close(): void {
    this.dispatch("close", {});
    this.peer?.dispatch("close", {});
  }

  pairWith(peer: InMemoryWebSocket): void {
    this.peer = peer;
  }

  private dispatch(type: SocketEventType, event: SocketEvent): void {
    for (const listener of this.listeners[type]) {
      listener(event);
    }
  }
}

class InMemoryWebSocketPair {
  readonly 0: WebSocket;
  readonly 1: WebSocket;

  constructor() {
    const client = new InMemoryWebSocket();
    const server = new InMemoryWebSocket();
    client.pairWith(server);
    server.pairWith(client);

    this[0] = client as unknown as WebSocket;
    this[1] = server as unknown as WebSocket;
  }
}

async function fetchWorker(
  env: Env,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return apiWorker.fetch(new Request(`https://hot-hands.local${path}`, init), env);
}

function installWorkerRuntimeGlobals(): void {
  Object.assign(globalThis, {
    WebSocketPair: InMemoryWebSocketPair,
    Response: WorkerResponse,
  });
}
