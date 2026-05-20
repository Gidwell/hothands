export interface DevTestnetConfig {
  apiHost: string;
  apiPort: number;
  apiUrl: string;
  pwaHost: string;
  pwaPort: number;
  pwaUrl: string;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 8789;
const DEFAULT_PWA_PORT = 5176;

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

  return {
    apiHost,
    apiPort,
    apiUrl: localHttpUrl(apiHost, apiPort),
    pwaHost,
    pwaPort,
    pwaUrl: localHttpUrl(pwaHost, pwaPort),
  };
}

function readPort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

function localHttpUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}
