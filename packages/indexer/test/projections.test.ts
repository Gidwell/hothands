import { describe, expect, test } from "bun:test";
import {
  buildWalletPerformanceEntries,
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

  test("scores recent prediction quality instead of absolute PnL alone", () => {
    const positions = [
      ...Array.from({ length: 6 }, (_, index) =>
        positionSummary({
          id: `small-sharp-${index}`,
          owner: "0xsmall-sharp",
          oracleId: `btc-small-${index}`,
          strike: 72_000_000_000 + index,
          mintedQuantity: 2_000_000,
          redeemedQuantity: 2_000_000,
          openQuantity: 0,
          cost: 1_000_000,
          payout: index === 0 ? 0 : 2_000_000,
          realizedPnl: index === 0 ? -1_000_000 : 1_000_000,
          lastEventMs: 10_000 + index,
        }),
      ),
      positionSummary({
        id: "large-one-shot",
        owner: "0xlarge-one-shot",
        oracleId: "btc-large-one-shot",
        mintedQuantity: 200_000_000,
        redeemedQuantity: 200_000_000,
        openQuantity: 0,
        cost: 100_000_000,
        payout: 200_000_000,
        realizedPnl: 100_000_000,
        lastEventMs: 10_100,
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        positionSummary({
          id: `recent-loser-${index}`,
          owner: "0xrecent-loser",
          oracleId: `btc-loser-${index}`,
          strike: 72_000_000_000 + index,
          mintedQuantity: 10_000_000,
          redeemedQuantity: 10_000_000,
          openQuantity: 0,
          cost: 5_000_000,
          payout: 0,
          realizedPnl: -5_000_000,
          lastEventMs: 10_200 + index,
        }),
      ),
    ];

    const heat = buildTraderHeatProjection([], positions, { nowMs: 11_000 });
    const byWallet = new Map(heat.map((entry) => [entry.trader, entry]));

    expect(byWallet.get("0xsmall-sharp")?.hotScore).toBeGreaterThanOrEqual(75);
    expect(byWallet.get("0xsmall-sharp")?.hotScore).toBeGreaterThan(
      byWallet.get("0xlarge-one-shot")?.hotScore ?? 0,
    );
    expect(byWallet.get("0xlarge-one-shot")?.hotScore).toBeLessThan(70);
    expect(byWallet.get("0xrecent-loser")?.hotScore).toBeLessThanOrEqual(20);
  });

  test("aggregates repeated same-position buys before scoring heat confidence", () => {
    const repeatedBuys = Array.from({ length: 5 }, (_, index) =>
      positionSummary({
        id: `repeat-${index}`,
        owner: "0xrepeat",
        oracleId: "btc-repeat",
        strike: 72_000_000_000,
        mintedQuantity: 2_000_000,
        redeemedQuantity: 2_000_000,
        openQuantity: 0,
        cost: 1_000_000,
        payout: 2_000_000,
        realizedPnl: 1_000_000,
        lastEventMs: 10_000 + index,
      }),
    );
    const diverseBuys = Array.from({ length: 5 }, (_, index) =>
      positionSummary({
        id: `diverse-${index}`,
        owner: "0xdiverse",
        oracleId: `btc-diverse-${index}`,
        strike: 72_000_000_000 + index,
        mintedQuantity: 2_000_000,
        redeemedQuantity: 2_000_000,
        openQuantity: 0,
        cost: 1_000_000,
        payout: 2_000_000,
        realizedPnl: 1_000_000,
        lastEventMs: 10_000 + index,
      }),
    );

    const heat = buildTraderHeatProjection([], [...repeatedBuys, ...diverseBuys], {
      nowMs: 11_000,
    });
    const byWallet = new Map(heat.map((entry) => [entry.trader, entry]));

    expect(byWallet.get("0xrepeat")?.decisionCount).toBe(1);
    expect(byWallet.get("0xdiverse")?.decisionCount).toBe(5);
    expect(byWallet.get("0xdiverse")?.hotScore).toBeGreaterThan(
      (byWallet.get("0xrepeat")?.hotScore ?? 0) + 20,
    );
  });

  test("keeps recent noisy losing activity cold", () => {
    const events = [
      ...Array.from({ length: 20 }, (_, index) =>
        tradeEvent({
          eventId: `mint:loser:${index}`,
          actor: "0xactive-loser",
          timestampMs: 10_000 + index,
          cost: 5_000_000,
          quantity: 10_000_000,
        }),
      ),
    ];
    const positions = Array.from({ length: 8 }, (_, index) =>
      positionSummary({
        id: `active-loser-${index}`,
        owner: "0xactive-loser",
        oracleId: `btc-active-loser-${index}`,
        strike: 72_000_000_000 + index,
        mintedQuantity: 10_000_000,
        redeemedQuantity: 10_000_000,
        openQuantity: 0,
        cost: 5_000_000,
        payout: 0,
        realizedPnl: -5_000_000,
        lastEventMs: 10_100 + index,
      }),
    );

    const heat = buildTraderHeatProjection(events, positions, {
      nowMs: 11_000,
      recentWindowMs: 1_000,
    });

    expect(heat[0]).toMatchObject({
      trader: "0xactive-loser",
      eventCount: 20,
      recentEventCount: 20,
      winCount: 0,
      lossCount: 8,
      decisionCount: 8,
    });
    expect(heat[0]?.hotScore).toBeLessThanOrEqual(20);
  });

  test("lets recovering wallets heat up without hard negative-PnL caps", () => {
    const recoveringClosedPositions = [
      [1_233_251, 0, 1_797_453, 1_780_367_551_417],
      [1_083_190, 0, 2_218_750, 1_780_367_564_864],
      [996_034, 1_921_718, 1_921_718, 1_780_370_617_212],
      [1_085_325, 1_891_942, 1_891_942, 1_780_373_731_824],
      [967_169, 1_697_442, 1_697_442, 1_780_374_661_942],
      [973_155, 4_629_629, 4_629_629, 1_780_431_287_106],
      [776_552, 1_840_265, 1_840_265, 1_780_433_446_426],
      [3_246_176, 5_676_250, 5_676_250, 1_780_600_893_859],
      [5_308_534, 8_729_391, 9_531_250, 1_780_615_238_151],
      [5_159_340, 8_945_312, 8_945_312, 1_780_624_540_724],
      [4_903_414, 0, 8_746_927, 1_781_016_752_501],
      [9_735_555, 0, 19_633_343, 1_781_016_801_925],
      [2_705_469, 0, 5_976_562, 1_781_100_192_535],
      [5_378_099, 0, 7_812_500, 1_781_100_193_867],
      [1_061_502, 0, 2_828_125, 1_781_100_195_181],
      [1_011_450, 0, 1_867_187, 1_781_100_196_491],
      [954_554, 0, 1_867_187, 1_781_100_198_007],
      [2_087_509, 0, 3_625_000, 1_781_100_199_297],
      [4_163_011, 0, 10_585_937, 1_781_100_200_600],
      [946_170, 0, 1_937_500, 1_781_100_202_118],
      [947_853, 0, 1_912_500, 1_781_100_203_397],
      [802_231, 0, 1_859_375, 1_781_100_204_949],
      [1_007_292, 0, 2_233_046, 1_781_100_206_301],
      [4_952_173, 0, 7_609_577, 1_781_251_222_829],
      [991_167, 0, 1_629_600, 1_781_291_729_868],
      [1_006_602, 1_030_686, 1_030_686, 1_781_330_424_087],
      [9_997_398, 12_554_444, 12_554_444, 1_781_334_015_718],
      [4_854_360, 5_713_021, 5_713_021, 1_781_366_428_105],
      [10_533_033, 11_469_848, 11_469_848, 1_781_397_912_768],
      [896_076, 0, 12_408_272, 1_781_565_319_864],
      [5_002_843, 7_178_861, 7_178_861, 1_781_577_021_245],
      [5_216_948, 7_224_086, 7_224_086, 1_781_583_326_821],
      [9_413_704, 13_168_895, 13_168_895, 1_781_637_327_031],
      [9_247_394, 12_998_743, 12_998_743, 1_781_639_126_627],
    ].map(([cost, payout, quantity, lastEventMs], index) =>
      positionSummary({
        id: `recovering-${index}`,
        owner: "0xrecovering",
        oracleId: `btc-recovering-${index}`,
        mintedQuantity: quantity,
        redeemedQuantity: quantity,
        openQuantity: 0,
        cost,
        payout,
        realizedPnl: payout - cost,
        lastEventMs,
      }),
    );

    const heat = buildTraderHeatProjection([], recoveringClosedPositions, {
      nowMs: 1_781_639_126_627,
    });

    expect(heat[0]).toMatchObject({
      trader: "0xrecovering",
      decisionCount: 34,
      winCount: 16,
      lossCount: 18,
      realizedPnl: -11_974_000,
      currentStreakType: "win",
      currentStreakLength: 4,
    });
    expect(heat[0]?.hotScore).toBeGreaterThan(60);
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
      positionSummary({
        id: "beta-active-open",
        owner: "0xbeta",
        expiryMs: 30_000,
        realizedPnl: 0,
        status: "open",
        lastEventMs: 4_500,
      }),
      positionSummary({
        id: "beta-expired-open",
        owner: "0xbeta",
        expiryMs: 10_000,
        realizedPnl: 0,
        status: "open",
        lastEventMs: 4_800,
      }),
    ];

    const leaderboards = buildWalletPerformanceLeaderboards(positions, {
      limit: 2,
      nowMs: 20_000,
    });

    expect(leaderboards.longestWinningStreak.map((entry) => entry.wallet)).toEqual([
      "0xalpha",
      "0xbeta",
    ]);
    expect(leaderboards.longestWinningStreak[0]).toMatchObject({
      wallet: "0xalpha",
      totalPnl: 190_000,
      winCount: 2,
      lossCount: 1,
      heatScore: expect.any(Number),
      longestWinningStreak: 2,
      longestLosingStreak: 1,
      currentStreakType: "loss",
      currentStreakLength: 1,
    });
    expect(leaderboards.longestLosingStreak.map((entry) => entry.wallet)).toEqual([
      "0xbeta",
      "0gamma",
    ]);
    expect(leaderboards.currentWinningStreak.map((entry) => entry.wallet)).toEqual([
      "0xbeta",
    ]);
    expect(leaderboards.currentWinningStreak[0]).toMatchObject({
      wallet: "0xbeta",
      currentStreakType: "win",
      currentStreakLength: 1,
      heatScore: expect.any(Number),
      longestWinningStreak: 1,
      totalPnl: 380_000,
      openCount: 1,
    });
    expect(leaderboards.currentLosingStreak.map((entry) => entry.wallet)).toEqual([
      "0gamma",
      "0xalpha",
    ]);
    expect(leaderboards.currentLosingStreak[0]).toMatchObject({
      wallet: "0gamma",
      currentStreakType: "loss",
      currentStreakLength: 1,
      longestLosingStreak: 1,
      totalPnl: -900_000,
    });
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
      openCount: 0,
      closedCount: 1,
      longestLosingStreak: 1,
      currentStreakType: "loss",
      currentStreakLength: 1,
    });

    const expectedHeatLeaders = buildWalletPerformanceEntries(positions, {
      nowMs: 20_000,
    })
      .filter((entry) => Number.isFinite(entry.heatScore) && entry.heatScore > 0)
      .sort(
        (left, right) =>
          right.heatScore - left.heatScore ||
          right.lastSeenMs - left.lastSeenMs ||
          left.wallet.localeCompare(right.wallet),
      )
      .slice(0, 2)
      .map((entry) => entry.wallet);

    expect(leaderboards.heat.map((entry) => entry.wallet)).toEqual(expectedHeatLeaders);
    expect(leaderboards.heat).toHaveLength(2);
    expect(
      leaderboards.heat.map(
        (entry) => Number.isFinite(entry.heatScore) && entry.heatScore > 0,
      ),
    ).toEqual([true, true]);

    const expectedWorstHeatLeaders = buildWalletPerformanceEntries(positions, {
      nowMs: 20_000,
    })
      .filter((entry) => Number.isFinite(entry.heatScore))
      .sort(
        (left, right) =>
          left.heatScore - right.heatScore ||
          left.totalPnl - right.totalPnl ||
          right.lastSeenMs - left.lastSeenMs ||
          left.wallet.localeCompare(right.wallet),
      )
      .slice(0, 2)
      .map((entry) => entry.wallet);

    expect(leaderboards.worstHeat.map((entry) => entry.wallet)).toEqual(
      expectedWorstHeatLeaders,
    );
    expect(leaderboards.worstHeat).toHaveLength(2);
  });

  test("counts settled expired open positions in wallet leaderboard PnL", () => {
    const positions = [
      positionSummary({
        id: "wallet-closed-win",
        owner: "0xwallet",
        oracleId: "btc-closed",
        realizedPnl: 1_000_000,
        cost: 1_000_000,
        payout: 2_000_000,
        status: "closed",
        lastEventMs: 1_000,
      }),
      positionSummary({
        id: "wallet-expired-loss",
        owner: "0xwallet",
        oracleId: "btc-expired-loss",
        expiryMs: 2_000,
        strike: 72_000_000_000,
        isUp: true,
        mintedQuantity: 3_000_000,
        redeemedQuantity: 0,
        openQuantity: 3_000_000,
        cost: 2_500_000,
        payout: 0,
        status: "open",
        lastEventMs: 2_000,
      }),
      positionSummary({
        id: "wallet-active-open",
        owner: "0xwallet",
        oracleId: "btc-active-open",
        expiryMs: 10_000,
        mintedQuantity: 5_000_000,
        redeemedQuantity: 0,
        openQuantity: 5_000_000,
        cost: 5_000_000,
        payout: 0,
        status: "open",
        lastEventMs: 3_000,
      }),
    ];

    const leaderboards = buildWalletPerformanceLeaderboards(positions, {
      limit: 5,
      nowMs: 5_000,
      oracles: [
        oracleState({
          oracle_id: "btc-expired-loss",
          settlement_price: 71_000_000_000,
          status: "settled",
        }),
      ],
    });

    expect(leaderboards.highestPnl[0]).toMatchObject({
      wallet: "0xwallet",
      totalCost: 3_500_000,
      totalPayout: 2_000_000,
      totalPnl: -1_500_000,
      openCount: 1,
      closedCount: 2,
      winCount: 1,
      lossCount: 1,
      longestWinningStreak: 1,
      longestLosingStreak: 1,
      currentStreakType: "loss",
      currentStreakLength: 1,
    });
  });

  test("orders current streaks by settlement time instead of later claim time", () => {
    const positions = [
      positionSummary({
        id: "old-claimed-loss",
        owner: "0xwallet",
        oracleId: "btc-old-loss",
        expiryMs: 2_000,
        cost: 1_000_000,
        payout: 0,
        realizedPnl: -1_000_000,
        status: "closed",
        lastEventMs: 12_000,
      }),
      positionSummary({
        id: "newer-settled-win",
        owner: "0xwallet",
        oracleId: "btc-new-win",
        expiryMs: 8_000,
        cost: 1_000_000,
        payout: 2_000_000,
        realizedPnl: 1_000_000,
        status: "closed",
        lastEventMs: 9_000,
      }),
    ];

    const leaderboards = buildWalletPerformanceLeaderboards(positions, {
      limit: 5,
      nowMs: 13_000,
      oracles: [
        oracleState({
          oracle_id: "btc-old-loss",
          settlement_price: 71_000_000_000,
          settled_at: 2_100,
          status: "settled",
        }),
        oracleState({
          oracle_id: "btc-new-win",
          settlement_price: 73_000_000_000,
          settled_at: 8_100,
          status: "settled",
        }),
      ],
    });

    expect(leaderboards.currentWinningStreak[0]).toMatchObject({
      wallet: "0xwallet",
      currentStreakType: "win",
      currentStreakLength: 1,
      longestLosingStreak: 1,
      totalPnl: 0,
    });
    expect(leaderboards.currentLosingStreak).toEqual([]);
  });

  test("orders streaks by early redeem time and held-to-expiry realization time", () => {
    const positions = [
      positionSummary({
        id: "held-to-expiry-loss",
        owner: "0xwallet",
        oracleId: "btc-held-loss",
        expiryMs: 2_000,
        cost: 1_000_000,
        payout: 0,
        realizedPnl: -1_000_000,
        status: "closed",
        lastEventMs: 9_000,
      }),
      positionSummary({
        id: "early-redeemed-win",
        owner: "0xwallet",
        oracleId: "btc-early-win",
        expiryMs: 10_000,
        cost: 1_000_000,
        payout: 1_500_000,
        realizedPnl: 500_000,
        status: "closed",
        lastEventMs: 6_000,
      }),
    ];

    const leaderboards = buildWalletPerformanceLeaderboards(positions, {
      limit: 5,
      nowMs: 11_000,
      oracles: [
        oracleState({
          oracle_id: "btc-held-loss",
          settlement_price: 71_000_000_000,
          settled_at: 2.1,
          status: "settled",
        }),
      ],
    });

    expect(leaderboards.currentWinningStreak[0]).toMatchObject({
      wallet: "0xwallet",
      currentStreakType: "win",
      currentStreakLength: 1,
      longestWinningStreak: 1,
      longestLosingStreak: 1,
      totalPnl: -500_000,
    });
  });

  test("does not count break-even positions as losses", () => {
    const leaderboards = buildWalletPerformanceLeaderboards(
      [
        positionSummary({
          id: "break-even",
          owner: "0xwallet",
          cost: 1_000_000,
          payout: 1_000_000,
          realizedPnl: 0,
          status: "closed",
          lastEventMs: 1_000,
        }),
      ],
      {
        limit: 5,
        nowMs: 2_000,
      },
    );

    expect(leaderboards.highestPnl[0]).toMatchObject({
      wallet: "0xwallet",
      winCount: 0,
      lossCount: 0,
      currentStreakType: "none",
      currentStreakLength: 0,
      longestWinningStreak: 0,
      longestLosingStreak: 0,
    });
    expect(leaderboards.currentWinningStreak).toEqual([]);
    expect(leaderboards.currentLosingStreak).toEqual([]);
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
  const summary = {
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

  if (
    summary.status === "closed" &&
    !("cost" in overrides) &&
    !("payout" in overrides) &&
    summary.realizedPnl !== 0
  ) {
    if (summary.realizedPnl > 0) {
      summary.payout = summary.realizedPnl;
    } else {
      summary.cost = Math.abs(summary.realizedPnl);
    }
  }

  return summary;
}

function oracleState(overrides: Record<string, unknown>) {
  return {
    predict_id: "predict",
    oracle_id: "btc-15m",
    underlying_asset: "BTC",
    expiry: 20_000,
    min_strike: 50_000_000_000,
    tick_size: 1_000_000,
    status: "active",
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
