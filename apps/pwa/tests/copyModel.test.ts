import { describe, expect, test } from "bun:test";
import {
  createInitialCopyState,
  getCopyReceiptPreview,
  selectHotTrader,
  setCopyAmount,
  stepCopyAmount,
  toggleCopyArmed,
} from "../src/copyModel";
import { market, traders } from "../src/mockData";

describe("copy interaction model", () => {
  test("clamps and steps copy amount in fixed copy chips", () => {
    const state = createInitialCopyState(traders);

    expect(state.copyAmount).toBe(250);
    expect(stepCopyAmount(state, -1).copyAmount).toBe(200);
    expect(stepCopyAmount(setCopyAmount(state, 11), -1).copyAmount).toBe(25);
    expect(stepCopyAmount(setCopyAmount(state, 5_000), 1).copyAmount).toBe(1_000);
  });

  test("toggles copy arming without losing the selected leader", () => {
    const state = createInitialCopyState(traders);
    const selected = selectHotTrader(state, "t2", traders);
    const armed = toggleCopyArmed(selected);
    const disarmed = toggleCopyArmed(armed);

    expect(selected.isArmed).toBe(false);
    expect(armed.isArmed).toBe(true);
    expect(disarmed.isArmed).toBe(false);
    expect(disarmed.selectedTraderId).toBe("t2");
  });

  test("builds the next-signal receipt preview from selected trader and amount", () => {
    const state = setCopyAmount(
      selectHotTrader(createInitialCopyState(traders), "t3", traders),
      375,
    );

    expect(getCopyReceiptPreview(state, traders, market)).toEqual({
      leader: "Rhea Stack",
      market: "BTC-USD",
      amount: "$375",
      label: "Copy next signal",
      status: "Disarmed",
      summary: "Rhea Stack selected on BTC-USD. Arm copy to use up to $375 on the next signal.",
    });
  });
});
