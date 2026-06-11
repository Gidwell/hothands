import { describe, expect, test } from "bun:test";
import {
  clearMainnetSuinsDisplayNameCacheForTest,
  loadMainnetSuinsNames,
  mergeDemoWalletDisplayNames,
} from "../src/suinsDisplayNames";

describe("SuiNS display names", () => {
  test("fills unresolved demo wallets with deterministic SuiNS-style names", () => {
    const walletA = "0xaaaa222233334444555566667777888899990001";
    const walletB = "0xbbbb222233334444555566667777888899990002";
    const names = mergeDemoWalletDisplayNames([walletA, walletB, walletA], {
      [walletA]: {
        name: "alice.sui",
        source: "mainnet_suins",
      },
    });

    expect(names[walletA]).toEqual({
      name: "alice.sui",
      source: "mainnet_suins",
    });
    expect(names[walletB]?.name).toMatch(/\.sui$/);
    expect(names[walletB]?.source).toBe("demo_seed");
    expect(mergeDemoWalletDisplayNames([walletB])[walletB]).toEqual(names[walletB]);
  });

  test("caches mainnet SuiNS names between live feed refreshes", async () => {
    clearMainnetSuinsDisplayNameCacheForTest();

    const wallet = "0xaaaa222233334444555566667777888899990001";
    let now = 1_000;
    const calls: string[] = [];
    const fetcher = async (url: string | URL | Request) => {
      calls.push(String(url));

      return Response.json({
        source: "mainnet_suins",
        network: "mainnet",
        names: [
          {
            wallet,
            name: "alice.sui",
            source: "mainnet_suins",
          },
        ],
      });
    };

    await expect(
      loadMainnetSuinsNames({
        apiBaseUrl: "https://api.hot-hands.test/",
        fetcher,
        nowMs: () => now,
        wallets: [wallet],
      }),
    ).resolves.toEqual({
      [wallet]: {
        name: "alice.sui",
        source: "mainnet_suins",
      },
    });

    now += 1_000;
    await loadMainnetSuinsNames({
      apiBaseUrl: "https://api.hot-hands.test/",
      fetcher,
      nowMs: () => now,
      wallets: [wallet],
    });

    expect(calls).toEqual([
      `https://api.hot-hands.test/testnet/mainnet-suins-names?wallet=${wallet}`,
    ]);
  });

  test("backs off transient mainnet SuiNS failures", async () => {
    clearMainnetSuinsDisplayNameCacheForTest();

    const wallet = "0xbbbb222233334444555566667777888899990001";
    let now = 1_000;
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      throw new Error("mainnet unavailable");
    };

    await expect(
      loadMainnetSuinsNames({
        apiBaseUrl: "https://api.hot-hands.test/",
        fetcher,
        nowMs: () => now,
        wallets: [wallet],
      }),
    ).resolves.toEqual({});

    now += 1_000;
    await expect(
      loadMainnetSuinsNames({
        apiBaseUrl: "https://api.hot-hands.test/",
        fetcher,
        nowMs: () => now,
        wallets: [wallet],
      }),
    ).resolves.toEqual({});
    expect(calls).toBe(1);

    now += 61_000;
    await loadMainnetSuinsNames({
      apiBaseUrl: "https://api.hot-hands.test/",
      fetcher,
      nowMs: () => now,
      wallets: [wallet],
    });
    expect(calls).toBe(2);
  });
});
