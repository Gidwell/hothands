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

  test("falls back to a PredictManager balance call when object fields do not expose bankroll", async () => {
    const inspectCalls: Array<{ sender: string }> = [];
    const label = await loadPredictManagerBankrollLabel({
      predictManagerObjectId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      sender: "0xwallet",
      client: {
        getObject: async () => ({
          data: {
            content: {
              dataType: "moveObject",
              fields: {
                owner: "0xwallet",
              },
            },
          },
        }),
      },
      fallbackClient: {
        devInspectTransactionBlock: async (input) => {
          inspectCalls.push({
            sender: input.sender,
          });
          return {
            results: [
              {
                returnValues: [[[0x40, 0x4b, 0x4c, 0x00, 0, 0, 0, 0]]],
              },
            ],
          };
        },
      },
    });

    expect(inspectCalls).toEqual([
      {
        sender: "0xwallet",
      },
    ]);
    expect(label).toBe("$5");
  });

  test("selects a DUSDC coin that can cover a deposit amount", async () => {
    const calls: Array<{
      owner: string;
      coinType: string;
      cursor?: string | null;
      limit?: number;
    }> = [];
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
        cursor: null,
        limit: 50,
      },
    ]);
    expect(coin).toEqual({
      coinObjectId: "0xlarge",
      coinObjectIds: ["0xlarge"],
      balance: "25000000",
    });
  });

  test("selects multiple DUSDC coins when no single coin covers a deposit amount", async () => {
    const calls: Array<{
      owner: string;
      coinType: string;
      cursor?: string | null;
      limit?: number;
    }> = [];
    const coin = await selectDusdcDepositCoin({
      owner: "0xwallet",
      amount: "25000000",
      client: {
        getCoins: async (input) => {
          calls.push(input);
          return {
            data: [
              {
                coinObjectId: "0x8",
                balance: "8000000",
              },
              {
                coinObjectId: "0x9",
                balance: "9000000",
              },
              {
                coinObjectId: "0x10",
                balance: "10000000",
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
        cursor: null,
        limit: 50,
      },
    ]);
    expect(coin).toEqual({
      coinObjectId: "0x10",
      coinObjectIds: ["0x10", "0x9", "0x8"],
      balance: "27000000",
    });
  });

  test("selects fragmented coins matching a wallet with $26 total for a $25 deposit", async () => {
    const coin = await selectDusdcDepositCoin({
      owner: "0xwallet",
      amount: "25000000",
      client: {
        getCoins: async () => ({
          data: [
            {
              coinObjectId: "0xcoin16",
              balance: "16000000",
            },
            {
              coinObjectId: "0xcoin10",
              balance: "10000000",
            },
          ],
        }),
      },
    });

    expect(coin).toEqual({
      coinObjectId: "0xcoin16",
      coinObjectIds: ["0xcoin16", "0xcoin10"],
      balance: "26000000",
    });
  });
});
