import { describe, expect, test } from "bun:test";
import { selectHotTrader, setCopyAmount, toggleCopyArmed } from "../src/copyModel";
import { market } from "../src/mockData";
import {
  REPLAY_SCENARIOS,
  advanceReplay,
  createInitialReplayState,
  createReplayScenario,
  getReplayAccountSummary,
  getReplayFrame,
  getReplayTraders,
  selectReplayScenario,
  updateReplayCopy,
} from "../src/replayModel";

describe("live replay model", () => {
  test("builds BTC replay scenarios from shared deterministic frames", () => {
    expect(REPLAY_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "opening-night",
      "trap-streak",
      "hot-hand-swing",
    ]);

    const openingNight = createReplayScenario("opening-night");
    const trapStreak = createReplayScenario("trap-streak");
    const hotHandSwing = createReplayScenario("hot-hand-swing");

    expect(openingNight.title).toBe("Opening Night");
    expect(openingNight.traders[0]).toMatchObject({
      id: "trader-mira",
      name: "Mira Vale",
      signal: "BTC UP above $64,200",
    });
    expect(openingNight.frames.map((frame) => frame.phase)).toContain("copy-executed");
    expect(openingNight.frames.map((frame) => frame.phase)).toContain("hot-hand-updated");
    expect(trapStreak.traders[0]).toMatchObject({
      id: "trader-kade",
      name: "Kade Lin",
    });
    expect(hotHandSwing.traders.map((trader) => trader.name)).toEqual([
      "Alpha Cruz",
      "Beta Shah",
    ]);
  });

  test("walks the shared deterministic copy loop from armed to hot hand update", () => {
    const scenario = createReplayScenario("opening-night");
    let state = createInitialReplayState(scenario);

    expect(state.copy.selectedTraderId).toBe("trader-mira");
    expect(state.copy.isArmed).toBe(false);
    expect(state.isPlaying).toBe(false);
    expect(getReplayFrame(state, scenario, market)).toMatchObject({
      phase: "copy-armed",
      status: "Copy ready",
      copyReceipt: {
        leader: "Mira Vale",
        amount: "$25",
        state: "Disarmed",
      },
    });

    state = updateReplayCopy(state, (copyState) => toggleCopyArmed(copyState));
    expect(getReplayFrame(state, scenario, market)).toMatchObject({
      phase: "copy-armed",
      status: "Copy armed",
      copyReceipt: {
        state: "Waiting",
        settlement: "Waiting for next signal",
        summary: "Waiting for Mira Vale's next BTC-USD signal. No trade yet.",
      },
    });

    state = advanceReplay(state, scenario);
    expect(getReplayFrame(state, scenario, market)).toMatchObject({
      phase: "signal-landed",
      status: "Leader signal landed",
      latestSignal: "Mira Vale posted BTC UP above $64,200",
      copyReceipt: {
        state: "Signal landed",
        settlement: "Confirm copy",
        summary: "Mira Vale's signal landed. Confirm to submit up to $25.",
      },
    });

    state = advanceReplay(state, scenario);
    expect(state.copy.isArmed).toBe(false);
    expect(state.copy.copyStatus).toBe("submitted");
    expect(getReplayFrame(state, scenario, market)).toMatchObject({
      phase: "copy-executed",
      status: "Copy executed",
      copyReceipt: {
        label: "Copied receipt",
        amount: "$25",
        state: "Copied once",
        settlement: "Submitted once",
        summary: "$25 copied once from Mira Vale. Re-arm to copy another future signal.",
      },
    });

    state = advanceReplay(state, scenario);
    expect(getReplayFrame(state, scenario, market)).toMatchObject({
      phase: "settled",
      status: "Settlement posted",
      settlement: {
        amount: "$25",
        pnl: "+$40",
        status: "Filled",
      },
    });

    state = advanceReplay(state, scenario);
    const frame = getReplayFrame(state, scenario, market);
    const replayTraders = getReplayTraders(state, scenario);

    expect(frame).toMatchObject({
      phase: "hot-hand-updated",
      status: "Hot hand updated",
      hotHand: {
        leader: "Mira Vale",
        hotScore: 50,
        streak: 1,
      },
    });
    expect(replayTraders[0]).toMatchObject({
      id: "trader-mira",
      hotScore: 50,
      copied: 20,
      streak: 1,
    });
  });

  test("keeps selected trader and amount intact while replay ticks advance", () => {
    const scenario = createReplayScenario("hot-hand-swing");
    let state = createInitialReplayState(scenario);
    state = updateReplayCopy(state, (copyState) =>
      toggleCopyArmed(
        setCopyAmount(selectHotTrader(copyState, "trader-beta", scenario.traders), 375),
      ),
    );

    state = advanceReplay(advanceReplay(advanceReplay(state, scenario), scenario), scenario);
    const frame = getReplayFrame(state, scenario, market);

    expect(state.copy.selectedTraderId).toBe("trader-beta");
    expect(state.copy.copyAmount).toBe(375);
    expect(frame.copyReceipt).toMatchObject({
      leader: "Beta Shah",
      amount: "$375",
    });
    expect(frame.settlement).toMatchObject({
      amount: "$375",
      pnl: "+$80",
    });
  });

  test("summarizes account PnL and copy exposure from replay state", () => {
    const scenario = createReplayScenario("opening-night");
    let state = createInitialReplayState(scenario);
    let frame = getReplayFrame(state, scenario, market);

    expect(getReplayAccountSummary(state, frame)).toEqual({
      title: "My Session",
      accountValue: "$1,250",
      available: "$1,250",
      pnl: "+$0",
      pnlTone: "flat",
      copyValue: "$25",
      status: "Flat",
      detail: "No active copy. Mira Vale selected.",
    });

    state = updateReplayCopy(state, (copyState) => toggleCopyArmed(copyState));
    frame = getReplayFrame(state, scenario, market);
    expect(getReplayAccountSummary(state, frame)).toMatchObject({
      available: "$1,225",
      pnl: "+$0",
      copyValue: "$25",
      status: "Armed",
      detail: "$25 reserved for Mira Vale's next BTC-USD signal.",
    });

    state = advanceReplay(state, scenario);
    frame = getReplayFrame(state, scenario, market);
    expect(getReplayAccountSummary(state, frame)).toMatchObject({
      available: "$1,225",
      status: "Confirm",
      detail: "Confirm before submitting up to $25.",
    });

    state = advanceReplay(state, scenario);
    frame = getReplayFrame(state, scenario, market);
    expect(getReplayAccountSummary(state, frame)).toMatchObject({
      available: "$1,225",
      status: "Pending",
      detail: "$25 copy submitted. Settlement pending.",
    });

    state = advanceReplay(state, scenario);
    frame = getReplayFrame(state, scenario, market);
    expect(getReplayAccountSummary(state, frame)).toEqual({
      title: "My Session",
      accountValue: "$1,290",
      available: "$1,290",
      pnl: "+$40",
      pnlTone: "positive",
      copyValue: "$25",
      status: "Settled",
      detail: "$25 settled for +$40.",
    });
  });

  test("resets copy state and replay frame when switching shared scenarios", () => {
    const openingNight = createReplayScenario("opening-night");
    const trapStreak = createReplayScenario("trap-streak");
    const state = selectReplayScenario(
      advanceReplay(createInitialReplayState(openingNight), openingNight),
      trapStreak,
    );

    expect(state.step).toBe(0);
    expect(state.copy.selectedTraderId).toBe("trader-kade");
    expect(getReplayFrame(state, trapStreak, market).copyReceipt).toMatchObject({
      leader: "Kade Lin",
      market: "BTC-USD",
      state: "Disarmed",
    });
  });
});
