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
});
