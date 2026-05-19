import { describe, expect, test } from "bun:test";
import { produceRealtimeActivityTraceById } from "@hot-hands/demo-runner";
import {
  createLiveActivityMode,
  type LiveActivityModeSnapshot,
} from "../src/liveActivityMode";
import {
  applyRealtimeActivityItem,
  createInitialRealtimeActivityState,
  type RealtimeActivityState,
} from "../src/realtimeActivityModel";
import type {
  RealtimeActivityConnectionStatus,
  RealtimeActivitySubscription,
  RealtimeActivitySubscriptionOptions,
  RealtimeActivityWebSocketLike,
} from "../src/realtimeActivitySubscription";

class FakeWebSocket implements RealtimeActivityWebSocketLike {
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  close(): void {}

  send(): void {}
}

function createFakeSubscriber() {
  const calls: RealtimeActivitySubscriptionOptions[] = [];
  let state = createInitialRealtimeActivityState();
  let status: RealtimeActivityConnectionStatus = "connecting";
  let closeCount = 0;

  const subscription: RealtimeActivitySubscription = {
    get state() {
      return state;
    },
    get status() {
      return status;
    },
    url: "wss://worker.example.test/tables/btc-15m/ws",
    close: () => {
      closeCount += 1;
    },
  };

  return {
    calls,
    get closeCount() {
      return closeCount;
    },
    subscribe: (options: RealtimeActivitySubscriptionOptions) => {
      calls.push(options);
      options.onStatusChange?.(status);
      return subscription;
    },
    pushState: (nextState: RealtimeActivityState) => {
      state = nextState;
      calls.at(-1)?.onStateChange?.(nextState);
    },
    pushStatus: (nextStatus: RealtimeActivityConnectionStatus) => {
      status = nextStatus;
      calls.at(-1)?.onStatusChange?.(nextStatus);
    },
  };
}

function latestSnapshot(snapshots: LiveActivityModeSnapshot[]) {
  return snapshots.at(-1);
}

describe("live activity mode", () => {
  test("keeps deterministic replay when realtime config is absent or invalid", () => {
    const [signal] = produceRealtimeActivityTraceById("opening-night");
    const replayActivity = applyRealtimeActivityItem(
      createInitialRealtimeActivityState(),
      signal,
    );
    const subscriber = createFakeSubscriber();

    const replayMode = createLiveActivityMode({
      apiBaseUrl: "",
      tableId: "btc-15m",
      replayActivity,
      WebSocket: FakeWebSocket,
      subscribe: subscriber.subscribe,
    });

    expect(replayMode.snapshot).toMatchObject({
      activity: replayActivity,
      activitySource: "replay",
      dataSource: "fixture_replay",
      status: "replay",
    });
    expect(subscriber.calls).toEqual([]);

    const invalidMode = createLiveActivityMode({
      apiBaseUrl: "not a worker URL",
      tableId: "btc-15m",
      replayActivity,
      WebSocket: FakeWebSocket,
      subscribe: subscriber.subscribe,
    });

    expect(invalidMode.snapshot).toMatchObject({
      activity: replayActivity,
      activitySource: "replay",
      dataSource: "fixture_replay",
      status: "fallback",
    });
    expect(subscriber.calls).toEqual([]);

    const unavailableMode = createLiveActivityMode({
      apiBaseUrl: "https://worker.example.test",
      tableId: "btc-15m",
      replayActivity,
      WebSocket: null,
      subscribe: subscriber.subscribe,
    });

    expect(unavailableMode.snapshot.status).toBe("fallback");
    expect(unavailableMode.snapshot.activity).toBe(replayActivity);
    expect(subscriber.calls).toEqual([]);
  });

  test("subscribes with valid config and falls back to the latest replay after socket failure", () => {
    const [signal, copySubmitted] = produceRealtimeActivityTraceById("opening-night");
    const replayActivity = applyRealtimeActivityItem(
      createInitialRealtimeActivityState(),
      signal,
    );
    const nextReplayActivity = applyRealtimeActivityItem(replayActivity, copySubmitted);
    const liveActivity = applyRealtimeActivityItem(
      createInitialRealtimeActivityState(),
      signal,
    );
    const snapshots: LiveActivityModeSnapshot[] = [];
    const subscriber = createFakeSubscriber();

    const mode = createLiveActivityMode({
      apiBaseUrl: "https://worker.example.test/api",
      tableId: "btc-15m",
      spectatorId: "spectator-local",
      replayActivity,
      WebSocket: FakeWebSocket,
      subscribe: subscriber.subscribe,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    expect(subscriber.calls).toHaveLength(1);
    expect(subscriber.calls[0]).toMatchObject({
      apiBaseUrl: "https://worker.example.test/api/",
      tableId: "btc-15m",
      spectatorId: "spectator-local",
    });
    expect(mode.snapshot).toMatchObject({
      activity: replayActivity,
      activitySource: "replay",
      status: "connecting",
    });

    subscriber.pushStatus("open");
    expect(mode.snapshot.status).toBe("live");
    expect(mode.snapshot.activitySource).toBe("replay");

    subscriber.pushState(liveActivity);
    expect(mode.snapshot).toMatchObject({
      activity: liveActivity,
      activitySource: "realtime",
      dataSource: "worker_realtime",
      status: "live",
    });

    mode.updateReplayActivity(nextReplayActivity);
    expect(mode.snapshot.activity).toBe(liveActivity);

    subscriber.pushStatus("error");
    expect(mode.snapshot).toMatchObject({
      activity: nextReplayActivity,
      activitySource: "replay",
      dataSource: "fixture_replay",
      status: "fallback",
    });
    expect(latestSnapshot(snapshots)?.activity).toBe(nextReplayActivity);

    mode.close();
    expect(subscriber.closeCount).toBe(1);

    subscriber.pushStatus("open");
    subscriber.pushState(liveActivity);
    expect(mode.snapshot).toMatchObject({
      activity: nextReplayActivity,
      activitySource: "replay",
      status: "fallback",
    });
  });
});
