import { describe, expect, test } from "bun:test";
import {
  buildWalletPerformanceLeaderboards,
  buildLatestTradeFeedProjection,
  buildTraderHeatProjection,
  downsampleOraclePricePoints,
  summarizeWalletStats,
} from "../src";
import type {
  PredictNormalizedTradeEvent,
  PredictOraclePricePoint,
} from "../src/deepbook-predict";
import type { PredictPositionSummary } from "../src/store";

describe("Predict durable projections", () => {
  test("builds a true latest feed with expiry hiding and a limit", () => {
    const events = [
      tradeEvent({
        eventId: "mint:hot-older:0",
        actor: "0xhot",
        timestampMs: 1_000,
        expiryMs: 5_000,
      }),
      tradeEvent({
        eventId: "mint:cold-newest:0",
        actor: "0xcold",
        timestampMs: 3_000,
        expiryMs: 5_000,
      }),
      tradeEvent({
        eventId: "mint:expired-newest:0",
        actor: "0xexpired",
        timestampMs: 4_000,
        expiryMs: 2_000,
      }),
    ];

    expect(
      buildLatestTradeFeedProjection(events, {
        hideExpiredAtMs: 2_500,
        limit: 2,
      }).map((event) => event.eventId),
    ).toEqual(["mint:cold-newest:0", "mint:hot-older:0"]);
  });

  test("builds transparent trader heat from activity and position summaries", () => {
    const events = [
      tradeEvent({
        eventId: "mint:alpha:0",
        actor: "0xalpha",
        timestampMs: 10_000,
        cost: 1_000_000,
      }),
      tradeEvent({
        eventId: "redeem:alpha:1",
        kind: "redeem",
        actor: "0xalpha",
        timestampMs: 10_500,
        payout: 1_400_000,
      }),
      tradeEvent({
        eventId: "mint:beta:0",
        actor: "0xbeta",
        timestampMs: 10_900,
        cost: 600_000,
      }),
      tradeEvent({
        eventId: "redeem:beta:1",
        kind: "redeem",
        actor: "0xbeta",
        timestampMs: 10_950,
        payout: 0,
      }),
      tradeEvent({
        eventId: "mint:beta-open:2",
        actor: "0xbeta",
        timestampMs: 10_990,
        cost: 300_000,
      }),
    ];
    const positions = [
      positionSummary({
        id: "alpha-win",
        owner: "0xalpha",
        cost: 1_000_000,
        payout: 1_400_000,
        realizedPnl: 400_000,
        status: "closed",
      }),
      positionSummary({
        id: "beta-loss",
        owner: "0xbeta",
        cost: 600_000,
        payout: 0,
        realizedPnl: -600_000,
        status: "closed",
      }),
      positionSummary({
        id: "beta-open",
        owner: "0xbeta",
        cost: 300_000,
        payout: 0,
        realizedPnl: -300_000,
        status: "open",
      }),
    ];

    expect(
      buildTraderHeatProjection(events, positions, {
        nowMs: 11_000,
        recentWindowMs: 1_000,
      }),
    ).toEqual([
      {
        trader: "0xalpha",
        hotScore: 60,
        eventCount: 2,
        mintCount: 1,
        redeemCount: 1,
        recentEventCount: 2,
        observedVolume: 2_400_000,
        realizedPnl: 400_000,
        openCount: 0,
        closedCount: 1,
        winCount: 1,
        lossCount: 0,
        lastSeenMs: 10_500,
        components: {
          recentActivity: 16,
          realizedPnl: 4,
          winRedeem: 16,
          observedVolume: 24,
        },
      },
      {
        trader: "0xbeta",
        hotScore: 23,
        eventCount: 3,
        mintCount: 2,
        redeemCount: 1,
        recentEventCount: 3,
        observedVolume: 900_000,
        realizedPnl: -600_000,
        openCount: 1,
        closedCount: 1,
        winCount: 0,
        lossCount: 1,
        lastSeenMs: 10_990,
        components: {
          recentActivity: 24,
          realizedPnl: -6,
          winRedeem: -4,
          observedVolume: 9,
        },
      },
    ]);
  });

  test("downsamples oracle price charts while preserving first and last points", () => {
    const points = Array.from({ length: 7 }, (_, index) =>
      pricePoint({
        eventId: `price:${index}`,
        timestampMs: index,
        spot: 70_000 + index,
      }),
    );

    expect(downsampleOraclePricePoints(points, 4).map((point) => point.eventId)).toEqual([
      "price:0",
      "price:2",
      "price:4",
      "price:6",
    ]);
  });

  test("summarizes wallet stats and counts only closed positions as wins or losses", () => {
    const positions = [
      positionSummary({
        id: "alpha-win",
        owner: "0xalpha",
        cost: 1_000_000,
        payout: 1_400_000,
        realizedPnl: 400_000,
        status: "closed",
      }),
      positionSummary({
        id: "alpha-open",
        owner: "0xalpha",
        cost: 250_000,
        payout: 0,
        realizedPnl: -250_000,
        status: "open",
      }),
      positionSummary({
        id: "beta-loss",
        owner: "0xbeta",
        cost: 500_000,
        payout: 0,
        realizedPnl: -500_000,
        status: "closed",
      }),
    ];

    expect(summarizeWalletStats(positions, { owner: "0xalpha" })).toEqual({
      totalCost: 1_250_000,
      totalPayout: 1_400_000,
      realizedPnl: 400_000,
      openCount: 1,
      closedCount: 1,
      winCount: 1,
      lossCount: 0,
    });
  });

  test("builds wallet leaderboards for streaks and realized PnL", () => {
    const positions = [
      positionSummary({
        id: "alpha-win-1",
        owner: "0xalpha",
        realizedPnl: 100_000,
        lastEventMs: 1_000,
      }),
      positionSummary({
        id: "alpha-win-2",
        owner: "0xalpha",
        realizedPnl: 120_000,
        lastEventMs: 2_000,
      }),
      positionSummary({
        id: "alpha-loss",
        owner: "0xalpha",
        realizedPnl: -30_000,
        lastEventMs: 3_000,
      }),
      positionSummary({
        id: "beta-loss-1",
        owner: "0xbeta",
        realizedPnl: -50_000,
        lastEventMs: 1_500,
      }),
      positionSummary({
        id: "beta-loss-2",
        owner: "0xbeta",
        realizedPnl: -70_000,
        lastEventMs: 2_500,
      }),
      positionSummary({
        id: "beta-win",
        owner: "0xbeta",
        realizedPnl: 500_000,
        lastEventMs: 3_500,
      }),
      positionSummary({
        id: "gamma-loss",
        owner: "0gamma",
        realizedPnl: -900_000,
        lastEventMs: 4_000,
      }),
      positionSummary({
        id: "gamma-open",
        owner: "0gamma",
        realizedPnl: 1_000_000,
        status: "open",
        lastEventMs: 5_000,
      }),
    ];

    const leaderboards = buildWalletPerformanceLeaderboards(positions, { limit: 2 });

    expect(leaderboards.longestWinningStreak.map((entry) => entry.wallet)).toEqual([
      "0xalpha",
      "0xbeta",
    ]);
    expect(leaderboards.longestWinningStreak[0]).toMatchObject({
      wallet: "0xalpha",
      totalPnl: 190_000,
      winCount: 2,
      lossCount: 1,
      longestWinningStreak: 2,
      longestLosingStreak: 1,
      currentStreakType: "loss",
      currentStreakLength: 1,
    });
    expect(leaderboards.longestLosingStreak.map((entry) => entry.wallet)).toEqual([
      "0xbeta",
      "0gamma",
    ]);
    expect(leaderboards.highestPnl.map((entry) => entry.wallet)).toEqual([
      "0xbeta",
      "0xalpha",
    ]);
    expect(leaderboards.worstPnl.map((entry) => entry.wallet)).toEqual([
      "0gamma",
      "0xalpha",
    ]);
    expect(leaderboards.worstPnl[0]).toMatchObject({
      wallet: "0gamma",
      totalPnl: -900_000,
      openCount: 1,
      closedCount: 1,
      longestLosingStreak: 1,
      currentStreakType: "loss",
      currentStreakLength: 1,
    });
  });
});

function tradeEvent(
  overrides: Partial<PredictNormalizedTradeEvent>,
): PredictNormalizedTradeEvent {
  return {
    eventId: "mint:default:0",
    kind: "mint",
    actor: "0xtrader",
    trader: overrides.actor ?? "0xtrader",
    managerId: "manager-btc",
    oracleId: "btc-15m",
    expiryMs: 20_000,
    strike: 72_000_000_000,
    isUp: true,
    quantity: 1,
    timestampMs: 0,
    source: "positions/minted",
    ...overrides,
  };
}

function positionSummary(
  overrides: Partial<PredictPositionSummary>,
): PredictPositionSummary {
  return {
    id: "position",
    owner: "0xtrader",
    managerId: "manager-btc",
    oracleId: "btc-15m",
    expiryMs: 20_000,
    strike: 72_000_000_000,
    isUp: true,
    mintedQuantity: 1,
    redeemedQuantity: 1,
    openQuantity: 0,
    cost: 0,
    payout: 0,
    realizedPnl: 0,
    lastEventMs: 0,
    status: "closed",
    ...overrides,
  };
}

function pricePoint(
  overrides: Partial<PredictOraclePricePoint>,
): PredictOraclePricePoint {
  return {
    eventId: "price:default",
    oracleId: "btc-15m",
    spot: 70_000,
    timestampMs: 0,
    source: "oracles/prices",
    ...overrides,
  };
}
