import { getTestnetMarketHeat } from "./market-heat";

interface BunServer {
  readonly url: URL;
  readonly port: number;
  stop(closeActiveConnections?: boolean): void;
}

interface BunRuntime {
  readonly env: Record<string, string | undefined>;
  serve(options: {
    hostname: string;
    port: number;
    fetch(request: Request): Response | Promise<Response>;
  }): BunServer;
}

declare const Bun: BunRuntime;

export interface TestnetDevServerFetchOptions {
  fetchImpl?: typeof fetch;
}

export interface TestnetDevServerOptions extends TestnetDevServerFetchOptions {
  hostname?: string;
  port?: number;
}

const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_PORT = 8789;

const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json; charset=utf-8"
};

const CORS_HEADERS = {
  "access-control-allow-origin": JSON_HEADERS["access-control-allow-origin"],
  "access-control-allow-methods": JSON_HEADERS["access-control-allow-methods"],
  "access-control-allow-headers": JSON_HEADERS["access-control-allow-headers"]
};

export function createTestnetDevServerFetch({
  fetchImpl = fetch
}: TestnetDevServerFetchOptions = {}): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "api-worker-testnet-dev", stage: 3 });
    }

    if (url.pathname === "/testnet/market-heat") {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      return json(await getTestnetMarketHeat({ fetchImpl }));
    }

    return json(
      {
        error: "not_found",
        routes: ["/health", "/testnet/market-heat"]
      },
      404
    );
  };
}

export function createTestnetDevServer({
  hostname = DEFAULT_HOSTNAME,
  port = DEFAULT_PORT,
  fetchImpl = fetch
}: TestnetDevServerOptions = {}): BunServer {
  return Bun.serve({
    hostname,
    port,
    fetch: createTestnetDevServerFetch({ fetchImpl })
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

function readPort(value: string | undefined): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}

if ((import.meta as { main?: boolean }).main) {
  const server = createTestnetDevServer({
    hostname: Bun.env.HOST ?? DEFAULT_HOSTNAME,
    port: readPort(Bun.env.HOT_HANDS_TESTNET_API_PORT ?? Bun.env.PORT)
  });

  console.log(`Testnet API dev server listening on ${server.url}`);
  console.log("Routes: GET /health, GET /testnet/market-heat");
}
