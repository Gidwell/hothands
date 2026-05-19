import { expect, test, type Page } from "@playwright/test";
import { produceRealtimeActivityTraceById } from "@hot-hands/demo-runner";
import type { RealtimeActivityTraceItem } from "@hot-hands/shared";

type ObservedMockSocket = {
  url: string;
  sent: string[];
};

declare global {
  interface Window {
    __hotHandsLiveActivityMock?: {
      sockets: ObservedMockSocket[];
    };
  }
}

test("mobile live activity mode subscribes to the worker stream", async ({ page }) => {
  const [openingActivity] = produceRealtimeActivityTraceById("opening-night");

  await installMockLiveActivitySocket(page, openingActivity);
  await page.goto("/");

  await expect(page.getByTestId("activity-connection-status")).toHaveText("Live");
  await expect(page.getByTestId("spectator-rail")).toContainText(openingActivity.label);

  const liveSocket = await findMockLiveSocket(page);
  expect(liveSocket).not.toBeNull();
  expect(liveSocket!.url).toContain("/live/tables/btc-15m/ws");
  expect(liveSocket!.sent.map((payload) => JSON.parse(payload))).toEqual([
    {
      type: "join",
      spectatorId: "spectator-local",
    },
  ]);
});

async function installMockLiveActivitySocket(
  page: Page,
  openingActivity: RealtimeActivityTraceItem,
) {
  await page.addInitScript((activity) => {
    const NativeWebSocket = window.WebSocket;
    const liveTablePath = "/live/tables/btc-15m/ws";
    const mock = {
      sockets: [] as ObservedMockSocket[],
    };

    Object.defineProperty(window, "__hotHandsLiveActivityMock", {
      configurable: true,
      value: mock,
    });

    class MockLiveActivityWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly url: string;
      readonly protocol = "";
      readonly extensions = "";
      readonly bufferedAmount = 0;
      readonly sent: string[] = [];
      binaryType: BinaryType = "blob";
      readyState = MockLiveActivityWebSocket.CONNECTING;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        mock.sockets.push(this);

        queueMicrotask(() => {
          this.readyState = MockLiveActivityWebSocket.OPEN;
          const openEvent = new Event("open");
          this.onopen?.(openEvent);
          this.dispatchEvent(openEvent);

          queueMicrotask(() => {
            const messageEvent = new MessageEvent("message", {
              data: JSON.stringify(activity),
            });
            this.onmessage?.(messageEvent);
            this.dispatchEvent(messageEvent);
          });
        });
      }

      close(): void {
        if (this.readyState === MockLiveActivityWebSocket.CLOSED) {
          return;
        }

        this.readyState = MockLiveActivityWebSocket.CLOSED;
        const closeEvent = new CloseEvent("close", {
          code: 1000,
          reason: "client close",
        });
        this.onclose?.(closeEvent);
        this.dispatchEvent(closeEvent);
      }

      send(data: string): void {
        this.sent.push(data);
      }
    }

    function RoutedWebSocket(
      this: WebSocket,
      url: string | URL,
      protocols?: string | string[],
    ) {
      const urlString = String(url);

      if (urlString.includes(liveTablePath)) {
        return new MockLiveActivityWebSocket(urlString);
      }

      if (protocols === undefined) {
        return new NativeWebSocket(url);
      }

      return new NativeWebSocket(url, protocols);
    }

    RoutedWebSocket.prototype = NativeWebSocket.prototype;
    Object.assign(RoutedWebSocket, {
      CONNECTING: NativeWebSocket.CONNECTING,
      OPEN: NativeWebSocket.OPEN,
      CLOSING: NativeWebSocket.CLOSING,
      CLOSED: NativeWebSocket.CLOSED,
    });

    window.WebSocket = RoutedWebSocket as typeof WebSocket;
  }, openingActivity);
}

async function findMockLiveSocket(page: Page): Promise<ObservedMockSocket | null> {
  return page.evaluate(() => {
    const sockets = window.__hotHandsLiveActivityMock?.sockets ?? [];
    const socket = sockets.find((item) =>
      item.url.includes("/live/tables/btc-15m/ws")
    );

    if (!socket) {
      return null;
    }

    return {
      url: socket.url,
      sent: socket.sent,
    };
  });
}
