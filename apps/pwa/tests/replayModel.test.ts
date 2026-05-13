import { describe, expect, test } from "bun:test";
import { selectHotTrader, setCopyAmount } from "../src/copyModel";
import { market, traders } from "../src/mockData";
import {
  advanceReplay,
  createInitialReplayState,
  getReplayFrame,
  getReplayTraders,
  updateReplayCopy,
} from "../src/replayModel";

describe("live replay model", () => {
  test("walks the deterministic copy loop from armed to hot hand update", () => {
    let state = createInitialReplayState(traders);

    expect(state.copy.selectedTraderId).toBe("t1");
    expect(state.copy.isArmed).toBe(true);
    expect(getReplayFrame(state, traders, market)).toMatchObject({
      phase: "copy-armed",
      status: "Copy armed",
      copyReceipt: {
        leader: "Mina Volt",
        amount: "$250",
        state: "Armed",
      },
    });

    state = advanceReplay(state);
    expect(getReplayFrame(state, traders, market)).toMatchObject({
      phase: "signal-landed",
      status: "Leader signal landed",
      latestSignal: "Mina Volt fired Long BTC on pullback",
    });

    state = advanceReplay(state);
    expect(getReplayFrame(state, traders, market)).toMatchObject({
      phase: "copy-executed",
      status: "Copy executed",
      copyReceipt: {
        label: "Copied receipt",
        amount: "$250",
        settlement: "Awaiting fill",
      },
    });

    state = advanceReplay(state);
    expect(getReplayFrame(state, traders, market)).toMatchObject({
      phase: "settled",
      status: "Settlement posted",
      settlement: {
        amount: "$250",
        pnl: "+$32",
        status: "Filled",
      },
    });

    state = advanceReplay(state);
    const frame = getReplayFrame(state, traders, market);
    const replayTraders = getReplayTraders(state, traders);

    expect(frame).toMatchObject({
      phase: "hot-hand-updated",
      status: "Hot hand updated",
      hotHand: {
        leader: "Mina Volt",
        hotScore: 99,
        streak: 9,
      },
    });
    expect(replayTraders[0]).toMatchObject({
      id: "t1",
      hotScore: 99,
      copied: 1263,
      streak: 9,
    });
  });

  test("keeps selected trader and amount intact while replay ticks advance", () => {
    let state = createInitialReplayState(traders);
    state = updateReplayCopy(state, (copyState) =>
      setCopyAmount(selectHotTrader(copyState, "t3", traders), 375),
    );

    state = advanceReplay(advanceReplay(advanceReplay(state)));
    const frame = getReplayFrame(state, traders, market);

    expect(state.copy.selectedTraderId).toBe("t3");
    expect(state.copy.copyAmount).toBe(375);
    expect(frame.copyReceipt).toMatchObject({
      leader: "Rhea Stack",
      amount: "$375",
    });
    expect(frame.settlement).toMatchObject({
      amount: "$375",
      pnl: "+$48",
    });
  });
});
