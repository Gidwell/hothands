import { describe, expect, test } from "bun:test";
import {
  DUSDC_COIN_TYPE,
  formatDusdcBalance,
  loadPredictManagerBankrollLabel,
  loadDusdcBalanceLabel,
  selectDusdcDepositCoin,
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

  test("loads the PredictManager bankroll DUSDC balance", async () => {
    const calls: Array<{ id: string; options: { showContent: boolean } }> = [];
    const label = await loadPredictManagerBankrollLabel({
      predictManagerObjectId: "0xmanager",
      client: {
        getObject: async (input) => {
          calls.push(input);
          return {
            data: {
              content: {
                dataType: "moveObject",
                fields: {
                  bankroll: "12500000",
                },
              },
            },
          };
        },
      },
    });

    expect(calls).toEqual([
      {
        id: "0xmanager",
        options: {
          showContent: true,
        },
      },
    ]);
    expect(label).toBe("$12.50");
  });

  test("selects a DUSDC coin that can cover a deposit amount", async () => {
    const calls: Array<{ owner: string; coinType: string }> = [];
    const coin = await selectDusdcDepositCoin({
      owner: "0xwallet",
      amount: "10000000",
      client: {
        getCoins: async (input) => {
          calls.push(input);
          return {
            data: [
              {
                coinObjectId: "0xsmall",
                balance: "5000000",
              },
              {
                coinObjectId: "0xlarge",
                balance: "25000000",
              },
            ],
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
    expect(coin).toEqual({
      coinObjectId: "0xlarge",
      balance: "25000000",
    });
  });
});
