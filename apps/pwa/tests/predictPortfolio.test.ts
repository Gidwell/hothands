import { describe, expect, test } from "bun:test";
import {
  POSITION_MINTED_EVENT_TYPE,
  POSITION_REDEEMED_EVENT_TYPE,
  buildPortfolioPositions,
  createPredictPortfolioSettlementClient,
  loadPredictPortfolio,
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
});
