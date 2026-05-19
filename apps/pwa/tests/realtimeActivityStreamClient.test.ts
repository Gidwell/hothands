import { describe, expect, test } from "bun:test";
import { produceRealtimeActivityTraceById } from "@hot-hands/demo-runner";
import {
  applyRealtimeActivityServerMessageJson,
} from "../src/realtimeActivityStreamClient";
import { createInitialRealtimeActivityState } from "../src/realtimeActivityModel";

describe("realtime activity stream client", () => {
  test("applies worker table_activity JSON while ignoring other server messages", () => {
    const trace = produceRealtimeActivityTraceById("opening-night");
    let state = createInitialRealtimeActivityState();

    state = applyRealtimeActivityServerMessageJson(
      state,
      JSON.stringify({
        type: "welcome",
        spectatorId: "spectator-local",
        table: {
          tableId: "btc-15m",
          spectatorCount: 12,
          armedCount: 0,
          updatedAtMs: 1,
        },
      }),
    );
    expect(state).toEqual(createInitialRealtimeActivityState());

    state = applyRealtimeActivityServerMessageJson(
      state,
      JSON.stringify(trace[0]),
    );
    expect(state).toMatchObject({
      source: "fixture_replay",
      handStatus: "signal_landed",
      isAutoplaying: false,
      isAutoArmed: false,
      latestActivity: {
        event: "signal_landed",
        sequence: trace[0].sequence,
      },
      activeSignal: {
        signalId: "sig-open-1",
      },
      openCopyConfirmations: [
        {
          signalId: "sig-open-1",
        },
      ],
    });

    const afterSignal = state;
    state = applyRealtimeActivityServerMessageJson(
      state,
      JSON.stringify({
        type: "table_delta",
        tableId: "btc-15m",
        atMs: 2,
        spectatorCount: 14,
        armedCount: 1,
        event: "copy_armed",
      }),
    );
    expect(state).toBe(afterSignal);

    state = applyRealtimeActivityServerMessageJson(
      state,
      JSON.stringify(trace[1]),
    );
    expect(state).toMatchObject({
      handStatus: "copy_submitted",
      isAutoplaying: false,
      isAutoArmed: false,
      copy: {
        receiptId: "copy-open-1",
        status: "submitted",
      },
      openCopyConfirmations: [],
    });
  });

  test("rejects malformed table_activity JSON without mutating activity state", () => {
    const state = applyRealtimeActivityServerMessageJson(
      createInitialRealtimeActivityState(),
      JSON.stringify(produceRealtimeActivityTraceById("opening-night")[0]),
    );

    expect(applyRealtimeActivityServerMessageJson(state, "{")).toBe(state);
    expect(
      applyRealtimeActivityServerMessageJson(
        state,
        JSON.stringify({
          type: "table_activity",
          source: "fixture_replay",
          sequence: 2,
          sourceSequence: 2,
          atMs: 2,
          tableId: "btc-15m",
          event: "copy_submitted",
          label: "Copy submitted",
          spectatorCount: 10,
          armedCount: 1,
          payload: {
            copy: {
              receiptId: "copy-bad",
              signalId: "sig-open-1",
            },
          },
        }),
      ),
    ).toBe(state);
  });

  test("rejects invalid table_activity counters without mutating activity state", () => {
    const [signal] = produceRealtimeActivityTraceById("opening-night");
    const state = applyRealtimeActivityServerMessageJson(
      createInitialRealtimeActivityState(),
      JSON.stringify(signal),
    );

    const invalidMessages = [
      { ...signal, spectatorCount: -1 },
      { ...signal, armedCount: -1 },
      { ...signal, sequence: 1.5 },
      { ...signal, sourceSequence: 1.5 },
      { ...signal, atMs: -1 },
      { ...signal, spectatorCount: 2, armedCount: 3 },
    ];

    for (const message of invalidMessages) {
      expect(
        applyRealtimeActivityServerMessageJson(state, JSON.stringify(message)),
      ).toBe(state);
    }
  });
});
