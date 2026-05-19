import { describe, expect, test } from "bun:test";
import {
  encodeServerMessage,
  parseClientMessage,
  type ServerMessage
} from "../src/protocol";

describe("realtime protocol", () => {
  test("parses supported client messages", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "join", spectatorId: "spectator-1" }))
    ).toEqual({ type: "join", spectatorId: "spectator-1" });
    expect(parseClientMessage(JSON.stringify({ type: "ping", nonce: "n1" }))).toEqual({
      type: "ping",
      nonce: "n1"
    });
    expect(
      parseClientMessage(JSON.stringify({ type: "arm_copy", leaderId: "leader-1" }))
    ).toEqual({ type: "arm_copy", leaderId: "leader-1" });
    expect(parseClientMessage(JSON.stringify({ type: "disarm_copy" }))).toEqual({
      type: "disarm_copy"
    });
  });

  test("rejects malformed or unsupported client messages", () => {
    const invalidInputs = [
      "{not-json",
      "[]",
      JSON.stringify({}),
      JSON.stringify({ type: "subscribe" }),
      JSON.stringify({ type: "join", spectatorId: "" }),
      JSON.stringify({ type: "join", spectatorId: 42 }),
      JSON.stringify({ type: "ping", nonce: 42 }),
      JSON.stringify({ type: "arm_copy" }),
      JSON.stringify({ type: "arm_copy", leaderId: "" }),
      JSON.stringify({ type: "disarm_copy", spectatorId: "extra-field" })
    ];

    for (const input of invalidInputs) {
      expect(parseClientMessage(input)).toBeNull();
    }
  });

  test("encodes valid server messages as protocol JSON", () => {
    const message: ServerMessage = {
      type: "table_delta",
      tableId: "table-1",
      atMs: 1000,
      spectatorCount: 3,
      armedCount: 1,
      event: "copy_armed"
    };

    expect(JSON.parse(encodeServerMessage(message))).toEqual(message);
    expect(
      JSON.parse(encodeServerMessage({ type: "pong", atMs: 1000, nonce: undefined }))
    ).toEqual({ type: "pong", atMs: 1000 });
  });

  test("encodes stage 2 table activity messages as protocol JSON", () => {
    const messages: ServerMessage[] = [
      tableActivity({
        event: "signal_landed",
        payload: { signal: signalPayload() }
      }),
      tableActivity({
        sequence: 1,
        sourceSequence: 2,
        event: "copy_submitted",
        label: "Vee Moss submitted copy for Alpha Cruz",
        actorId: "follower-vee",
        followerId: "follower-vee",
        receiptId: "copy-1",
        payload: { copy: copyPayload("submitted") }
      }),
      tableActivity({
        sequence: 2,
        sourceSequence: 2,
        event: "copy_executed",
        receiptId: "copy-1",
        payload: { copy: copyPayload("executed") }
      }),
      tableActivity({
        sequence: 3,
        sourceSequence: 3,
        event: "settlement_posted",
        payload: {
          settlement: {
            signalId: "signal-1",
            leaderId: "leader-1",
            status: "settled_loss",
            settlementPrice: 64_900,
            pnl: -7.25
          }
        }
      }),
      tableActivity({
        sequence: 4,
        sourceSequence: 4,
        event: "hot_hand_updated",
        hotScore: 88.5,
        payload: {
          hotHand: {
            leaderChanged: true,
            currentLeaderId: "leader-1",
            previousLeaderId: "leader-0",
            score: leaderScore()
          }
        }
      })
    ];

    for (const message of messages) {
      expect(JSON.parse(encodeServerMessage(message))).toEqual(message);
    }
  });

  test("encodes hot score table deltas as protocol JSON", () => {
    const message: ServerMessage = {
      type: "table_delta",
      tableId: "table-1",
      atMs: 2500,
      spectatorCount: 3,
      armedCount: 1,
      perLeaderArmedCounts: { "leader-1": 1 },
      hotScore: 88.5,
      event: "hot_score_updated"
    };

    expect(JSON.parse(encodeServerMessage(message))).toEqual(message);
  });

  test("rejects invalid server messages before encoding", () => {
    const invalidMessages: unknown[] = [
      { type: "pong", atMs: -1 },
      {
        type: "table_delta",
        tableId: "table-1",
        atMs: 1000,
        spectatorCount: 0,
        armedCount: 1,
        event: "copy_armed"
      },
      {
        type: "table_delta",
        tableId: "",
        atMs: 1000,
        spectatorCount: 1,
        armedCount: 0,
        event: "copy_armed"
      },
      {
        type: "table_delta",
        tableId: "table-1",
        atMs: 1000,
        spectatorCount: 1,
        armedCount: 0,
        event: "settlement"
      },
      {
        type: "welcome",
        table: {
          tableId: "table-1",
          spectatorCount: 0,
          armedCount: 1,
          updatedAtMs: 1000
        },
        spectatorId: "spectator-1"
      },
      { type: "error", code: "panic", message: "bad code" },
      { type: "error", code: "bad_message", message: "" }
    ];

    for (const message of invalidMessages) {
      expect(() => encodeServerMessage(message as ServerMessage)).toThrow(
        "Invalid server message"
      );
    }
  });

  test("rejects malformed stage 2 table activity messages before encoding", () => {
    const invalidMessages: unknown[] = [
      {
        ...tableActivity({ leaderId: "" }),
      },
      tableActivity({
        event: "copy_executed",
        payload: { copy: copyPayload("submitted") }
      }),
      tableActivity({
        event: "settlement_posted",
        payload: {
          settlement: {
            signalId: "signal-1",
            leaderId: "leader-1",
            status: "settled_loss",
            settlementPrice: 64_900,
            pnl: Number.NaN
          }
        }
      }),
      tableActivity({
        event: "hot_hand_updated",
        hotScore: -1,
        payload: {
          hotHand: {
            leaderChanged: true,
            currentLeaderId: "leader-1",
            score: leaderScore()
          }
        }
      }),
      {
        ...tableActivity({ payload: { signal: signalPayload() } }),
        extra: "not-protocol"
      }
    ];

    for (const message of invalidMessages) {
      expect(() => encodeServerMessage(message as ServerMessage)).toThrow(
        "Invalid server message"
      );
    }
  });
});

function tableActivity(overrides: Partial<Extract<ServerMessage, { type: "table_activity" }>> = {}): ServerMessage {
  return {
    type: "table_activity",
    source: "fixture_replay",
    sequence: 0,
    sourceSequence: 1,
    atMs: 2_000,
    tableId: "table-1",
    event: "signal_landed",
    label: "Alpha Cruz posted UP BTC-USD",
    actorId: "leader-1",
    leaderId: "leader-1",
    signalId: "signal-1",
    spectatorCount: 3,
    armedCount: 1,
    payload: { signal: signalPayload() },
    ...overrides
  };
}

function signalPayload() {
  return {
    signalId: "signal-1",
    leaderId: "leader-1",
    oracleId: "btc-15m",
    market: "BTC-USD",
    direction: "up" as const,
    strike: 65_000,
    expiryMs: 2_900,
    confidenceBps: 7_200,
    createdAtMs: 2_000,
    status: "copyable" as const,
    thesis: "Continuation after pullback."
  };
}

function copyPayload(status: "submitted" | "executed") {
  return {
    receiptId: "copy-1",
    signalId: "signal-1",
    followerId: "follower-vee",
    leaderId: "leader-1",
    copiedCost: 120,
    cumulativeCopiedVolume: 120,
    status
  };
}

function leaderScore() {
  return {
    rank: 1,
    traderId: "leader-1",
    handle: "alpha",
    displayName: "Alpha Cruz",
    hotScore: 88.5,
    roi: 0.24,
    pnl: 80,
    hitRate: 1,
    resolvedCount: 1,
    winStreak: 1,
    copiedVolume: 120,
    freshnessScore: 0.95,
    label: "Hot Hand" as const
  };
}
