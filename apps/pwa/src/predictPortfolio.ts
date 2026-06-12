import { DEEPBOOK_PREDICT_TESTNET_TX_CONFIG } from "@hot-hands/contracts";
import {
  getJsonRpcFullnodeUrl,
  SuiJsonRpcClient,
  type EventId,
  type PaginatedEvents,
  type QueryEventsParams,
} from "@mysten/sui/jsonRpc";
import { formatDusdcBalance } from "./walletBalance";

export const POSITION_MINTED_EVENT_TYPE =
  `${DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId}::predict::PositionMinted`;
export const POSITION_REDEEMED_EVENT_TYPE =
  `${DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId}::predict::PositionRedeemed`;

export type PredictPortfolioEventType = "mint" | "redeem";

export type PredictPortfolioEvent = {
  eventId: string;
  eventType: PredictPortfolioEventType;
  managerId: string;
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  quantity: number;
  cost?: number;
  payout?: number;
  timestampMs: number;
};

export type PredictPortfolioPosition = {
  id: string;
  managerId: string;
  oracleId: string;
  expiry: number;
  expiryMs: number;
  strike: string;
  quantity: string;
  direction: "UP" | "DOWN";
  strikeLabel: string;
  expiryTimeLabel: string;
  timeLabel: string;
  statusLabel: "Open" | "Expired";
  actionLabel: "Redeem" | "Claim" | "Dismiss";
  maxPayoutAtomic: string;
  maxPayoutLabel: string;
  costBasisAtomic: string;
  costBasisLabel: string;
  closeValueLabel?: string;
  closeValueStatusLabel?: "Quoted now";
  claimValueAtomic?: string;
  claimValueLabel?: string;
  dismissible?: boolean;
  outcomeLabel?: "Pays out" | "No payout" | "Settlement pending";
  settlementPriceLabel?: string;
  isExpired: boolean;
};

export type PredictPortfolioPositionIdInput = {
  managerId: string;
  oracleId: string;
  expiry: number | string;
  strike: number | string;
  direction: "UP" | "DOWN";
};

export type PredictPortfolioPnlSummary = {
  costLabel: string;
  payoutLabel: string;
  pnlAtomic: string;
  pnlLabel: string;
  pnlTone: "positive" | "negative" | "flat";
};

export type PredictPortfolioHistoryItem = {
  id: string;
  managerId: string;
  oracleId: string;
  direction: "UP" | "DOWN";
  strikeLabel: string;
  expiryTimeLabel: string;
  timeLabel?: string;
  openedAtLabel: string;
  updatedAtLabel: string;
  quantityLabel: string;
  remainingLabel: string;
  costLabel: string;
  payoutLabel: string;
  pnlAtomic?: string;
  pnlLabel: string;
  pnlTone: "positive" | "negative" | "flat";
  statusLabel: "Open" | "Redeemed" | "Claimable" | "No payout" | "Settlement pending";
  closeLabel: string;
  settlementPriceLabel?: string;
};

export type PredictPortfolioSnapshot = {
  history: PredictPortfolioHistoryItem[];
  pnl: PredictPortfolioPnlSummary;
  positions: PredictPortfolioPosition[];
};

export type PredictPortfolioEventClient = {
  queryEvents(
    input: Pick<QueryEventsParams, "query" | "cursor" | "limit" | "order">,
  ): Promise<Pick<PaginatedEvents, "data" | "hasNextPage" | "nextCursor">>;
};

export type PredictOracleSettlement = {
  oracleId: string;
  status: string;
  settlementPrice: number | null;
  settledAtMs?: number | null;
};

export type PredictPortfolioSettlementClient = {
  getOracleSettlement(oracleId: string): Promise<PredictOracleSettlement | null>;
};

export type PredictPortfolioCloseQuote = {
  oracleId: string;
  expiry: string;
  strike: string;
  side: "UP" | "DOWN";
  quantity: string;
  redeemPayout: string;
  redeemPayoutUsd: number;
  quoteStatus: "ready";
};

export type PredictPortfolioCloseQuoteClient = {
  getCloseQuote(position: PredictPortfolioPosition): Promise<PredictPortfolioCloseQuote | null>;
};

export type LoadPredictPortfolioOptions = {
  client?: PredictPortfolioEventClient;
  closeQuoteClient?: PredictPortfolioCloseQuoteClient;
  limit?: number;
  managerObjectId?: string | null;
  maxPages?: number;
  nowMs?: number;
  settlementClient?: PredictPortfolioSettlementClient;
};

export const ZERO_PAYOUT_POSITION_HIDE_MS = 24 * 60 * 60 * 1000;

type PortfolioAccumulator = {
  managerId: string;
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  quantity: bigint;
  costBasis: bigint;
  lastTimestampMs: number;
};

type PortfolioHistoryAccumulator = PortfolioAccumulator & {
  firstTimestampMs: number;
  totalCost: bigint;
  totalQuantity: bigint;
  payout: bigint;
};

export async function loadPredictPortfolio({
  ...options
}: LoadPredictPortfolioOptions): Promise<PredictPortfolioPosition[]> {
  const snapshot = await loadPredictPortfolioSnapshot(options);

  return snapshot.positions;
}

export async function loadPredictPortfolioSnapshot({
  client = createPredictPortfolioEventClient(),
  limit = 50,
  managerObjectId,
  maxPages = 8,
  nowMs = Date.now(),
  closeQuoteClient,
  settlementClient,
}: LoadPredictPortfolioOptions): Promise<PredictPortfolioSnapshot> {
  const [mints, redeems] = await Promise.all([
    loadPortfolioEvents({
      client,
      eventType: "mint",
      limit,
      managerObjectId,
      maxPages,
      moveEventType: POSITION_MINTED_EVENT_TYPE,
    }),
    loadPortfolioEvents({
      client,
      eventType: "redeem",
      limit,
      managerObjectId,
      maxPages,
      moveEventType: POSITION_REDEEMED_EVENT_TYPE,
    }),
  ]);

  const events = [...mints, ...redeems];
  const positions = buildPortfolioPositions(events, { nowMs });
  if (positions.length === 0 || (!settlementClient && !closeQuoteClient)) {
    return buildPortfolioSnapshot(events, { nowMs });
  }

  const [oracleSettlements, closeQuotes] = await Promise.all([
    settlementClient ? loadOracleSettlements(positions, settlementClient) : [],
    closeQuoteClient ? loadCloseQuotes(positions, closeQuoteClient) : [],
  ]);

  return buildPortfolioSnapshot(events, {
    closeQuotes,
    nowMs,
    oracleSettlements,
  });
}

export function buildPortfolioSnapshot(
  events: PredictPortfolioEvent[],
  {
    closeQuotes = [],
    nowMs = Date.now(),
    oracleSettlements = [],
  }: {
    closeQuotes?: PredictPortfolioCloseQuote[];
    nowMs?: number;
    oracleSettlements?: PredictOracleSettlement[];
  } = {},
): PredictPortfolioSnapshot {
  return {
    history: buildPortfolioHistory(events, {
      nowMs,
      oracleSettlements,
    }),
    pnl: buildPortfolioPnlSummary(events, {
      nowMs,
      oracleSettlements,
    }),
    positions: buildPortfolioPositions(events, {
      closeQuotes,
      nowMs,
      oracleSettlements,
    }),
  };
}

export function buildPortfolioPositions(
  events: PredictPortfolioEvent[],
  {
    closeQuotes = [],
    nowMs = Date.now(),
    oracleSettlements = [],
  }: {
    closeQuotes?: PredictPortfolioCloseQuote[];
    nowMs?: number;
    oracleSettlements?: PredictOracleSettlement[];
  } = {},
): PredictPortfolioPosition[] {
  const positions = new Map<string, PortfolioAccumulator>();
  const settlementsByOracleId = new Map(
    oracleSettlements.map((settlement) => [settlement.oracleId, settlement]),
  );
  const closeQuotesByPositionId = new Map(
    closeQuotes.map((quote) => [closeQuoteKey(quote), quote]),
  );

  for (const event of [...events].sort(compareEventsByTime)) {
    const key = positionKey(event);
    const position =
      positions.get(key) ??
      {
        managerId: event.managerId,
        oracleId: event.oracleId,
        expiry: event.expiry,
        strike: event.strike,
        isUp: event.isUp,
        quantity: 0n,
        costBasis: 0n,
        lastTimestampMs: 0,
      };
    positions.set(key, position);
    position.lastTimestampMs = Math.max(position.lastTimestampMs, event.timestampMs);

    const quantity = BigInt(Math.max(0, Math.trunc(event.quantity)));
    if (event.eventType === "mint") {
      position.quantity += quantity;
      position.costBasis += BigInt(Math.max(0, Math.trunc(event.cost ?? 0)));
      continue;
    }

    const removedQuantity = quantity > position.quantity ? position.quantity : quantity;
    const removedCost =
      position.quantity === 0n
        ? 0n
        : (position.costBasis * removedQuantity) / position.quantity;
    position.quantity -= removedQuantity;
    position.costBasis -= removedCost;
  }

  return [...positions.values()]
    .filter((position) => position.quantity > 0n)
    .map((position) => {
      const builtPosition = buildPortfolioPosition(
        position,
        nowMs,
        settlementsByOracleId.get(position.oracleId),
      );
      const closeQuote = closeQuotesByPositionId.get(positionCloseQuoteKey(builtPosition));

      return closeQuote ? applyCloseQuote(builtPosition, closeQuote) : builtPosition;
    })
    .sort((left, right) => right.expiryMs - left.expiryMs || left.id.localeCompare(right.id));
}

export function selectVisiblePortfolioPositions(
  positions: PredictPortfolioPosition[],
  {
    dismissedPositionIds = new Set<string>(),
    nowMs = Date.now(),
  }: {
    dismissedPositionIds?: ReadonlySet<string>;
    nowMs?: number;
  } = {},
): PredictPortfolioPosition[] {
  return positions.filter((position) => {
    if (!isZeroPayoutExpiredPosition(position)) {
      return true;
    }

    if (dismissedPositionIds.has(position.id)) {
      return false;
    }

    return nowMs - position.expiryMs < ZERO_PAYOUT_POSITION_HIDE_MS;
  });
}

function buildPortfolioHistory(
  events: PredictPortfolioEvent[],
  {
    nowMs,
    oracleSettlements,
  }: {
    nowMs: number;
    oracleSettlements: PredictOracleSettlement[];
  },
): PredictPortfolioHistoryItem[] {
  const histories = new Map<string, PortfolioHistoryAccumulator>();
  const settlementsByOracleId = new Map(
    oracleSettlements.map((settlement) => [settlement.oracleId, settlement]),
  );

  for (const event of [...events].sort(compareEventsByTime)) {
    const key = positionKey(event);
    const history =
      histories.get(key) ??
      {
        managerId: event.managerId,
        oracleId: event.oracleId,
        expiry: event.expiry,
        strike: event.strike,
        isUp: event.isUp,
        quantity: 0n,
        costBasis: 0n,
        firstTimestampMs: event.timestampMs,
        lastTimestampMs: 0,
        payout: 0n,
        totalCost: 0n,
        totalQuantity: 0n,
      };
    histories.set(key, history);
    history.firstTimestampMs = Math.min(history.firstTimestampMs, event.timestampMs);
    history.lastTimestampMs = Math.max(history.lastTimestampMs, event.timestampMs);

    const quantity = atomicBigInt(event.quantity);
    if (event.eventType === "mint") {
      const cost = atomicBigInt(event.cost);
      history.quantity += quantity;
      history.costBasis += cost;
      history.totalCost += cost;
      history.totalQuantity += quantity;
      continue;
    }

    const removedQuantity = quantity > history.quantity ? history.quantity : quantity;
    const removedCost =
      history.quantity === 0n
        ? 0n
        : (history.costBasis * removedQuantity) / history.quantity;
    history.quantity -= removedQuantity;
    history.costBasis -= removedCost;
    history.payout += atomicBigInt(event.payout);
  }

  return [...histories.values()]
    .sort(
      (left, right) =>
        portfolioHistoryRealizedAtMs(right, nowMs, settlementsByOracleId.get(right.oracleId)) -
          portfolioHistoryRealizedAtMs(left, nowMs, settlementsByOracleId.get(left.oracleId)) ||
        right.lastTimestampMs - left.lastTimestampMs ||
        right.firstTimestampMs - left.firstTimestampMs ||
        positionAccumulatorKey(right).localeCompare(positionAccumulatorKey(left)),
    )
    .map((history) =>
      buildPortfolioHistoryItem(
        history,
        nowMs,
        settlementsByOracleId.get(history.oracleId),
      ),
    );
}

function portfolioHistoryRealizedAtMs(
  history: PortfolioHistoryAccumulator,
  nowMs: number,
  settlement?: PredictOracleSettlement,
): number {
  const expiryMs = normalizeEpochMs(history.expiry);
  const settlementMs =
    typeof settlement?.settledAtMs === "number" && Number.isFinite(settlement.settledAtMs)
      ? normalizeEpochMs(settlement.settledAtMs)
      : null;

  if (history.quantity === 0n) {
    return history.lastTimestampMs < expiryMs ? history.lastTimestampMs : (settlementMs ?? expiryMs);
  }

  return expiryMs <= nowMs ? (settlementMs ?? expiryMs) : expiryMs;
}

function buildPortfolioPnlSummary(
  events: PredictPortfolioEvent[],
  {
    nowMs,
    oracleSettlements,
  }: {
    nowMs: number;
    oracleSettlements: PredictOracleSettlement[];
  },
): PredictPortfolioPnlSummary {
  const positions = new Map<string, PortfolioAccumulator>();
  const settlementsByOracleId = new Map(
    oracleSettlements.map((settlement) => [settlement.oracleId, settlement]),
  );
  let cost = 0n;
  let payout = 0n;

  for (const event of [...events].sort(compareEventsByTime)) {
    const key = positionKey(event);
    const position =
      positions.get(key) ??
      {
        managerId: event.managerId,
        oracleId: event.oracleId,
        expiry: event.expiry,
        strike: event.strike,
        isUp: event.isUp,
        quantity: 0n,
        costBasis: 0n,
        lastTimestampMs: 0,
      };
    positions.set(key, position);
    position.lastTimestampMs = Math.max(position.lastTimestampMs, event.timestampMs);

    const quantity = atomicBigInt(event.quantity);
    if (event.eventType === "mint") {
      position.quantity += quantity;
      position.costBasis += atomicBigInt(event.cost);
      continue;
    }

    const removedQuantity = quantity > position.quantity ? position.quantity : quantity;
    const removedCost =
      position.quantity === 0n
        ? 0n
        : (position.costBasis * removedQuantity) / position.quantity;
    position.quantity -= removedQuantity;
    position.costBasis -= removedCost;
    cost += removedCost;
    payout += atomicBigInt(event.payout);
  }

  for (const position of positions.values()) {
    if (position.quantity <= 0n || normalizeEpochMs(position.expiry) > nowMs) {
      continue;
    }

    const settlementPrice = settledPrice(settlementsByOracleId.get(position.oracleId));
    if (settlementPrice === null) {
      continue;
    }

    cost += position.costBasis;
    if (
      didPositionWin({
        isUp: position.isUp,
        settlementPrice,
        strike: position.strike,
      })
    ) {
      payout += position.quantity;
    }
  }

  const pnl = payout - cost;

  return {
    costLabel: formatDusdcBalance(cost),
    payoutLabel: formatDusdcBalance(payout),
    pnlAtomic: pnl.toString(),
    pnlLabel: formatSignedDusdcBalance(pnl),
    pnlTone: pnl > 0n ? "positive" : pnl < 0n ? "negative" : "flat",
  };
}

export function createPredictPortfolioCloseQuoteClient({
  apiBaseUrl,
  fetcher = fetch,
}: {
  apiBaseUrl?: string | null;
  fetcher?: typeof fetch;
}): PredictPortfolioCloseQuoteClient | undefined {
  const normalizedBaseUrl = apiBaseUrl?.trim();
  if (!normalizedBaseUrl) {
    return undefined;
  }

  return {
    getCloseQuote: async (position) => {
      const url = new URL(`${normalizedBaseUrl.replace(/\/+$/, "")}/testnet/redeem-quote`);
      url.searchParams.set("oracleId", position.oracleId);
      url.searchParams.set("expiry", String(position.expiry));
      url.searchParams.set("strike", position.strike);
      url.searchParams.set("side", position.direction);
      url.searchParams.set("quantity", position.quantity);

      const response = await fetcher(url.toString());
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as unknown;
      return parseCloseQuote(payload);
    },
  };
}

export function createPredictPortfolioIndexedEventClient({
  apiBaseUrl,
  fallbackClient = createPredictPortfolioEventClient(),
  fetcher = fetch,
  managerObjectId,
  walletAddress,
}: {
  apiBaseUrl?: string | null;
  fallbackClient?: PredictPortfolioEventClient;
  fetcher?: typeof fetch;
  managerObjectId?: string | null;
  walletAddress?: string | null;
}): PredictPortfolioEventClient | undefined {
  const normalizedBaseUrl = apiBaseUrl?.trim();
  const normalizedManagerId = managerObjectId?.trim();
  const normalizedWalletAddress = walletAddress?.trim();
  if (!normalizedBaseUrl || (!normalizedManagerId && !normalizedWalletAddress)) {
    return undefined;
  }

  return {
    queryEvents: async (input) => {
      const eventType = portfolioEventTypeForQuery(input.query);
      if (!eventType) {
        return emptyPaginatedEvents();
      }

      const url = new URL(`${normalizedBaseUrl.replace(/\/+$/, "")}/testnet/portfolio-events`);
      if (normalizedManagerId) {
        url.searchParams.set("managerId", normalizedManagerId);
      }
      if (normalizedWalletAddress) {
        url.searchParams.set("wallet", normalizedWalletAddress);
      }
      url.searchParams.set("eventType", eventType);
      if (input.limit !== undefined) {
        url.searchParams.set("limit", String(input.limit));
      }

      try {
        const response = await fetcher(url.toString());
        if (!response.ok) {
          return normalizedManagerId ? fallbackClient.queryEvents(input) : emptyPaginatedEvents();
        }

        return parseIndexedPortfolioEventsPayload(await response.json());
      } catch {
        return normalizedManagerId ? fallbackClient.queryEvents(input) : emptyPaginatedEvents();
      }
    },
  };
}

export function createPredictPortfolioSettlementClient({
  apiBaseUrl,
  fetcher = fetch,
}: {
  apiBaseUrl?: string | null;
  fetcher?: typeof fetch;
}): PredictPortfolioSettlementClient | undefined {
  const normalizedBaseUrl = apiBaseUrl?.trim();
  if (!normalizedBaseUrl) {
    return undefined;
  }

  return {
    getOracleSettlement: async (oracleId) => {
      const url = new URL(`${normalizedBaseUrl.replace(/\/+$/, "")}/testnet/oracle-settlement`);
      url.searchParams.set("oracleId", oracleId);

      const response = await fetcher(url.toString());
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as unknown;
      return parseOracleSettlement(payload);
    },
  };
}

function portfolioEventTypeForQuery(
  query: Pick<QueryEventsParams, "query">["query"],
): PredictPortfolioEventType | null {
  if (
    "MoveEventType" in query &&
    query.MoveEventType === POSITION_MINTED_EVENT_TYPE
  ) {
    return "mint";
  }

  if (
    "MoveEventType" in query &&
    query.MoveEventType === POSITION_REDEEMED_EVENT_TYPE
  ) {
    return "redeem";
  }

  return null;
}

function parseIndexedPortfolioEventsPayload(
  payload: unknown,
): Pick<PaginatedEvents, "data" | "hasNextPage" | "nextCursor"> {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return emptyPaginatedEvents();
  }

  return {
    data: payload.data as PaginatedEvents["data"],
    hasNextPage: payload.hasNextPage === true,
    nextCursor: isEventId(payload.nextCursor) ? payload.nextCursor : null,
  };
}

function emptyPaginatedEvents(): Pick<PaginatedEvents, "data" | "hasNextPage" | "nextCursor"> {
  return {
    data: [],
    hasNextPage: false,
    nextCursor: null,
  };
}

function isEventId(value: unknown): value is EventId {
  return (
    isRecord(value) &&
    stringValue(value.txDigest) !== null &&
    stringValue(value.eventSeq) !== null
  );
}

async function loadPortfolioEvents({
  client,
  eventType,
  limit,
  managerObjectId,
  maxPages,
  moveEventType,
}: {
  client: PredictPortfolioEventClient;
  eventType: PredictPortfolioEventType;
  limit: number;
  managerObjectId?: string | null;
  maxPages: number;
  moveEventType: string;
}): Promise<PredictPortfolioEvent[]> {
  const events: PredictPortfolioEvent[] = [];
  let cursor: EventId | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.queryEvents({
      query: {
        MoveEventType: moveEventType,
      },
      cursor,
      limit,
      order: "descending",
    });

    for (const rawEvent of response.data) {
      const event = parsePortfolioEvent(rawEvent, eventType);
      if (event && (!managerObjectId || event.managerId === managerObjectId)) {
        events.push(event);
      }
    }

    if (!response.hasNextPage || !response.nextCursor) {
      break;
    }

    cursor = response.nextCursor;
  }

  return events;
}

function buildPortfolioPosition(
  position: PortfolioAccumulator,
  nowMs: number,
  settlement?: PredictOracleSettlement,
): PredictPortfolioPosition {
  const expiryMs = normalizeEpochMs(position.expiry);
  const isExpired = expiryMs <= nowMs;
  const direction = position.isUp ? "UP" : "DOWN";
  const settlementPrice = settledPrice(settlement);
  const didWin =
    isExpired && settlementPrice !== null
      ? didPositionWin({
          isUp: position.isUp,
          settlementPrice,
          strike: position.strike,
        })
      : null;
  const claimValue = didWin === null ? null : didWin ? position.quantity : 0n;
  const isNoPayout = didWin === false;

  return {
    id: buildPredictPortfolioPositionId({
      managerId: position.managerId,
      oracleId: position.oracleId,
      expiry: position.expiry,
      strike: position.strike,
      direction,
    }),
    managerId: position.managerId,
    oracleId: position.oracleId,
    expiry: position.expiry,
    expiryMs,
    strike: String(position.strike),
    quantity: position.quantity.toString(),
    direction,
    strikeLabel: formatStrike(position.strike),
    expiryTimeLabel: formatExpiryTime(expiryMs),
    timeLabel: formatPortfolioTimeRemaining(expiryMs, nowMs),
    statusLabel: isExpired ? "Expired" : "Open",
    actionLabel: isExpired ? (isNoPayout ? "Dismiss" : "Claim") : "Redeem",
    maxPayoutAtomic: position.quantity.toString(),
    maxPayoutLabel: formatDusdcBalance(position.quantity),
    costBasisAtomic: position.costBasis.toString(),
    costBasisLabel: formatDusdcBalance(position.costBasis),
    ...(isExpired
      ? {
          claimValueAtomic: claimValue === null ? undefined : claimValue.toString(),
          claimValueLabel: claimValue === null ? undefined : formatDusdcBalance(claimValue),
          dismissible: isNoPayout,
          outcomeLabel:
            didWin === null ? "Settlement pending" : didWin ? "Pays out" : "No payout",
          settlementPriceLabel:
            settlementPrice === null ? undefined : formatPredictPrice(settlementPrice),
        }
      : {}),
    isExpired,
  };
}

function buildPortfolioHistoryItem(
  history: PortfolioHistoryAccumulator,
  nowMs: number,
  settlement?: PredictOracleSettlement,
): PredictPortfolioHistoryItem {
  const expiryMs = normalizeEpochMs(history.expiry);
  const isExpired = expiryMs <= nowMs;
  const direction = history.isUp ? "UP" : "DOWN";
  const settlementPrice = settledPrice(settlement);
  const didWin =
    isExpired && history.quantity > 0n && settlementPrice !== null
      ? didPositionWin({
          isUp: history.isUp,
          settlementPrice,
          strike: history.strike,
        })
      : null;
  const knownPayout =
    didWin === null ? history.payout : history.payout + (didWin ? history.quantity : 0n);
  const isFullyRedeemed = history.quantity === 0n;
  const isResolved = isFullyRedeemed || didWin !== null;
  const pnl = isResolved ? knownPayout - history.totalCost : null;
  const statusLabel: PredictPortfolioHistoryItem["statusLabel"] = isFullyRedeemed
    ? "Redeemed"
    : !isExpired
      ? "Open"
      : didWin === null
        ? "Settlement pending"
        : didWin
          ? "Claimable"
          : "No payout";
  const isOpen = statusLabel === "Open";
  const pendingPayoutLabel =
    history.payout > 0n ? formatPortfolioHistoryDusdcBalance(history.payout) : "Pending";

  return {
    id: positionAccumulatorKey(history),
    managerId: history.managerId,
    oracleId: history.oracleId,
    direction,
    strikeLabel: formatStrike(history.strike),
    expiryTimeLabel: formatExpiryTime(expiryMs),
    timeLabel: !isExpired ? formatPortfolioTimeRemaining(expiryMs, nowMs) : undefined,
    openedAtLabel: formatExpiryTime(history.firstTimestampMs),
    updatedAtLabel: formatExpiryTime(history.lastTimestampMs),
    quantityLabel: formatDusdcBalance(history.totalQuantity),
    remainingLabel: formatDusdcBalance(history.quantity),
    costLabel: formatPortfolioHistoryDusdcBalance(history.totalCost),
    payoutLabel: isResolved
      ? formatPortfolioHistoryDusdcBalance(knownPayout)
      : isOpen
        ? "-"
        : pendingPayoutLabel,
    pnlAtomic: pnl === null ? undefined : pnl.toString(),
    pnlLabel:
      pnl === null
        ? (isOpen ? "-" : "Pending")
        : formatSignedPortfolioHistoryDusdcBalance(pnl),
    pnlTone: pnl === null ? "flat" : pnl > 0n ? "positive" : pnl < 0n ? "negative" : "flat",
    statusLabel,
    closeLabel: statusLabel,
    settlementPriceLabel:
      settlementPrice === null ? undefined : formatPredictPrice(settlementPrice),
  };
}

async function loadOracleSettlements(
  positions: PredictPortfolioPosition[],
  settlementClient: PredictPortfolioSettlementClient,
): Promise<PredictOracleSettlement[]> {
  const oracleIds = [...new Set(positions.map((position) => position.oracleId))];
  const settlements = await Promise.all(
    oracleIds.map((oracleId) => settlementClient.getOracleSettlement(oracleId).catch(() => null)),
  );

  return settlements.filter(
    (settlement): settlement is PredictOracleSettlement => settlement !== null,
  );
}

async function loadCloseQuotes(
  positions: PredictPortfolioPosition[],
  closeQuoteClient: PredictPortfolioCloseQuoteClient,
): Promise<PredictPortfolioCloseQuote[]> {
  const quotes = await Promise.all(
    positions
      .filter((position) => !position.isExpired)
      .map((position) => closeQuoteClient.getCloseQuote(position).catch(() => null)),
  );

  return quotes.filter((quote): quote is PredictPortfolioCloseQuote => quote !== null);
}

function applyCloseQuote(
  position: PredictPortfolioPosition,
  quote: PredictPortfolioCloseQuote,
): PredictPortfolioPosition {
  if (position.isExpired || closeQuoteKey(quote) !== positionCloseQuoteKey(position)) {
    return position;
  }

  return {
    ...position,
    closeValueLabel: formatDusdcBalance(quote.redeemPayout),
    closeValueStatusLabel: "Quoted now",
  };
}

function parsePortfolioEvent(
  event: unknown,
  eventType: PredictPortfolioEventType,
): PredictPortfolioEvent | null {
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

  const managerId = stringValue(parsedJson.manager_id ?? parsedJson.managerId);
  const oracleId = stringValue(parsedJson.oracle_id ?? parsedJson.oracleId);
  const expiry = numberValue(parsedJson.expiry);
  const strike = numberValue(parsedJson.strike);
  const isUp = booleanValue(parsedJson.is_up ?? parsedJson.isUp);
  const quantity = numberValue(parsedJson.quantity);
  const timestampMs = normalizeEpochMs(numberValue(event.timestampMs ?? parsedJson.timestamp_ms));

  if (
    !managerId ||
    !oracleId ||
    expiry === null ||
    strike === null ||
    isUp === null ||
    quantity === null ||
    timestampMs === null
  ) {
    return null;
  }

  return {
    eventId: eventId(event, eventType),
    eventType,
    managerId,
    oracleId,
    expiry,
    strike,
    isUp,
    quantity,
    cost: numberValue(parsedJson.cost) ?? undefined,
    payout: numberValue(parsedJson.payout) ?? undefined,
    timestampMs,
  };
}

export function buildPredictPortfolioPositionId({
  managerId,
  oracleId,
  expiry,
  strike,
  direction,
}: PredictPortfolioPositionIdInput): string {
  return `${managerId}:${oracleId}:${expiry}:${strike}:${direction}`;
}

function positionKey(event: Pick<PredictPortfolioEvent, "managerId" | "oracleId" | "expiry" | "strike" | "isUp">): string {
  return buildPredictPortfolioPositionId({
    managerId: event.managerId,
    oracleId: event.oracleId,
    expiry: event.expiry,
    strike: event.strike,
    direction: event.isUp ? "UP" : "DOWN",
  });
}

function positionAccumulatorKey(
  position: Pick<PortfolioAccumulator, "managerId" | "oracleId" | "expiry" | "strike" | "isUp">,
): string {
  return buildPredictPortfolioPositionId({
    managerId: position.managerId,
    oracleId: position.oracleId,
    expiry: position.expiry,
    strike: position.strike,
    direction: position.isUp ? "UP" : "DOWN",
  });
}

function compareEventsByTime(left: PredictPortfolioEvent, right: PredictPortfolioEvent): number {
  return left.timestampMs - right.timestampMs || left.eventId.localeCompare(right.eventId);
}

function eventId(event: Record<string, unknown>, eventType: PredictPortfolioEventType): string {
  const id = isRecord(event.id) ? event.id : null;
  const digest = stringValue(id?.txDigest ?? event.txDigest ?? event.digest) ?? "unknown";
  const seq = stringValue(id?.eventSeq ?? event.eventSeq) ?? "0";

  return `${eventType}:${digest}:${seq}`;
}

function normalizeEpochMs(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }

  return value < 10_000_000_000 ? value * 1000 : value;
}

function formatStrike(strike: number): string {
  return formatUsdPrice(normalizeStrike(strike));
}

function formatPredictPrice(price: number): string {
  return formatUsdPrice(normalizePredictPrice(price));
}

function formatUsdPrice(price: number): string {
  return `$${price.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function normalizeStrike(value: number): number {
  if (value >= 1_000_000_000_000) {
    return Math.round(value / 1_000_000_000);
  }

  if (value >= 1_000_000_000) {
    return Math.round(value / 1_000_000);
  }

  return Math.round(value);
}

function normalizePredictPrice(value: number): number {
  if (value >= 1_000_000_000_000) {
    return value / 1_000_000_000;
  }

  if (value >= 1_000_000_000) {
    return value / 1_000_000;
  }

  return value;
}

function didPositionWin({
  isUp,
  settlementPrice,
  strike,
}: {
  isUp: boolean;
  settlementPrice: number;
  strike: number;
}): boolean {
  const normalizedSettlementPrice = normalizePredictPrice(settlementPrice);
  const normalizedStrike = normalizeStrike(strike);

  return isUp
    ? normalizedSettlementPrice > normalizedStrike
    : normalizedSettlementPrice <= normalizedStrike;
}

function settledPrice(settlement: PredictOracleSettlement | undefined): number | null {
  if (
    !settlement ||
    settlement.status !== "settled" ||
    typeof settlement.settlementPrice !== "number" ||
    !Number.isFinite(settlement.settlementPrice)
  ) {
    return null;
  }

  return settlement.settlementPrice;
}

function isZeroPayoutExpiredPosition(position: PredictPortfolioPosition): boolean {
  return (
    position.isExpired &&
    (position.dismissible === true ||
      position.outcomeLabel === "No payout" ||
      position.claimValueAtomic === "0" ||
      position.claimValueLabel === "$0")
  );
}

function atomicBigInt(value: number | undefined): bigint {
  if (!Number.isFinite(value)) {
    return 0n;
  }

  return BigInt(Math.max(0, Math.trunc(value ?? 0)));
}

function formatSignedDusdcBalance(value: bigint): string {
  if (value === 0n) {
    return "$0";
  }

  const prefix = value > 0n ? "+" : "-";
  return `${prefix}${formatDusdcBalance(value > 0n ? value : -value)}`;
}

function formatPortfolioHistoryDusdcBalance(value: bigint): string {
  if (value === 0n) {
    return "$0";
  }

  if (value > 0n && value < 10_000n) {
    return "<$0.01";
  }

  return formatDusdcBalance(value);
}

function formatSignedPortfolioHistoryDusdcBalance(value: bigint): string {
  if (value === 0n) {
    return "$0";
  }

  const prefix = value > 0n ? "+" : "-";
  const absoluteValue = value > 0n ? value : -value;
  return `${prefix}${formatPortfolioHistoryDusdcBalance(absoluteValue)}`;
}

function closeQuoteKey(quote: PredictPortfolioCloseQuote): string {
  return `${quote.oracleId}:${quote.expiry}:${quote.strike}:${quote.side}:${quote.quantity}`;
}

function positionCloseQuoteKey(position: PredictPortfolioPosition): string {
  return `${position.oracleId}:${position.expiry}:${position.strike}:${position.direction}:${position.quantity}`;
}

function parseCloseQuote(payload: unknown): PredictPortfolioCloseQuote | null {
  if (!isRecord(payload)) {
    return null;
  }

  const oracleId = stringValue(payload.oracleId ?? payload.oracle_id);
  const expiry = stringValue(payload.expiry);
  const strike = stringValue(payload.strike);
  const side = sideValue(payload.side);
  const quantity = stringValue(payload.quantity);
  const redeemPayout = stringValue(payload.redeemPayout ?? payload.redeem_payout);
  const redeemPayoutUsd = numberValue(payload.redeemPayoutUsd ?? payload.redeem_payout_usd);

  if (
    !oracleId ||
    !expiry ||
    !strike ||
    !side ||
    !quantity ||
    !redeemPayout ||
    redeemPayoutUsd === null ||
    payload.quoteStatus !== "ready"
  ) {
    return null;
  }

  return {
    oracleId,
    expiry,
    strike,
    side,
    quantity,
    redeemPayout,
    redeemPayoutUsd,
    quoteStatus: "ready",
  };
}

function parseOracleSettlement(payload: unknown): PredictOracleSettlement | null {
  if (!isRecord(payload)) {
    return null;
  }

  const oracleId = stringValue(payload.oracleId ?? payload.oracle_id);
  const status = stringValue(payload.status);
  const settlementPrice = numberValue(payload.settlementPrice ?? payload.settlement_price);
  const settledAtMs = numberValue(payload.settledAtMs ?? payload.settled_at);

  if (!oracleId || !status) {
    return null;
  }

  return {
    oracleId,
    status,
    settlementPrice,
    settledAtMs,
  };
}

function formatExpiryTime(expiryMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(expiryMs));
}

export function formatPortfolioTimeRemaining(expiryMs: number, nowMs: number): string {
  const remainingMs = expiryMs - nowMs;
  if (remainingMs <= 0) {
    return "Expired";
  }

  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (remainingMs >= dayMs) {
    const days = Math.ceil(remainingMs / dayMs);
    return `${days}d left`;
  }
  if (remainingMs >= hourMs) {
    const hours = Math.ceil(remainingMs / hourMs);
    return `${hours}h left`;
  }

  return `${Math.max(1, Math.ceil(remainingMs / minuteMs))}m left`;
}

function createPredictPortfolioEventClient(): PredictPortfolioEventClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  });
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  return null;
}

function sideValue(value: unknown): "UP" | "DOWN" | null {
  return value === "UP" || value === "DOWN" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
