import { describe, expect, test } from "bun:test";
import {
  buildTableSnapshot,
  labelStreak,
  scoreTrader,
  settleSignal,
  type Signal,
  type TraderScore,
} from "../src/index";

const baseSignal: Signal = {
  signalId: "sig-1",
  leaderId: "trader-a",
  oracleId: "btc-15m",
  market: "BTC-USD",
  direction: "up",
  strike: 100,
  expiryMs: 2_000,
  confidenceBps: 6_500,
  createdAtMs: 1_000,
  intendedCost: 25,
  status: "copyable",
};

describe("signal settlement", () => {
  test("settles UP wins only above strike", () => {
    expect(settleSignal(baseSignal, 101, 2_100).status).toBe("settled_win");
    expect(settleSignal(baseSignal, 100, 2_100).status).toBe("settled_loss");
  });

  test("settles DOWN wins at or below strike", () => {
    const down = { ...baseSignal, direction: "down" as const };

    expect(settleSignal(down, 100, 2_100).status).toBe("settled_win");
    expect(settleSignal(down, 101, 2_100).status).toBe("settled_loss");
  });
});

describe("hot scoring", () => {
  test("ranks traders by hotness with ROI and copy volume tie breakers", () => {
    const leaders: TraderScore[] = [
      score({
        traderId: "trader-volume-but-lower-roi",
        hotScore: 72,
        roi: 0.18,
        copiedVolume: 900,
      }),
      score({
        traderId: "trader-roi-tie-low-volume",
        hotScore: 72,
        roi: 0.24,
        copiedVolume: 100,
      }),
      score({
        traderId: "trader-roi-tie-high-volume",
        hotScore: 72,
        roi: 0.24,
        copiedVolume: 240,
      }),
      score({
        traderId: "trader-clear-hot-hand",
        hotScore: 86,
        roi: 0.1,
        copiedVolume: 0,
      }),
    ];

    const snapshot = buildTableSnapshot({
      tableId: "btc-15m",
      oracleId: "btc-15m",
      market: "BTC-USD",
      asOfMs: 10_000,
      spectators: 12,
      armedFollowers: 3,
      activeSignals: [],
      leaders,
    });

    expect(snapshot.leaders.map((leader) => leader.traderId)).toEqual([
      "trader-clear-hot-hand",
      "trader-roi-tie-high-volume",
      "trader-roi-tie-low-volume",
      "trader-volume-but-lower-roi",
    ]);
  });

  test("labels a copied five-win streak as on fire", () => {
    const resolvedSignals = Array.from({ length: 5 }, (_, index) =>
      settleSignal(
        {
          ...baseSignal,
          signalId: `sig-${index + 1}`,
          strike: 100 + index,
          createdAtMs: 1_000 + index,
          expiryMs: 2_000 + index,
        },
        110 + index,
        3_000 + index,
      )
    );

    const score = scoreTrader({
      traderId: "trader-a",
      resolvedSignals,
      copiedVolume: 300,
      nowMs: 4_000,
    });

    expect(score.label).toBe("On Fire");
    expect(score.winStreak).toBe(5);
    expect(score.hotScore).toBeGreaterThan(80);
  });

  test("flags strong hit rate with negative ROI as trap streak", () => {
    expect(
      labelStreak({
        winStreak: 3,
        roi: -0.25,
        hitRate: 0.75,
        copiedVolume: 120,
      }),
    ).toBe("Trap Streak");
  });

  test("scores a high-win-rate negative-ROI trader as a trap streak", () => {
    const resolvedSignals = [
      settleSignal({ ...baseSignal, signalId: "sig-trap-1", intendedCost: 10 }, 101, 2_000),
      settleSignal({ ...baseSignal, signalId: "sig-trap-2", intendedCost: 10 }, 102, 3_000),
      settleSignal({ ...baseSignal, signalId: "sig-trap-3", intendedCost: 10 }, 103, 4_000),
      settleSignal({ ...baseSignal, signalId: "sig-trap-4", intendedCost: 120 }, 99, 5_000),
    ];

    const score = scoreTrader({
      traderId: "trader-a",
      resolvedSignals,
      copiedVolume: 120,
      nowMs: 6_000,
    });

    expect(score.hitRate).toBe(0.75);
    expect(score.roi).toBeLessThan(0);
    expect(score.label).toBe("Trap Streak");
  });
});

function score(overrides: Partial<TraderScore> & Pick<TraderScore, "traderId">): TraderScore {
  return {
    traderId: overrides.traderId,
    hotScore: 0,
    roi: 0,
    pnl: 0,
    hitRate: 0,
    resolvedCount: 0,
    winStreak: 0,
    copiedVolume: 0,
    freshnessScore: 0,
    label: "Cold",
    ...overrides,
  };
}
