export type ClientMessage =
  | JoinMessage
  | PingMessage
  | ArmCopyMessage
  | DisarmCopyMessage;

export type ServerMessage =
  | WelcomeMessage
  | PongMessage
  | TableDeltaMessage
  | ErrorMessage;

export interface JoinMessage {
  type: "join";
  spectatorId?: string;
}

export interface PingMessage {
  type: "ping";
  nonce?: string;
}

export interface ArmCopyMessage {
  type: "arm_copy";
  leaderId?: string;
}

export interface DisarmCopyMessage {
  type: "disarm_copy";
}

export interface WelcomeMessage {
  type: "welcome";
  table: TableSummary;
  spectatorId: string;
}

export interface PongMessage {
  type: "pong";
  atMs: number;
  nonce?: string;
}

export interface TableDeltaMessage {
  type: "table_delta";
  tableId: string;
  atMs: number;
  spectatorCount: number;
  armedCount: number;
  event:
    | "spectator_joined"
    | "spectator_left"
    | "copy_armed"
    | "copy_disarmed";
}

export interface ErrorMessage {
  type: "error";
  code: "bad_json" | "bad_message" | "unsupported_message";
  message: string;
}

export interface TableSummary {
  tableId: string;
  spectatorCount: number;
  armedCount: number;
  updatedAtMs: number;
}

export interface SocketSession {
  spectatorId: string;
  armed: boolean;
  joinedAtMs: number;
  lastSeenAtMs: number;
}

export function parseClientMessage(input: string): ClientMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  switch (parsed.type) {
    case "join":
      return {
        type: "join",
        spectatorId: optionalString(parsed.spectatorId)
      };
    case "ping":
      return {
        type: "ping",
        nonce: optionalString(parsed.nonce)
      };
    case "arm_copy":
      return {
        type: "arm_copy",
        leaderId: optionalString(parsed.leaderId)
      };
    case "disarm_copy":
      return { type: "disarm_copy" };
    default:
      return null;
  }
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
