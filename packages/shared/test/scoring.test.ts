import { describe, expect, test } from "bun:test";
import {
  labelStreak,
  scoreTrader,
  settleSignal,
  type Signal,
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
});
