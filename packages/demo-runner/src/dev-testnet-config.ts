export interface DevTestnetConfig {
  apiCommand: string[];
  apiHost: string;
  apiPort: number;
  apiUrl: string;
  cleanupPorts: number[];
  liveIndexerCommand: string[] | null;
  pwaCommand: string[];
  pwaHost: string;
  pwaPort: number;
  pwaUrl: string;
  readinessTimeoutMs: number;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 8789;
const DEFAULT_PWA_PORT = 5176;
const DEFAULT_READINESS_TIMEOUT_MS = 30_000;
const API_COMMAND = ["bun", "apps/api-worker/src/testnet-dev-server.ts"];
const LIVE_INDEXER_COMMAND = ["bun", "packages/indexer/src/live.ts"];

export function resolveDevTestnetConfig(
  env: Record<string, string | undefined>,
): DevTestnetConfig {
  const sharedHost = env.HOT_HANDS_TESTNET_HOST;
  const apiHost = env.HOT_HANDS_TESTNET_API_HOST ?? sharedHost ?? DEFAULT_HOST;
  const pwaHost = env.HOT_HANDS_TESTNET_PWA_HOST ?? sharedHost ?? DEFAULT_HOST;
  const apiPort = readPort(
    env.HOT_HANDS_TESTNET_API_PORT ?? env.PORT,
    DEFAULT_API_PORT,
  );
  const pwaPort = readPort(env.HOT_HANDS_TESTNET_PWA_PORT, DEFAULT_PWA_PORT);
  const readinessTimeoutMs = readPositiveInteger(
    env.HOT_HANDS_DEV_READY_TIMEOUT_MS,
    DEFAULT_READINESS_TIMEOUT_MS,
  );
  const liveIndexerCommand =
    env.DATABASE_URL && env.HOT_HANDS_INDEXER_LIVE !== "false"
      ? LIVE_INDEXER_COMMAND
      : null;

  return {
    apiCommand: API_COMMAND,
    apiHost,
    apiPort,
    apiUrl: localHttpUrl(apiHost, apiPort),
    cleanupPorts: [apiPort, pwaPort],
    liveIndexerCommand,
    pwaCommand: [
      "bun",
      "run",
      "--cwd",
      "apps/pwa",
      "dev",
      "--",
      "--host",
      pwaHost,
      "--port",
      String(pwaPort),
    ],
    pwaHost,
    pwaPort,
    pwaUrl: localHttpUrl(pwaHost, pwaPort),
    readinessTimeoutMs,
  };
}

function readPort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

function localHttpUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
