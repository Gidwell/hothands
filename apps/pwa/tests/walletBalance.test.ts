import { describe, expect, test } from "bun:test";
import {
  DUSDC_COIN_TYPE,
  formatDusdcBalance,
  loadDusdcBalanceLabel,
} from "../src/walletBalance";

describe("DUSDC wallet balance", () => {
  test("formats DUSDC atomic balances for the account summary", () => {
    expect(formatDusdcBalance("0")).toBe("$0");
    expect(formatDusdcBalance("250000")).toBe("$0.25");
    expect(formatDusdcBalance("12345678")).toBe("$12.35");
    expect(formatDusdcBalance("1")).toBe("$0.000001");
  });

  test("loads the connected wallet DUSDC balance", async () => {
    const calls: Array<{ owner: string; coinType: string }> = [];
    const label = await loadDusdcBalanceLabel({
      owner: "0xwallet",
      client: {
        getBalance: async (input) => {
          calls.push(input);
          return {
            balance: {
              balance: "42000000",
            },
          };
        },
      },
    });

    expect(calls).toEqual([
      {
        owner: "0xwallet",
        coinType: DUSDC_COIN_TYPE,
      },
    ]);
    expect(label).toBe("$42");
  });
});
