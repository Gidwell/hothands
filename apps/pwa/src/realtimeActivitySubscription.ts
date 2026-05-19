import {
  createInitialRealtimeActivityState,
  type RealtimeActivityState,
} from "./realtimeActivityModel";
import { applyRealtimeActivityServerMessageJson } from "./realtimeActivityStreamClient";

export type RealtimeActivityConnectionStatus =
  | "connecting"
  | "open"
  | "closed"
  | "error";

export type RealtimeActivityWebSocketLike = {
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onopen: ((event: Event) => void) | null;
  close: () => void;
  send: (data: string) => void;
};

export type RealtimeActivityWebSocketConstructor = new (
  url: string,
) => RealtimeActivityWebSocketLike;

export type RealtimeActivitySubscriptionOptions = {
  apiBaseUrl: string;
  tableId: string;
  spectatorId?: string;
  initialState?: RealtimeActivityState;
  WebSocket?: RealtimeActivityWebSocketConstructor;
  onStateChange?: (state: RealtimeActivityState) => void;
  onStatusChange?: (status: RealtimeActivityConnectionStatus) => void;
};

export type RealtimeActivitySubscription = {
  readonly state: RealtimeActivityState;
  readonly status: RealtimeActivityConnectionStatus;
  readonly url: string;
  close: () => void;
};

export function subscribeToRealtimeActivity({
  apiBaseUrl,
  tableId,
  spectatorId,
  initialState = createInitialRealtimeActivityState(),
  WebSocket: WebSocketConstructor = globalThis.WebSocket,
  onStateChange,
  onStatusChange,
}: RealtimeActivitySubscriptionOptions): RealtimeActivitySubscription {
  if (!WebSocketConstructor) {
    throw new Error("WebSocket is not available for realtime activity subscription");
  }

  let state = initialState;
  let status: RealtimeActivityConnectionStatus = "connecting";
  const url = buildRealtimeActivityWebSocketUrl(apiBaseUrl, tableId);
  const socket = new WebSocketConstructor(url);

  const setStatus = (nextStatus: RealtimeActivityConnectionStatus) => {
    if (status === nextStatus) {
      return;
    }

    status = nextStatus;
    onStatusChange?.(status);
  };

  onStatusChange?.(status);

  socket.onopen = () => {
    setStatus("open");

    if (spectatorId) {
      socket.send(
        JSON.stringify({
          type: "join",
          spectatorId,
        }),
      );
    }
  };

  socket.onmessage = (event) => {
    if (typeof event.data !== "string") {
      return;
    }

    const nextState = applyRealtimeActivityServerMessageJson(state, event.data);

    if (nextState === state) {
      return;
    }

    state = nextState;
    onStateChange?.(state);
  };

  socket.onerror = () => {
    setStatus("error");
  };

  socket.onclose = () => {
    setStatus("closed");
  };

  return {
    get state() {
      return state;
    },
    get status() {
      return status;
    },
    url,
    close: () => {
      if (status === "closed") {
        return;
      }

      socket.close();
      setStatus("closed");
    },
  };
}

export function buildRealtimeActivityWebSocketUrl(
  apiBaseUrl: string,
  tableId: string,
): string {
  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.search = "";
  url.hash = "";
  url.pathname = joinPathSegments(
    url.pathname,
    "tables",
    encodeURIComponent(tableId),
    "ws",
  );

  return url.toString();
}

function joinPathSegments(...segments: string[]): string {
  const path = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

  return `/${path}`;
}
