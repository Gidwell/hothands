import { describe, expect, test } from "bun:test";
import { produceRealtimeActivityTraceById } from "@hot-hands/demo-runner";
import type { RealtimeActivityEvent } from "@hot-hands/shared";
import {
  createRealtimeWorkerHarness,
  type ObservedServerMessage,
} from "../support/realtime-worker-harness";

const EXPECTED_LIFECYCLE: RealtimeActivityEvent[] = [
  "signal_landed",
  "copy_submitted",
  "copy_executed",
  "settlement_posted",
  "hot_hand_updated",
];

describe("realtime activity stream contract", () => {
  test("broadcasts the ordered opening-night fixture lifecycle to a subscribed table socket", async () => {
    const trace = produceRealtimeActivityTraceById("opening-night");
    const tableId = "btc-15m";
    const harness = createRealtimeWorkerHarness();

    const client = await harness.subscribe(tableId);
    try {
      const response = await harness.postActivity(tableId, trace);
      const messages = await client.waitForMessages((items) =>
        observedActivityEvents(items).length >= trace.length &&
        observedHotScoreDeltas(items).length >= hotScoreUpdateCount(trace)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        activityCount: trace.length,
        broadcastCount: trace.length + hotScoreUpdateCount(trace),
        table: {
          tableId,
          hotScore: 65.4,
        },
      });
      expect(observedActivityEvents(messages)).toEqual(
        trace.map((item) => item.event),
      );
      expect(observedActivityEvents(messages).slice(0, EXPECTED_LIFECYCLE.length))
        .toEqual(EXPECTED_LIFECYCLE);
      expect(observedHotScoreDeltas(messages)).toEqual([
        expect.objectContaining({
          type: "table_delta",
          tableId,
          event: "hot_score_updated",
          hotScore: 50.4,
        }),
        expect.objectContaining({
          type: "table_delta",
          tableId,
          event: "hot_score_updated",
          hotScore: 65.4,
        }),
      ]);
    } finally {
      client.close();
    }
  });
});

function observedActivityEvents(
  messages: ObservedServerMessage[],
): RealtimeActivityEvent[] {
  return messages
    .filter((message) => message.type === "table_activity")
    .map((message) => message.event);
}

function observedHotScoreDeltas(messages: ObservedServerMessage[]) {
  return messages.filter((message) =>
    message.type === "table_delta" && message.event === "hot_score_updated"
  );
}

function hotScoreUpdateCount(
  trace: ReturnType<typeof produceRealtimeActivityTraceById>,
): number {
  return trace.filter((item) =>
    item.event === "hot_hand_updated" && item.hotScore !== undefined
  ).length;
}
