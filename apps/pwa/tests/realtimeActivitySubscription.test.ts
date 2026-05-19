import { describe, expect, test } from "bun:test";
import { produceRealtimeActivityTraceById } from "@hot-hands/demo-runner";
import {
  subscribeToRealtimeActivity,
  type RealtimeActivityConnectionStatus,
  type RealtimeActivityWebSocketLike,
} from "../src/realtimeActivitySubscription";
import { createInitialRealtimeActivityState } from "../src/realtimeActivityModel";

class FakeWebSocket implements RealtimeActivityWebSocketLike {
  static instances: FakeWebSocket[] = [];

  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  sent: string[] = [];
  wasClosed = false;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.wasClosed = true;
    this.onclose?.({ code: 1000, reason: "client close" } as CloseEvent);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  open(): void {
    this.onopen?.(new Event("open"));
  }

  receive(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  error(): void {
    this.onerror?.(new Event("error"));
  }
}

describe("realtime activity subscription", () => {
  test("subscribes to the worker table socket and applies only activity messages", () => {
    FakeWebSocket.instances = [];
    const statuses: RealtimeActivityConnectionStatus[] = [];
    const states = [];
    const [signal] = produceRealtimeActivityTraceById("opening-night");

    const subscription = subscribeToRealtimeActivity({
      apiBaseUrl: "https://worker.example.test/api/",
      tableId: "btc-15m",
      spectatorId: "spectator-local",
      WebSocket: FakeWebSocket,
      onStatusChange: (status) => statuses.push(status),
      onStateChange: (state) => states.push(state),
    });

    expect(subscription.status).toBe("connecting");
    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe("wss://worker.example.test/api/tables/btc-15m/ws");
    expect(statuses).toEqual(["connecting"]);
    expect(subscription.state).toEqual(createInitialRealtimeActivityState());

    socket.open();
    expect(subscription.status).toBe("open");
    expect(statuses).toEqual(["connecting", "open"]);
    expect(socket.sent).toEqual([
      JSON.stringify({
        type: "join",
        spectatorId: "spectator-local",
      }),
    ]);

    socket.receive(JSON.stringify({ type: "welcome", spectatorId: "spectator-local" }));
    socket.receive("{");
    expect(subscription.state).toEqual(createInitialRealtimeActivityState());
    expect(states).toEqual([]);

    socket.receive(JSON.stringify(signal));
    expect(subscription.state).toMatchObject({
      source: "fixture_replay",
      handStatus: "signal_landed",
      activeSignal: {
        signalId: "sig-open-1",
      },
      isAutoplaying: false,
      isAutoArmed: false,
    });
    expect(states).toHaveLength(1);

    subscription.close();
    expect(socket.wasClosed).toBe(true);
    expect(subscription.status).toBe("closed");
    expect(statuses).toEqual(["connecting", "open", "closed"]);
  });

  test("omits the join message when no spectator id is provided", () => {
    FakeWebSocket.instances = [];

    subscribeToRealtimeActivity({
      apiBaseUrl: "http://localhost:8787",
      tableId: "btc-15m",
      WebSocket: FakeWebSocket,
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe("ws://localhost:8787/tables/btc-15m/ws");
    socket.open();
    expect(socket.sent).toEqual([]);
  });
});
