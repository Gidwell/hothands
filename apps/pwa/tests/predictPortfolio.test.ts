import { describe, expect, test } from "bun:test";
import {
  POSITION_MINTED_EVENT_TYPE,
  POSITION_REDEEMED_EVENT_TYPE,
  buildPortfolioSnapshot,
  buildPortfolioPositions,
  createPredictPortfolioCloseQuoteClient,
  createPredictPortfolioIndexedEventClient,
  createPredictPortfolioSettlementClient,
  loadPredictPortfolio,
  selectVisiblePortfolioPositions,
} from "../src/predictPortfolio";

describe("Predict portfolio", () => {
  test("aggregates minted and redeemed events into remaining portfolio positions", () => {
    const positions = buildPortfolioPositions(
      [
        {
          eventId: "mint-1",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: true,
          quantity: 5_000_000,
          cost: 2_250_000,
          timestampMs: 1_779_100_000_000,
        },
        {
          eventId: "redeem-1",
          eventType: "redeem",
          managerId: "0xmanager",
          oracleId: "0xoracle",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: true,
          quantity: 1_000_000,
          payout: 520_000,
          timestampMs: 1_779_101_000_000,
        },
      ],
      { nowMs: 1_779_102_000_000 },
    );

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      actionLabel: "Redeem",
      costBasisLabel: "$1.80",
      direction: "UP",
      expiry: 1_779_193_600,
      expiryMs: 1_779_193_600_000,
      id: "0xmanager:0xoracle:1779193600:65000000000:UP",
      isExpired: false,
      managerId: "0xmanager",
      maxPayoutLabel: "$4",
      oracleId: "0xoracle",
      quantity: "4000000",
      statusLabel: "Open",
      strike: "65000000000",
      strikeLabel: "$65,000.00",
      timeLabel: "2d left",
    });
    expect(positions[0]?.expiryTimeLabel).toContain("May");
  });

  test("labels expired positions as claimable", () => {
    const [position] = buildPortfolioPositions(
      [
        {
          eventId: "mint-1",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: false,
          quantity: 5_000_000,
          cost: 2_250_000,
          timestampMs: 1_779_100_000_000,
        },
      ],
      { nowMs: 1_779_194_000_000 },
    );

    expect(position?.statusLabel).toBe("Expired");
    expect(position?.actionLabel).toBe("Claim");
    expect(position?.timeLabel).toBe("Expired");
  });

  test("shows whether an expired position has settlement payout", () => {
    const positions = buildPortfolioPositions(
      [
        {
          eventId: "mint-loss",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle-loss",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: false,
          quantity: 5_000_000,
          cost: 2_250_000,
          timestampMs: 1_779_100_000_000,
        },
        {
          eventId: "mint-win",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle-win",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: false,
          quantity: 4_000_000,
          cost: 1_800_000,
          timestampMs: 1_779_100_000_000,
        },
      ],
      {
        nowMs: 1_779_194_000_000,
        oracleSettlements: [
          {
            oracleId: "0xoracle-loss",
            settlementPrice: 65_100,
            status: "settled",
          },
          {
            oracleId: "0xoracle-win",
            settlementPrice: 64_900,
            status: "settled",
          },
        ],
      },
    );

    expect(positions.find((position) => position.oracleId === "0xoracle-loss")).toMatchObject({
      claimValueLabel: "$0",
      outcomeLabel: "No payout",
      settlementPriceLabel: "$65,100.00",
    });
    expect(positions.find((position) => position.oracleId === "0xoracle-win")).toMatchObject({
      claimValueLabel: "$4",
      outcomeLabel: "Pays out",
      settlementPriceLabel: "$64,900.00",
    });
  });

  test("calculates all-time PnL from redeemed and settled positions", () => {
    const snapshot = buildPortfolioSnapshot(
      [
        {
          eventId: "mint-redeemed",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle-redeemed",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: true,
          quantity: 5_000_000,
          cost: 2_000_000,
          timestampMs: 1_779_100_000_000,
        },
        {
          eventId: "redeem-win",
          eventType: "redeem",
          managerId: "0xmanager",
          oracleId: "0xoracle-redeemed",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: true,
          quantity: 5_000_000,
          payout: 3_250_000,
          timestampMs: 1_779_101_000_000,
        },
        {
          eventId: "mint-settled-loss",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle-loss",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: false,
          quantity: 4_000_000,
          cost: 1_500_000,
          timestampMs: 1_779_102_000_000,
        },
        {
          eventId: "mint-open",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle-open",
          expiry: 1_779_300_000,
          strike: 65_000_000_000,
          isUp: true,
          quantity: 2_000_000,
          cost: 900_000,
          timestampMs: 1_779_103_000_000,
        },
      ],
      {
        nowMs: 1_779_194_000_000,
        oracleSettlements: [
          {
            oracleId: "0xoracle-loss",
            settlementPrice: 65_100,
            status: "settled",
          },
        ],
      },
    );

    expect(snapshot.pnl).toEqual({
      costLabel: "$3.50",
      payoutLabel: "$3.25",
      pnlAtomic: "-250000",
      pnlLabel: "-$0.25",
      pnlTone: "negative",
    });
  });

  test("builds all-time trade history from opened, redeemed, and settled positions", () => {
    const snapshot = buildPortfolioSnapshot(
      [
        {
          eventId: "mint-redeemed",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle-redeemed",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: true,
          quantity: 5_000_000,
          cost: 2_000_000,
          timestampMs: 1_779_100_000_000,
        },
        {
          eventId: "redeem-win",
          eventType: "redeem",
          managerId: "0xmanager",
          oracleId: "0xoracle-redeemed",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: true,
          quantity: 5_000_000,
          payout: 3_250_000,
          timestampMs: 1_779_101_000_000,
        },
        {
          eventId: "mint-settled-loss",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle-loss",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: false,
          quantity: 4_000_000,
          cost: 1_500_000,
          timestampMs: 1_779_102_000_000,
        },
        {
          eventId: "mint-open",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle-open",
          expiry: 1_779_300_000,
          strike: 65_000_000_000,
          isUp: true,
          quantity: 2_000_000,
          cost: 900_000,
          timestampMs: 1_779_103_000_000,
        },
      ],
      {
        nowMs: 1_779_194_000_000,
        oracleSettlements: [
          {
            oracleId: "0xoracle-loss",
            settlementPrice: 65_100,
            status: "settled",
          },
        ],
      },
    );

    expect(snapshot.history.map((item) => item.oracleId)).toEqual([
      "0xoracle-open",
      "0xoracle-loss",
      "0xoracle-redeemed",
    ]);
    expect(snapshot.history.find((item) => item.oracleId === "0xoracle-open")).toMatchObject({
      costLabel: "$0.90",
      direction: "UP",
      payoutLabel: "Pending",
      pnlLabel: "Open",
      remainingLabel: "$2",
      statusLabel: "Open",
      strikeLabel: "$65,000.00",
    });
    expect(snapshot.history.find((item) => item.oracleId === "0xoracle-loss")).toMatchObject({
      costLabel: "$1.50",
      direction: "DOWN",
      payoutLabel: "$0",
      pnlLabel: "-$1.50",
      statusLabel: "No payout",
    });
    expect(snapshot.history.find((item) => item.oracleId === "0xoracle-redeemed")).toMatchObject({
      costLabel: "$2",
      direction: "UP",
      payoutLabel: "$3.25",
      pnlLabel: "+$1.25",
      statusLabel: "Redeemed",
    });
  });

  test("filters old or dismissed no-payout expired positions", () => {
    const freshNoPayout = {
      actionLabel: "Dismiss" as const,
      claimValueLabel: "$0",
      costBasisLabel: "$1",
      direction: "DOWN" as const,
      dismissible: true,
      expiry: 1_779_193_600,
      expiryMs: 1_779_193_600_000,
      expiryTimeLabel: "May 18, 2026, 9:46 PM",
      id: "fresh-loss",
      isExpired: true,
      managerId: "0xmanager",
      maxPayoutLabel: "$2",
      oracleId: "0xfresh",
      outcomeLabel: "No payout" as const,
      quantity: "2000000",
      settlementPriceLabel: "$65,100.00",
      statusLabel: "Expired" as const,
      strike: "65000000000",
      strikeLabel: "$65,000.00",
      timeLabel: "Expired",
    };
    const staleNoPayout = {
      ...freshNoPayout,
      expiryMs: 1_779_000_000_000,
      id: "stale-loss",
      oracleId: "0xstale",
    };
    const claimableWin = {
      ...freshNoPayout,
      actionLabel: "Claim" as const,
      claimValueLabel: "$2",
      dismissible: false,
      id: "win",
      oracleId: "0xwin",
      outcomeLabel: "Pays out" as const,
    };

    expect(
      selectVisiblePortfolioPositions([freshNoPayout, staleNoPayout, claimableWin], {
        dismissedPositionIds: new Set<string>(),
        nowMs: freshNoPayout.expiryMs + 60_000,
      }).map((position) => position.id),
    ).toEqual(["fresh-loss", "win"]);

    expect(
      selectVisiblePortfolioPositions([freshNoPayout, claimableWin], {
        dismissedPositionIds: new Set(["fresh-loss"]),
        nowMs: freshNoPayout.expiryMs + 60_000,
      }).map((position) => position.id),
    ).toEqual(["win"]);
  });

  test("shows an estimated close value for open positions", () => {
    const [position] = buildPortfolioPositions(
      [
        {
          eventId: "mint-open",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle",
          expiry: 1_779_193_600,
          strike: 65_000_000_000,
          isUp: true,
          quantity: 5_000_000,
          cost: 2_250_000,
          timestampMs: 1_779_100_000_000,
        },
      ],
      {
        nowMs: 1_779_102_000_000,
        closeQuotes: [
          {
            oracleId: "0xoracle",
            expiry: "1779193600",
            strike: "65000000000",
            side: "UP",
            quantity: "5000000",
            redeemPayout: "2410000",
            redeemPayoutUsd: 2.41,
            quoteStatus: "ready",
          },
        ],
      },
    );

    expect(position).toMatchObject({
      closeValueLabel: "$2.41",
      closeValueStatusLabel: "Quoted now",
      maxPayoutLabel: "$5",
    });
  });

  test("formats high precision live strikes without changing raw redeem input", () => {
    const [position] = buildPortfolioPositions(
      [
        {
          eventId: "mint-1",
          eventType: "mint",
          managerId: "0xmanager",
          oracleId: "0xoracle",
          expiry: 1_780_366_500_000,
          strike: 70_167_000_000_000,
          isUp: false,
          quantity: 1_797_453,
          cost: 1_230_000,
          timestampMs: 1_780_365_000_000,
        },
      ],
      { nowMs: 1_780_367_000_000 },
    );

    expect(position?.strike).toBe("70167000000000");
    expect(position?.strikeLabel).toBe("$70,167.00");
    expect(position?.expiry).toBe(1_780_366_500_000);
  });

  test("loads minted and redeemed position events for one manager", async () => {
    const queries: unknown[] = [];
    const settlementRequests: string[] = [];
    const closeQuoteRequests: string[] = [];
    const positions = await loadPredictPortfolio({
      managerObjectId: "0xmanager",
      nowMs: 1_779_102_000_000,
      settlementClient: {
        getOracleSettlement: async (oracleId) => {
          settlementRequests.push(oracleId);
          return {
            oracleId,
            settlementPrice: 65_500,
            status: "active",
          };
        },
      },
      closeQuoteClient: {
        getCloseQuote: async (position) => {
          closeQuoteRequests.push(position.oracleId);
          return {
            oracleId: position.oracleId,
            expiry: String(position.expiry),
            strike: position.strike,
            side: position.direction,
            quantity: position.quantity,
            redeemPayout: "2410000",
            redeemPayoutUsd: 2.41,
            quoteStatus: "ready",
          };
        },
      },
      client: {
        queryEvents: async (input) => {
          queries.push(input.query);
          if (
            "MoveEventType" in input.query &&
            input.query.MoveEventType === POSITION_MINTED_EVENT_TYPE
          ) {
            return {
              data: [
                {
                  id: {
                    txDigest: "mint-digest",
                    eventSeq: "0",
                  },
                  timestampMs: "1779100000000",
                  parsedJson: {
                    manager_id: "0xmanager",
                    oracle_id: "0xoracle",
                    expiry: "1779193600",
                    strike: "65000000000",
                    is_up: true,
                    quantity: "5000000",
                    cost: "2250000",
                  },
                },
              ],
              hasNextPage: false,
              nextCursor: null,
            };
          }

          return {
            data: [],
            hasNextPage: false,
            nextCursor: null,
          };
        },
      },
    });

    expect(queries).toEqual([
      {
        MoveEventType: POSITION_MINTED_EVENT_TYPE,
      },
      {
        MoveEventType: POSITION_REDEEMED_EVENT_TYPE,
      },
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0]?.managerId).toBe("0xmanager");
    expect(positions[0]?.quantity).toBe("5000000");
    expect(settlementRequests).toEqual(["0xoracle"]);
    expect(closeQuoteRequests).toEqual(["0xoracle"]);
    expect(positions[0]?.closeValueLabel).toBe("$2.41");
  });

  test("loads oracle settlement details through the configured testnet API", async () => {
    const requestedUrls: string[] = [];
    const client = createPredictPortfolioSettlementClient({
      apiBaseUrl: "https://api.hot-hands.test/",
      fetcher: async (url) => {
        requestedUrls.push(String(url));
        return new Response(
          JSON.stringify({
            oracleId: "0xoracle",
            status: "settled",
            settlementPrice: 70_255_724_491_985,
            settledAtMs: 1_780_366_507_716,
          }),
        );
      },
    });

    await expect(client?.getOracleSettlement("0xoracle")).resolves.toEqual({
      oracleId: "0xoracle",
      status: "settled",
      settlementPrice: 70_255_724_491_985,
      settledAtMs: 1_780_366_507_716,
    });
    expect(requestedUrls).toEqual([
      "https://api.hot-hands.test/testnet/oracle-settlement?oracleId=0xoracle",
    ]);
  });

  test("loads portfolio events through the indexed testnet API client", async () => {
    const calls: string[] = [];
    const client = createPredictPortfolioIndexedEventClient({
      apiBaseUrl: "https://api.hot-hands.test",
      managerObjectId: "0xmanager",
      fetcher: async (url) => {
        const requestUrl = String(url);
        calls.push(requestUrl);
        const eventType = new URL(requestUrl).searchParams.get("eventType");

        return Response.json({
          data:
            eventType === "mint"
              ? [
                  {
                    id: {
                      txDigest: "mint-digest",
                      eventSeq: "0",
                    },
                    timestampMs: "1779100000000",
                    parsedJson: {
                      manager_id: "0xmanager",
                      oracle_id: "0xoracle",
                      expiry: "1779193600",
                      strike: "65000000000",
                      is_up: true,
                      quantity: "5000000",
                      cost: "2250000",
                    },
                  },
                ]
              : [],
          hasNextPage: false,
          nextCursor: null,
        });
      },
    });

    expect(client).toBeDefined();

    const positions = await loadPredictPortfolio({
      client,
      managerObjectId: "0xmanager",
      nowMs: 1_779_102_000_000,
    });

    expect(calls).toEqual([
      "https://api.hot-hands.test/testnet/portfolio-events?managerId=0xmanager&eventType=mint&limit=50",
      "https://api.hot-hands.test/testnet/portfolio-events?managerId=0xmanager&eventType=redeem&limit=50",
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0]?.managerId).toBe("0xmanager");
    expect(positions[0]?.quantity).toBe("5000000");
  });

  test("falls back to a direct event client when indexed portfolio API is unavailable", async () => {
    const fallbackQueries: unknown[] = [];
    const client = createPredictPortfolioIndexedEventClient({
      apiBaseUrl: "https://api.hot-hands.test",
      fallbackClient: {
        queryEvents: async (input) => {
          fallbackQueries.push(input.query);

          return {
            data: [],
            hasNextPage: false,
            nextCursor: null,
          };
        },
      },
      managerObjectId: "0xmanager",
      fetcher: async () => Response.json({ error: "indexer_unavailable" }, { status: 503 }),
    });

    await client?.queryEvents({
      query: {
        MoveEventType: POSITION_MINTED_EVENT_TYPE,
      },
      limit: 50,
      order: "descending",
    });

    expect(fallbackQueries).toEqual([
      {
        MoveEventType: POSITION_MINTED_EVENT_TYPE,
      },
    ]);
  });

  test("loads open-position close quotes through the configured testnet API", async () => {
    const requestedUrls: string[] = [];
    const client = createPredictPortfolioCloseQuoteClient({
      apiBaseUrl: "https://api.hot-hands.test/",
      fetcher: async (url) => {
        requestedUrls.push(String(url));
        return new Response(
          JSON.stringify({
            oracleId: "0xoracle",
            expiry: "1779193600",
            strike: "65000000000",
            side: "DOWN",
            quantity: "5000000",
            redeemPayout: "2410000",
            redeemPayoutUsd: 2.41,
            quoteStatus: "ready",
          }),
        );
      },
    });

    await expect(
      client?.getCloseQuote({
        actionLabel: "Redeem",
        costBasisLabel: "$2.25",
        direction: "DOWN",
        expiry: 1_779_193_600,
        expiryMs: 1_779_193_600_000,
        expiryTimeLabel: "May 19, 2026, 12:26 PM",
        id: "position",
        isExpired: false,
        managerId: "0xmanager",
        maxPayoutLabel: "$5",
        oracleId: "0xoracle",
        quantity: "5000000",
        statusLabel: "Open",
        strike: "65000000000",
        strikeLabel: "$65,000.00",
        timeLabel: "2d left",
      }),
    ).resolves.toMatchObject({
      oracleId: "0xoracle",
      redeemPayout: "2410000",
      redeemPayoutUsd: 2.41,
    });
    expect(requestedUrls).toEqual([
      "https://api.hot-hands.test/testnet/redeem-quote?oracleId=0xoracle&expiry=1779193600&strike=65000000000&side=DOWN&quantity=5000000",
    ]);
  });
});
