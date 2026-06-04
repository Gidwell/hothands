export type OraclePriceChartStatus = "ready" | "unavailable";

export type OraclePriceChartPoint = {
  timestampMs: number;
  price: number;
  forwardPrice?: number;
  checkpoint?: number;
};

export type OraclePriceChart = {
  status: OraclePriceChartStatus;
  oracleId: string;
  marketLabel: "BTC/USD";
  sourceLabel: string;
  title: string;
  detail: string;
  latestPriceLabel: string | null;
  points: OraclePriceChartPoint[];
};

export type LoadOraclePriceChartOptions = {
  apiBaseUrl?: string;
  oracleId: string;
  fetcher?: typeof fetch;
};

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8789";

export async function loadOraclePriceChart({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  oracleId,
  fetcher = fetch,
}: LoadOraclePriceChartOptions): Promise<OraclePriceChart> {
  try {
    const response = await fetcher(buildOraclePriceChartUrl(apiBaseUrl, oracleId));
    if (!response.ok) {
      return buildUnavailableOraclePriceChart(oracleId);
    }

    return buildOraclePriceChartFromPayload(await response.json(), oracleId);
  } catch {
    return buildUnavailableOraclePriceChart(oracleId);
  }
}

function buildOraclePriceChartFromPayload(payload: unknown, oracleId: string): OraclePriceChart {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const points = parseOraclePriceChartPoints(record.points);
  const latestPrice = numberValue(record.latestPrice);
  const latestPointPrice = points.at(-1)?.price;
  const latestPriceLabel = formatUsdPrice(
    latestPrice && latestPrice > 0 ? latestPrice : latestPointPrice,
  );

  if (points.length < 2) {
    return buildUnavailableOraclePriceChart(oracleId);
  }

  return {
    status: "ready",
    oracleId: stringValue(record.oracleId) ?? oracleId,
    marketLabel: "BTC/USD",
    sourceLabel: formatSourceLabel(record.source),
    title: stringValue(record.title) ?? "DeepBook BTC oracle price",
    detail:
      stringValue(record.detail) ??
      "DeepBook Predict oracle price used for BTC market settlement.",
    latestPriceLabel,
    points,
  };
}

function buildUnavailableOraclePriceChart(oracleId: string): OraclePriceChart {
  return {
    status: "unavailable",
    oracleId,
    marketLabel: "BTC/USD",
    sourceLabel: "Live Testnet",
    title: "DeepBook BTC oracle price",
    detail: "Waiting for DeepBook oracle price history.",
    latestPriceLabel: null,
    points: [],
  };
}

function parseOraclePriceChartPoints(value: unknown): OraclePriceChartPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(parseOraclePriceChartPoint)
    .filter((point): point is OraclePriceChartPoint => point !== null)
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

function parseOraclePriceChartPoint(value: unknown): OraclePriceChartPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const timestampMs = numberValue(record.timestampMs);
  const price = numberValue(record.price);
  if (
    timestampMs === undefined ||
    price === undefined ||
    timestampMs <= 0 ||
    price <= 0
  ) {
    return null;
  }

  const forwardPrice = numberValue(record.forwardPrice);
  const checkpoint = numberValue(record.checkpoint);

  return {
    timestampMs,
    price,
    ...(forwardPrice === undefined ? {} : { forwardPrice }),
    ...(checkpoint === undefined ? {} : { checkpoint }),
  };
}

function buildOraclePriceChartUrl(apiBaseUrl: string, oracleId: string): string {
  const url = new URL("/testnet/oracle-prices", normalizeBaseUrl(apiBaseUrl));
  url.searchParams.set("oracleId", oracleId);

  return url.toString();
}

function normalizeBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
}

function formatSourceLabel(value: unknown): string {
  const source = stringValue(value);
  if (source === "live_testnet") {
    return "Live Testnet";
  }

  return "DeepBook";
}

function formatUsdPrice(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
