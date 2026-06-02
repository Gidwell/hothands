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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
