import {
  createInitialRealtimeActivityState,
  type RealtimeActivityState,
} from "./realtimeActivityModel";
import {
  subscribeToRealtimeActivity,
  type RealtimeActivityConnectionStatus,
  type RealtimeActivitySubscription,
  type RealtimeActivitySubscriptionOptions,
  type RealtimeActivityWebSocketConstructor,
} from "./realtimeActivitySubscription";

export type LiveActivityModeStatus =
  | "replay"
  | "connecting"
  | "live"
  | "fallback";

export type LiveActivityModeSnapshot = {
  activity: RealtimeActivityState;
  activitySource: "replay" | "realtime";
  dataSource: "fixture_replay" | "worker_realtime";
  status: LiveActivityModeStatus;
  statusLabel: "Replay" | "Syncing" | "Live";
};

export type LiveActivityModeController = {
  readonly snapshot: LiveActivityModeSnapshot;
  close: () => void;
  updateReplayActivity: (replayActivity: RealtimeActivityState) => void;
};

export type LiveActivityModeOptions = {
  apiBaseUrl?: string | null;
  tableId: string;
  spectatorId?: string;
  replayActivity: RealtimeActivityState;
  WebSocket?: RealtimeActivityWebSocketConstructor | null;
  subscribe?: (options: RealtimeActivitySubscriptionOptions) => RealtimeActivitySubscription;
  onSnapshot?: (snapshot: LiveActivityModeSnapshot) => void;
};

type InternalConnectionStatus =
  | RealtimeActivityConnectionStatus
  | "fallback"
  | "replay";

export function createLiveActivityMode({
  apiBaseUrl,
  tableId,
  spectatorId,
  replayActivity: initialReplayActivity,
  WebSocket,
  subscribe = subscribeToRealtimeActivity,
  onSnapshot,
}: LiveActivityModeOptions): LiveActivityModeController {
  let replayActivity = initialReplayActivity;
  let realtimeActivity = createInitialRealtimeActivityState();
  let connectionStatus: InternalConnectionStatus = "replay";
  let isClosed = false;
  let subscription: RealtimeActivitySubscription | null = null;
  let snapshot = selectLiveActivitySnapshot(
    replayActivity,
    realtimeActivity,
    connectionStatus,
  );

  const emit = () => {
    if (isClosed) {
      return;
    }

    snapshot = selectLiveActivitySnapshot(
      replayActivity,
      realtimeActivity,
      connectionStatus,
    );
    onSnapshot?.(snapshot);
  };

  const normalizedApiBaseUrl = normalizeRealtimeApiBaseUrl(apiBaseUrl);

  if (apiBaseUrl && !normalizedApiBaseUrl) {
    connectionStatus = "fallback";
    snapshot = selectLiveActivitySnapshot(
      replayActivity,
      realtimeActivity,
      connectionStatus,
    );
  } else if (normalizedApiBaseUrl) {
    const WebSocketConstructor = resolveWebSocketConstructor(WebSocket);

    if (!WebSocketConstructor) {
      connectionStatus = "fallback";
      snapshot = selectLiveActivitySnapshot(
        replayActivity,
        realtimeActivity,
        connectionStatus,
      );
    } else {
      let receivedStatus = false;

      try {
        subscription = subscribe({
          apiBaseUrl: normalizedApiBaseUrl,
          tableId,
          spectatorId,
          WebSocket: WebSocketConstructor,
          initialState: realtimeActivity,
          onStateChange: (nextState) => {
            realtimeActivity = nextState;
            emit();
          },
          onStatusChange: (nextStatus) => {
            receivedStatus = true;
            connectionStatus = nextStatus;
            emit();
          },
        });

        if (!receivedStatus) {
          connectionStatus = subscription.status;
          emit();
        }
      } catch {
        subscription = null;
        connectionStatus = "fallback";
        snapshot = selectLiveActivitySnapshot(
          replayActivity,
          realtimeActivity,
          connectionStatus,
        );
      }
    }
  }

  return {
    get snapshot() {
      return snapshot;
    },
    close: () => {
      if (isClosed) {
        return;
      }

      isClosed = true;
      subscription?.close();
    },
    updateReplayActivity: (nextReplayActivity) => {
      replayActivity = nextReplayActivity;
      emit();
    },
  };
}

export function createReplayLiveActivitySnapshot(
  replayActivity: RealtimeActivityState,
): LiveActivityModeSnapshot {
  return selectLiveActivitySnapshot(
    replayActivity,
    createInitialRealtimeActivityState(),
    "replay",
  );
}

export function normalizeRealtimeApiBaseUrl(
  apiBaseUrl?: string | null,
): string | null {
  const trimmedApiBaseUrl = apiBaseUrl?.trim();

  if (!trimmedApiBaseUrl) {
    return null;
  }

  try {
    const url = new URL(trimmedApiBaseUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (!url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function selectLiveActivitySnapshot(
  replayActivity: RealtimeActivityState,
  realtimeActivity: RealtimeActivityState,
  connectionStatus: InternalConnectionStatus,
): LiveActivityModeSnapshot {
  const status = getLiveActivityModeStatus(connectionStatus);
  const hasRealtimeActivity =
    status === "live" && realtimeActivity.latestActivity !== null;

  return {
    activity: hasRealtimeActivity ? realtimeActivity : replayActivity,
    activitySource: hasRealtimeActivity ? "realtime" : "replay",
    dataSource: hasRealtimeActivity ? "worker_realtime" : "fixture_replay",
    status,
    statusLabel: getStatusLabel(status),
  };
}

function getLiveActivityModeStatus(
  connectionStatus: InternalConnectionStatus,
): LiveActivityModeStatus {
  if (connectionStatus === "open") {
    return "live";
  }

  if (connectionStatus === "connecting") {
    return "connecting";
  }

  if (connectionStatus === "replay") {
    return "replay";
  }

  return "fallback";
}

function getStatusLabel(status: LiveActivityModeStatus): LiveActivityModeSnapshot["statusLabel"] {
  if (status === "connecting") {
    return "Syncing";
  }

  if (status === "live") {
    return "Live";
  }

  return "Replay";
}

function resolveWebSocketConstructor(
  WebSocketConstructor: RealtimeActivityWebSocketConstructor | null | undefined,
): RealtimeActivityWebSocketConstructor | undefined {
  if (WebSocketConstructor === null) {
    return undefined;
  }

  return WebSocketConstructor ?? globalThis.WebSocket;
}
