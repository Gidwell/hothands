import { DEEPBOOK_PREDICT_TESTNET_TX_CONFIG } from "@hot-hands/contracts";
import {
  getJsonRpcFullnodeUrl,
  SuiJsonRpcClient,
  type EventId,
  type PaginatedEvents,
  type QueryEventsParams,
} from "@mysten/sui/jsonRpc";
import { normalizeSuiAddress } from "@mysten/sui/utils";

export const PREDICT_MANAGER_CREATED_EVENT_TYPE =
  `${DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId}::predict_manager::PredictManagerCreated`;

export type PredictManagerEventClient = {
  queryEvents(
    input: Pick<QueryEventsParams, "query" | "cursor" | "limit" | "order">,
  ): Promise<Pick<PaginatedEvents, "data" | "hasNextPage" | "nextCursor">>;
};

export type FindPredictManagerForOwnerOptions = {
  client?: PredictManagerEventClient;
  limit?: number;
  maxPages?: number;
  owner: string;
};

export type FindIndexedPredictManagerForOwnerOptions = {
  apiBaseUrl?: string | null;
  fetcher?: typeof fetch;
  owner: string;
};

export async function findPredictManagerForOwner({
  client = createPredictManagerEventClient(),
  limit = 50,
  maxPages = 5,
  owner,
}: FindPredictManagerForOwnerOptions): Promise<string | null> {
  const normalizedOwner = normalizeSuiAddress(owner);
  let cursor: EventId | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.queryEvents({
      query: {
        MoveEventType: PREDICT_MANAGER_CREATED_EVENT_TYPE,
      },
      cursor,
      limit,
      order: "descending",
    });

    for (const event of response.data) {
      const parsedEvent = parsePredictManagerCreatedEvent(event);
      if (parsedEvent && normalizeSuiAddress(parsedEvent.owner) === normalizedOwner) {
        return parsedEvent.managerId;
      }
    }

    if (!response.hasNextPage || !response.nextCursor) {
      break;
    }

    cursor = response.nextCursor;
  }

  return null;
}

export async function findIndexedPredictManagerForOwner({
  apiBaseUrl,
  fetcher = fetch,
  owner,
}: FindIndexedPredictManagerForOwnerOptions): Promise<string | null> {
  const normalizedBaseUrl = apiBaseUrl?.trim();
  if (!normalizedBaseUrl) {
    return null;
  }

  const normalizedOwner = normalizeSuiAddress(owner);
  for (const eventType of ["mint", "redeem"]) {
    const url = new URL(`${normalizedBaseUrl.replace(/\/+$/, "")}/testnet/portfolio-events`);
    url.searchParams.set("wallet", normalizedOwner);
    url.searchParams.set("eventType", eventType);
    url.searchParams.set("limit", "1");

    const response = await fetcher(url.toString());
    if (!response.ok) {
      continue;
    }

    const managerId = parseIndexedPortfolioManagerId(await response.json());
    if (managerId) {
      return managerId;
    }
  }

  return null;
}

function createPredictManagerEventClient(): PredictManagerEventClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  });
}

function parsePredictManagerCreatedEvent(
  event: unknown,
): { managerId: string; owner: string } | null {
  if (!isRecord(event)) {
    return null;
  }

  const parsedJson = isRecord(event.parsedJson)
    ? event.parsedJson
    : isRecord(event.json)
      ? event.json
      : null;
  if (!parsedJson) {
    return null;
  }

  const managerId = parsedJson.manager_id ?? parsedJson.managerId;
  const owner = parsedJson.owner;
  if (typeof managerId !== "string" || typeof owner !== "string") {
    return null;
  }

  return {
    managerId,
    owner,
  };
}

function parseIndexedPortfolioManagerId(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return null;
  }

  for (const event of payload.data) {
    if (!isRecord(event)) {
      continue;
    }

    const parsedJson = isRecord(event.parsedJson)
      ? event.parsedJson
      : isRecord(event.json)
        ? event.json
        : null;
    const managerId = parsedJson?.manager_id ?? parsedJson?.managerId;
    if (typeof managerId === "string" && managerId.trim()) {
      return managerId;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
