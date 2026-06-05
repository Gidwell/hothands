export interface DevTestnetConfig {
  apiCommand: string[];
  apiHost: string;
  apiPort: number;
  apiUrl: string;
  bootstrapBackfillCommand: string[] | null;
  cleanupPorts: number[];
  liveIndexerCommand: string[] | null;
  migrationCommand: string[] | null;
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
const BACKFILL_COMMAND = ["bun", "packages/indexer/src/backfill-predict.ts", "--write"];
const LIVE_INDEXER_COMMAND = ["bun", "packages/indexer/src/live.ts"];
const MIGRATION_COMMAND = ["bun", "packages/indexer/src/migrate.ts"];
const FALLBACK_TESTNET_OPT_IN = "HOT_HANDS_ALLOW_FALLBACK_TESTNET";

export function resolveDevTestnetConfig(
  env: Record<string, string | undefined>,
): DevTestnetConfig {
  if (!env.DATABASE_URL && env[FALLBACK_TESTNET_OPT_IN] !== "true") {
    throw new Error(
      [
        "DATABASE_URL is required for bun run dev:testnet.",
        "Hot Hands treats non-indexed testnet mode as degraded; set DATABASE_URL to a local Postgres database.",
        `Only set ${FALLBACK_TESTNET_OPT_IN}=true for explicit fallback debugging.`,
      ].join(" "),
    );
  }

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
  const migrationCommand =
    env.DATABASE_URL && env.HOT_HANDS_DEV_MIGRATE !== "false"
      ? MIGRATION_COMMAND
      : null;
  const bootstrapBackfillCommand =
    env.DATABASE_URL && env.HOT_HANDS_DEV_BACKFILL !== "false"
      ? BACKFILL_COMMAND
      : null;

  return {
    apiCommand: API_COMMAND,
    apiHost,
    apiPort,
    apiUrl: localHttpUrl(apiHost, apiPort),
    bootstrapBackfillCommand,
    cleanupPorts: [apiPort, pwaPort],
    liveIndexerCommand,
    migrationCommand,
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
