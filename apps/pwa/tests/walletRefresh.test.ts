import { describe, expect, test } from "bun:test";
import {
  POST_WALLET_REFRESH_DELAYS_MS,
  schedulePostWalletRefresh,
  waitForWalletTransactionFinality,
} from "../src/walletRefresh";

describe("wallet post-transaction refresh", () => {
  test("waits for transaction finality when a digest and client waiter exist", async () => {
    const waits: string[] = [];

    await waitForWalletTransactionFinality({
      digest: "0xdigest",
      client: {
        waitForTransaction: async ({ digest }) => {
          waits.push(digest);
        },
      },
    });

    expect(waits).toEqual(["0xdigest"]);
  });

  test("skips finality waiting when no digest is available", async () => {
    const waits: string[] = [];

    await waitForWalletTransactionFinality({
      digest: null,
      client: {
        waitForTransaction: async ({ digest }) => {
          waits.push(digest);
        },
      },
    });

    expect(waits).toEqual([]);
  });

  test("refreshes immediately and schedules delayed follow-up refreshes", () => {
    const calls: Array<"refresh" | number> = [];

    schedulePostWalletRefresh({
      refresh: () => calls.push("refresh"),
      setTimer: (callback, delay) => {
        calls.push(delay);
        callback();
        return 0;
      },
    });

    expect(calls).toEqual([
      "refresh",
      POST_WALLET_REFRESH_DELAYS_MS[0],
      "refresh",
      POST_WALLET_REFRESH_DELAYS_MS[1],
      "refresh",
    ]);
  });
});
